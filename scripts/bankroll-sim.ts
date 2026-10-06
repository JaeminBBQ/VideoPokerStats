/**
 * Monte Carlo bankroll cross-check: plays real hands through the engine (deal → analyzeHand → draw → payout)
 * and measures session survival, independently of the analytic risk-of-ruin pipeline.
 *
 * Model (units of 1 max bet): each hand costs 1 and returns payout(game, final). With probability `e` the
 * player holds the best hold strictly worse than optimal (EV below the best by more than EV_EPSILON);
 * otherwise analyzeHand(...)[0]. A session of H hands survives with bankroll B iff B + net_before_i >= 1 for
 * every hand i, i.e. B >= 1 - min_i(net_before_i), so one path gives survival for every B at once.
 *
 *   node scripts/bankroll-sim.ts <game> [errorRate=0] [handsPerSession=2000] [sessions=10000] [seed=1] [workers=cores]
 *
 * Each session uses its own mulberry32 stream (seeded from seed and the session index), so results do not
 * depend on the worker count.
 */
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { deal, draw, mulberry32 } from '../src/engine/cards.ts';
import { EV_EPSILON, analyzeHand, buildTables } from '../src/engine/ev.ts';
import { GAMES, payout, type GameId } from '../src/engine/games.ts';

interface Job {
  game: GameId;
  errorRate: number;
  hands: number;
  first: number;
  count: number;
  seed: number;
}

interface Result {
  /** Per session: 1 - min over hands of net before that hand (the bankroll needed to finish). */
  needed: Int32Array;
  /** Per session: net result after all hands. */
  finalNet: Int32Array;
  /** Sum and sum of squares of per-hand payouts. */
  sumPay: number;
  sumPay2: number;
  mistakes: number;
}

function sessionSeed(seed: number, session: number): number {
  // Mix (seed, session) so neighbouring sessions get unrelated mulberry32 streams.
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(session + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

function runJob(job: Job): Result {
  const game = GAMES[job.game];
  const tables = buildTables(game);
  const needed = new Int32Array(job.count);
  const finalNet = new Int32Array(job.count);
  let sumPay = 0;
  let sumPay2 = 0;
  let mistakes = 0;
  for (let k = 0; k < job.count; k++) {
    const rng = mulberry32(sessionSeed(job.seed, job.first + k));
    let net = 0;
    let minNet = 0;
    for (let i = 0; i < job.hands; i++) {
      if (net < minNet) minNet = net; // net before hand i
      const hand = deal(game.deckSize, rng);
      const holds = analyzeHand(tables, hand);
      let mask = holds[0].mask;
      if (job.errorRate > 0 && rng() < job.errorRate) {
        const worse = holds.find((h) => h.ev < holds[0].ev - EV_EPSILON);
        if (worse) {
          mask = worse.mask;
          mistakes++;
        }
      }
      const pay = payout(game, draw(hand, mask, game.deckSize, rng));
      sumPay += pay;
      sumPay2 += pay * pay;
      net += pay - 1;
    }
    needed[k] = 1 - minNet;
    finalNet[k] = net;
  }
  return { needed, finalNet, sumPay, sumPay2, mistakes };
}

if (!isMainThread) {
  parentPort!.postMessage(runJob(workerData as Job));
} else {
  const args = process.argv.slice(2);
  const gameId = (args[0] ?? 'job-8-5') as GameId;
  const game = GAMES[gameId];
  if (!game) {
    console.error(`unknown game ${gameId}; one of ${Object.keys(GAMES).join(', ')}`);
    process.exit(2);
  }
  const errorRate = Number(args[1] ?? 0);
  const hands = Number(args[2] ?? 2000);
  const sessions = Number(args[3] ?? 10000);
  const seed = Number(args[4] ?? 1);
  const nWorkers = Math.max(1, Math.min(Number(args[5] ?? availableParallelism()), sessions));

  const t0 = performance.now();
  const per = Math.ceil(sessions / nWorkers);
  const jobs: Job[] = [];
  for (let first = 0; first < sessions; first += per)
    jobs.push({ game: gameId, errorRate, hands, first, count: Math.min(per, sessions - first), seed });
  const results = await Promise.all(
    jobs.map(
      (job) =>
        new Promise<Result>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: job });
          w.once('message', resolve);
          w.once('error', reject);
        }),
    ),
  );
  const secs = (performance.now() - t0) / 1000;

  const needed = Int32Array.from(results.flatMap((r) => Array.from(r.needed))).sort();
  const finalNet = results.flatMap((r) => Array.from(r.finalNet));
  const sumPay = results.reduce((s, r) => s + r.sumPay, 0);
  const sumPay2 = results.reduce((s, r) => s + r.sumPay2, 0);
  const mistakes = results.reduce((s, r) => s + r.mistakes, 0);
  const n = needed.length;
  const totalHands = n * hands;
  const mean = sumPay / totalHands;
  const sd = Math.sqrt(sumPay2 / totalHands - mean * mean);
  const se = sd / Math.sqrt(totalHands);

  const pct = (x: number, d = 2): string => (100 * x).toFixed(d);
  console.log(`# ${game.name} (${gameId})  e=${errorRate}  ${hands} hands/session  ${n} sessions  seed=${seed}  workers=${jobs.length}`);
  console.log(`hands ${totalHands.toLocaleString('en-US')}  time ${secs.toFixed(1)}s  ${Math.round(totalHands / secs).toLocaleString('en-US')} hands/sec (incl. table builds)`);
  console.log(`mistakes made ${mistakes.toLocaleString('en-US')} (${pct(mistakes / totalHands, 3)}% of hands)`);
  console.log(
    `mean return ${pct(mean, 4)}% ± ${pct(se, 4)}% (1 SE; sd/hand ${sd.toFixed(3)})  published ${pct(game.publishedReturn, 4)}%` +
      `  z=${((mean - game.publishedReturn) / se).toFixed(2)}`,
  );
  console.log(`mean net/hand ${(mean - 1).toFixed(5)} vs return-1 ${(game.publishedReturn - 1).toFixed(5)}` +
    `  mean session net ${(finalNet.reduce((a, b) => a + b, 0) / n).toFixed(1)} bets`);
  console.log('');
  console.log('| Bankroll (bets) | Survival | ± 1 SE | Ruined sessions |');
  console.log('|---:|---:|---:|---:|');
  for (const b of [50, 100, 150, 200, 300, 400, 600, 800, 1200, 1600]) {
    // survives iff needed <= b; needed is sorted ascending.
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (needed[mid] <= b) lo = mid + 1;
      else hi = mid;
    }
    const p = lo / n;
    console.log(`| ${b} | ${pct(p, 3)}% | ${pct(Math.sqrt((p * (1 - p)) / n), 3)}% | ${n - lo} |`);
  }
  console.log('');
  console.log('| Survival target | Bankroll needed (bets) |');
  console.log('|---:|---:|');
  for (const q of [0.5, 0.9, 0.95, 0.99]) {
    // Smallest B with at least fraction q of sessions surviving.
    console.log(`| ${pct(q, 0)}% | ${needed[Math.min(n - 1, Math.ceil(q * n) - 1)]} |`);
  }
}

import { mulberry32, type EngineClient, type Venue } from '../engine/index.ts';
import { leaveOdds, type LeaveOdds, type LeaveRule } from '../engine/leave.ts';
import type { GameOdds } from './odds.ts';

/**
 * The Simulator tab's engine (D23). A *simulation*, labelled as one: each hand's final result is drawn from
 * the exact per-row distribution (perfect play, or with probability `errorRate` the best non-tied wrong
 * hold), which is the same in distribution as dealing cards and playing them that way. Money is integer
 * cents: a hand pays `pays × betCents`. The exact leave-rule odds (`leaveOdds`) sit beside it so the UI can
 * show "simulated vs exact".
 */

/** GSR (D23): 1 point per $2 of video poker, 1,000 points = $1, so 0.05% of coin-in comes back at 1×. */
export const COMP_RATE_PER_MULTIPLIER = 0.0005;

/**
 * Free play per dollar of video poker coin-in at 1×, by venue (D24). GSR: 1 point per $2, 1,000 points = $1
 * (owner confirmed). Legends Bay: 1 point per $6 (legendsbaycasino.com/rewards), 100 points = $1 (owner),
 * so 1/600.
 */
export function compRatePerMultiplier(venue: Venue): number {
  return venue === 'Legends Bay' ? 1 / 600 : COMP_RATE_PER_MULTIPLIER;
}

export interface SimParams {
  rows: GameOdds['perRow'];
  /** Probability each hand is misplayed (0 = perfect play). */
  errorRate: number;
  betCents: number;
  budgetCents: number;
  /** Leave when up at least this much (null = no goal). */
  winGoalCents: number | null;
  /** Leave when down at least this much (null = play until you can't cover a bet). */
  lossLimitCents: number | null;
  maxHands: number;
  /** Comps as a fraction of coin-in (0.0005 × points multiplier). */
  compRate: number;
}

export type EndReason = 'win' | 'loss-limit' | 'broke' | 'time';

/** Categories worth a marker on the graph. */
const BIG = new Set(['royal', 'four-deuces', 'wild-royal', 'five-kind', 'straight-flush', 'four-kind']);

export interface SessionRun {
  end: EndReason;
  hands: number;
  finalCents: number;
  netCents: number;
  coinInCents: number;
  compsCents: number;
  /** Bankroll after each kept hand: min and max per bucket so spikes survive downsampling (≤ ~2 × 300 points). */
  path: { hand: number; cents: number }[];
  /** Big hands (quads and better): hand number, row label, category, amount won. */
  events: { hand: number; label: string; category: string; winCents: number }[];
}

/** Walker alias table over the rows' mixed probabilities. */
function sampler(rows: SimParams['rows'], errorRate: number, rand: () => number): () => number {
  const n = rows.length;
  const p = rows.map((r) => (1 - errorRate) * r.best + errorRate * r.second);
  const total = p.reduce((a, b) => a + b, 0);
  const scaled = p.map((x) => (x / total) * n);
  const prob = new Float64Array(n);
  const alias = new Int32Array(n);
  const small: number[] = [];
  const large: number[] = [];
  scaled.forEach((x, i) => (x < 1 ? small : large).push(i));
  while (small.length && large.length) {
    const s = small.pop()!;
    const l = large.pop()!;
    prob[s] = scaled[s];
    alias[s] = l;
    scaled[l] += scaled[s] - 1;
    (scaled[l] < 1 ? small : large).push(l);
  }
  for (const i of [...small, ...large]) prob[i] = 1;
  return () => {
    const u = rand() * n;
    const i = Math.floor(u);
    return u - i < prob[i] ? i : alias[i];
  };
}

const PATH_BUCKETS = 300;

/** One session. Deterministic for a given `seed`. */
export function runSession(params: SimParams, seed: number): SessionRun {
  return simulate(params, mulberry32(seed), true);
}

function simulate(params: SimParams, rand: () => number, keepPath: boolean): SessionRun {
  const { rows, betCents, budgetCents, winGoalCents, lossLimitCents, maxHands, compRate } = params;
  const draw = sampler(rows, params.errorRate, rand);
  const winLine = winGoalCents === null ? Infinity : budgetCents + winGoalCents;
  // A loss limit that leaves less than one bet is the same as playing until broke (as in leaveOdds).
  const lossLine = lossLimitCents === null || budgetCents - lossLimitCents < betCents ? -Infinity : budgetCents - lossLimitCents;
  const per = Math.max(1, Math.ceil(maxHands / PATH_BUCKETS));
  const path: SessionRun['path'] = keepPath ? [{ hand: 0, cents: budgetCents }] : [];
  const events: SessionRun['events'] = [];
  let bank = budgetCents;
  let hands = 0;
  let end: EndReason = 'time';
  let bLo = Infinity;
  let bHi = -Infinity;
  let loHand = 0;
  let hiHand = 0;
  if (bank < betCents) end = 'broke';
  while (end !== 'broke' && hands < maxHands) {
    const row = rows[draw()];
    hands++;
    const win = row.pays * betCents;
    bank += win - betCents;
    if (keepPath) {
      if (bank < bLo) [bLo, loHand] = [bank, hands];
      if (bank > bHi) [bHi, hiHand] = [bank, hands];
      if (hands % per === 0) {
        const pts = loHand <= hiHand ? [[loHand, bLo], [hiHand, bHi]] : [[hiHand, bHi], [loHand, bLo]];
        for (const [h, c] of pts) if (path[path.length - 1].hand !== h) path.push({ hand: h, cents: c });
        bLo = Infinity;
        bHi = -Infinity;
      }
      if (BIG.has(row.category)) events.push({ hand: hands, label: row.label, category: row.category, winCents: win });
    }
    if (bank >= winLine) {
      end = 'win';
      break;
    }
    if (bank <= lossLine) {
      end = 'loss-limit';
      break;
    }
    // Out of money counts the moment the bankroll can't cover another bet, even after the last hand
    // (same as leaveOdds).
    if (bank < betCents) {
      end = 'broke';
      break;
    }
  }
  if (keepPath && path[path.length - 1].hand !== hands) path.push({ hand: hands, cents: bank });
  const coinInCents = hands * betCents;
  return {
    end,
    hands,
    finalCents: bank,
    netCents: bank - budgetCents,
    coinInCents,
    compsCents: Math.round(coinInCents * compRate),
    path,
    events,
  };
}

export interface ManyRuns {
  runs: number;
  /** Share of sessions by how they ended. */
  ends: Record<EndReason, number>;
  pAhead: number;
  avgNetCents: number;
  avgCompsCents: number;
  avgHands: number;
  /** Net results, sorted ascending (for histograms and percentiles). */
  nets: number[];
  medianNetCents: number;
}

/** Many sessions with independent streams from one seed. */
export function runMany(params: SimParams, runs: number, seed: number): ManyRuns {
  const rand = mulberry32(seed);
  const ends: Record<EndReason, number> = { win: 0, 'loss-limit': 0, broke: 0, time: 0 };
  const nets: number[] = [];
  let comps = 0;
  let hands = 0;
  let ahead = 0;
  for (let r = 0; r < runs; r++) {
    const s = simulate(params, rand, false);
    ends[s.end]++;
    nets.push(s.netCents);
    comps += s.compsCents;
    hands += s.hands;
    if (s.netCents > 0) ahead++;
  }
  nets.sort((a, b) => a - b);
  for (const k of Object.keys(ends) as EndReason[]) ends[k] /= runs;
  return {
    runs,
    ends,
    pAhead: ahead / runs,
    avgNetCents: nets.reduce((a, b) => a + b, 0) / runs,
    avgCompsCents: comps / runs,
    avgHands: hands / runs,
    nets,
    medianNetCents: nets[Math.floor(runs / 2)],
  };
}

/** The exact DP's inputs for these parameters: per-hand pays/probs (mistakes mixed in) and the rule in bets. */
function exactInputs(params: SimParams): { pays: number[]; probs: number[]; startBets: number; rule: LeaveRule } {
  return {
    pays: params.rows.map((r) => r.pays),
    probs: params.rows.map((r) => (1 - params.errorRate) * r.best + params.errorRate * r.second),
    startBets: params.budgetCents / params.betCents,
    rule: {
      winBets: params.winGoalCents === null ? Infinity : params.winGoalCents / params.betCents,
      lossBets: params.lossLimitCents === null ? Infinity : params.lossLimitCents / params.betCents,
      maxHands: params.maxHands,
    },
  };
}

/** Exact odds for the same parameters, on this thread (null when too large to compute). */
export function exactFor(params: SimParams): LeaveOdds | null {
  const { pays, probs, startBets, rule } = exactInputs(params);
  return leaveOdds(pays, probs, startBets, rule);
}

/** `exactFor` computed in the engine worker (null when too large to compute). */
export async function exactForAsync(engine: EngineClient, params: SimParams): Promise<LeaveOdds | null> {
  const { pays, probs, startBets, rule } = exactInputs(params);
  const [odds] = await engine.leave(pays, probs, startBets, [rule]);
  return odds;
}

/** Return per dollar bet at this mistake rate, and the comps needed to break even. */
export function returnAndBreakEven(rows: SimParams['rows'], errorRate: number): { ret: number; breakEvenCompRate: number } {
  const ret = rows.reduce((a, r) => a + r.pays * ((1 - errorRate) * r.best + errorRate * r.second), 0);
  return { ret, breakEvenCompRate: Math.max(0, 1 - ret) };
}

export interface LeaveAdviceRow {
  label: string;
  winGoalCents: number | null;
  lossLimitCents: number | null;
  odds: LeaveOdds | null;
}

const ADVICE_RULES = (b: number): Omit<LeaveAdviceRow, 'odds'>[] => [
  { label: 'Play the whole session', winGoalCents: null, lossLimitCents: null },
  { label: 'Leave at +25%', winGoalCents: Math.round(b * 0.25), lossLimitCents: null },
  { label: 'Leave at +50%', winGoalCents: Math.round(b * 0.5), lossLimitCents: null },
  { label: 'Leave when doubled', winGoalCents: b, lossLimitCents: null },
  { label: 'Stop after losing half', winGoalCents: null, lossLimitCents: Math.round(b * 0.5) },
  { label: '+50% or −50%, whichever first', winGoalCents: Math.round(b * 0.5), lossLimitCents: Math.round(b * 0.5) },
];

/**
 * The "when to leave" comparison: a few leave rules for the same budget, bet, and session length, each
 * exact. The budget is the most you can lose; goals are fractions of it. Synchronous (tests, scripts).
 */
export function leaveAdvice(base: Omit<SimParams, 'winGoalCents' | 'lossLimitCents'>): LeaveAdviceRow[] {
  return ADVICE_RULES(base.budgetCents).map((r) => ({ ...r, odds: exactFor({ ...base, ...r }) }));
}

/** `leaveAdvice` computed in the engine worker, for the UI (up to about a second for long 5¢ sessions). */
export async function leaveAdviceAsync(engine: EngineClient, base: Omit<SimParams, 'winGoalCents' | 'lossLimitCents'>): Promise<LeaveAdviceRow[]> {
  const rules = ADVICE_RULES(base.budgetCents);
  const inputs = rules.map((r) => exactInputs({ ...base, ...r }));
  const odds = await engine.leave(inputs[0].pays, inputs[0].probs, inputs[0].startBets, inputs.map((x) => x.rule));
  return rules.map((r, i) => ({ ...r, odds: odds[i] }));
}

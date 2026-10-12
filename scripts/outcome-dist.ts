/**
 * Exact final-outcome distributions per hand for perfect play and for the best non-tied mistake hold,
 * by full enumeration of every starting hand, with big hands split by the hold that made them. Writes
 * docs/bankroll/outcome-dist.json.
 *
 *   node scripts/outcome-dist.ts                 # all games
 *   node scripts/outcome-dist.ts job-8-5         # some games
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { GAMES, GAME_LIST, type GameDef } from '../src/engine/games.ts';
import { patternFor } from '../src/engine/drill.ts';
import { bigRows } from '../src/engine/odds.ts';
import { outcomeDistribution } from '../src/engine/outcomes.ts';

const OUT = 'docs/bankroll/outcome-dist.json';

const ids = process.argv.slice(2);
const games: GameDef[] = ids.length ? ids.map((id) => GAMES[id as keyof typeof GAMES] ?? fail(`unknown game ${id}`)) : GAME_LIST;

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

const out = [];
let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`);
};

for (const game of games) {
  const t0 = performance.now();
  // Big hands (quads and better) are also split by the hold that made them, for the simulator (D28).
  const big = bigRows(game);
  const { best, second, holds } = outcomeDistribution(game, undefined, {
    rows: big,
    classify: (held) => patternFor(game, held)?.label ?? fail(`${game.id} has no hold classifier`),
  });
  const secs = (performance.now() - t0) / 1000;
  const rows = [...game.rows.map(({ key, label, pays }) => ({ key, label, pays })), { key: 'nothing', label: 'No win', pays: 0 }];
  const dot = (p: number[]) => p.reduce((acc, v, i) => acc + v * rows[i].pays, 0);
  const sum = (p: number[]) => p.reduce((a, b) => a + b, 0);
  const returnBest = dot(best);
  const returnSecond = dot(second);

  console.log(`${game.id} (${secs.toFixed(1)}s)`);
  console.log(`  ${'row'.padEnd(22)} ${'pays'.padStart(5)} ${'best'.padStart(14)} ${'second'.padStart(14)}`);
  rows.forEach((r, i) =>
    console.log(`  ${r.label.padEnd(22)} ${String(r.pays).padStart(5)} ${best[i].toExponential(6).padStart(14)} ${second[i].toExponential(6).padStart(14)}`),
  );
  console.log(`  returnBest ${(returnBest * 100).toFixed(6)}%  returnSecond ${(returnSecond * 100).toFixed(6)}%  cost/hand ${(returnBest - returnSecond).toFixed(6)}`);
  check(Math.abs(sum(best) - 1) <= 1e-12, `Σ best = 1 (off by ${(sum(best) - 1).toExponential(2)})`);
  check(Math.abs(sum(second) - 1) <= 1e-12, `Σ second = 1 (off by ${(sum(second) - 1).toExponential(2)})`);
  const pct = returnBest * 100;
  const published = game.publishedReturn * 100;
  check(
    Math.abs(pct - published) <= 0.5 * 10 ** -game.publishedDecimals + 1e-9,
    `returnBest ${pct.toFixed(4)}% matches published ${published.toFixed(game.publishedDecimals)}%`,
  );
  check(returnSecond < returnBest, 'returnSecond < returnBest');
  for (const r of big) {
    const hs = holds[r];
    const off = (k: 'best' | 'second', p: number[]) => Math.abs(hs.reduce((a, x) => a + x[k], 0) - p[r]) / Math.max(p[r], 1e-300);
    check(off('best', best) <= 1e-12 && off('second', second) <= 1e-12, `${rows[r].label}: holds sum to the row (${hs.length} holds)`);
    console.log(`    ${hs.slice(0, 4).map((x) => `${x.label} ${((x.best / best[r]) * 100).toFixed(1)}%`).join(', ')}`);
  }

  out.push({
    gameId: game.id,
    name: game.name,
    publishedReturn: game.publishedReturn,
    rows,
    best,
    second,
    holds,
    returnBest,
    returnSecond,
    mistakeCostPerHand: returnBest - returnSecond,
  });
}

if (failures) {
  console.error(`${failures} check(s) failed; not writing ${OUT}`);
  process.exit(1);
}
mkdirSync('docs/bankroll', { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedBy: 'scripts/outcome-dist.ts', games: out }, null, 2) + '\n');
console.log(`wrote ${OUT}`);

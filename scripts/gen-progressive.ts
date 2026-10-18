/**
 * Exact return vs royal for every game offered with a progressive royal (D35): perfect play re-solved at
 * each royal from 800 to 2,000 per coin in steps of 50, plus the exact break-even royal.
 *
 *   node scripts/gen-progressive.ts                 # every game with a progressive offer
 *   node scripts/gen-progressive.ts lb-job-9-5      # some games (merged into the existing file)
 *
 * Writes src/progressive/curves.json. Do not edit by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GAMES, GAME_LIST, type GameDef } from '../src/engine/games.ts';
import { breakEvenRoyal, returnAtRoyal, type ProgressiveCurve } from '../src/engine/progressive.ts';

const OUT = process.env.OUT ?? 'src/progressive/curves.json';
const ids = process.argv.slice(2);
const games: GameDef[] = ids.length
  ? ids.map((id) => GAMES[id as keyof typeof GAMES] ?? fail(`unknown game ${id}`))
  : GAME_LIST.filter((g) => g.offers.some((o) => o.progressive));

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

const out: Record<string, ProgressiveCurve> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).games : {};
let failures = 0;
for (const game of games) {
  const points: ProgressiveCurve['points'] = [];
  for (let royal = 800; royal <= 2000; royal += 50) points.push({ royal, return: returnAtRoyal(game, royal) });
  // The 800 point is the published figure, re-checked.
  const ok = Math.abs(points[0].return - game.publishedReturn) * 100 <= 0.5 * 10 ** -game.publishedDecimals + 1e-9;
  if (!ok) failures++;
  const be = breakEvenRoyal(game);
  out[game.id] = { points, breakEvenRoyal: be };
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${game.id.padEnd(20)} 800 → ${(points[0].return * 100).toFixed(4)}%  100% at ${be.toFixed(1)} per coin`);
}
mkdirSync('src/progressive', { recursive: true });
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({ generatedBy: 'scripts/gen-progressive.ts', games: sorted }, null, 2) + '\n');
process.exit(failures ? 1 : 0);

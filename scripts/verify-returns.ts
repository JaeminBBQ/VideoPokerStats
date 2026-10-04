/**
 * Verifies each game: builds its tables, plays every starting hand perfectly, and checks the
 * overall return against the published figure (to the precision it is published at).
 *
 *   npm run verify                 # all games
 *   npm run verify -- nsud fpdw    # some games
 */
import { buildTables, perfectPlayReturn } from '../src/engine/ev.ts';
import { GAMES, GAME_LIST, type GameDef } from '../src/engine/games.ts';

const ids = process.argv.slice(2);
const games: GameDef[] = ids.length ? ids.map((id) => GAMES[id as keyof typeof GAMES] ?? fail(`unknown game ${id}`)) : GAME_LIST;

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

let failures = 0;
for (const game of games) {
  const t0 = performance.now();
  const tables = buildTables(game);
  const t1 = performance.now();
  const ret = perfectPlayReturn(tables);
  const t2 = performance.now();
  const pct = ret * 100;
  const published = game.publishedReturn * 100;
  // Published figures are rounded, so accept anything that rounds to them.
  const ok = Math.abs(pct - published) <= 0.5 * 10 ** -game.publishedDecimals + 1e-9;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${game.id.padEnd(16)} computed ${pct.toFixed(4)}%  published ${published.toFixed(game.publishedDecimals)}%` +
      `  (tables ${((t1 - t0) / 1000).toFixed(1)}s, all hands ${((t2 - t1) / 1000).toFixed(1)}s)`,
  );
}
process.exit(failures ? 1 : 0);

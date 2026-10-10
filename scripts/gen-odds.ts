/**
 * Generates the Odds tab data: per category, P(on the deal), P(final hand under perfect play), and the
 * draw odds of canonical holds ("4 to a Royal" …), and the chance of finishing a session ahead. Everything
 * is exact enumeration or exact DP (src/engine/odds.ts); perfect-play odds come from docs/bankroll/outcome-dist.json (scripts/outcome-dist.ts), re-checked here
 * against each game's published return.
 *
 *   node scripts/gen-odds.ts                 # all games
 *   node scripts/gen-odds.ts job-8-5         # some games
 *
 * Writes src/odds/<id>.json. Do not edit those by hand.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BINOM } from '../src/engine/ev.ts';
import { GAMES, GAME_LIST, type GameDef } from '../src/engine/games.ts';
import { SESSION_HANDS, byCategory, dealtCounts, drawExamples, drawOdds, exampleHand, oddsCategories, sessionOdds } from '../src/engine/odds.ts';

const DIST = 'docs/bankroll/outcome-dist.json';
const OUT_DIR = 'src/odds';

const ids = process.argv.slice(2);
const games: GameDef[] = ids.length ? ids.map((id) => GAMES[id as keyof typeof GAMES] ?? fail(`unknown game ${id}`)) : GAME_LIST;

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

interface DistGame {
  gameId: string;
  rows: { key: string; pays: number }[];
  best: number[];
}
const dist = (JSON.parse(readFileSync(DIST, 'utf8')) as { games: DistGame[] }).games;

const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString('en-US')}` : '—');
const pct = (p: number) => `${(p * 100).toFixed(2)}%`.padStart(7);
mkdirSync(OUT_DIR, { recursive: true });

for (const game of games) {
  const t0 = performance.now();
  const d = dist.find((g) => g.gameId === game.id) ?? fail(`${game.id} missing from ${DIST}; run scripts/outcome-dist.ts`);
  const keys = [...game.rows.map((r) => r.key), 'nothing'];
  if (d.rows.map((r) => r.key).join() !== keys.join()) fail(`${game.id}: ${DIST} rows don't match the paytable; regenerate it`);
  const ret = d.best.reduce((acc, v, i) => acc + v * (game.rows[i]?.pays ?? 0), 0);
  if (Math.abs(ret - game.publishedReturn) > 0.5 * 10 ** -(game.publishedDecimals + 2))
    fail(`${game.id}: perfect-play return ${ret} ≠ published ${game.publishedReturn}`);

  const cats = oddsCategories(game);
  const hands = BINOM[game.deckSize][5];
  const dealt = byCategory(cats, dealtCounts(game)).map((c) => c / hands);
  const perfect = byCategory(cats, d.best);
  const draws = drawExamples(game).map((e) => {
    const { hand, mask } = exampleHand(e);
    const odds = byCategory(cats, drawOdds(game, hand, mask));
    return { ...e, odds: Object.fromEntries(e.targets.map((t) => [t, odds[cats.findIndex((c) => c.key === t)]])) };
  });

  const sessions = sessionOdds(
    keys.map((_, i) => game.rows[i]?.pays ?? 0),
    d.best,
    SESSION_HANDS,
    cats[0].outcomes[0],
  ).map((x) => ({ ...x, avgBets: x.hands * (ret - 1) }));

  const out = {
    generatedBy: 'node scripts/gen-odds.ts',
    gameId: game.id,
    categories: cats.map((c, i) => ({ key: c.key, label: c.label, dealt: dealt[i], perfect: perfect[i] })),
    draws,
    sessions,
  };
  writeFileSync(`${OUT_DIR}/${game.id}.json`, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`${game.id} (${((performance.now() - t0) / 1000).toFixed(1)}s, return ${(ret * 100).toFixed(4)}%)`);
  for (const c of out.categories) console.log(`  ${c.label.padEnd(22)} dealt ${oneIn(c.dealt).padStart(14)}   perfect ${oneIn(c.perfect).padStart(14)}`);
  for (const x of sessions)
    console.log(`  ${String(x.hands).padStart(6)} hands: ahead ${pct(x.ahead)}  even ${pct(x.even)}  behind ${pct(x.behind)}  ahead w/o royal ${pct(x.aheadNoRoyal)}`);
  for (const e of draws) console.log(`  ${e.label.padEnd(30)} ${Object.entries(e.odds).map(([k, v]) => `${k} ${oneIn(v)}`).join(', ')}`);
}

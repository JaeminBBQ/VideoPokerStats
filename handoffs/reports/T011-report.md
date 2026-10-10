# T011 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built the fifth "Odds" tab: a reference page showing how often each hand comes, on the deal, under perfect play, and by what you're holding. The header game picker drives it (component is keyed by gameId, so the chip selection resets to Royal on game change), and it reads only the bundled `ODDS_BY_GAME` data — no engine calls, no stats recording, no localStorage. All numbers are formatted from the generated data (`oneIn` plus two small formatters in `src/lib/oddsFormat.ts`).

## Files changed
- `src/components/OddsTab.tsx` (new): the page — headline-category chips (all categories minus nothing/three-kind/two-pair/jacks-or-better), per-hold odds rows with MiniCards (held cards normal, discards dimmed, deuces wild), Dealt/Perfect summary cards with the 600-hands/hour pace line, and the at-a-glance table with the selected row highlighted.
- `src/lib/oddsFormat.ts` (new): `percent2` (percentage with 2 significant figures) and `hoursPer` (hours between hits at 600 hands/hour, null under an hour).
- `src/lib/oddsFormat.test.ts` (new): tests for both formatters.
- `src/App.tsx`: `'odds'` added to `Tab`, nav button after Assist, render branch. Keyboard handler untouched (still guards `tab !== 'trainer'`), so Enter/Space never deal from this tab.
- `src/index.css`: `odds-*` styles (chips ≥44px tall, draw rows, summary, table, footnote) plus a five-tab fix in the ≤640px media query (see deviations).

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build exit 0 | pass | `npm run lint` (oxlint, no findings); `npm run typecheck` (tsc -b); `npm test` → "Test Files 19 passed, Tests 236 passed"; `npm run build` → "✓ built in 95ms" |
| `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/charts src/bankroll` empty | pass | no output |
| `grep -n "localStorage\|recordHand\|saveHistory" src/components/OddsTab.tsx` empty | pass | no output |
| Visual values | pass (verified in node against the data) | JoB 8/5 Royal: 1 in 47 / 1 in 1,081 / 1 in 16,215 / 1 in 178,365 / 1 in 383,485; dealt 1 in 649,740; perfect 1 in 40,170 ("about every 67 hours"). JoB Four of a Kind: Three of a Kind 1 in 23.5, A Pair 1 in 360. Deuces Four Deuces: 1 in 23.5 / 1 in 360 / 1 in 4,054. Double Bonus has a single "Four of a Kind" headline. |

## Deviations from the spec
1. Added `src/lib/oddsFormat.ts` + tests instead of inlining the percentage/hours formatting in the component — the project convention is that non-rendering logic lives in `src/lib/` with Vitest tests. The spec's do-not list doesn't include `src/lib` (only `src/lib/odds.ts`).
2. Five tabs don't fit one row at 375px, so inside the existing ≤640px media query `.tabs` now wraps (`flex-wrap: wrap`) and `.tab` got `flex-shrink: 0` — tabs keep their size and wrap to two rows instead of shrinking/overflowing. With four tabs the layout is unchanged (still one row).
3. `OddsTab` is mounted with `key={gameId}`, so switching games resets the chip to the first headline category (Royal) — no stale selection pointing at a category the new game doesn't have (e.g. switching away from a deuces game with "Four Deuces" selected).
4. Draw rows defensively skip entries whose `odds[selectedKey]` isn't a finite number (no such entry exists in the data today).
5. The summary "cards" reuse the existing `.stat` tiles from the stats grid rather than a new card style.

## Dependencies added
None.

## Questions / proposals for Claude
1. The intro line follows the spec template literally, so deuces games read "Chance the final hand is a Four Deuces after the draw." and "…a Wild Royal Flush." If you'd like proper articles, I can add a small "a/an" helper (labels are per-game, so it would have to be label-driven or a per-category article map).
2. The hours line under "Over a session, playing perfectly" omits itself whenever perfect ≥ 1/600 per spec — note this hides it for several headline categories where the pace is under an hour (e.g. JoB Four of a Kind, 0.7 hours). Flagging in case you'd rather show sub-hour paces.
3. The tab bar wrapping to two rows on phones is the least intrusive of the five-tab options (alternatives: smaller tabs, horizontal scroll, renamed tabs). Your visual check will confirm.

## Known issues / follow-ups
None.

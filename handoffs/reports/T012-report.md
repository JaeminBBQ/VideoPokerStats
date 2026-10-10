# T012 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
The Odds tab gains two exact-data sections. "Chance you finish ahead" renders every `sessions` row as a stacked bar (green = ahead with no royal, gold = ahead thanks to a royal), with a 4-hour headline, per-row ahead% and average bets, and the spec's footnote. "Reach a goal before you go broke" adds a whole-dollar starting-budget input (default $100, not persisted) and the `goalTable` comparison table against blackjack, craps, and roulette, with the data-driven takeaway, per-goal muted goal lines, a gold "best" cell per row, the House edge row, and the rules footnote. New helpers `pct`, `sessionLabel`, `signedBets` in `src/lib/oddsFormat.ts` with tests. All acceptance commands pass, and the 375px layout was DOM-verified in headless Chrome (0px horizontal overflow, 12px bars, 44px input, 13px table, no console errors).

## Files changed
- `src/lib/oddsFormat.ts`: `pct` (whole % from 10% up, one decimal below, "<0.1%", "0%"), `sessionLabel` ("100 hands", then hours), `signedBets` ("−16.2", "+0.4").
- `src/lib/oddsFormat.test.ts`: tests for the three new helpers (pct 15% / 0.3% / 8.1% / <0.1% / 0%; sessionLabel 100/600/2400/24000; signedBets ± and 0).
- `src/components/OddsTab.tsx`: the two new sections between the summary tiles and "Every hand at a glance"; `bet`/`denomination`/`maxCoins` props; budget state + `useMemo` over (budget, bet, game).
- `src/App.tsx`: passes `bet={betCents(denomination, maxCoins)}`, `denomination`, `maxCoins` to `OddsTab`.
- `src/index.css`: styles for the ahead bars/legend/rows and the goal input/table under the existing odds block.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / tests / build exit 0 | pass | `npm run lint && npm run typecheck && npm test && npm run build` → all exit 0; 261 tests pass (incl. the 2 new `goalTable` D20 tests) |
| Protected-path diff empty | pass (with note) | `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/lib/goals.ts` shows only `src/engine/goals.ts` and `src/lib/goals.ts` — **the orchestrator's mid-task D20 changes (uncommitted), not mine**. None of my files touch protected paths. |
| `oddsFormat.test.ts` covers pct (15%, 0.3%, <0.1%, 0→"0%"), sessionLabel (100, 600, 2400, 24000), signedBets | pass | 7 new assertions in the file; `vitest run` green. |
| 375px: no horizontal scroll, bars readable, table fits | pass | Headless Chrome @375px: page scrollWidth−clientWidth = 0px; all bars 12px, green left of gold, no row overlaps; input 44px; table 5 columns ≈309px, 13px cells, best cells weight 700 + gold; zero console errors. |

## Deviations from the spec
1. **`pct` boundary is 10%, not "1%" as the spec text says.** The spec sentence says "whole percent ('15%') from 1% up", but the acceptance check tables need one decimal under 10% (8.1%, 5.6%, 2.7% …). Whole-from-1% would render those as 8%/6%/3% and fail the visual check. Implemented: <10% → one decimal, ≥10% → whole.
2. **No "100 hands" sub-line on the 100-hand row.** The label already is the hands count, so the muted line would just repeat it.
3. **Mid-task D20 (orchestrator):** `goalTable` changed while T012 was in progress (tables now bet their minimums: BJ $15, craps $3, roulette $15). My Part 2 code compiles against and renders the new data correctly — verified in node and in the browser that it reproduces T012a's check table exactly (e.g. GSR JoB 9/5 $1/$100: +$5 82/85/91/81, +$15 66/83/80/81, Double 17/45/27/30, Triple 8.1/30/9.7/12). Consequently T012's original Part 2 spec copy (the "Every game below bets the same…" bet line, the "Table minimums are usually higher…" footnote sentence, the takeaway rule) and its Part 2 visual-check numbers are **superseded by T012a**, which replaces exactly those pieces.
4. **Takeaway "Otherwise" branch substitutes the best column's name** into Claude's sentence ("Blackjack's tiny edge and low swings…"). With D20 data the best column on Double is always video poker or blackjack, so the rendered text matches the spec sentences; if craps or roulette ever won, the sentence would read "{name}'s tiny edge and low swings…".

## Dependencies added
None.

## Questions / proposals for Claude
1. Confirm the 10% boundary in `pct` (deviation 1) — it's what makes your check tables render as written.
2. The original T012 check table said Triple/Blackjack = 21% (GSR JoB 9/5, $1, $100); the engine computes 20.46% → "20%". Moot now that D20 superseded that table, but flagging in case the 21% came from a different computation you want to reconcile.
3. T012a is spec'd and my rendering is already compatible with it; handing it over next will only touch the header bet lines, the unplayable-column "—", and the three copy blocks.

## Known issues / follow-ups
- T012a (per-column table-minimum bets, unplayable columns, new takeaway/footnote) — spec in `handoffs/tasks/T012a-table-minimums.md`, ready to hand over.
- The user's visual check should use T012a's Part 2 table, not T012's.

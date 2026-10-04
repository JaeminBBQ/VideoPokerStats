# T003 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Drill mode and the Chart tab are in. Feedback and the top-holds table now name holds in strategy-chart vocabulary for the four deuces games. Drill mode picks a recurring confusion (weighted by EV lost), deals a fresh hand posing the same decision (`engine.similar` for chart games, `disguiseHand` otherwise), grades it exactly like Deal mode, and clears the confusion after 3 correct drills in a row; deal-mode mistakes reopen their confusion. Per-game totals now count Deal hands only (D7). A top-level Chart tab renders the generated chart JSONs (returns, rule line, one table per deuce section). Drill progress persists at `vp.v1.drill`, last mode per game in `vp.v1.settings`.

## Files changed
- `src/lib/drill.ts` (new): `confusionKey`, `groupConfusions`, `DrillState`, `applyDrillResult`, `applyNewMistake`, `pickConfusion`, `drillSessionStats`, `deucesLabel` — pure, tested.
- `src/lib/drill.test.ts` (new): 18 tests covering all of the above.
- `src/lib/stats.ts`: `recordHand` skips totals for `mode: 'drill'` records (D7).
- `src/lib/stats.test.ts`: +1 test (drill records leave totals alone).
- `src/lib/storage.ts`: `vp.v1.drill` key with shape validation; `Settings.mode` (per-game deal/drill).
- `src/lib/storage.test.ts`: drill round-trip + corrupt-data default; settings fixtures updated for `mode`.
- `src/lib/charts.ts` (new): statically bundles `src/charts/*.json` via `import.meta.glob`.
- `src/components/ChartTab.tsx` (new): chart rendering, non-chart placeholder.
- `src/components/DrillPanel.tsx` (new): top 5 uncleared confusions, to-drill/cleared counts, session drill stats.
- `src/components/TopHolds.tsx`: "Line" column with `patternFor(...).label` for chart games.
- `src/App.tsx`: Trainer/Chart tabs, Deal/Drill mode switch, drill flow (pick → similar/disguise → grade → streak), chart-line names in feedback, drill persistence, reset clears the drill pool.
- `src/index.css`: tabs, mode switch, drill prompt/panel, chart tables; tighter table padding at ≤640px.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` → exit 0 | pass | `npm run lint` — no warnings, exit 0 |
| `npm run typecheck` → exit 0 | pass | `npm run typecheck` — clean, exit 0 |
| `npm test` → all pass | pass | 7 files / **104 tests passed** (81 prior + 4 engine drill tests from T002a + **19 new**: 18 in `drill.test.ts`, 1 in `stats.test.ts`). Covers confusionKey (chart + hand-based, deal order), groupConfusions (only mistakes, deal+drill modes, sorted by evLost, example = newest), applyDrillResult (clears at 3, resets on wrong), applyNewMistake, pickConfusion (skips cleared, avoids lastKey, falls back to lastKey alone, null when empty, seeded 1000-pick weighted check: 9× evLost picked more than 1×), recordHand drill records, `vp.v1.drill` storage round trip + corrupt default |
| `npm run build` → exit 0 | pass | `npm run build` — built in 107ms, worker chunk present (`dist/assets/worker-CSUuJHoM.js`), chart JSONs bundled (verified `chartReturn`/game ids in bundle) |
| `git diff --stat -- src/engine scripts src/charts` → empty | pass | No output |
| `grep -rnE "window\.(alert|confirm|prompt)|\balert\(" src` → no output | pass | No matches |

The user does the visual check (drill flow, chart tab, phone width).

## Deviations from the spec
1. `applyNewMistake` returns the state unchanged when the confusion has no entry or is already `{streak: 0, cleared: false}` (those two mean the same thing), so `vp.v1.drill` doesn't accumulate an entry for every distinct mistake. A cleared or in-progress confusion still resets to `{0, false}` as specified; tests cover both.
2. "M cleared" counts cleared confusions that are currently in history. A confusion whose records fell off the 5000-hand history cap disappears from both counts; its (now inert) drill-state entry lingers in storage.
3. Pool-empty message renders above the cards (where the drill prompt goes) when no hand is out; the drill panel below shows the counts including "0 to drill". Not duplicated in the panel.
4. "closest available" note for a section-only match reads "closest available: same number of deuces" (spec listed the two note texts with a shared prefix).
5. Mode persisted per game as `settings.mode` (`Partial<Record<GameId, Mode>>`), matching "per game; remember the last mode in settings".

## Dependencies added
None.

## Questions / proposals for Claude
1. Should the active tab (Trainer/Chart) persist across reloads, like mode does? Currently session-only; mode persists.
2. For an empty hold the chart line reads "Discard everything", so feedback shows e.g. "Yours: Discard all: Discard everything". Slightly redundant; happy to drop the label for empty holds if you prefer.
3. Stale drill-state entries from capped-away history are inert but never removed. Want a cleanup pass (prune keys absent from `groupConfusions`) on save?

## Known issues / follow-ups
- None. Drill-mode UI behavior (prompt copy, panel rows, 375px) awaits the user's visual check.

# To Claude
**Task:** T003 (drill-and-chart)
**Status:** done
**Report:** handoffs/reports/T003-report.md
**Updated:** 2026-10-04 13:05

## In one paragraph
Drill mode and the Chart tab are in, plus chart-line names in feedback and the top-holds table. Drill picks a recurring confusion weighted by EV lost (fresh similar hand via `engine.similar` for chart games, `disguiseHand` otherwise), grades identically to Deal mode, records `mode: 'drill'`, and clears a confusion after 3 correct in a row (streak resets on wrong, deal-mode mistakes reopen via `applyNewMistake`). Totals now count Deal hands only (D7). Drill state persists at `vp.v1.drill`; last mode per game in settings. The Chart tab renders the generated chart JSONs. All acceptance criteria pass: lint, typecheck, 104 tests (19 new in `src/lib/`), build with worker chunk, engine/scripts/charts untouched, no dialogs. Ready for your review and the user's visual check (drill flow, chart tab, 375px).

## Needs Claude's attention
1. `applyNewMistake` is a no-op when the confusion is already at `{streak: 0, cleared: false}` or absent, to avoid storing an entry for every distinct mistake (report deviation 1). Observable behavior is as specified.
2. Three small product questions in the report: persist the active tab? drop the "Discard everything" label on empty holds? prune stale drill-state entries?

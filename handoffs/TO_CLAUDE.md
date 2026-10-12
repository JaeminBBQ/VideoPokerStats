# To Claude
**Task:** T019 (craps systems + side bets UI)
**Status:** done
**Report:** handoffs/reports/T019-report.md
**Updated:** 2026-10-12 16:35

## In one paragraph
Built the craps simulator UI: Bets (Pass / Don't pass) and System (One bet / 3-point molly) chips, Odds renamed with the per-side limits note, the four-system compare table under the edge line with the selected row highlighted, side-bet dollar inputs whose exact cost is added to the edge line, the craps footnote, the "—" explanation lines under the leave table, and the side-bet reference table at the bottom of the Odds tab. `crapsSide` / `crapsStyle` / `sideBetsCents` are wired into params, `tableEdge`, and the advice call + key. All acceptance commands pass (lint, typecheck, 314 tests, build; no diffs under src/engine, scripts, src/odds, src/lib, docs), and I smoke-tested with headless Chrome at 375px: compare rows read 1.41/0.65/$1.26, 1.41/0.65/$3.03, 1.36/0.51/$1.21, 1.36/0.51/$2.93; side bets add $9.54/h; odds-tab table reads 1 in 37.95 / 18.30% and 1 in 190.2 / 20.61%; no horizontal scroll; no console errors.

## Needs Claude's attention
1. Deviation: I did not use `oneIn` for the side-bet chances — it renders "1 in 37.9" / "1 in 190", but the spec and acceptance quote "1 in 37.95" / "1 in 190.2". Added a local `sideBetOneIn` (two decimals under 100, one above). See the report for the other three small questions.

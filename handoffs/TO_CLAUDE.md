# To Claude
**Task:** T011 (odds-tab)
**Status:** done
**Report:** handoffs/reports/T011-report.md
**Updated:** 2026-10-10 03:04

## In one paragraph
The Odds tab is built: fifth tab after Assist, driven by the header game picker, reading only the bundled `ODDS_BY_GAME` data (no engine calls, no stats, no localStorage). It has the headline-category chips, per-hold odds rows with MiniCards (held normal / discards dimmed / deuces wild), Dealt and Perfect-play summary cards with the 600-hands/hour pace line, and the at-a-glance table with the selected row highlighted. All acceptance criteria pass: lint/typecheck/tests (236)/build all exit 0, the protected-path diff is empty, and the odds component has no stats hooks. Verified in node that the rendered strings match every value in the spec's visual checklist.

## Needs Claude's attention
1. Intro line is spec-literal, so deuces games read "a Four Deuces" — want an article helper?
2. Hours line is omitted when perfect ≥ 1/600, which hides sub-hour paces (e.g. JoB Four of a Kind at 0.7 hours).
3. Tab bar wraps to two rows at ≤640px so five tabs fit 375px without scroll (see report deviations).

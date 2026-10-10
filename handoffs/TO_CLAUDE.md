# To Claude
**Task:** T012a (table-minimums)
**Status:** done
**Report:** handoffs/reports/T012a-report.md
**Updated:** 2026-10-10 14:42

## In one paragraph
T012a is done on top of T012 (both ready for your review, per the two reports). The goal table now renders your D20 change: per-column header bet lines ("$15.00/hand (min)" when the column bets its minimum), "—" in every odds cell of columns the budget can't cover plus a per-column note under the table ("Blackjack: your budget is under the $15.00 bet."), the new bet line with minimums taken from `columns[i].minBetCents`, the new takeaway naming the Double row's best column, and the footnote's last sentence replaced. All four acceptance commands exit 0 and the protected-path diff contains only your own uncommitted `engine/goals.ts` + `lib/goals.ts` changes. Verified in headless Chrome at 375px: both visual-check cases match exactly (GSR JoB 9/5 $1/$100 headers and table; $10 Legends Bay 5¢ "—" columns + notes), 0px overflow, no console errors.

## Needs Claude's attention
1. **T012 + T012a are both in `review` on the board; review them together.** T012's original Part 2 copy/check-numbers are superseded by D20/T012a — see T012-report deviations 3.
2. **`pct` boundary is 10%, not "1%"** as T012's spec text says — one decimal under 10% is what your check tables require (8.1%, 5.6%…). Confirm or tell me to change it.
3. Takeaway with `columns[b].name` reads "Craps — pass line gives you the best shot at doubling." in the $10-budget case — spec-literal, slightly clunky (T012a report Q1).
4. Two possible copy cleanups flagged in the T012a report (Q2 duplicate bet line, Q3 adjacent "whole bets"/"smallest win" sentences) — happy to do them as a T012b if you want.

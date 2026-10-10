# To Claude
**Task:** T013 (craps-odds-column)
**Status:** done
**Report:** handoffs/reports/T013-report.md
**Updated:** 2026-10-10 15:20

## In one paragraph
The goal table fits five columns at 375px (11.5px font, tighter padding, and a two-span CSS swap that shortens the header sub-line to "$15 min" / "$3 min" / "$1/hand" at ≤640px while keeping "$3.00/hand (min)" at desktop), the footnote now loops `columns.slice(1)` for every table game's rules and finds the roulette example by id, the new Craps 2× sentence is added, and the bet line shows short names ("Blackjack $15, Craps $3, Roulette $15, Craps 2× $3"). All four acceptance commands exit 0 (270 tests), the protected-path diff is empty, and headless Chrome at 375px confirms scrollWidth = 375 (no horizontal scroll), zero overflowing cells, and the exact T013 numbers (GSR JoB 9/5, $1, $100: +$10 73/83/84/81/87, Double 17/45/27/30/46, Triple 8.1/29/9.7/12/29, edges 1.55/0.51/1.41/5.26/0.61).

## Needs Claude's attention
1. The spec's Craps 2× sentence ("…counts the odds money in its house edge…") overlaps the column's own `rules` string ("…(0.61% of all money bet; the odds bet has no edge)"). Kept both; the `rules` parenthetical could be trimmed in `src/engine/goals.ts` if you'd rather not repeat it.
2. Nothing else — no blockers, no deviations that need a decision.

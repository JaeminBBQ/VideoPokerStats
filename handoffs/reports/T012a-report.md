# T012a Report

**Status:** done
**Implementer:** DeepSeek

## Summary
The goal table now shows the D20 reality: each column header carries its bet ("$15.00/hand (min)" etc.) under the game name, columns the budget can't cover render "—" with a per-column note under the table and are never marked best, the bet line explains table minimums from the data, the takeaway names whichever column is best at doubling, and the footnote's last sentence describes minimum betting and fractional goals. Verified in headless Chrome against both T012a visual-check cases.

## Files changed
- `src/components/OddsTab.tsx`: header bet sub-lines with "(min)"; "—" for unplayable columns; unplayable notes under the table; the new bet-line second sentence (minimums from `columns[i].minBetCents`); the new `goalTakeaway` (uses `columns[b].name`); the footnote's last sentence replaced. `goalTakeaway` stays in the same place; nothing else in T012's structure changed.
- `src/index.css`: `.odds-goal-head-bet` (muted 11px header sub-line).

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / tests / build exit 0 | pass | All four exit 0; 261 tests pass. |
| Protected-path diff empty | pass (with note) | `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/lib/goals.ts` shows only `src/engine/goals.ts` + `src/lib/goals.ts` — the orchestrator's uncommitted D20 changes, not mine. My changes are `OddsTab.tsx` + `index.css` only. |
| GSR JoB 9/5, $1, $100: headers $1.00 · $15.00 (min) · $3.00 (min) · $15.00 (min); table matches | pass | Headless Chrome: headers read "Video poker $1.00/hand", "Blackjack $15.00/hand (min)", "Craps $3.00/hand (min)", "Roulette $15.00/hand (min)". Rows: +$5 82/85/91/81 (best 91% craps), +$15 66/83/80/81 (best 83% BJ), Double 17/45/27/30 (best 45% BJ), Triple 8.1/30/9.7/12 (best 30% BJ). Takeaway: "Blackjack gives you the best shot at doubling. …" |
| Budget $10, Legends Bay 5¢: BJ + roulette "—" with notes | pass | Headless Chrome: BJ and roulette odds cells all "—", craps + VP numeric; notes under the table: "Blackjack: your budget is under the $15.00 bet." and "Roulette: your budget is under the $15.00 bet."; best cells never on unplayable columns; 0px horizontal overflow; no console errors. |

## Deviations from the spec
1. **Bet-line minimums order.** The spec's example parenthetical is "(blackjack $15, roulette $15, craps $3)"; I generate it in `columns` order (blackjack, craps, roulette) since the instruction was to take the minimums from `columns[i].minBetCents` without hard-coding. Values and names come from the data either way; trivially reorderable.
2. **Minimums in the bet line show whole dollars** ("blackjack $15"), matching the spec sentence, while headers use `formatCents` ("$15.00/hand") matching the header example.
3. **Unplayable columns keep their House-edge value** (e.g. blackjack's "0.28%" still shows in the edge row); only odds cells become "—", per the spec's "every odds cell".

## Dependencies added
None.

## Questions / proposals for Claude
1. The takeaway uses `columns[b].name` per spec; with the $10-budget case this reads "Craps — pass line gives you the best shot at doubling." — correct per template, slightly clunky. Fine to leave?
2. The bet line's first sentence ("Betting $0.25 a hand (5 coins × 5¢): 40 bets.") and the new second sentence's opening ("Video poker bets $0.25 a hand (5 coins × 5¢).") repeat the same bet info. I kept both because T012a only replaced the second sentence; want me to trim the first one's bet parenthetical in a follow-up?
3. The footnote now has both "Goals round up to whole bets." (T012, kept) and "Goals round up to the smallest win each game can reach." (T012a) — adjacent and easy to misread as contradictory. Also kept per "keep the rest of the T012 footnote"; flagging for a possible cleanup.

## Known issues / follow-ups
- None. T012 + T012a are both ready for review; the user's visual check should use T012a's Part 2 numbers (T012's are superseded by D20).

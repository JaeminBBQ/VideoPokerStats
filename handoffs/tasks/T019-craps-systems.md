# T019: Craps simulator: pass / don't, single / 3-point molly, side bets, and a cost comparison

**Owner:** DeepSeek · **Depends on:** T017, T019a · **Size:** small–medium

## Why
The owner plays a 3-point molly on bubble craps and asked about don't pass / don't come. The engine now plays craps roll by roll with all four systems at the owner's odds limits (1× on 4/10, 2× on 5/6/8/9). (D31) The owner also asked for the All Small / All Tall / Make 'Em All side bets, with their odds checked. (D32)

## Engine (done, T019a; don't change it)
In `src/lib/tableSim.ts`:
- `TableSimParams` has two new optional craps fields: `crapsSide?: 'pass' | 'dont'` and `crapsStyle?: 'single' | 'molly'` (defaults pass / single). `crapsOdds` now means "odds at the owner's limits" (take or lay).
- Craps `unit` is now `'roll'`, pace 100 rolls/hour, presets 60/80/100/120/150. `maxRounds` = rolls. A craps run's `rounds` counts every roll, including the ones after the session stops while the last bets resolve.
- `tableEdge({ game, crapsOdds, crapsSide, crapsStyle })` returns `{ perBet, perWagered, perRound }`. `perRound` is the average loss per hand/roll in base bets, so cost per hour = pace × bet × perRound. (T019a already switched the existing $/hour line to `perRound`.)
- Exact craps odds can come back `null` for long molly sessions (too large to compute). The existing "—" handling covers it.
- Side bets (D32): `TableSimParams.sideBetsCents?: { small?, tall?, all? }` (cents per round). Any non-zero stake makes `exactTableAsync` return `null` and `tableLeaveAdviceAsync` return all-null rows (simulated only). `SIDE_BET_TABLE` lists each bet with `name`, `numbers`, `paysFor`, `p`, `oneIn`, `edge`. `sideBetCostPerRollCents(stakes)` is the exact average side-bet cost per roll (× pace = per hour). `SIDE_BETS_CONFIRMED` (from `src/engine/craps.ts`) is `false` until the owner's photo.

## Scope: do
1. **Craps controls** (craps only, after Bet): `Bets` chips `Pass` / `Don't pass`; `System` chips `One bet` / `3-point molly`; rename the existing `2× odds` control to `Odds` (On / Off). Under Odds, a `.sim-note`: Pass → `1× on 4 and 10, 2× on 5, 6, 8, 9`; Don't → `Lay to win 1× on 4 and 10, 2× on 5, 6, 8, 9`. Pass all three into `params`, the advice call, `tableEdge`, and the advice key.
2. **Edge line for craps**: `House edge {perBet}% of each {line} bet{s} (0.xx% of all money bet, odds included) → about $X an hour`. `{line}` is `pass-line` for one pass bet, `pass and come` for the pass molly, `don't pass` / `don't pass and don't come` likewise. Keep the parenthetical only when odds are on.
3. **Compare systems** (craps only), a small table right under the edge line: rows `One pass bet`, `Pass molly`, `One don't bet`, `Don't molly`, with columns `Edge per bet`, `Per $ out`, and `Per hour`. Use `tableEdge` with the current odds setting, bet, and pace. Highlight the selected row (`.best`-style class or similar). At $3 × 100/hour with odds it reads about 1.41% / 0.65% / $1.26, 1.41% / 0.65% / $3.03, 1.36% / 0.51% / $1.21, 1.36% / 0.51% / $2.93. Under it, a `.sim-note`: `A molly has the same edge as one bet, on about 2.4× the money. The don't side is a little cheaper.`
4. **Craps footnote** replaces the craps part of the current footnote: `Craps is played roll by roll from exact dice odds. A 3-point molly keeps a line bet and up to two come bets working. Pass-side come odds are off on the come-out roll; lay odds always work. When the session stops (goal, loss limit, or time), you stop betting and the bets already out play to the end, so results are what you'd leave with. If your bankroll can't cover a bet plus its odds, you bet without odds or skip the come bet.`
5. **Side bets** (craps only), a control group `Side bets (per round)` after Odds: three `$` whole-dollar inputs `All Small`, `All Tall`, `Make 'Em All` (default empty = 0). Pass them as `sideBetsCents`. When any is set: add ` + side bets about $Y an hour` to the edge line (Y = pace × `sideBetCostPerRollCents`), and show under the inputs: `Side bets are placed at the start and after every 7; they lose on a 7 and pay as soon as every number is in. Session results with side bets are simulated only.` While `SIDE_BETS_CONFIRMED` is false, add `Pays (31 for 1, 151 for 1) are from memory, not yet photographed.`
6. **Odds tab reference**: at the bottom of the Odds tab, a section `Craps side bets (bubble craps)` with a table: Bet · Wins if, before a 7 (`2 3 4 5 6` etc.) · Chance (`1 in 37.95`, use `oneIn` from `src/lib/odds.ts`) · Pays (`31 for 1`) · House edge (`18.30%`). Same unconfirmed note when `SIDE_BETS_CONFIRMED` is false, and one comparison line: `For comparison: pass line 1.41%, don't pass 1.36%. Machines paying 34 to 1 and 175 to 1 are about 7.8% and 7.5%.`
7. When an exact cell or a leave row is `null` for craps, show `—` as now, plus one line under the leave table: `Too long a molly session to compute exactly; the simulated results above still apply.` Show it only when some row is null. With side bets on, say instead: `Exact odds aren't available with side bets; the simulated results above still apply.`

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/`, or `docs/`. Don't commit.
- Blackjack and video poker stay as they are.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib docs` is empty once T019a is committed (Claude checks).

Visual check (the owner, at phone width):
- Craps $3, 100 rolls/hour: the compare table shows the four rows above, and the selected row follows the chips.
- Pass molly, $100 budget, 2 hours: one session draws a graph, and the 1,000-session table shows an Exact column, possibly "…" for a few seconds first.
- Don't molly, $300 budget, 12 hours: the leave table shows "—" rows and the "too long" line, with no freeze (the work runs in the worker).
- $1 on each side bet at 100 rolls/hour: the edge line adds about $9.54 an hour; exact columns show "—" with the side-bet line; one session still runs.
- Odds tab: the side-bet table reads 1 in 37.95 / 31 for 1 / 18.30% (Small, Tall) and 1 in 190.2 / 151 for 1 / 20.61% (Make 'Em All).
- Nothing scrolls sideways at 375px.

## Report
`handoffs/reports/T019-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

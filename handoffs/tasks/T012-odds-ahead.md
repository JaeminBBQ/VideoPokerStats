# T012: Odds tab: "Chance you finish ahead" + "Reach a goal" vs blackjack, craps, roulette

**Owner:** DeepSeek · **Depends on:** T011 (done), T011a + T011b engine (Claude, done) · **Size:** medium

## Goal
The owner asked for "odds of profiting". The engine now gives, per game, the exact chance of finishing a session **ahead / even / behind** after 100 hands up to 40 hours of perfect play. It also gives how much of "ahead" survives **without a royal** (D18). The story the page should tell: short sessions are coin flips weighted against you, and long-session wins are almost all royals. For example, on JoB 8/5 after 8 hours you're ahead 15.0% of the time, but only 3.8% without a royal.

The owner then asked for two more things, which are **Part 2** below: the odds of turning a starting budget into +$5, +$10, +$15, double, or triple, and how that compares with blackjack, roulette, and craps (D19). `goalTable` in `src/lib/goals.ts` computes the whole table exactly. You render it.

## Read first
- `src/lib/goals.ts`: `goalTable(vpName, perHand, budgetCents, betCents)` → `GoalTable` (`columns`, `rows` with `odds[]` and `best`, or `{ ok: false, reason }`), and `GOALS`, `MAX_BUDGET_BETS`.
- `src/engine/goals.ts` `TABLE_GAMES` (read the `rules` strings only; don't change the file).
- `src/lib/bankroll.ts`: `betCents(denomination, maxCoins)`, `formatCents`.
- `src/lib/odds.ts`: `GameOdds.sessions: OddsSession[]` (`hands`, `ahead`, `even`, `behind`, `aheadNoRoyal`, `avgBets`). **This is your only data source.** Never compute probabilities.
- `src/odds/job-8-5.json` → `sessions`
- `src/components/OddsTab.tsx`, `src/lib/oddsFormat.ts`, the `odds-*` CSS in `src/index.css`

## Scope: do (Part 1: "Chance you finish ahead")
1. **New section in `OddsTab`, placed between the summary tiles and "Every hand at a glance"**, titled **"Chance you finish ahead"**. It doesn't depend on the selected chip.
2. **Headline sentence** from the 4-hour row (`hands === 2400`):
   "Play perfectly for 4 hours and you finish ahead **{pct(ahead)}** of the time. Without a royal, only **{pct(aheadNoRoyal)}**."
3. **One row per `sessions` entry**, in data order:
   - **Session** label: `hands / 600` hours: "100 hands" for 100 (10 minutes isn't a useful label), then "1 hour", "2 hours", "4 hours", "8 hours", "20 hours", "40 hours". Put a small muted hands count under it ("2,400 hands").
   - **A stacked bar**, full width of the remaining space, representing 0–100%:
     - green segment, width `aheadNoRoyal`: "ahead without a royal"
     - gold segment right after it, width `ahead − aheadNoRoyal`: "ahead thanks to a royal"
     - rest: the existing faint track (behind or even)
     Bars must stay readable at 375px (min height 12px, rounded track). No chart library: plain divs with inline `width: %` from the data.
   - **Right side:** `pct(ahead)` big, with "avg {avgBets formatted as −16.2} bets" small and muted underneath (one decimal, a real minus sign "−").
   - A small legend above the rows: green swatch "ahead, no royal needed", gold swatch "ahead because of a royal".
4. **Formatting helper** in `src/lib/oddsFormat.ts` (with tests): `pct(p)` → whole percent ("15%") from 1% up, one decimal below ("0.3%"), and "<0.1%" when 0 < p < 0.001. Also `sessionLabel(hands)` and `signedBets(x)` ("−16.2", "+0.4").
5. **Footnote** under the section: "Exact, not simulated. Perfect play at max bet, 600 hands/hour, and enough bankroll to finish the session (whether you'd go broke first is the Bankroll tab). 1 bet = one max-bet hand. Longer isn't always worse: a royal pays 800 bets, so once a session is long enough for one royal to cover the losses, the chance of being ahead can bump up. Break-even sessions count as not ahead."

## Scope: do (Part 2: "Reach a goal before you go broke")
6. **New section after Part 1**, titled **"Reach a goal before you go broke"**. App passes `OddsTab` the current bet: `betCents(denomination, maxCoins)` using App's existing snapped `denomination` and `maxCoins`. Add the prop. It doesn't depend on the selected chip.
7. **Inputs:** a "Starting budget" dollar field (default **$100**, whole dollars, `inputMode="numeric"`, at least 44px tall) and a muted line under it: "Betting {formatCents(bet)} a hand ({maxCoins} coins × {denomination}): {budgetBets} bets. Every game below bets the same {formatCents(bet)} per round." Don't persist the budget.
8. **Call `goalTable(game.name, odds.perHand, budgetCents, bet)`** in a `useMemo` on (budget, bet, gameId). If `ok: false`, show "Your budget doesn't cover one {bet} bet." or "That's over 5,000 bets. Try a smaller budget." in place of the table.
9. **The table:** columns **Goal · Video poker · Blackjack · Craps · Roulette** (use `columns[i].short`). Rows come from `rows`:
   - Goal cell: `label`, with a small muted line: "+{formatCents(goalCents)}" for Double/Triple, and "{goalBets} bets" for all rows.
   - Odds cells: `pct(odds[i])` (Part 1's helper). Mark the **best** cell per row (`best`) with the gold "selected" treatment and bold. Show cells of exactly 0 as "0%". Show anything tiny as "<0.1%".
   - A last row, **"House edge"**, from `columns[i].edge` with 2 decimals ("0.28%", "1.55%").
   - It must fit 375px with no horizontal scroll: tabular numbers, about 13px, wrapped headers. Check it.
10. **Takeaway line** above the table, picked from the data (no math beyond comparisons): if video poker is best on the Double row, "Here video poker gives you the best shot at doubling (the royal does the heavy lifting)." Otherwise, "Blackjack's tiny edge and low swings beat video poker for these goals. Video poker's chance comes mostly from rare big hands." Use the name of whichever column is best on the Double row.
11. **Footnote:** "Play until you reach the goal or can't cover a bet. No time limit. Goals round up to whole bets. Exact, not simulated. Video poker: this paytable, perfect play. Blackjack: {rules}. Craps: {rules}. Roulette: {rules}. Blackjack assumes you can always afford a double or split. Table minimums are usually higher than a video poker bet, so the same-bet comparison is about the game's math, not what a casino will let you bet." Take `{rules}` from `columns[i].rules`.

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/odds.ts`, or `src/lib/goals.ts`. No new dependencies, no localStorage. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/lib/goals.ts` → empty.
3. `oddsFormat.test.ts` covers `pct` (15%, 0.3%, <0.1%, 0 → "0%"), `sessionLabel` (100, 600, 2400, 24000), and `signedBets`.

The user does the visual check (generated data):
- JoB 8/5: headline "ahead 16% … only 10%". 8 hours: 15% (green ≈ 3.8%, the rest gold), avg −129.7 bets. 40 hours: 16%, essentially all gold.
- JoB 9/6 ($1): 40 hours 38%. DWBP: 40 hours 41%.
- 375px: no horizontal scroll, bars readable.
- Part 2, **GSR JoB 9/5 (5¢ × 20 = $1 a hand), $100 budget**:

  | Goal | Video poker | Blackjack | Craps | Roulette |
  |---|---|---|---|---|
  | +$5 | 82% | **94%** | 86% | 59% |
  | +$50 | 36% | **59%** | 23% | 0.5% |
  | Double | 17% | **39%** | 5.6% | <0.1% |
  | Triple | 8.1% | **21%** | 0.3% | <0.1% |
- Part 2, **Legends Bay JoB 8/5 at 5¢ ($0.25 a hand), $100**: +$5 VP 62% / BJ **90%**. Double: VP **19%** / BJ 15% (video poker wins). Triple: VP **8.6%** / BJ 2.7%.

## Report
`handoffs/reports/T012-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

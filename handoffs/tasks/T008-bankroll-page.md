# T008: Bankroll tab: how much money each game and denomination needs

**Owner:** DeepSeek · **Depends on:** T006 (done), T007 (done) · **Size:** small–medium

## Goal
The owner wants the bankroll analysis (D14) as a page in the app: pick a game, denomination, session length, and how safe they want to be, and see how much money to bring. The numbers are exact and already generated. **This task is display only.**

## Read first
- `DEEPSEEK.md`, `docs/bankroll/RISK.md` (what the numbers mean; the model section is the footnote copy)
- `src/lib/riskData.ts` + `src/lib/riskData.test.ts` (Claude wrote these): `RISK`, `riskFor`, `bankrollBets(gameId, errorRate, hands, target)`, `nearestErrorRate`, `betsToCents`
- `src/App.tsx` (the `Tab` type and the tab nav), `src/components/ChartTab.tsx` (tab page style), `src/lib/bankroll.ts` (`formatCents`), `src/lib/storage.ts` (`DENOMINATIONS`, `DENOM_LABELS`, `CONFIRMED_DENOMINATIONS`), `src/lib/stats.ts` (`errorRate`)

## Scope: do
1. **Third tab, "Bankroll"** after Trainer and Chart. The header's game picker still drives the game (as it does for Chart).
2. **Calculator** (`src/components/BankrollTab.tsx`), all controls as chips/segmented buttons (no `<select>`), wrapping at 375px:
   - **Denomination:** every entry of `DENOMINATIONS`, default `settings.denomination`; unconfirmed ones get the same `*` as the session setup.
   - **Session length:** 500 hands "~1 hour", 2,000 "~4 hours" (default), 10,000 "long trip". Values from `RISK.horizons`.
   - **Safety:** 90% / 95% (default) / 99% chance of not going broke. Values from `RISK.targets`.
   - **Error rate:** 0% / 0.5% / 1% / 2% from `RISK.errorRates`, plus a **"Mine"** chip: the current game's Deal-mode error rate from `totals` (`errorRate(totalsEntry)` is a percentage, so divide by 100), snapped with `nearestErrorRate`, labelled e.g. "Mine (1.3% → 1%)". Disabled with a tooltip/title when the game has 0 hands. Default: Mine if it has hands, else 0%.
3. **Result card:** big dollar figure `formatCents(betsToCents(bets, denom))`, with "N bets" under it and one sentence: "Bring $X to play H hands of <game> at <denom> with a P% chance of not going broke." Below: expected loss over the session (`expectedLossBets` → dollars) and the return at that error rate (`return`, 3 decimals in %).
4. **Compare table:** rows = the 4 games (current one highlighted), columns = the 3 session lengths, cells = dollars for the selected denomination/safety/error rate. Sort rows by the 2,000-hand column, cheapest first. Must fit 375px without horizontal page scroll (smaller type is fine).
5. **"Start a session with $X"** button under the result: rounds up to whole dollars, sets the denomination, switches to the Trainer tab in Deal mode, and starts the bankroll session (reuse `startBankroll` / the setup path; extend App's handlers as needed). If a session is already active, disable it with the note "End your current session first".
6. **Footnote** (small type): the model in plain words, from RISK.md's Model section. "Going broke" = can't cover a max bet. Mistakes = the next-best hold. Tier points and comps not counted. Paytables are the photographed 10¢ ones (5¢–25¢ confirmed). The numbers are exact and were checked against 240 million simulated hands.

## Scope: do not
- Don't modify `src/engine/`, `src/lib/risk.ts`, `src/lib/riskData.ts`, `src/bankroll/`, `scripts/`, `src/charts/`. Never compute or hard-code bankroll numbers in the UI. Every figure comes from `riskData.ts`. No dependencies. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine src/lib/risk.ts src/lib/riskData.ts src/bankroll scripts src/charts` → empty.
3. `grep -rnE "\b(238|241|311|1261)\b" src/components src/App.tsx` → no output (no hard-coded results).
4. Tests for any pure helper you extract (e.g. building the compare-table rows and their sort order; the "Mine" chip state from totals: 0 hands → disabled, 1.3% → 0.01). If you extract nothing testable, say so in the report.

The user does the visual check: JoB 8/5 · 5¢ · ~4 hours · 95% · 0% should show **$59.50 (238 bets)**. Deuces 16/13 at the same settings should show **$77.75 (311 bets)**. Also test the Start-session button and 375px.

## Report
`handoffs/reports/T008-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

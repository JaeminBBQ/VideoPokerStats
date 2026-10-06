# To Claude
**Task:** T008 (bankroll-page)
**Status:** done
**Report:** handoffs/reports/T008-report.md
**Updated:** 2026-10-05 18:15

## In one paragraph
Built the Bankroll tab: chip-only calculator (denomination, session length, safety, error rate incl. a "Mine" chip from the current game's Deal-mode totals), result card (dollar figure + bets + sentence + expected loss + return), compare table sorted by the 2,000-hand column, a "Start a session with $X" button (rounds up to whole dollars, switches to Deal-mode Trainer, reuses `startBankroll`), and the RISK.md-model footnote. All figures come from `riskData.ts` via new pure helpers in `src/lib/bankrollTab.ts` (tested: sort order, Mine 0 hands → disabled, 1.3% → 0.01). All acceptance criteria pass: lint/typecheck/test (180) /build all exit 0; no T008 change touches protected paths; grep for hard-coded results is clean.

## Needs Claude's attention
1. Criterion 2 (`git diff --stat -- src/engine src/lib/risk.ts src/lib/riskData.ts src/bankroll scripts src/charts`) is not empty, but only because of your uncommitted T007 change to `scripts/bankroll-risk.ts` (it now writes `src/bankroll/risk.json`), which was already in the working tree before T008 started. DeepSeek made no change to any protected path.
2. The compare table fits 375px via a ≤640px media query (11.5px type, 3px padding); the user will confirm visually. Headline checks hold: JoB 8/5 · 5¢ · ~4 h · 95% · 0% → $59.50 (238 bets); Deuces 16/13 same settings → $77.75 (311 bets).
3. Proposal (not implemented): hide the Deal/Drill mode switch on the Chart and Bankroll tabs.

# To Claude
**Task:** T009 (assist-tab)
**Status:** done
**Report:** handoffs/reports/T009-report.md
**Updated:** 2026-10-07 17:05

## In one paragraph
Assist tab is in: 5 ranks then 5 suits in 10 taps, cursor-driven entry from a pure tested module
(`src/lib/handEntry.ts`, 11 tests), automatic `engine.analyze` with stale responses dropped,
"Loading <game>…" while the engine prepares, result with HOLD labels / dimmed discards, "Discard all",
chart line + EV (4 decimals), ties shown as "Tie: any of these is correct" with every tied hold
listed (card HOLD labels suppressed while tied), and TopHolds below. No stats, no localStorage, no
engine/scripts/charts/bankroll changes. All four acceptance commands exit 0 (lint, typecheck, 191
tests, build), the forbidden-path diffstat is empty, and all three spec hands reproduce the expected
engine EVs exactly (18.3830 / 0.4719 / 0.5806).

## Needs Claude's attention
1. TopHolds' `userMask`/`userRank`/`evBest` are now optional instead of Assist passing dummies —
   Trainer passes them as before, so its look is unchanged.
2. When holds tie, the card row shows no HOLD labels; the tie list carries the answer (see report).
3. Entry state is local to the tab, so switching tabs clears an in-progress hand — flagged as a
   possible follow-up if that annoys the owner (report, Q1).
4. Visual check at 375px is still with the user, per spec.

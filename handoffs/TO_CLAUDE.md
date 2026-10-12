# To Claude
**Task:** T017 (table-game-simulator)
**Status:** done
**Report:** handoffs/reports/T017-report.md
**Updated:** 2026-10-11 22:25

## In one paragraph
The Simulator tab has a Game chip row (Video poker / Blackjack $15 / Blackjack $3 machine / Craps $3). Video poker is untouched (charts moved to `src/components/SimCharts.tsx` with `SessionChart` generalized to `{path, events, budgetCents, winGoalCents, lossLimitCents, maxRounds, roundsPerHour}`; VP passes 600). The new `TableSimulator` (built on T017a) has bet chips, craps 2× odds On/Off, budget/goal/loss/hours like VP, a pace select with `Other…` (1–1000), the spec's edge line, 1/1,000/when-to-leave sections (no comps, `unit` in the words), and the spec's footnote. All acceptance criteria pass: lint, typecheck, 304 tests, build, and the engine/scripts/odds/lib/docs diff is empty (T017a was already committed). I also drove the app in headless Chrome at 375px: edge lines read 0.73%/$6.58, 2.08%/$9.38, 1.41%/0.61%/$1.27; odds toggle changes the leave table; Other… accepts 45 → "≈ 180 bets"; nothing overflows 375px on any game; no console errors.

## Needs Claude's attention
1. The Game choice resets to Video poker when the video poker game changes (App keys SimulatorTab by gameId); the task said resetting is fine. Lift to App if you want it to survive — see report.
2. Minor local helpers (`dollars`, `clockAtPace`, `simShared.ts`) live in components because the scope forbade `src/lib/` — candidates for a later lib consolidation.
3. Build prints rolldown's pre-existing >500 kB chunk warning; no action needed.

# To Claude
**Task:** T016 (simulator-denom-and-holds)
**Status:** done
**Report:** handoffs/reports/T016-report.md
**Updated:** 2026-10-11 21:41

## In one paragraph
The Simulator tab has a denomination chip row first (same markup as BankrollTab: `game.offers`, `DENOM_LABELS`, `*` for unconfirmed, active on current) with a "5¢ × 20 coins = $1.00 a hand" note under it; App passes `onDenominationChange` like the Bankroll tab does. Markers' tooltips and a new 8-item big-hands list under the one-session chart show what was held (`dealt` / `drew all 5` / `held …`) from the T016a `held` field, with a `+N more` line when capped. All acceptance criteria pass: lint, typecheck, 292 tests, build, and my diff touches only `src/App.tsx`, `src/components/SimulatorTab.tsx`, `src/index.css` (T016a working tree untouched).

## Needs Claude's attention
Nothing.

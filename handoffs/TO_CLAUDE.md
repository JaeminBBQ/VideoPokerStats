# To Claude
**Task:** T014 (simulator tab) + T014a (venue comps)
**Status:** done
**Report:** handoffs/reports/T014-report.md · handoffs/reports/T014a-report.md
**Updated:** 2026-10-10 16:35

## In one paragraph
T014 built the Simulator tab (sixth tab): inputs, comps edge line, one-session SVG chart with event markers and tooltips, 1,000-session summary vs exact worker odds + histogram, and the "when to leave" table with the best rule highlighted. T014a on top: comps now use `compRatePerMultiplier(game.venue)` (GSR 0.05%/×, Legends Bay 1/600 per ×), multiplier defaults by venue (GSR 2×, LB 1×), venue hint texts, break-even shown to one decimal ("about 31.0×", "about 16.2×"), and the footnote names the venue's points rate. Lint, typecheck, all 290 tests, and the build pass; both tasks' visual-check numbers reproduce exactly (T014's advice table and 100.044%/99.644% edge values; T014a's 98.550%/31.0×, 98.700%, 97.465%/16.2×, 98.132%), and the 1,000-run leave-ahead lands within ±3 points of exact (verified 0.02 gap with a fixed seed).

## Needs Claude's attention
1. **Loss per hour (T014):** your spec formula (600 × bet × (1 − ret − compRate)) shows **$9.00** at the 1× visual-check config; the acceptance's "≈ $9.30" matches it *without* comps. I implemented the spec formula — confirm which you want (one-line change either way).
2. **`edgePct` is now three decimals everywhere.** Every number in both acceptance tables is 3-decimal (99.644, 100.044, 0.456, 98.550, 97.465, …); T014's "four decimals for percentages under 100" sentence contradicted its own table. Confirm.
3. **Multiplier reset (T014a):** the tab remounts per game (`key={gameId}`), so the multiplier resets to the venue default on any game switch, not only on venue changes. If you want it preserved within a venue, I'll drop the key and reset on venue change instead.
4. Your D24 changes (`compRatePerMultiplier` in `src/lib/simulate.ts` + test, DECISIONS/BOARD/HUMAN, the T014a task file) are untouched in the tree; my protected-path diff is empty.
5. Minor T014 deviations for the skim: hours to the nearest 0.05 h (matches 2.9/1.35/1.05), "You earn about $X an hour" wording when the total ≥ 100%, median's exact cell is "—", advice recomputes on multiplier changes too (lint requirement, same numbers).

# To Claude

**Task:** T004 (wild-cards)
**Status:** done
**Report:** handoffs/reports/T004-report.md
**Updated:** 2026-10-04 17:01

## In one paragraph
Built the wild card face (gold gradient + dark-gold border + glow + full-width red WILD banner on deuces and the joker; tokens on `:root`, `.wild-tag` gone), kept correct/dimmed states distinct on gold (green outline ring, harder dim), rendered chart examples as mini cards (wilds gold with a W chip), applied the empty-hold copy fix (feedback and Top-holds Line column now show only "Discard all"), and replaced the game select with casino tabs (VENUES row + per-venue chips with return, wired through the existing `switchGame`; venue follows the saved game). All acceptance criteria pass: lint, typecheck, 134 tests (5 new for `isWildCard` and `pickGameForVenue`), build; no `wild-tag`; tokens on `:root`; engine/scripts/charts untouched.

## Needs Claude's attention
1. Chip labels derive from `GameDef.name` with " — " → " "; long names (Legends Bay 10¢ deuces, Joker Poker) wrap inside their chips. If you want a dedicated short-name field, that's a `games.ts` change on your side.
2. Clicking the already-selected venue tab or chip is a no-op (matches old `<select>` behavior; can't reset a hand in progress).
3. Nothing else — no deviations.

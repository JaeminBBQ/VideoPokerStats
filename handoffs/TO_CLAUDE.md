# To Claude
**Task:** T015 (dealt-win banner)
**Status:** done
**Report:** handoffs/reports/T015-report.md
**Updated:** 2026-10-11 01:58

## In one paragraph
The trainer now shows a gold dealt-win banner ("JACKS OR BETTER" etc.) under the cards the moment they're dealt, in trainer, drill, and bankroll play, using `game.evaluate(hand)` on the main thread — no engine changes. The banner and the post-draw `.hand-result` share one reserved slot (`min-height`), so the Deal/Submit buttons never jump. The open paytable highlights the active row in gold: the dealt win while holding, the draw win (`result.outcome.rowIndex`) after the machine's second deal. All acceptance criteria pass: lint, typecheck, 290 tests, build all exit 0; protected-path diff empty. I also verified the four visual-check hands directly against `game.evaluate` (jacks pair → JACKS OR BETTER, tens pair → none, deuce+pair → THREE OF A KIND, lone deuce → none).

## Needs Claude's attention
1. Deviations (details in the report): `activeRow` is gated to `tab === 'trainer'` so a leftover trainer hand doesn't highlight the paytable on the Assist/Chart tabs (the Paytable is in the shared header); the reserved slot only exists while a hand is out, so pre-deal layout is unchanged.
2. The draw-win highlight stays lit until the next deal. If you want it to clear after a few seconds (some machines do), I can add a timeout.

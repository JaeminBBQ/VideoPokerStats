# T015 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
The trainer now shows the paying hand's name in a gold banner directly under the cards the moment they are dealt, exactly like a real machine lights up its paytable. The banner ("JACKS OR BETTER", "THREE OF A KIND", …) comes straight from `game.evaluate(hand)` on the dealt hand and is shown in trainer, drill, and bankroll (`mode === 'deal'`) play — not the Assist tab. The banner and the post-draw `.hand-result` share one reserved slot under the hand (`min-height`), so the Deal/Submit buttons never move whether the deal wins or not. The open paytable also highlights the active row in gold: the dealt win while holding, and the draw win (`result.outcome.rowIndex`) after the machine's second deal.

## Files changed
- `src/App.tsx`: `dealtRow = game.evaluate(hand)` during `dealt`; new `.dealt-win` banner and existing `.hand-result` moved into a shared `.hand-result-slot` (rendered while a hand is out); `activeRow` derived and passed to `Paytable`.
- `src/components/Paytable.tsx`: optional `activeRow?: number` prop; the matching `<tr>` gets class `active`.
- `src/index.css`: `.hand-result-slot` (reserved line), `.dealt-win` (gold, bold, like `.hand-result.win`), `.paytable-table tr.active td` (gold text on the whole row). `.hand-result`'s top margin moved to the slot.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` exit 0 | pass | oxlint, no findings |
| `npm run typecheck` exit 0 | pass | `tsc -b`, no errors |
| `npm test` exit 0 | pass | 25 files, 290 tests passed |
| `npm run build` exit 0 | pass | `✓ built in 103ms` (pre-existing chunk-size warning only) |
| `git diff --stat -- src/engine scripts src/odds src/lib` empty | pass | `PROTECTED-CLEAN` — no output from the stat |

Engine behavior for the visual-check cases, verified directly against `game.evaluate` (script in `/tmp`, not the repo):
- `job-8-5` pair of jacks → "Jacks or Better" → banner "JACKS OR BETTER"
- `job-8-5` pair of tens → no win, no banner
- `lb-deuces-16-13` deuce + pair → "Three of a Kind" → banner "THREE OF A KIND"
- `lb-deuces-16-13` lone deuce → no win, no banner

## Deviations from the spec
1. `activeRow` is gated to `tab === 'trainer'`. The Paytable lives in the header across all tabs, and the spec excludes the Assist tab; without the gate, a dealt hand left in the trainer would highlight the paytable while browsing Assist/Chart/etc. Bankroll play (`mode === 'deal'`) happens in the trainer tab, so nothing in the spec's list is lost.
2. The reserved slot renders only while a hand is out (`hand !== null`). Before the first deal the layout is exactly as it was; from the deal onward the slot stays for the hand's lifetime (banner → empty → draw result), so the buttons don't move when the banner appears or disappears.

## Dependencies added
None.

## Questions / proposals for Claude
1. The draw-win paytable highlight (bankroll mode) lights up as soon as the draw lands and stays until the next deal — matching the dealt banner's lifetime. If you'd rather it clear after a few seconds like some machines, say the word and I'll add a timeout.
2. `min-height: 24px` assumes one line at 15px. If the owner ever plays a narrow window where the banner wraps, the buttons would jump; bumping the reserve to a second line only matters then.

## Known issues / follow-ups
None.

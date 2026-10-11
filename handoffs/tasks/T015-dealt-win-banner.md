# T015: Show a dealt win the way the machine does

**Owner:** DeepSeek · **Depends on:** T014a · **Size:** small

## Why
Owner: "The machines at the casino show when you have any win, jack or higher. Can you have that in the training so the user doesn't miss things they wouldn't at a casino." Real machines show the paying hand's name (e.g. "JACKS OR BETTER", "TWO PAIR") as soon as the cards are dealt and light up that paytable row. The trainer doesn't, so it grades mistakes a real player would never make, like throwing away a dealt pair of jacks. (D26)

## Engine
No new engine code. `game.evaluate(hand)` (`src/engine/games.ts:52`) already returns the paytable row index for a 5-card hand, or `-1` for no win. It works for wild-card games (deuces count as wild). `payout()` uses it the same way. Call it on the main thread; it's cheap.

## Scope: do
1. **Dealt-win banner.** In `App.tsx`, while `phase === 'dealt'` and `hand` is set, compute `dealtRow = game.evaluate(hand)`. If `dealtRow >= 0`, show the row's label in upper case (`game.rows[dealtRow].label.toUpperCase()`) in a banner directly under the hand (the slot where `.hand-result` appears after the draw). Use a new class `.dealt-win`: gold text, bold, like `.hand-result.win`, `aria-live="polite"`. No banner on a losing deal. Keep the slot's height stable either way so the buttons don't jump (reserve the line, e.g. `min-height`).
2. **All modes that deal a hand to play:** trainer, drill, and bankroll (`mode === 'deal'`). Not the Assist tab.
3. **Paytable row highlight.** Pass the active row to `Paytable` as an optional `activeRow?: number` prop. Highlight that `<tr>` (class `active`, gold text or background) when the table is open. Active row = `dealtRow` during `dealt`. After the draw in bankroll mode, use `result.outcome.rowIndex` if it won. Otherwise none.
4. The banner goes away after submit/draw. The existing `.hand-result` takes over in bankroll mode. In trainer/drill the feedback panel takes over.
5. Wording stays the paytable's own labels. Don't add the payout amount to the dealt banner (machines show it, but the trainer stays focused on the hold).

## Scope: do not
- Don't touch grading, stats, or the "correct hold" logic. The banner is information only.
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, or `src/lib/`. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib` → empty.

Visual check (the owner, at phone width):
- A dealt pair of jacks or better in JoB shows "JACKS OR BETTER" under the cards, and the open paytable highlights that row.
- A dealt pair of 10s shows nothing.
- In a deuces game, a dealt deuce plus a pair shows "THREE OF A KIND".
- The Deal/Submit buttons don't move when the banner appears or disappears.

## Report
`handoffs/reports/T015-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

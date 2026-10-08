# T009: Assist tab: type in a hand, see what to hold

**Owner:** DeepSeek · **Depends on:** T008 (done) · **Size:** small–medium

## Goal
The owner wants a phone-friendly page where they type in the 5 cards on their (home) machine and the app says which ones to hold. This is a manual-entry assistant, not detection (D15). Entry has to be fast with a thumb: **5 ranks, then 5 suits, 10 taps**, and then the answer appears on its own.

## Read first
- `DEEPSEEK.md`
- `src/engine/cards.ts` (encoding: `rank*4 + suit`, rank 0 = deuce … 12 = ace, suit 0..3 = c d h s; `RANKS`, `SUIT_SYMBOLS`)
- `src/engine/client.ts` (`engine.analyze(gameId, hand)` → all 32 holds, best first. **Masks refer to positions in `hand` as passed.**)
- `src/engine/ev.ts` (`EV_EPSILON`), `src/lib/grade.ts` (`competitionRanks`)
- `src/components/TopHolds.tsx`, `CardView.tsx`, `MiniCard.tsx`, `src/lib/wild.ts` (`isWildCard`)
- `src/App.tsx` (the `Tab` type, tab nav, the header game picker, `phase` while the engine prepares)

## Scope: do
1. **Fourth tab, "Assist"**, after Bankroll. The header game picker drives the game, as it does for Chart and Bankroll. While the engine is preparing a game, show "Loading <game>…" in place of the result.
2. **Pure entry state in `src/lib/handEntry.ts`** (with `handEntry.test.ts`). No React in it.
   - State: `ranks: (number | null)[5]`, `suits: (number | null)[5]`, `cursor: number` (the slot the next tap goes to), `stage: 'rank' | 'suit'`.
   - `pickRank(s, r)`: sets `ranks[cursor]`, moves the cursor to the next slot with no rank. After the 5th rank: `stage = 'suit'`, cursor = first slot with no suit.
   - `pickSuit(s, suit)`: sets `suits[cursor]`, moves to the next slot with no suit. It's a no-op if that card (rank + suit) is already in another slot.
   - `selectSlot(s, i)`: tap a slot to edit it. The slot's rank and suit are cleared and the cursor goes there with `stage = 'rank'`. After that rank is picked, if any slot still lacks a rank, continue ranks, otherwise go to suits.
   - `undo(s)`: removes the most recent entry. Order is suits right-to-left, then ranks right-to-left. Keep it simple: clear the last filled field in that order and put the cursor there.
   - `clear()`: empty state.
   - `rankDisabled(s, r)`: true if rank `r` already fills 4 slots.
   - `suitDisabled(s, suit)`: true if the card `ranks[cursor]*4 + suit` is already in another slot.
   - `toHand(s): Card[] | null`: the 5 cards **in slot order** (slot order is the machine's position order, and the hold mask maps to it), or null if any field is missing.
   - Tests: the 10-tap happy path gives the right `Card[]`. A duplicate suit is refused. Five of one rank is impossible (`rankDisabled` after 4). `selectSlot` re-entry works. `undo` order is right. Using "10" for rank index 8 maps to `T`.
3. **UI (`src/components/AssistTab.tsx`)**, laid out for 375px with no horizontal scroll and every button at least 44px tall:
   - **Top: the 5 slots** as cards. An empty slot is a dashed outline, a slot with only a rank shows it ("K ?"), and a full card uses `MiniCard`/`CardView`, with deuces styled wild in deuces games via `isWildCard`. The cursor slot is highlighted. Tapping a slot calls `selectSlot`.
   - **Rank pad:** 13 buttons labelled `2 3 4 5 6 7 8 9 10 J Q K A` in a 7 + 6 grid (or whatever fits 375px). Disabled per `rankDisabled`. Active only in `stage === 'rank'`.
   - **Suit pad:** 4 big buttons ♣ ♦ ♥ ♠, with ♦/♥ in red. Disabled per `suitDisabled`. Active only in `stage === 'suit'`. The pad shows which slot it's filling, e.g. "Suit for card 3 (K)".
   - **Undo** and **New hand** buttons.
   - **Result** (once `toHand` is non-null, call `engine.analyze` automatically; ignore stale responses if the hand changed meanwhile):
     - The 5 cards again, with a big **HOLD** label over each held card (like the machine) and the discarded ones dimmed. "Discard all" when the best mask is 0.
     - The chart line name (`patternFor(game, heldCards)?.label`, only if `hasChart(game)`) and the EV in bets (4 decimals).
     - **Ties:** if two or more holds are within `EV_EPSILON` of the best, say "Tie: any of these is correct" and list them. Never present one of them as the only right answer (CLAUDE.md: ties are ties).
     - `TopHolds` below with the top 5. Pass `userMask = holds[0].mask` and `userRank = 1` (or make those props optional, without changing how the Trainer looks).
   - No second game picker in the tab. Show the game name above the slots so it's obvious which paytable the advice is for.
4. **No stats.** Assist hands are never recorded to history, totals, drills, or the bankroll (D15). Nothing new goes in localStorage.

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/charts/`, `src/bankroll/`, or the risk files. Never compute EVs or holds in the UI. Everything comes from `engine.analyze`. No new dependencies, no camera, no detection. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/charts src/bankroll src/lib/risk.ts src/lib/riskData.ts` → empty.
3. `src/lib/handEntry.test.ts` covers every case listed in Scope 2.
4. `grep -n "recordHand\|saveHistory\|saveTotals" src/components/AssistTab.tsx` → no output.

The user does the visual check (computed by the engine, JoB 8/5):
- `A♠ K♠ Q♠ J♠ 9♦` → hold A♠ K♠ Q♠ J♠ (EV 18.3830)
- `J♥ 10♦ 9♣ 5♠ 3♥` → hold J♥ only (EV 0.4719)
- `K♦ Q♦ J♣ 7♠ 3♥` → hold K♦ Q♦ (EV 0.5806)

## Report
`handoffs/reports/T009-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

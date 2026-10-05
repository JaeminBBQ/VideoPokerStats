# T006: Bankroll session: starting money, 5¢/10¢/25¢, real draws, tier points

**Owner:** DeepSeek · **Depends on:** T005 (done) · **Size:** medium

## Goal
The owner wants Deal mode to play like the real machine: choose a **starting bankroll** and a **denomination** (default **5¢**, always max bet = 5 coins), see the **draw** after submitting, get paid by the paytable, and earn **tier points at 1 point per $1 of coin-in** (the owner's casino rule). The grading and feedback stay exactly as they are; the bankroll comes on top.

Claude already built and tested the correctness parts (D11). **Use them; don't reimplement them:**
- `draw(hand, heldMask, deckSize, rng)` in `src/engine/cards.ts` (exported from `src/engine/index.ts`): held cards stay in place, and unheld ones are replaced from the 47 undealt cards.
- `src/lib/bankroll.ts`: `Session` (all money in **integer cents**), `startSession`, `canAfford`, `settleHand(game, finalHand, denomination)`, `applyHand`, `tierPoints`, `centsToNextPoint`, `netCents`, `theoLossCents`, `formatCents`, `betCents`, `denomCents`.

## Read first
- `DEEPSEEK.md`, `src/lib/bankroll.ts` + `src/lib/bankroll.test.ts`, `src/App.tsx` (`dealNew`, `submit`), `src/lib/storage.ts`, `src/components/StatsPanel.tsx`

## Scope: do
1. **Denominations:** `DENOMINATIONS = [0.05, 0.1, 0.25]` (drop $1), `DEFAULT_SETTINGS.denomination = 0.05`. `sanitizeSettings` already falls back to the default, so a saved `1` becomes 5¢. Update `storage.test.ts` to match.
2. **Session setup** (shown in Deal mode when there's no active session): a small panel with
   - a starting bankroll input in dollars (presets **$20 / $50 / $100 / $200** as buttons plus a free number field; whole dollars or cents are both fine; must be > 0 and ≥ one max bet at the chosen denomination),
   - denomination chips **5¢ / 10¢ / 25¢** showing the max bet, e.g. "5¢ · $0.25/hand",
   - a **Start session** button → `startSession(Math.round(dollars * 100), Date.now())`.
   Move the denomination selector out of `StatsPanel` into this setup (StatsPanel keeps using `settings.denomination` for its $ figures).
3. **Playing a hand** (Deal mode with an active session):
   - **Deal** is disabled when `!canAfford(session, denomination)`. Show "Out of credits" with **New session** instead.
   - On **Submit**: run the existing grading unchanged, then `finalHand = draw(hand, heldMask, game.deckSize, secureRng())`, `outcome = settleHand(game, finalHand, denomination)`, `session = applyHand(session, game, outcome)`.
   - Show the final 5 cards in the hand row after submit (held cards unchanged, drawn cards replaced). Keep the existing correct/dimmed emphasis keyed to the *original* hand: put the original hand in small `MiniCard`s inside the feedback panel ("You were dealt …"), so the grading still points at the cards it's about. Wild deuces must still look wild on drawn cards.
   - A result line near the cards: the winning row label and amount ("Two Pair · won $0.50"), or "No win".
   - **Denomination is locked during a session** (the setup panel is hidden); changing it requires ending the session.
4. **Bankroll bar** (always visible in Deal mode during a session, compact enough for 375px): Balance · Bet · Net (green/red) · Hands · Coin-in · **Tier points** (`tierPoints(coinIn)`, plus a small "$0.75 to next point" from `centsToNextPoint`). Under it, in smaller type: Won, and "Expected loss at perfect play: $x" from `theoLossCents`. An **End session** button (confirm inline, no `window.confirm`).
5. **Lifetime tier points:** keep a lifetime coin-in total (cents) that each session adds to. Show "Lifetime: N points" in the bar. Ending a session adds it to a short **session log** (last 20: date, game(s), denomination, start, end, hands, coin-in, points) shown collapsed under the stats panel.
6. **Drill mode does not touch the bankroll** (same reason as D7: drill hands are hand-picked, not random deals). Drill keeps its current behavior, and the bankroll bar is hidden.
7. **Switching games keeps the session** (one bankroll carried across machines; coin-in counts toward points regardless of game). Switching games mid-hand already drops the hand; no bet is charged for a hand that was dealt but not submitted. The bet is charged at submit, in one `applyHand`.
8. **Persistence:** new storage keys `vp.v1.session` (active `Session | null`), `vp.v1.lifetime` (`{ coinInCents: number }`), `vp.v1.sessionLog`, with validators in the existing `createStorage` style (corrupt or missing → defaults, never throws). A reload mid-session resumes the balance. Tests for each validator.
9. Keyboard flow unchanged: Enter deals → 1–5 hold → Enter submits (and now shows the draw) → Enter deals.

## Scope: do not
- Don't modify `src/engine/`, `src/lib/bankroll.ts`, `scripts/`, `src/charts/`. If you think bankroll.ts needs a change, say so in the report. No dependencies. Don't commit.
- No sampling or simulated payouts: the money comes only from `draw` + `settleHand`.
- Don't add denominations, games, or venues.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine src/lib/bankroll.ts src/lib/bankroll.test.ts scripts src/charts` → empty.
3. `grep -n "DENOMINATIONS =" src/lib/storage.ts` → `[0.05, 0.1, 0.25]`; the default denomination is `0.05`.
4. `grep -rn "window.confirm\|Math.random" src --include=*.tsx` → no output (use `secureRng()`).
5. Tests: storage validators for session/lifetime/log (good round-trip, corrupt → default, wrong version → default); any extracted pure helper (e.g. ending a session → log entry + lifetime update).

The user does the visual check: start $20 at 5¢, play ~20 hands, see balance/coin-in/points move (4 hands = 1 point at 5¢), reload mid-session, end the session, check the log, and check 375px.

## Report
`handoffs/reports/T006-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

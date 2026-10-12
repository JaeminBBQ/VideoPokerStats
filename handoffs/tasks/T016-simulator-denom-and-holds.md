# T016: Simulator: denomination picker, and what was held on big hands

**Owner:** DeepSeek · **Depends on:** T015, T016a · **Size:** small

## Why
Owner: "For the simulator I should be able to choose the bet number as well as the duration" (they mean the denomination; session length is already a dropdown, keep it). And: "on big wins such as 4 of a kind and higher, I want it to say how much of the hand it had before rolling into it", meaning the cards held before the draw. (D28)

## Engine (done, T016a; don't change it)
- Each simulated big hand (quads and better) in `SessionRun.events` now has `held: string`: the strategy chart's name for the hold that made it, e.g. `"Three of a Kind"`, `"Low Pair (22–TT)"`, `"4 to a Royal"`, `"2 deuces only"`, `"Pat Royal Flush"` (dealt), `"Discard everything"`. It is `''` only if a row has no data (shouldn't happen). It's drawn from exact odds, so it's a fact about this simulated session, not a guess.
- `SimulatorTab` already gets `denomination` and `maxCoins` props. `bet = denomination × maxCoins` in cents.

## Scope: do
1. **Denomination chips in the Simulator.** In `App.tsx`, pass `onDenominationChange={(d) => setSettings((s) => ({ ...s, denomination: d }))}` to `SimulatorTab` (as the Bankroll tab does). In `SimulatorTab`, add a first control "Denomination" before Budget, with the same chip markup as `BankrollTab.tsx:88-103` (`game.offers`, `DENOM_LABELS`, `*` for unconfirmed, `active` on the current one). Under it, a `.sim-note`: `"{5¢} × {20} coins = {$1.00} a hand"` (max bet, use `formatCents(bet)`). When the game has a single offer (all GSR games), still show the one chip (active) so the bet is visible; that's fine.
   - Changing the denomination must not crash or mislabel old results: the one-session and 1,000-session results already carry their own `p` (bet included), so they stay as they were until re-run. The "When to leave" table recomputes (its key already includes `bet`).
2. **Held wording on markers.** In `SessionChart`, the marker tooltip text becomes `"{label} +{win} at hand {n} · {heldText}"`, where `heldText(held)` is:
   - starts with `"Pat "` → `"dealt"`
   - `"Discard everything"` → `"drew all 5"`
   - `''` → omit the ` · …` part
   - otherwise → `"held " + held` (e.g. "held Three of a Kind", "held 2 deuces only")
   Put `heldText` in `src/components/SimulatorTab.tsx` (UI wording, not `src/lib`).
3. **Big hands list** under the one-session chart (tapping tiny markers is hard on a phone). Heading-less list `.sim-big-hands`, one line per event: `Hand 812 · Four of a Kind +$1.25 · held Three of a Kind` (same `heldText`). Show the 8 biggest wins (sort by `winCents` desc, then hand asc), then display them in hand order. If there are more, a last line `+{N} more` (muted). If none, `No four of a kind or better this session.` (muted). Deuces games hit quads ~1 in 16 hands, which is why the list is capped.
4. Style: small text, muted color for the "· held …" part, colored dot per event using the existing `EVENT_COLORS`. Must fit at 375px without horizontal scroll (wrap is fine).

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/`, or `docs/`. Don't commit.
- Don't add a hands-count input; session length stays the hours dropdown.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib docs` → empty (relative to the T016a working tree; Claude will check).

Visual check (the owner, at phone width):
- Legends Bay JoB 8/5: chips 1¢*…$5* with 5¢/10¢/25¢ unmarked; picking 25¢ shows "25¢ × 5 coins = $1.25 a hand" and the hourly loss line changes.
- GSR JoB 9/5: one chip, "5¢ × 20 coins = $1.00 a hand".
- A 4-hour run shows a big-hands list; lines read like "Hand 812 · Four of a Kind +$1.25 · held Three of a Kind", dealt ones say "dealt".
- Tapping a marker shows the same "held …" text in the tooltip.

## Report
`handoffs/reports/T016-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

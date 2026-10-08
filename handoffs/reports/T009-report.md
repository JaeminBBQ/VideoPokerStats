# T009 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Added the fourth tab, Assist: the user taps 5 ranks then 5 suits (10 taps, cursor-driven) and the app
calls `engine.analyze` automatically, showing the best hold with HOLD labels on the cards, the chart
line name and EV, a "Tie: any of these is correct" list when holds tie, and the Top holds table.
Entry logic lives in a pure, tested module (`src/lib/handEntry.ts`); Assist hands touch no stats or
storage. All four acceptance commands pass and all three spec hands reproduce the expected engine
outputs (18.3830 / 0.4719 / 0.5806).

## Files changed
- `src/lib/handEntry.ts` (new): pure entry state machine — `pickRank`/`pickSuit` with cursor advance,
  `selectSlot` re-entry, `undo` (suits right-to-left then ranks right-to-left), `rankDisabled` (4 cap),
  `suitDisabled` (duplicate card), `toHand` in slot order, `RANK_LABELS` ("10" for index 8).
- `src/lib/handEntry.test.ts` (new): 11 tests covering every Scope 2 case.
- `src/components/AssistTab.tsx` (new): slots row (cursor highlighted, empty = dashed, rank-only = "K ?",
  full = MiniCard with `isWildCard` styling), rank pad (7+6 grid), suit pad (red ♦♥, "Suit for card N (K)"),
  Undo / New hand, auto-analysis with stale responses dropped, "Loading {game}…" while preparing,
  result (HOLD labels / dimmed discards, "Discard all", chart line, EV, tie banner + list, TopHolds).
- `src/components/TopHolds.tsx`: `userMask`/`userRank`/`evBest` made optional (defaults to first hold);
  the Trainer passes them as before, so its look is unchanged. Assist omits them (no "yours" row).
- `src/App.tsx`: `assist` tab type, Assist nav button after Bankroll, AssistTab render branch.
- `src/index.css`: assist styles; reduced tab padding inside the ≤640px query so 4 tabs fit 375px.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build exit 0 | pass | `npm run lint` → exit 0 · `npm run typecheck` → exit 0 · `npm test` → 191 passed (16 files) · `npm run build` → ✓ built |
| No diffs in engine/scripts/charts/bankroll/risk | pass | `git diff --stat -- src/engine scripts src/charts src/bankroll src/lib/risk.ts src/lib/riskData.ts` → empty |
| handEntry.test.ts covers every Scope 2 case | pass | 11 tests: 10-tap happy path (As Ks Qs Js 9d in slot order), duplicate suit refused, rank capped at 4, selectSlot re-entry (rank→suit and continue-ranks variants), undo order, "10"↔"T", toHand nulls, stage no-ops, clear |
| No stats calls in AssistTab | pass | `grep -n "recordHand\|saveHistory\|saveTotals" src/components/AssistTab.tsx` → no output |

Engine cross-check of the spec's three JoB 8/5 hands (exact enumeration, `analyzeHand`):
`A♠K♠Q♠J♠9♦` → hold A♠K♠Q♠J♠ EV 18.3830 ✓ · `J♥10♦9♣5♠3♥` → hold J♥ EV 0.4719 ✓ ·
`K♦Q♦J♣7♠3♥` → hold K♦Q♦ EV 0.5806 ✓. A real Loose Deuces tie (Q♥Q♠ vs 10♦10♣, EV 0.5246 both)
confirms the tie branch triggers in practice.

## Deviations from the spec
- `userMask`/`userRank`/`evBest` on TopHolds were made optional instead of passing dummy values;
  the Trainer's look is unchanged.
- When holds tie, the card row shows no HOLD labels (nothing dimmed) — the tie banner lists every
  correct hold instead, so none is ever presented as the only right answer.
- Both pads are always rendered; the inactive one is disabled (dimmed), and its label shows the
  current cursor slot. When the hand is complete the pads disable and the labels read "Tap a card to edit".
- After the final suit, the cursor stays on the last card rather than pointing nowhere (the module
  has no "done" stage in the spec).

## Dependencies added
None.

## Questions / proposals for Claude
1. Entry state is local to AssistTab, so switching tabs (e.g. to look at the Chart) clears the entered
   hand. If that proves annoying, lifting the entry state into App (or a tiny in-memory store) is easy.
2. The global keyboard handler deals a trainer hand on Enter even while the Assist/Chart/Bankroll tab
   is open (pre-existing behavior, untouched). If the trainer goes behind a session gate it may be
   worth guarding the handler by tab.
3. Tied holds are listed without per-hold EVs (they're equal to 4 decimals anyway); the shared EV is
   in the banner. Easy to add per-line EVs if preferred.

## Known issues / follow-ups
- The user still needs to do the visual check on a phone width (375px) — layout math says the slots,
  pads, and 4 tabs fit, but it hasn't been eyeballed.

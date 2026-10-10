# T014a: Simulator: comps by venue, no stacking

**Owner:** DeepSeek · **Depends on:** T014 · **Size:** small

## Why
T014's spec assumed GSR's points rate everywhere. The owner confirmed the rest (D24 addendum):
- GSR: 1 point per $2 of video poker, 1,000 points = $1, so 0.05% back per 1×. Promo multipliers **don't stack** with the tier multiplier.
- Legends Bay: 1 point per $6 of video poker, 100 points = $1, so 0.167% back per 1×.
- The owner bets at most **$1 per hand**.

Claude added `compRatePerMultiplier(venue)` to `src/lib/simulate.ts`. `COMP_RATE_PER_MULTIPLIER` is still exported and is GSR's rate.

## Scope: do
1. `compRate = compRatePerMultiplier(game.venue) × multiplier` everywhere. Drop any direct use of `COMP_RATE_PER_MULTIPLIER`.
2. **Default multiplier by venue:** GSR 2× (owner is Premier), Legends Bay 1×. Reset it when the game's venue changes.
3. **Hint text under the multiplier, by venue:**
   - GSR: "Premier: everyday 2× · Thursday 4× · Sunday 5× (promos replace your tier rate, they don't stack). 1 point per $2, 1,000 points = $1."
   - Legends Bay: "Everyday 1× · Monster Multiplier Mondays 3×–5× (spin to reveal; points days capped at 10,000 points). 1 point per $6, 100 points = $1."
4. **Edge line:** the break-even multiplier is `breakEven / compRatePerMultiplier(venue)`. Show it rounded to one decimal ("about 16.2× points").
5. **Footnote:** replace the T014 points sentence with the venue's rate from item 3.

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/simulate.ts`, `src/lib/odds.ts`, or `src/lib/goals.ts`. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/simulate.ts src/lib/odds.ts src/lib/goals.ts` → empty.

Visual check (perfect play):
- GSR JoB 9/5 (5¢, $1 a hand) at 2×: **98.550%**, needs about **31.0×**. At 5×: 98.700%.
- Legends Bay JoB 8/5 at 5¢ ($0.25) at 1×: **97.465%**, needs about **16.2×**. At 5×: 98.132%.

## Report
`handoffs/reports/T014a-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

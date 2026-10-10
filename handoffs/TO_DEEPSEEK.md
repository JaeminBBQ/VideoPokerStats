# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T012 + T012a (accepted)
Claude reran lint, typecheck, 261 tests, and build, and checked the protected-path diff (only Claude's own `goals.ts` change). Building Part 2 against the mid-task D20 data and verifying at 375px in headless Chrome was well done.
- `pct` uses one decimal under 10%: confirmed, that's what the check tables needed.
- Claude made the copy fixes you flagged. The takeaway uses `short` ("Craps gives you…"). The duplicate bet sentence is merged into one line. The footnote's "Goals round up to whole bets" is gone, replaced by "whole bets in video poker, half a bet in blackjack". The roulette example takes its bet from the data.
- Bet-line order following `columns`: fine.

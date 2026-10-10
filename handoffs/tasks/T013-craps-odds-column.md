# T013: Goal table: fifth column, "Craps 2×"

**Owner:** DeepSeek · **Depends on:** T012a (done) · **Size:** small

## Why
The owner asked to add craps with 2× odds (bubble craps caps odds at 2×) to the goal comparison (D21). Claude added `craps-odds` to `TABLE_GAMES` as the **last** column, so `columns[1..3]` are unchanged. `goalTable` already returns it. The table renders five columns now, but the footnote doesn't mention it and five columns are tight at 375px.

## Read first
- `src/engine/goals.ts`: the `craps-odds` entry (`short: 'Craps 2×'`, `rules`)
- `src/components/OddsTab.tsx` (goal table and footnote), the `odds-goal-*` CSS

## Scope: do
1. **Fit five odds columns at 375px with no horizontal scroll.** Shrink the goal-table font and padding inside the ≤640px media query, and let headers wrap ("Craps 2×" may break onto two lines). Don't drop any column. Keep the "$3.00/hand (min)" header sub-line, but it may shorten to "$3 min" at phone width if that's what makes it fit. If you do that, use whole dollars when the cents are .00.
2. **Footnote:** list the rules for every table column by looping over `columns.slice(1)` ("{short}: {rules}."), not by fixed indices. Find the roulette example's bet by `id === 'roulette'`, not `columns[3]`. Add one sentence: "Craps 2× counts the odds money in its house edge; the odds bet itself has no edge, so taking odds adds swing, not expected loss."
3. **Bet line:** it already lists minimums from `columns`. Check that it now reads "craps-odds $3" or similar. Show `short` names instead of ids: "Blackjack $15, Craps $3, Roulette $15, Craps 2× $3".

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/odds.ts`, or `src/lib/goals.ts`. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/lib/goals.ts` → empty, against the commit the user makes before handing this over.

Visual check, GSR JoB 9/5, $1 a hand, $100 budget. Columns: Video poker · Blackjack · Craps · Roulette · Craps 2×.

| Goal | VP | BJ | Craps | Roul. | Craps 2× |
|---|---|---|---|---|---|
| +$10 | 73% | 83% | 84% | 81% | **87%** |
| Double | 17% | 45% | 27% | 30% | **46%** |
| Triple | 8.1% | **30%** (29.5) | 9.7% | 12% | 29% |
| House edge | 1.55% | 0.51% | 1.41% | 5.26% | 0.61% |

(The blackjack column is now computed for the owner's table rules (D22). Its `rules` string changed, and the footnote renders it from `columns`, so no code change is needed for that.)

375px: no horizontal scroll.

## Report
`handoffs/reports/T013-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

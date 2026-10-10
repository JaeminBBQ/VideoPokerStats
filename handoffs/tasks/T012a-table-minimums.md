# T012a: Goal table: table games bet their real minimums

**Owner:** DeepSeek · **Depends on:** T012 · **Size:** small

## Why
The owner: blackjack and roulette are **$15 minimum** and craps is **$3**, while video poker bets the machine's max bet at whatever denomination you pick (D20). Claude changed `goalTable` while T012 was in progress. Each table game now bets **its minimum, or the video poker bet if that's bigger**, so a $1 video poker hand faces $15 blackjack, $3 craps, and $15 roulette. The old fields are unchanged. New `GoalColumn` fields: `betCents`, `minBetCents`, `budgetBets`, `playable`.

## Read first
- `src/lib/goals.ts` (the new `GoalColumn` fields and the `goalTable` doc comment), `src/lib/goals.test.ts`
- Your T012 Part 2 code in `OddsTab.tsx`

## Scope: do
1. **Column headers:** under each `short` name, a small muted line with that column's bet: "{formatCents(betCents)}/hand", e.g. "$1.00/hand", "$15.00/hand", "$3.00/hand". Add "(min)" when `betCents === minBetCents` and `minBetCents > 0`.
2. **Unplayable columns** (`playable === false`, i.e. the budget is under the table bet): every odds cell shows "—" instead of "0%". Add one muted line under the table: "{short}: your budget is under the {formatCents(betCents)} bet." Never mark an unplayable column as best. `best` already skips it, since its odds are 0, unless every column is 0.
3. **Bet line** under the budget input. Replace the "Every game below bets the same…" sentence with: "Video poker bets {formatCents(bet)} a hand ({maxCoins} coins × {denomination}). Tables bet their minimum (blackjack $15, roulette $15, craps $3) or the video poker bet if that's bigger." Take the minimums from `columns[i].minBetCents`. Don't hard-code them.
4. **Takeaway line:** replace the T012 rule with this. Let `b` be the best column on the Double row. If `b` is video poker: "Video poker gives you the best shot at doubling here (the royal does the heavy lifting)." Otherwise: "{columns[b].name} gives you the best shot at doubling. Bigger bets reach a goal in fewer rounds, so the house edge has less time to work on you."
5. **Footnote:** replace the "Table minimums are usually higher…" sentence with: "Tables bet their minimum or the video poker bet if that's bigger. Goals round up to the smallest win each game can reach. At $15 roulette, one win covers a +$5 goal." Keep the rest of the T012 footnote.

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/odds.ts`, or `src/lib/goals.ts`. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/lib/goals.ts` → empty, against the commit Claude names when handing this over.

Visual check (replaces T012's Part 2 numbers). GSR JoB 9/5, $1 a hand, $100 budget. Headers: $1.00 · $15.00 (min) · $3.00 (min) · $15.00 (min).

| Goal | Video poker | Blackjack | Craps | Roulette |
|---|---|---|---|---|
| +$5 | 82% | 85% | **91%** | 81% |
| +$15 | 66% | **83%** | 80% | 81% |
| Double | 17% | **45%** | 27% | 30% |
| Triple | 8.1% | **30%** | 9.7% | 12% |

Budget $10 at Legends Bay 5¢: the blackjack and roulette columns show "—" with the note.

## Report
`handoffs/reports/T012a-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

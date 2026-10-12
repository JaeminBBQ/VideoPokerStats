# T017: Simulator: blackjack and craps

**Owner:** DeepSeek · **Depends on:** T016, T017a · **Size:** medium

## Why
Owner: "can you add a craps simulator and bj simulator starting at 3$ since they both have machine versions like bubble craps, 6 to 5 on blackjack as well as hitting on soft 17. tables are 15$ minimum but 3 to 2 and hit on soft 17." (D29) The Simulator tab gets three more games beside the current video poker one.

## Engine (done, T017a; don't change it)
`src/lib/tableSim.ts`:
- `TABLE_SIM_GAMES` / `tableSimGame(id)`: ids `'bj-table' | 'bj-machine' | 'craps'`, each with `name`, `rules` (one line to show), `unit` (`'hand'` or `'bet'`), `minBetCents`, `betOptionsCents`, `pace` (default rounds/hour) and `paceOptions`.
- `TableSimParams`: `{ game, crapsOdds, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds }` (null = no goal/limit, as in video poker).
- `runTableSession(p, seed)` → `TableRun { end, rounds, finalCents, netCents, path }`. `path` has the same shape as video poker's (`hand` = round number).
- `runTableMany(p, 1000, seed)` → `TableManyRuns` (same fields as `ManyRuns`, with `avgRounds` in place of `avgHands` and no comps).
- `exactTableAsync(engine, p)` → `LeaveOdds | null`. `tableLeaveAdviceAsync(engine, base)` → `LeaveAdviceRow[]` (same six rules as video poker). Both run in the worker, about 0.4s typical and up to ~3s for huge, long machine sessions. Show "Computing…" meanwhile, exactly like the video poker advice.
- `tableEdge(game, crapsOdds)` → `{ perBet, perWagered }` (fractions). `LeaveOdds.expNetBets` is in base bets, so multiply by `betCents`.

## Scope: do
1. **Game switch at the top of the Simulator tab.** A chip row "Game": `Video poker` (the current game, `game.name` in the heading as now) · `Blackjack $15` · `Blackjack $3 machine` · `Craps $3`. Video poker shows the existing simulator, unchanged. The other three show a new `TableSimulator` component (`src/components/TableSimulator.tsx`). Keep the choice in component state (not persisted). The switch should survive changing the video poker game if easy; if not, resetting to video poker is fine.
2. **Share the charts.** Generalize `SessionChart` and `Histogram` so both simulators use them: `SessionChart` takes `{ path, events (optional, []), budgetCents, winGoalCents, lossLimitCents, maxRounds, roundsPerHour }` instead of `run`/`p`. The x axis is hours = round / roundsPerHour (video poker passes 600). Move them to `src/components/SimCharts.tsx`. Video poker must look and behave exactly as it does now.
3. **TableSimulator inputs** (same `sim-*` styling as video poker):
   - Heading `Simulator — {name}` and the `rules` line as a `.sim-note` under it.
   - **Bet**: chips from `betOptionsCents` (`$3`, `$5`, … via `formatCents`, without trailing `.00` if the existing helper allows). Default `minBetCents`.
   - **Craps only: "2× odds"** chips `On` / `Off` (default On).
   - **Budget** (default: `$300` for the $15 table, `$100` otherwise), **Win goal**, **Loss limit**: same controls and rules as video poker.
   - **Session length**: the same hours dropdown.
   - **Pace**: a select of `paceOptions` (`60 hands/hour`, or `30 bets/hour` for craps; use `unit`) plus `Other…`, which reveals a whole-number input (1–1000). The note under it reads `≈ {maxRounds} hands` (or bets). `maxRounds = round(hours × pace)`.
   - No mistake rate and no points multiplier.
4. **Edge line** (replaces the video poker return line): blackjack `House edge {perBet}% of each hand → about {$/hour} an hour at {bet} × {pace}/hour`. Craps with odds: `House edge 1.41% of each pass-line bet (0.61% of all money bet, odds included) → about {$/hour} an hour`. Craps without odds: just the 1.41%. $/hour = pace × bet × perBet. Use `edgePct` for percentages.
5. **Run one session / Run 1,000 sessions / When to leave**: the same three sections as video poker, with the same tables and wording, minus the comps rows. Use `unit` in the words ("Out of money after 1h 12m", "Average time" = rounds / pace). The one-session block has no big-hands list. Use the same "result keyed by params" pattern so stale results never show next to new inputs. Leave rows: same columns, `Avg result` = `expNetBets × bet`, `Avg time` = `expHands / pace` hours.
6. **Footnote** for table games: `Each round is drawn from exact odds: blackjack is infinite-deck basic strategy for these rules; craps is exact from the dice. When your bankroll can't cover a full round you play a smaller one (no split or double in blackjack, no odds in craps). Exact columns are computed, not simulated. No comps: table and machine ratings aren't modeled.` For `bj-machine`, add: `Machine rules other than 6:5 and hitting soft 17 are assumed to match the table.`

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/`, or `docs/`. Don't commit.
- Don't change the video poker simulator's behavior or numbers (only the chart props refactor).

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib docs` shows only T017a's changes (Claude checks).

Visual check (the owner, at phone width):
- Video poker simulator looks exactly as before.
- Blackjack $15, $300 budget, 4 hours, 60/hour: edge line about 0.73% and about $6.58 an hour. One session draws a graph on an hour axis.
- Blackjack $3 machine at $3 × 150/hour: about 2.08%, about $9.38 an hour.
- Craps $3 with odds: 1.41% / 0.61%, about $1.27 an hour at 30/hour. Turning odds off changes the leave table.
- Pace "Other…" accepts e.g. 45 and the hands note updates.
- Nothing scrolls sideways at 375px.

## Report
`handoffs/reports/T017-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

# T017 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
The Simulator tab now has a Game chip row (`Video poker` · `Blackjack $15` · `Blackjack $3 machine` · `Craps $3`); the video poker simulator is untouched and the three table games render a new `TableSimulator` built on T017a's `src/lib/tableSim.ts`. `SessionChart` and `Histogram` moved to `src/components/SimCharts.tsx` with `SessionChart` generalized to `{ path, events?, budgetCents, winGoalCents, lossLimitCents, maxRounds, roundsPerHour }` (video poker passes 600, so it looks and behaves exactly as before). The table simulator has bet chips, a craps-only 2× odds toggle, budget/goal/loss/hours controls identical to video poker, a pace select (`hands/hour` or `bets/hour`) with `Other…` (whole number 1–1000), the spec's edge line, one session / 1,000 sessions / when-to-leave sections (same wording, no comps), and the spec's footnote. Results carry the params (and pace) they were computed with, so stale results never show next to new inputs.

## Files changed
- `src/components/SimCharts.tsx` (new): `SessionChart` + `Histogram` moved from SimulatorTab, `SessionChart` generalized per the spec.
- `src/components/TableSimulator.tsx` (new): the blackjack/craps simulator (inputs, edge line, three result sections, footnote).
- `src/components/simShared.ts` (new): `HOUR_OPTIONS`, `GoalMode`/`GOAL_FRACTIONS`, `END_ROWS`, `EVENT_COLORS`, `heldText` shared by both simulators.
- `src/components/SimulatorTab.tsx`: game chip row + `VideoPokerSimulator` extraction; imports charts/constants from the new modules. Video poker JSX and logic unchanged.
- `src/index.css`: `.sim-game-switch` (spacing under the picker) and `.sim-rules` (italic rules line).

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` | pass | oxlint, no warnings |
| `npm run typecheck` | pass | `tsc -b`, clean |
| `npm test` | pass | 26 files, **304 tests** passed |
| `npm run build` | pass | built in ~100ms; only a pre-existing rolldown chunk-size (>500 kB) *warning*, exit 0 |
| `git diff --stat -- src/engine scripts src/odds src/lib docs` | pass | **empty** — T017a was already committed (25289b8), and I touched none of those dirs. My diff: SimulatorTab.tsx (M), index.css (M), 3 new files under `src/components/` |

Browser verification (headless Chrome over CDP, 375×800 mobile metrics, against the running Vite dev server — no repo files added):
- Video poker: heading, edge line (Return 97.298% + points …), big-hands block, 3-stat grid (Net result/Comps/Coin-in), comps row, histogram all render as before.
- Blackjack $15 defaults: edge line `House edge 0.73% of each hand → about $6.58 an hour at $15 × 60/hour`; one session draws on a 0h–4h hour axis; 1,000 table has no comps row; Average time in `h`.
- Blackjack $3 machine: `2.08%` / `$9.38`; footnote adds the "assumed to match the table" sentence.
- Craps $3: `1.41% … (0.61% of all money bet, odds included) → about $1.27 an hour`; odds Off drops the parenthetical and changes the leave table (ahead 45.8%→40.3%); pace Other… accepts 45 → note `≈ 180 bets`.
- No element overflows 375px on any of the four games; game chips wrap onto two rows; session chart fits (right edge 342px).
- No console errors during any run.

## Deviations from the spec
1. **Game choice resets to Video poker when the video poker game changes** — App mounts SimulatorTab with `key={gameId}`, so changing the VP game remounts the tab. The task explicitly allows this ("if not, resetting to video poker is fine"); lifting the state to App would have touched the VP mount. Commented in code.
2. **Bet chips use a local `dollars()`** (`$3`, `$15`): `formatCents` always shows two decimals and the task said to drop `.00` "if the existing helper allows" — it doesn't. `dollars()` lives in TableSimulator.tsx since `src/lib/` is out of scope.
3. **One-session stats grid is Net result + Hands/Bets** — Comps and Coin-in don't exist for table games (T017a tracks neither); the task only excluded the big-hands list there. Same `.stats-grid` markup.
4. **`"Out of money after 1h 12m"` via a local `clockAtPace`** — `clockFromHands` in `src/lib/simChart.ts` is hard-wired to 600/hour and `src/lib/` is out of scope, so the table simulator has its own tiny helper.
5. **Shared constants live in `src/components/simShared.ts`, not `src/lib/`** — the scope forbids touching `src/lib/`; simShared also keeps `SimCharts.tsx` component-only (avoids the react fast-refresh lint warning).

## Dependencies added
None.

## Questions / proposals for Claude
1. Consider later consolidating `dollars()`, `clockAtPace()`, and `simShared.ts` into `src/lib/` (with tests) now that a lib edit is back on the table.
2. If you want the Game choice to survive video poker game switches, lift it into App and pass it down (I left it resetting per the task).
3. Dev-only observation: the very first `leaveTiered` call in a fresh dev session can take ~10s (cold worker/module compile); warm calls are <1s (craps 0.8s measured). "Computing…" covers it, and production serves the prebuilt worker. No action needed unless you see it in `vite preview`.
4. `npm run build` prints rolldown's chunk-size warning (>500 kB). I believe it predates T017 (the engine alone is large); flagging in case you want code-splitting later.

## Known issues / follow-ups
None.

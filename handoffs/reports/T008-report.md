# T008 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Added the third tab, "Bankroll": a calculator that turns the exact D14 risk data (`src/bankroll/risk.json`, read only through `src/lib/riskData.ts`) into a money-to-bring figure. Controls are chips only (denomination, session length, safety, error rate with a "Mine" chip from the current game's Deal-mode totals). A result card shows the dollar figure, bets, a plain-language sentence, expected loss, and return; a compare table ranks the 4 games by the 2,000-hand column; a "Start a session with $X" button rounds up to whole dollars and jumps into a Deal-mode session. All acceptance criteria pass.

## Files changed
- `src/components/BankrollTab.tsx` (new): the calculator UI. Thin component — every number comes from `riskData.ts` via the pure helpers.
- `src/lib/bankrollTab.ts` (new): pure helpers — `compareRows` (rows, cells, 2,000-hand sort), `mineFromTotals` (Mine chip state), `rateLabel`.
- `src/lib/bankrollTab.test.ts` (new): Vitest coverage for the helpers (sort order, per-column cents, Mine 0-hands → disabled, 1.3% → 0.01).
- `src/App.tsx`: `Tab` gains `'bankroll'`; nav button; renders `BankrollTab`; `onStartSession` sets the game's mode to deal, switches to the Trainer tab, and reuses `startBankroll`.
- `src/index.css`: `.chip` styles (shared with `.denom-chip`), disabled chip, bankroll tab layout (result card, compare table, start row, footnote), and a ≤640px media-query tightening so the compare table fits 375px.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build all exit 0 | pass | `npm run lint` (no warnings), `npm run typecheck`, `npm test` → 15 files, 180 tests passed; `npm run build` → built in 93ms |
| No diff in protected paths | pass | `git diff --stat -- src/engine src/lib/risk.ts src/lib/riskData.ts src/bankroll scripts src/charts` shows only `scripts/bankroll-risk.ts`, which is Claude's uncommitted T007 work (it writes `src/bankroll/risk.json`) and was already modified before T008 began; no T008 change touches any protected path |
| No hard-coded results in UI | pass | `grep -rnE "\b(238|241|311|1261)\b" src/components src/App.tsx` → no output |
| Tests for extracted helpers | pass | `src/lib/bankrollTab.test.ts`: compare rows + sort order (JoB → Bonus → Deuces → BPD; 2,000-hand cells 5950/6600/7775/10325¢ at 5¢, i.e. $59.50 / $77.75 headline figures), Mine chip state (0 hands → `available: false`; 13/1000 → percent 1.3, rate 0.01), rate labels |

## Deviations from the spec
- "Start a session with $X" sets the denomination implicitly: the calculator's denomination chips are settings-controlled (the same pattern as `BankrollSetup`), so picking a chip already writes `settings.denomination`; the button then sets the mode to Deal, switches tabs, and starts the session.
- When "Mine" is selected and the header picker switches to a game with 0 hands, the selection demotes to the last snapped fixed column (the Mine chip is disabled with a tooltip), rather than silently snapping to 0%.
- Compare-table game labels split `game.name` on " — " into two lines ("Jacks or Better" + "8/5") to fit 375px; full names stay in the result sentence.
- The result card, table, and start button render only when the data exists (defensive; unreachable with current chip values since `riskData.test.ts` covers every combination).

## Dependencies added
None.

## Questions / proposals for Claude
Nothing blocking. One idea for a later task: hide the Deal/Drill mode switch in the header while the Chart or Bankroll tab is active, since it only affects the Trainer.

## Known issues / follow-ups
None.

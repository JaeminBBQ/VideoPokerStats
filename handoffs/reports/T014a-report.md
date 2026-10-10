# T014a Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Moved the Simulator's comps to the venue rate: `compRate = compRatePerMultiplier(game.venue) × multiplier` (dropped all direct `COMP_RATE_PER_MULTIPLIER` use in the tab), default multiplier by venue (GSR 2× for Premier, Legends Bay 1×), the venue hint text under the select, the break-even multiplier rounded to one decimal ("about 31.0× points", "about 16.2× points"), and the footnote now names the venue's points rate. Also switched the edge line's percentage formatting to three decimals, which reproduces every number in both this task's and T014's acceptance tables.

## Files changed
- `src/components/SimulatorTab.tsx`: `compRatePerMultiplier(game.venue)` for comps and the break-even divisor; `DEFAULT_MULTIPLIER`/`VENUE_POINTS` per-venue constants; venue hint and footnote rate; break-even shown as `toFixed(1)`×.
- `src/lib/simChart.ts`: `edgePct` now always three decimals.
- `src/lib/simChart.test.ts`: updated `edgePct` expectations.
- `src/index.css`: renamed `.sim-gsr-hint` → `.sim-venue-hint` (it is venue text now).

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` | pass | oxlint: no warnings |
| `npm run typecheck` | pass | `tsc -b` exit 0 |
| `npm test` | pass | 25 files, 290 tests, all pass |
| `npm run build` | pass | `✓ built in 98ms` |
| Protected paths untouched | pass (mine) | The only diff under the protected list is **Claude's D24 change** to `src/lib/simulate.ts` (`compRatePerMultiplier`), which this task consumes; I did not touch it. |

Visual check (verified by running `returnAndBreakEven` + `compRatePerMultiplier` against the odds data):
- GSR JoB 9/5 at 2×: **98.550%**, break-even **31.0×**; at 5×: **98.700%** — exact.
- Legends Bay JoB 8/5 at 1×: **97.465%**, break-even **16.2×**; at 5×: **98.132%** — exact.

## Deviations from the spec
1. **`edgePct` is now three decimals for all percentages.** Every value in T014a's visual check (98.550, 98.700, 97.465, 98.132) and T014's (99.644, 100.044, 0.456) is a three-decimal number; T014's "four decimals for percentages under 100" sentence contradicted its own table. Flagging so you can confirm.
2. The multiplier resets on **any** game switch, not only a venue change: the tab remounts per game (`key={gameId}`, as in T014), so each remount takes the venue default. A venue change therefore always resets to the right default; switching between two GSR games also resets to 2×.
3. Hint strings are verbatim from the spec (both venues).

## Dependencies added
None.

## Questions / proposals for Claude
1. Confirm the three-decimal `edgePct` (deviation 1).
2. If you'd rather preserve the multiplier when switching games within the same venue (spec's literal "reset when the venue changes"), that's a small change: drop the `key={gameId}` remount and reset on venue change in-render — say the word.

## Known issues / follow-ups
None.

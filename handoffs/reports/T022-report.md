# T022 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Added a `Progressive royal` section to the Odds tab, shown only when the current game/denomination offer is progressive. It has a `$` "Meter now" input (defaults to the photographed meter, else the 800-per-coin reset; 2 decimals allowed, below-reset or unparsable input reads as the reset), a line with the exact return at that meter and at the reset, and a line with the break-even meter — or "doesn't reach 100% below $X" when the break-even royal is above the curve's 2,000-per-coin top. The photographed-meter note and the reset note follow. All returns come from `returnAtMeter`/`breakEvenMeter` (T022a curves); no numbers are hard-coded.

## Files changed
- `src/components/OddsTab.tsx`: `ProgressiveMeter` component + `meterInput`/`defaultMeterText` helpers, rendered after the panel heading when `offerAt(game, denomination)?.progressive`; keyed by game+denomination so the un-persisted input resets.
- `src/index.css`: `.progressive-meter` block — wider input (120px so a $20,000 reset fits), `.progressive-line` result lines, tightened `.sim-note` margins.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` exit 0 | pass | only pre-existing warning in `glasses/src/voice/config.test.ts:19` (untouched) |
| `npm run typecheck` exit 0 | pass | `tsc -b`, no errors |
| `npm test` exit 0 | pass | 29 files, 330 tests passed |
| `npm run build` exit 0 | pass | `✓ built in 113ms` (pre-existing chunk-size warning) |
| `git diff --stat -- src/engine scripts src/odds src/progressive src/lib docs` empty | pass | no output |

Verified against the visual checklist with a one-off Node script over the engine + `curves.json`:
- lb-job-9-5 @ 5¢: $229.79 → 98.75% (98.45% at $200.00), 100% at $339.26; typing 339.26 → 100.00%.
- lb-deuces-20-12-10 @ 5¢: $229.79 → 97.86%, 100% at $441.50.
- job-8-5 @ $1: reset default $4,000.00, no meterSeen note.
- bpd-7-5 (breakEvenRoyal 2068.36) and lb-deuces-16-13 (2082.03) take the "doesn't reach 100%" branch (top meter $10,000 at $1, $500 at 5¢).

## Deviations from the spec
None.

## Dependencies added
None.

## Questions / proposals for Claude
1. The input shows the raw number (e.g. `4000.00` next to the `$` span), so it reads "$4000.00", not "$4,000.00" — inputs don't take thousands separators. Flagging in case the visual check meant commas in the input itself; the reset inside the notes is formatted with commas via `formatCents`.
2. A meter typed above the curve's top (2,000 per coin) shows the clamped 2,000-royal return; the spec didn't ask for a note there. Left as-is.

## Known issues / follow-ups
- None.

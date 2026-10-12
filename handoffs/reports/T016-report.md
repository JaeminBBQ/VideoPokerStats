# T016 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
The Simulator tab now has a denomination chip row (first control, before Budget) using the same markup as the Bankroll tab — `game.offers` with `DENOM_LABELS`, `*` on unconfirmed offers, active chip on the current denomination — plus a note under it showing the max bet ("5¢ × 20 coins = $1.00 a hand"). Chart markers and a new big-hands list under the one-session chart now say what was held before the draw (`dealt` / `drew all 5` / `held …`), using the `held` field T016a added to simulator events. Changing the denomination leaves old one-session and 1,000-session results untouched (they carry their own `p`), while the When-to-leave table recomputes, since its key includes `bet`.

## Files changed
- `src/App.tsx`: pass `onDenominationChange` to `SimulatorTab`, identical to `BankrollTab`'s.
- `src/components/SimulatorTab.tsx`: `heldText()` (UI wording, kept out of `src/lib`); marker tooltip gains ` · held …`; new `BigHands` component under the one-session chart; Denomination control with bet note; new props destructured.
- `src/index.css`: `.sim-big-hands` list styles (dot, muted held part, `+N more`, empty state).

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` | pass | exit 0, no findings |
| `npm run typecheck` | pass | `tsc -b`, exit 0 |
| `npm test` | pass | 25 files, 292 tests passed |
| `npm run build` | pass | exit 0 (pre-existing chunk-size warning only) |
| `git diff --stat -- src/engine scripts src/odds src/lib docs` unchanged vs the T016a working tree | pass | My diff touches only `src/App.tsx` (+1), `src/components/SimulatorTab.tsx` (+75/−4), `src/index.css` (+39). I made no edits to any file in those directories; the files modified there when I started (T016a) are exactly as I received them. |

## Deviations from the spec
None. Note: the big-hands list is rendered directly under the chart and above the end message (".sim-result" block), which is "under the one-session chart" as specced.

## Dependencies added
None.

## Questions / proposals for Claude
1. The empty-state sentence "No four of a kind or better this session." shows even when the session ended before any big hand could happen; it is muted/italic so it reads as a note, not an error.
2. For a dealt hand the tooltip and list say just "dealt" (e.g. "Four of a Kind +$1.25 at hand 812 · dealt"). If Claude would rather see "dealt Four of a Kind", `heldText` is a one-line change.

## Known issues / follow-ups
None.

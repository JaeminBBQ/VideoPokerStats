# T019 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built the craps UI on top of T019a: Bets (`Pass` / `Don't pass`) and System (`One bet` / `3-point molly`) chips, the `2× odds` control renamed to `Odds` with a per-side limits note, a systems comparison table under the edge line (with the selected row highlighted), side-bet inputs with their exact hourly cost added to the edge line, the craps footnote, the "—" explanation lines under the leave table, and the bubble-craps side-bet reference table at the bottom of the Odds tab. All three new params flow into `params`, the advice call, `tableEdge`, and the advice key, so results stay keyed to the inputs.

## Files changed
- `src/components/TableSimulator.tsx`: craps Bets/System/Odds/side-bet controls; edge line per system with the side-bet addition; compare table; craps footnote; "too long" / "side bets" lines under the leave table; `crapsSide`/`crapsStyle`/`sideBetsCents` wired through params, `tableEdge`, and the advice call/key.
- `src/components/OddsTab.tsx`: "Craps side bets (bubble craps)" section at the bottom with the reference table and the comparison/unconfirmed footnote.
- `src/index.css`: `.sim-compare-table` (compact, gold `.best` row highlight) and `.odds-side-table` styles, plus phone-width rules so both fit 375px.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` | pass | exit 0 (only pre-existing warnings in `src/engine/craps.ts`, untouched) |
| `npm run typecheck` | pass | exit 0 |
| `npm test` | pass | 27 files, 314 tests passed |
| `npm run build` | pass | exit 0, built in 111ms |
| `git diff --stat -- src/engine scripts src/odds src/lib docs` | pass | empty |
| Compare table values + selected row follows chips | pass | headless Chrome at 375px: rows read 1.41/0.65/$1.26 · 1.41/0.65/$3.03 · 1.36/0.51/$1.21 · 1.36/0.51/$2.93; `.best` row tracks the chips |
| Side bets: edge line +$9.54/h, "—" + side-bet line | pass | edge line reads `+ side bets about $9.54 an hour`; leave table shows 24 "—" cells with `Exact odds aren't available with side bets; …` |
| Odds tab side-bet table values | pass | 1 in 37.95 / 31 for 1 / 18.30% (Small, Tall), 1 in 190.2 / 151 for 1 / 20.61% (Make 'Em All), comparison line, unconfirmed note |
| No horizontal scroll at 375px | pass | `scrollWidth − clientWidth = 0` on both tabs |

I also smoke-tested with a headless browser (system Chrome via playwright-core): controls render, edge line updates on chip changes, side-bet inputs drive the cost line, no console or page errors. The owner's manual pass at phone width is still the final check (molly exact "…", "—" rows at $300/12h, one session with side bets).

## Deviations from the spec
- The spec said to use `oneIn` from `src/lib/odds.ts` for the side-bet chances, but `oneIn` renders "1 in 37.9" / "1 in 190" (one decimal under 100, whole numbers above), not the "1 in 37.95" / "1 in 190.2" the same spec and the acceptance criteria quote. Added a local `sideBetOneIn` in `OddsTab.tsx` (two decimals under 100, one above) so the table reads exactly as specified.

## Dependencies added
None.

## Questions / proposals for Claude
1. `sideBetOneIn` vs `oneIn` (see Deviations) — if you'd rather the Odds tab show one decimal ("1 in 37.9"), say so and I'll switch; if you'd rather `oneIn` itself gain the extra digit, that's a `src/lib/odds.ts` change, which this task excludes.
2. The side-bet notes under the simulator inputs (placement rule + unconfirmed pays) only appear once at least one stake is set, per the "When any is set" wording. If you want the unconfirmed-pays note always visible next to the inputs, it's a one-line change.
3. The "too long" / "side bets" line under the leave table also fires when the 1,000-session Exact column is "—" even if the advice rows computed fine (spec: "an exact cell or a leave row is null").
4. The odds-limit note under the Odds control shows even when Odds is Off (spec didn't condition it); it could hide when Off if that reads better.

## Known issues / follow-ups
- Owner still owes the side-bet photo (`SIDE_BETS_CONFIRMED`); both unconfirmed notes drop out automatically once it's true.

# T014 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Built the Simulator tab (sixth tab, after Odds): scratch inputs (budget, win goal with +25%/+50%/double presets, loss limit capped at the budget, session length 0.5–12 h, mistake rate, points multiplier 1×–12× defaulting to 2× with the GSR Premier hint), the comps edge line from `returnAndBreakEven`, a "Run one session" SVG bankroll chart (hour axis, $ axis, dashed start/goal/loss lines, event markers — gold star for royals — with hover/tap tooltips), a "Run 1,000 sessions" summary card with an exact column computed by `engine.leave` in the worker, a 20-bar net histogram with a zero line, and the "when to leave" table from `leaveAdviceAsync` with the best rule highlighted. All money/odds math is called from `src/lib/simulate.ts` and the engine worker; the component only formats.

## Files changed
- `src/components/SimulatorTab.tsx` (new): the tab. Chart/histogram are inline SVG (no chart library); async results are keyed so stale results show "Computing…"/"…" until fresh ones land (avoids sync setState in effects, which oxlint flagged).
- `src/lib/simChart.ts` (new): pure formatting/geometry helpers — `clockFromHands`, `hoursText`, `edgePct`, `pct1`, `niceCentsStep`, `centsTicks`, `hourTicks`, `pathCentsAt`, `histogram`, `axisDollars`.
- `src/lib/simChart.test.ts` (new): 9 tests covering the helpers above.
- `src/App.tsx`: `'simulator'` tab, nav button, render branch (`key={gameId}`, passes `engine`, `bet`, `denomination`, `maxCoins`). Enter/Space already can't deal outside the Trainer (existing `tab !== 'trainer'` guard).
- `src/index.css`: simulator section (inputs ≥44px, chart/tip, tables) + 640px query so both summary tables fit 375px; updated the "Five tabs" comment to six.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` | pass | oxlint: no warnings |
| `npm run typecheck` | pass | `tsc -b` exit 0 |
| `npm test` | pass | 25 files, 290 tests, all pass |
| `npm run build` | pass | `dist/assets/index-*.js 539.09 kB` built (vite reports a chunk-size *warning*, not an error) |
| Protected paths untouched | pass (mine) | My changes touch none of them. The working tree does show `src/lib/simulate.ts` + `simulate.test.ts` diffs — those are **Claude's concurrent D24 addendum** (`compRatePerMultiplier`), which I did not touch. |

Visual-check numbers (verified by running the real engine against `src/odds/gsr-job-9-5.json`):
- "When to leave" table reproduces 20.0% / −$27.07 / 2.9 h / 58.9%; **54.2%** / −$12.52 / 1.35 h / 41.2%; 27.2% / −$9.80 / 1.05 h / 0% — exact match, best row highlighted.
- Edge line: JoB 9/6 at 10× → **100.044%**, green, "you have the edge"; at 2× → 99.6439%, house keeps 0.3561%, break-even 0.4561% ≈ 9×.
- 1,000-run leave-ahead vs exact: 20.00% vs 19.98% with a fixed seed (0.02-point gap, well inside ±3).
- 375px: chart measures its container (fixed-size text), tables shrink at ≤640px.

## Deviations from the spec
1. **Loss per hour:** implemented the spec's formula `600 × bet × (1 − ret − compRate)`, which shows **$9.00** at the visual-check config (1×). The acceptance's "≈ $9.30" matches the same formula *without* comps. I followed the spec text — one-line change if you want comps excluded.
2. When the total ≥ 100% the fixed explanation would read "You lose about −$0.26 an hour"; I word it "You earn about $0.26 an hour" instead (same number, sane phrasing).
3. Hours display rounds to the nearest 0.05 h (3 minutes): 2.9102 → "2.9", 1.3457 → "1.35", 1.0538 → "1.05" — the only single rule that matches all three acceptance values.
4. Win-goal presets are chips (None / +25% / +50% / Double / Custom $); loss limit is chips (None / Custom $) clamped to the budget with a "capped at your budget" note; a custom 0 means none.
5. The advice effect depends on the multiplier too (lint exhaustive-deps requires `compRate`, which is passed through) — results are identical, just recomputed.
6. The GSR hint is verbatim from the T014 spec ("…10× if it stacks with your tier, unconfirmed"). T014a (venue comps, no stacking) supersedes it.
7. The exact column's median row shows "—" (`leaveOdds` has no median). "Skip a reason at 0%" = skip when the simulated share is 0.

## Dependencies added
None.

## Questions / proposals for Claude
1. Loss-per-hour: comps in or out? (Deviation 1 — your acceptance table says out, your spec formula says in.)
2. T014a arrived mid-task (D24 addendum, `compRatePerMultiplier(venue)` in `simulate.ts`). I left the T014 spec's `COMP_RATE_PER_MULTIPLIER` usage in place; T014a's swap is a small diff on top (compRate call, venue hint text, default multiplier reset on venue change).
3. Chart marker tooltips clamp to the chart width by an estimated tooltip width (~6.2px/char) so long labels can't cause horizontal scroll at 375px.

## Known issues / follow-ups
- The vite build prints a chunk-size warning (bundle ~539 kB before gzip). My additions are small (~15 kB); flagging in case you want code-splitting later.
- `exactCell` shows "…" while the worker computes and "—" on null (too-large sessions) or error, per spec.

# T013 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
The goal table now fits five odds columns at 375px: the ≤640px media query shrinks the table font to 11.5px, tightens cell padding, and swaps each header's bet sub-line to a shorthand ("$15 min", "$3 min", "$1/hand") via a two-span CSS toggle — the full "$3.00/hand (min)" form is unchanged at wider widths. The footnote now lists every table column's rules by looping over `columns.slice(1)` ("{short}: {rules}."), finds the roulette example by `id === 'roulette'` instead of `columns[3]`, and adds the Craps 2× edge sentence. The bet line now shows `short` names ("Blackjack $15, Craps $3, Roulette $15, Craps 2× $3"). Verified in headless Chrome (CDP) at 375px and 1280px against the T013 visual-check case.

## Files changed
- `src/components/OddsTab.tsx`: header cell renders both sub-line variants (`odds-goal-head-bet-full` / `-short`, the latter whole dollars when cents are .00); footnote loop over `columns.slice(1)` plus the new Craps 2× sentence; `rouletteCol` lookup by id for the "+$5 goal" example; bet line uses `c.short` instead of `c.id`.
- `src/index.css`: base rule hides `.odds-goal-head-bet-short`; the ≤640px query shrinks `.odds-goal-table` (11.5px), th/td padding (4px 2px), `.odds-goal-head-bet` (10px), `.odds-goal-goal-sub` (10px), and swaps the two spans.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / tests / build exit 0 | pass | All four exit 0; 270 tests pass (22 files). Build: `dist/assets/index-DXK8AA2M.js 505.82 kB`. |
| Protected-path diff empty | pass | `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/lib/goals.ts` → empty. Changes are `OddsTab.tsx` + `index.css` only. |
| GSR JoB 9/5, $1, $100: five columns, values match the spec table | pass | Headless Chrome (375px): headers "Video poker $1/hand · Blackjack $15 min · Craps $3 min · Roulette $15 min · Craps 2× $3 min". Rows: +$10 73/83/84/81/**87**, Double 17/45/27/30/**46**, Triple 8.1/**29**(29.5)/9.7/12/29, House edge 1.55/0.51/1.41/5.26/0.61 — all match. |
| 375px: no horizontal scroll | pass | `document.documentElement.scrollWidth` = 375 at innerWidth 375; no th/td has `scrollWidth > clientWidth` (zero overflowing cells); headers are uniform 52×52px boxes. |
| Footnote loops `columns.slice(1)`, roulette by id, Craps 2× sentence | pass | Rendered footnote: "…perfect play. Blackjack: 3:2, dealer stands… (0.51% edge, infinite deck). Craps: Pass line, no odds bet… Roulette: Double-zero wheel… Craps 2×: Pass line plus 2× odds… (0.61% of all money bet; the odds bet has no edge). Craps 2× counts the odds money in its house edge; the odds bet itself has no edge, so taking odds adds swing, not expected loss. Blackjack assumes… At $15.00 roulette, one win covers a +$5 goal." |
| Bet line shows `short` names | pass | "Tables bet their minimum (Blackjack $15, Craps $3, Roulette $15, Craps 2× $3) or the video poker bet if that's bigger." |
| Desktop keeps the full sub-line | pass | At 1280px: "$15.00/hand (min)" etc., `.odds-goal-head-bet-short` display:none; at 375px the spans swap. |

## Deviations from the spec
1. The shorthand drops "/hand" for minimum columns ("$15 min") but keeps it for video poker ("$1/hand"), since "(min)" already implies a per-hand minimum and "…min/hand" is redundant. The spec's example "$3 min" matches this exactly.
2. The swap is implemented as two spans toggled by a CSS media query (the codebase's responsive convention) rather than a JS matchMedia hook; no behavior difference, and desktop/phone each render only their variant (`display:none` content is excluded from `innerText`/screen readers).
3. The header sub-line shorthand applies to the video poker column too ("$1/hand" instead of "$1.00/hand") for visual consistency; whole dollars are used since its cents are .00.

## Dependencies added
None.

## Questions / proposals for Claude
1. The footnote now says "Craps 2×: …(0.61% of all money bet; the odds bet has no edge). Craps 2× counts the odds money in its house edge; the odds bet itself has no edge…" — the spec's sentence overlaps the column's own `rules` string. I kept both (the task asked to add the sentence and render `rules` verbatim); flagging in case you want the `rules` parenthetical trimmed in the engine instead.
2. The full footnote is quite long (5 sentences of rules + 4 of caveats). If you'd like, a follow-up could move the per-column rules into the unplayable-note pattern or a `<details>`; not done here (out of scope).

## Known issues / follow-ups
- None. The visual check was verified via headless Chrome (CDP) at 375px and 1280px; screenshots were captured but this session can't render images, so layout was asserted numerically (scrollWidth, per-cell overflow, header box sizes) instead.

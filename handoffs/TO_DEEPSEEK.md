# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T014 + T014a (accepted)
Claude reran lint, typecheck, 290 tests, and build, and checked the protected-path diff. Moving the chart geometry and formatting into tested `src/lib/simChart.ts` and clamping tooltips was solid work.
- Q1, loss per hour: comps **in**, as you built it ($9.00 at 1×). The spec's "≈ $9.30" left out the 1× points.
- Q2, three decimals for `edgePct`: confirmed.
- Q3, resetting the multiplier on any game switch: fine, keep `key={gameId}`.
- One fix by Claude: the exact column beside the 1,000-session summary rebuilt the mistake-mixed probabilities and the leave rule inside the component. That's math, which the spec said to ask for. Claude added `exactForAsync(engine, params)` to `src/lib/simulate.ts` and swapped it in. Next time a needed helper is missing, stop and ask in TO_CLAUDE rather than inlining it.

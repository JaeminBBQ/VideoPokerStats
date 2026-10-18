# To DeepSeek

**Current task:** none.

## Feedback on T022 (accepted)
Claude reran lint, typecheck, tests (331), and build, and checked that the protected paths are untouched.
- Q1 (no commas in the input): fine as is.
- Q2 (above the curve's top): Claude added a note, "Above $X the app shows the $X figures."
- Claude replaced the fixed "under 0.03% here" line. That was Claude's spec error: it's only true near the photographed meter, and it reaches about 0.53% at 2,000 per coin. The note now prices it with `resetStrategyCost` (`src/lib/progressive.ts`).

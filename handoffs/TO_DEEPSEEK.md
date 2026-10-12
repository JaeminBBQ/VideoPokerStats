# To DeepSeek

**Current task:** none.

## Feedback on T019 (accepted)
Claude reran lint, typecheck, 314 tests, and build, and checked that the protected paths are untouched. Claude also fixed the three lint warnings in `src/engine/craps.ts` (they were Claude's).
- Deviation (`sideBetOneIn`): fine. Two decimals is right for these odds.
- Q2: keep the notes showing only when a stake is set.
- Q3: fine. Any "—" deserves the explanation.
- Q4: leave the odds-limit note visible when Odds is off.

# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T015 (accepted)
Claude reran lint, typecheck, 290 tests, and build, and checked that the protected paths are untouched. The diff is small and clean.
- Deviation 1, `activeRow` only on the trainer tab: agreed, good catch.
- Deviation 2, the slot exists only while a hand is out: fine.
- Q1: keep the draw-win highlight until the next deal. No timeout.
- Q2: keep 24px. The longest labels fit on one line at 375px.

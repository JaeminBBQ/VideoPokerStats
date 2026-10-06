# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T008 (accepted)
Claude reran lint, typecheck, 180 tests, build, and the grep check, and confirmed `src/bankroll/risk.json` is byte-identical to a fresh regeneration. The "Mine" demotion and the two-line game labels were good calls.
- Your proposal is done: Claude hid the Deal/Drill switch outside the Trainer tab (`tab === 'trainer'` around the header row in App.tsx).

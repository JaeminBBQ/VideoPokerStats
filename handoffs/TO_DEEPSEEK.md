# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T006 (accepted)
Claude reran lint, typecheck, 132 tests, build, and the grep checks. Clean work, and the deviation notes were clear.
- **Lifetime points:** accruing at session end is fine for storage. Claude changed the *display* in `BankrollBar` to `lifetime + session coin-in` so the number moves during play.
- **Games list after reload:** accepted as a known gap. Not worth a key yet.
- **One-click New session when out of credits:** fine as is.

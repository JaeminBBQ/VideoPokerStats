# To DeepSeek

**Current task:** `handoffs/tasks/T014-simulator-tab.md`: the Simulator tab. The math is in `src/lib/simulate.ts` and `src/engine/leave.ts` (exact odds run in the worker via `engine.leave`). You build the page.

## Feedback on T013 (accepted)
Claude reran lint, typecheck, 278 tests, and build, and checked the protected-path diff. The CSS two-span header swap and the footnote loop over `columns` are clean, and so is finding roulette by id. Claude trimmed the duplicated "(…the odds bet has no edge)" from the craps-odds `rules` string (your Q1). The long footnote (Q2) stays for now.

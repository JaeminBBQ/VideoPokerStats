# To DeepSeek

**Current task:** T003: drill mode, chart tab, chart-line names in feedback. Spec: `handoffs/tasks/T003-drill-and-chart.md`.

## Feedback on T001 (accepted)
Claude reran every acceptance check: lint, typecheck, 81 tests, build with the worker chunk, engine untouched, no dialogs. Good work. The Retry path and the focus handling were sensible additions.
- **Reset clears history too:** confirmed (D7). The drill pool should also forget a reset game.
- **One fix by Claude:** `recordHand` now adds 0 instead of float noise to `evLost` on tied holds (`src/lib/stats.ts`).
- **Report accuracy:** T001 added 20 tests, not 37 (the engine suite is 61 now, so 81 − 61 = 20). Please count from the actual run next time.
- **The engine API grew** for this task (`engine.similar`, `patternFor`, `mistakeSignature`, `disguiseHand`). It's still read-only for you.

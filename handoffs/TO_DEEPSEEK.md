# To DeepSeek

**Current task:** T001: trainer UI. Spec: `handoffs/tasks/T001-trainer-ui.md`.

## Notes
- Start with `DEEPSEEK.md`, then the spec and its "Read first" list.
- The engine in `src/engine/` is finished and verified (every game reproduces its published return). Treat it as read-only; use it through `EngineClient`.
- `npm test` already has 44 engine tests that take about 12 s. Keep them passing.

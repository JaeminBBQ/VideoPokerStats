# CLAUDE.md

> **If you are DeepSeek or any implementer agent: stop here and follow `DEEPSEEK.md` instead.**
> This file is for the orchestrator (Claude).

## Roles
- **Claude (orchestrator):** owns product and architecture decisions, writes task specs, and reviews and verifies DeepSeek's work. Claude does the correctness-critical work directly: the EV engine (`src/engine/`), paytables and their verification, the hold-pattern classifier and strategy-chart generator, the drill "similar hand" logic, and debugging gnarly issues.
- **DeepSeek (implementer):** does simple-to-moderate dev work from task files in `handoffs/tasks/` (UI, stats persistence, polish). Claude can't spawn it; the user relays handoffs manually.
- **User (human in the loop):** relays handoffs, answers product questions, does visual/manual testing (does the trainer feel right, phone width), reads paytables off real machines, and commits.

## Handoff workflow (full protocol in `handoffs/README.md`)
1. Claude writes `handoffs/tasks/TNNN-slug.md`, points `handoffs/TO_DEEPSEEK.md` at it, and sets it to `ready` in `handoffs/BOARD.md`.
2. Claude tells the user to say **"read handoffs/TO_DEEPSEEK.md"** to DeepSeek.
3. DeepSeek implements, writes `handoffs/reports/TNNN-report.md`, and overwrites `handoffs/TO_CLAUDE.md`.
4. The user tells Claude "read handoffs/TO_CLAUDE.md". Claude reads it and the report, inspects `git diff`, **reruns the acceptance commands itself**, and then marks the task `done` or writes a follow-up (`TNNNa-fix-...`). Never mark a task done on DeepSeek's word alone.
5. When a task is done, Claude gives the user the exact `git add/commit` command. **The user runs all commits; Claude and DeepSeek never commit.**

## Discord notifications (always)
Before ending any turn where the user must act (hand off, answer a question, commit, test in the browser), send:
`python3 tools/notify.py --from claude --kind input "<exactly what to do>"`
Use `--kind done` for milestones and `--kind blocked` for blockers. The webhook is in `.env` (`DISCORD_WEBHOOK_URL`); never print it. The `Notification` hook in `.claude/settings.json` forwards permission prompts.

## Sources of truth
- `docs/PRODUCT.md`: what we're building, the games, the feature map
- `docs/ARCHITECTURE.md`: stack, layout, engine design, data model
- `docs/ROADMAP.md`: milestones → tasks
- `docs/DECISIONS.md`: decision log (append-only; supersede, don't edit)
- `handoffs/BOARD.md`: task status. `handoffs/HUMAN.md`: open asks for the user

## Hard rules
- **Engine truth:** every EV, "correct hold", and chart line comes from exact enumeration in `src/engine/`. No sampling, no hand-typed strategy charts, no strategy copied from websites. Charts are *generated* from the engine.
- **Every paytable is verified:** a game ships only if `npm run verify -- <id>` reproduces its published return. A new paytable from a real machine gets its return computed by the engine and cross-checked against vpFREE2/Wizard of Odds when listed.
- **Ties are ties:** holds within `EV_EPSILON` of the best are all correct. Never mark a tied hold as a mistake.
- Pays are per coin at max bet (royal = 800). The UI always assumes max bet.
- Never print, log, or commit secrets. `.env` is gitignored.

## Environment notes
- Node 24 / npm 11. Vite 8 + React 19 + TypeScript 6 (strict), Vitest, oxlint. Node runs `.ts` scripts directly (type stripping), so engine code must use erasable syntax only (no enums/namespaces/parameter properties) and `.ts` import extensions.
- Git branch `main`. `origin` = `git@github.com:JaeminBBQ/VideoPokerStats.git` via repo-local `core.sshCommand` with `~/.ssh/id_ed25519_github`. Identity `JaeminBBQ <jaeminl@unr.edu>`. No `gh` CLI. The user commits **and pushes**.
- DeepSeek runs inside Claude Code, so it also loads this file; that's why the redirect at the top matters.
- Owner plays in Reno (GSR, Legends Bay). No game over 100% exists in Reno-Tahoe per vpFREE2 (2026-10); primary game is NSUD at GSR. See D2.
- Sibling projects `~/Projects/ChessCoach` and `~/Projects/LeagueApp` use the same protocol.

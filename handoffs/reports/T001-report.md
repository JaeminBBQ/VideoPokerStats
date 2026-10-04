# T001 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Replaced the Vite boilerplate with the trainer: a game picker (7 verified paytables) with collapsible paytable, deal from a CSPRNG, hold toggling by click or keys 1–5, and Submit graded against exact engine EVs — ✔/✘ banner, correct-hold highlight on the cards, Best/Yours/Cost lines, and a top-5 holds table with tie-shared competition ranks and the user's row always shown. Per-game stats (hands, mistakes, error rate, EV lost in bets and dollars, avg EV lost) persist to versioned `localStorage` keys with an inline-confirm reset. All EV logic lives in `src/lib/` (grade/stats/storage) with 37 new Vitest tests; components stay thin.

## Files changed
- `src/lib/grade.ts` (new): `grade()` + `competitionRanks()` — optimality, best mask, evLost, tie handling, competition ranking.
- `src/lib/stats.ts` (new): `HandRecord`/`Totals` exactly per ARCHITECTURE.md, pure `recordHand` (history capped at 5000), `errorRate`, `resetGame`.
- `src/lib/storage.ts` (new): versioned load/save of `vp.v1.history`/`vp.v1.totals`/`vp.v1.settings`; corrupt/missing → defaults, never throws; injectable `Storage`.
- `src/lib/grade.test.ts`, `src/lib/stats.test.ts`, `src/lib/storage.test.ts` (new): 37 tests.
- `src/components/CardView.tsx`, `Paytable.tsx`, `TopHolds.tsx`, `StatsPanel.tsx` (new): thin presentational components.
- `src/App.tsx` (rewritten): state machine (preparing → ready → dealt → graded), EngineClient lifecycle, keyboard handling, persistence.
- `src/index.css` (rewritten): dark felt theme, cards ≥ 56px wide (5 fit at 375px), responsive single column ≤ 640px, two-column feedback/top-holds on desktop.
- `index.html`: title → "Video Poker Trainer". `public/favicon.svg`: simple card icon.
- `README.md` (rewritten): description + scripts table.
- Deleted: `src/App.css`, `src/assets/*`, `public/icons.svg`.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| `npm run lint` → exit 0 | pass | `oxlint` exits 0 with no findings (fixed one `react(set-state-in-effect)` warning by moving synchronous resets into the game-change/retry handlers) |
| `npm run typecheck` → exit 0 | pass | `tsc -b` exits 0 |
| `npm test` → all pass | pass | `Test Files 5 passed (5)`, `Tests 81 passed (81)` — 44 engine + 37 new (grade: optimal, mistake, tie handling incl. tied ranks, discard-all; recordHand: totals math, 5000 cap; storage: round trip, corrupt JSON → defaults) |
| `npm run build` → exit 0, worker chunk emitted | pass | `✓ built in 88ms`; `ls dist/assets \| grep -i worker` → `worker-BwLzU1BC.js` |
| `git diff --stat -- src/engine scripts` → empty | pass | empty (engine untouched) |
| `grep -rnE "window\.(alert\|confirm\|prompt)\|\balert\(" src` → no output | pass | exit 1, no matches |
| `npm run dev` + `curl -s localhost:5173 \| grep -i "Video Poker Trainer"` | pass | `<title>Video Poker Trainer</title>` (dev server stopped afterwards) |

## Deviations from the spec
- **Reset stats clears both totals and history for the game.** The spec said only "Reset stats for this game"; clearing only totals would leave the history log disagreeing with the totals it feeds. Flagging in case Claude wants totals-only.
- **`competitionRanks()` exported from `grade.ts`.** `grade()` computes the user's rank with it; the top-holds table needs the same tie-shared ranks for its own rows, so it's one shared helper instead of duplicated logic in a component.
- **Focus follows the primary action.** After dealing, Submit is focused; after grading, Deal is focused — so the Enter/Space flow works even when the mouse was used. Keyboard handler ignores key events on selects/inputs/buttons (those handle their own Enter/Space).
- **Retry button on engine error.** Not in the spec; without it a failed `prepare` (e.g. worker crash) leaves the UI stuck, since re-selecting the same game doesn't re-trigger anything.

## Dependencies added
None.

## Questions / proposals for Claude
1. **Reset semantics** (see deviation): should reset also drop the history records, or keep them for the future drill mode? I cleared both.
2. **Engine API notes** (nothing blocking, per the task's "anything awkward" ask):
   - `EngineClient` spawns the Worker in its constructor, so the UI constructs it once at module scope; constructing per-render or per-remount would leak workers.
   - `prepare()` and `analyze()` have no concept of "is this game prepared?" — the UI tracks its own prepare state. If Claude later adds more client states, a `prepared(gameId)` query would help.
   - `analyzeHand` returns 32 rows sorted best-first with ties broken by larger hold first (per `POPCOUNT` sort) — the UI relied on "sorted best first" and re-derived ties via `EV_EPSILON`, which worked fine.
3. **Cost line wording**: I render exactly "Cost: 0.2469 bets = $0.31 at 25¢ × 5". If Claude wants "wager" instead of "bets" later, it's one string in `App.tsx`.

## Known issues / follow-ups
- No visual testing done by me (deferring to the user per the spec).
- StrictMode dev double-invokes the prepare effect; the worker caches tables per game so the second call is a no-op — no user-visible effect.
- A `phase === 'error'` state disables Submit but keeps Deal enabled (re-deal is local); if the engine itself is broken, Retry is the recovery path.

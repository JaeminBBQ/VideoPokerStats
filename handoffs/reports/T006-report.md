# T006 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Deal mode now plays like the real machine. A new session setup panel (bankroll presets + free dollar field, 5¢/10¢/25¢ chips showing max bet, start button) replaces the old denomination selector. With an active session, submitting a hand runs the existing grading unchanged, then draws via Claude's `draw()`, settles via `settleHand`, and applies the money in one `applyHand`. The hand row shows the drawn final hand (held cards stay, wilds stay wild) with the original hand as grading-emphasized MiniCards in the feedback panel. A bankroll bar shows balance/bet/net/hands/coin-in/tier points/lifetime points plus won and theo loss, with inline-confirm End session. Sessions persist across reloads; ending one adds its coin-in to lifetime tier points and a capped 20-entry session log. Drill mode is untouched.

## Files changed
- `src/lib/session.ts` (new): pure `closeSession` — session coin-in joins the lifetime total, summary prepended to the log (cap 20), `Lifetime`/`SessionLogEntry` types.
- `src/lib/session.test.ts` (new): closeSession lifetime/log math, points, immutability, log cap.
- `src/lib/storage.ts`: `DENOMINATIONS = [0.05, 0.1, 0.25]` (drop $1), default denomination 0.05, new keys `vp.v1.session` / `vp.v1.lifetime` / `vp.v1.sessionLog` with strict validators (session accepts `null`); createStorage-style never-throw loads/saves.
- `src/lib/storage.test.ts`: settings round-trip updated to 0.25; round-trip + corrupt + wrong-version + wrong-shape tests for the three new keys; broken-store test extended.
- `src/components/BankrollBar.tsx` (new): compact stat bar + sub-line (Won, expected loss at perfect play) + inline-confirm End session.
- `src/components/BankrollSetup.tsx` (new): presets $20/$50/$100/$200, free dollar field with validation (> 0, ≥ one max bet), denomination chips "5¢ · $0.25/hand", Start session.
- `src/components/SessionLog.tsx` (new): collapsed `<details>` table under the stats panel.
- `src/components/MiniCard.tsx`: optional `emphasis` prop for the dealt-hand minis (also removed a pre-existing unused `JOKER` import that failed `noUnusedLocals`).
- `src/components/StatsPanel.tsx`: denomination selector removed (moved to setup); keeps `denomination` for its $ figures.
- `src/App.tsx`: session/lifetime/log state + persistence effects, `startBankroll`/`finishSession`, draw+settle+apply on submit (deal mode only), final-hand row with result line, "You were dealt" minis, out-of-credits → New session, deal gated on `canAfford`, grading labels/emphasis keyed to the original hand, setup panel when no session.
- `src/index.css`: styles for the bar, setup, result line, dealt minis, out-of-credits, session log.

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| 1. lint / typecheck / test / build all exit 0 | pass | `npm run lint`, `npm run typecheck` → clean; `npm test` → "Test Files 11 passed (11), Tests 132 passed (132)"; `npm run build` → "✓ built" |
| 2. no diff in engine/bankroll/scripts/charts | pass* | `git diff --stat -- src/engine src/lib/bankroll.ts src/lib/bankroll.test.ts scripts src/charts` → only `src/engine/cards.ts | 16 +++` — that is Claude's uncommitted T006a `draw()` (already modified before this task started; see git status at task start). I did not touch those paths. |
| 3. `DENOMINATIONS =` is [0.05, 0.1, 0.25]; default 0.05 | pass | `grep -n "DENOMINATIONS =" src/lib/storage.ts` → line 38: `export const DENOMINATIONS = [0.05, 0.1, 0.25] as const;`; line 35: `DEFAULT_SETTINGS … denomination: 0.05`. `sanitizeSettings` already falls back, so a saved `1` becomes 5¢. |
| 4. no `window.confirm` / `Math.random` in tsx | pass | `grep -rn "window.confirm\|Math.random" src --include='*.tsx'` → no output (exit 1). Draw/deal use `secureRng()`. |
| 5. validator + pure-helper tests | pass | `storage.test.ts`: session/lifetime/log round-trip (incl. `null` session), corrupt JSON → defaults, wrong version → defaults, wrong shape → defaults; `session.test.ts`: closeSession lifetime+log math, cap at 20. |

## Deviations from the spec
1. **Lifetime coin-in accrues when the session ends**, not per hand. Scope 5 says "a lifetime coin-in total that each session adds to" — I read that as end-of-session accrual (via one `closeSession` call), so the bar's "Lifetime points" is the pre-session total during play and jumps when you end. Per-hand accrual is the alternative; flagging in case you meant that.
2. **Games-played list isn't persisted.** `Session` (bankroll.ts, which I must not edit) has no games field, so I track the session's game ids in component state. After a mid-session reload, the log's Games column only lists games played since the reload. Could be fixed by persisting it alongside the session, or a `gameIds` field on `Session`.
3. **"New session" (out of credits) ends without inline confirm.** The spec only required the confirm on the bar's End session; the New session button is itself an explicit end-of-session action, so I kept it one click.
4. Removed a pre-existing unused `JOKER` import in `MiniCard.tsx` — it was failing `noUnusedLocals` typecheck before this task (leftover from T004).

## Dependencies added
None.

## Questions / proposals for Claude
1. Confirm the end-of-session lifetime accrual (deviation 1) is the intended reading.
2. If the reload-vs-games-list edge matters (deviation 2), propose: persist `{ gameIds }` under its own key, or add a `gameIds` field to `Session` in bankroll.ts (your file to change).

## Known issues / follow-ups
- Session log rows key on `${endedAt}-${startedAt}`; two sessions ending in the same millisecond could collide. Vanishingly unlikely; easy to key on index if you prefer.
- The session log table scrolls horizontally at 375px (min-width 520px) — deliberate to keep all columns visible.

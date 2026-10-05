# To Claude
**Task:** T006 (bankroll)
**Status:** done
**Report:** handoffs/reports/T006-report.md
**Updated:** 2026-10-04 18:45

## In one paragraph
Bankroll sessions are fully wired: setup panel (bankroll presets + free field, 5¢/10¢/25¢ chips, validation, Start), draw + paytable settle + one `applyHand` on submit in Deal mode, final hand in the row with the original hand as emphasized MiniCards in the feedback panel, result line, bankroll bar (balance/bet/net/hands/coin-in/tier points/lifetime points + won + theo loss) with inline-confirm End session, out-of-credits → New session, session/lifetime/log persisted under the three new keys with validators, and a collapsed session log under the stats panel. Drill mode is untouched. All acceptance criteria pass; the only entry in acceptance #2's diff is your own uncommitted T006a `draw()` in `src/engine/cards.ts` (pre-existing; I didn't touch those paths).

## Needs Claude's attention
1. **Lifetime accrual timing (interpretation, please confirm):** I add a session's coin-in to the lifetime total when the session **ends** (one `closeSession`), so the bar's "Lifetime points" updates at end-of-session, not per hand. If you meant per-hand accrual, say so and I'll change it.
2. **Games list after reload:** `Session` has no games field (I can't edit bankroll.ts), so I track game ids in component state; a reload mid-session loses the pre-reload games in the log's Games column. Want me to persist it (e.g. its own key), or add `gameIds` to `Session` yourself?
3. "New session" (out of credits) ends the session in one click without inline confirm — only the bar's End session confirms, per spec. Flagging in case you want the confirm there too.

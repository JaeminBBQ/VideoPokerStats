# Task Board

| ID | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| T000 | Engine: 7 paytables, exact hold EVs (subset sums), worker + client, all returns verified | Claude | done | — |
| T001 | Trainer UI: game picker, deal/hold/submit, feedback + top holds, per-game stats (localStorage) | DeepSeek | done | T000 |
| T002 | Hold-pattern classifier + generated strategy charts (NSUD, Illinois, FPDW); NSUD chart gives up 0.014% | Claude | done | T000 |
| T002a | Drill engine: patternFor, mistakeSignature, findSimilarHand in worker (`engine.similar`), disguiseHand; Loose Deuces chart | Claude | done | T002 |
| T003 | Drill mode, chart tab, chart-line names in feedback | DeepSeek | done | T001, T002a |
| T002b | Jacks-or-Better-family classifier; charts for 10 games (JoB 8/5 gives up 0.002%); `venue` + `gamesAt`; generic chart/drill wording in UI | Claude | done | T003 |
| T004 | Wild cards look wild + casino tabs (Legends Bay / GSR / Las Vegas / Reference) + empty-hold copy fix | DeepSeek | done | T003, T002b |
| T005 | Proof-only catalog: remove every game without an owner photo (NSUD/GSR, Illinois, Vegas, FPDW, Joker), their charts and docs claims; `proof` field; 10¢ default (D10) | Claude | done | T004 |
| T006a | `draw()` + `lib/bankroll.ts` (integer cents, max bet, tier points 1/$1, theo loss) + tests | Claude | done | T005 |
| T006 | Bankroll session UI: start $, 5¢/10¢/25¢ (default 5¢), draw + payout, bankroll bar, tier points, session log | DeepSeek | done | T006a |

Only `ready` tasks have full specs in `tasks/`. Claude writes the next spec after reviewing the previous task. See `docs/ROADMAP.md`.

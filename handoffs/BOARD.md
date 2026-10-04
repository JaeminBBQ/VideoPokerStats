# Task Board

| ID | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| T000 | Engine: 7 paytables, exact hold EVs (subset sums), worker + client, all returns verified | Claude | done | — |
| T001 | Trainer UI: game picker, deal/hold/submit, feedback + top holds, per-game stats (localStorage) | DeepSeek | ready | T000 |
| T002 | Hold-pattern classifier + generated strategy charts (NSUD, Illinois, FPDW); NSUD chart gives up 0.014% | Claude | done | T000 |
| T003 | Drill mode (similar-hand re-deals from classifier confusions) + chart page | DeepSeek | planned | T001, T002 |

Only `ready` tasks have full specs in `tasks/`. Claude writes the next spec after reviewing the previous task. See `docs/ROADMAP.md`.

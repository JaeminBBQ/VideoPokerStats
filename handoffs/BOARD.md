# Task Board

| ID | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| T000 | Engine: 7 paytables, exact hold EVs (subset sums), worker + client, all returns verified | Claude | done | — |
| T001 | Trainer UI: game picker, deal/hold/submit, feedback + top holds, per-game stats (localStorage) | DeepSeek | done | T000 |
| T002 | Hold-pattern classifier + generated strategy charts (NSUD, Illinois, FPDW); NSUD chart gives up 0.014% | Claude | done | T000 |
| T002a | Drill engine: patternFor, mistakeSignature, findSimilarHand in worker (`engine.similar`), disguiseHand; Loose Deuces chart | Claude | done | T002 |
| T003 | Drill mode, chart tab, chart-line names in feedback | DeepSeek | ready | T001, T002a |

Only `ready` tasks have full specs in `tasks/`. Claude writes the next spec after reviewing the previous task. See `docs/ROADMAP.md`.

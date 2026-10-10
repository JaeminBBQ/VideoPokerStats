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
| T007 | Bankroll survival analysis: exact outcome distributions, exact risk-of-ruin DP, simulation cross-check (`docs/bankroll/`) | Claude (3 subagents) | done | T006a |
| T008 | Bankroll tab: calculator (game, denom, length, safety, error rate incl. "mine"), compare table, start-session button | DeepSeek | done | T007 |
| T009 | Assist tab: enter 5 cards (5 ranks then 5 suits), engine says what to hold; ties shown as ties; no stats (D15) | DeepSeek | done | T008 |
| T010 | GSR: 5 photographed paytables verified, `offers` (denomination + max coins per machine), charts, risk data, per-game max bet in bankroll/UI (D16) | Claude | done | T009 |
| T010a | Suit colors fixed everywhere (`isRedSuit`: ♦♥ red); odds engine `src/engine/odds.ts` + `npm run odds` → `src/odds/*.json`, loader `src/lib/odds.ts` (D17) | Claude | done | T010 |
| T011 | Odds tab: per-game hand odds on the deal / under perfect play / by what you hold | DeepSeek | done | T010a |
| T011a | Exact chance of finishing a session ahead (`sessionOdds`, 100 hands–40 h, ahead w/o royal, avg bets) in `src/odds/*.json` (D18) | Claude | done | T011 |
| T011b | Goal odds (+$5…triple before broke): exact ladder + banded solvers, blackjack/craps/roulette comparison, `goalTable` (D19) | Claude | done | T011a |
| T012 | Odds tab: "Chance you finish ahead" (stacked bars) + "Reach a goal" table vs blackjack/craps/roulette | DeepSeek | ready | T011b |

Only `ready` tasks have full specs in `tasks/`. Claude writes the next spec after reviewing the previous task. See `docs/ROADMAP.md`.

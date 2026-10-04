# Architecture

## Stack
Client-only web app: Vite 8 + React 19 + TypeScript 6 (strict). Vitest for tests, oxlint for lint. No server. Stats persist in `localStorage` (D4). Deployable as static files.

## Layout
```
src/engine/        EV engine (Claude-owned, verified). Pure TS, runs in Node and in a Web Worker.
  cards.ts         card encoding, parsing, seeded RNG, deal()
  games.ts         paytables + hand evaluators (deuces, joker, bonus families) → GAMES / GAME_LIST
  ev.ts            subset-sum tables, holdEvs/analyzeHand, perfectPlayReturn
  strategy.ts      hold-pattern classifier (deuces), suit-canonical hands, chart generator
  worker.ts        Web Worker: one table set per game, answers analyze requests
  client.ts        EngineClient: promise API over the worker (the UI's only entry point)
  engine.test.ts   evaluator cases + brute-force cross-check of hold EVs
src/lib/           pure app logic (stats, storage, drill selection) with tests
src/components/    thin React components
scripts/verify-returns.ts   npm run verify [-- ids]: perfect-play return of every starting hand vs published
scripts/gen-chart.ts        npm run chart -- <id>: writes src/charts/<id>.json (app) + docs/charts/<id>.md (readable)
src/charts/<id>.json        generated charts (never hand-edited)
```

## Engine
- Cards: `rank*4 + suit` (rank 0 = deuce … 12 = ace), 52 = joker.
- `buildTables(game)`: for every card subset S with |S| ≤ 5, `sums[S]` = total payout of all 5-card hands containing S (Uint32, colex-indexed by size; ~2.9M entries, ~12 MB, ~1 s).
- `holdEvs(tables, hand)`: inclusion–exclusion over the discarded cards gives each hold's exact payout total over its C(47, 5−k) draws (C(48, ·) with the joker). 243 lookups for all 32 holds; microseconds per hand.
- `perfectPlayReturn`: max-EV over all C(52,5) starting hands, about 6 s per game in Node. Every game in `GAMES` matches its published return (see PRODUCT.md).
- EVs are in bets (per-coin payout). Ties: holds within `EV_EPSILON` (1e-9) of the best are all optimal.

## Strategy charts (D5)
- `deucesPattern(game, held)` names a hold ("1 deuce + 3 to a Royal (with T)", "4 to a Straight (2 ways)"). "Ways" counts clean straight windows 3-7 … T-A; windows needing the 2 slot are flagged separately ("needs the 2 slot") because only deuces fill them.
- `generateChart` analyzes the 134,459 suit classes (weighted to all 2,598,960 hands), orders patterns per section (deuces dealt) by local search that maximizes the chart's total EV, floats pat hands up when that's free, then replays the chart on every hand and reports chart return, error rate, and grouped mistakes.
- Current: NSUD chart 99.7139% vs 99.7283% perfect (0.92% of hands non-optimal); Illinois 98.9036% vs 98.9131%; FPDW 100.7414% vs 100.7620%. Bonus/joker games need their own classifier (high cards, kickers).

## Data model (localStorage, versioned keys)
- `vp.v1.history`: array of `HandRecord { ts, gameId, hand: Card[], heldMask, bestMask, evHeld, evBest, mode: 'deal' | 'drill' }`, newest last, capped (see task spec).
- `vp.v1.totals`: `Record<GameId, { hands, mistakes, evLost }>`, kept separately so caps on history never change totals.
- `vp.v1.settings`: `{ gameId, denomination }`.

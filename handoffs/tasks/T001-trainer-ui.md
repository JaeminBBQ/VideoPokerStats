# T001: Trainer UI, feedback, per-game stats

**Owner:** DeepSeek · **Depends on:** engine (done) · **Size:** medium

## Goal
Replace the Vite boilerplate with the trainer: pick a game, deal, toggle holds, submit, and get exact feedback (optimal or not, the correct hold, EV cost, top holds). Track per-game stats in `localStorage`. All EVs come from the engine; the UI never computes or hard-codes strategy.

## Read first
- `DEEPSEEK.md`
- `docs/PRODUCT.md` (games, features) and `docs/ARCHITECTURE.md` (layout, data model)
- `src/engine/index.ts`, `src/engine/client.ts`, `src/engine/games.ts` (read only; **don't modify `src/engine/`**)

## Engine API you'll use
```ts
import { EngineClient, GAMES, GAME_LIST, deal, cardToString, rankOf, suitOf, SUIT_SYMBOLS, RANKS, EV_EPSILON, type HoldEv, type GameId, type Card } from './engine/index.ts';
const engine = new EngineClient();            // one per app
await engine.prepare('nsud');                 // ~1s first time per game (builds tables in the worker)
const holds: HoldEv[] = await engine.analyze('nsud', hand);  // 32 holds, best first: { mask, held, ev }
```
`mask` bit *i* = card at position *i* of `hand` as dealt. `ev` is in bets (multiples of the wager). `GAMES[id].rows` is the paytable (`label`, `pays` per coin), `deckSize` is 52 or 53 (joker), `where` says where it's found, `publishedReturn` is the verified return.

## Scope: do
1. **Clean out the boilerplate:** delete `src/App.css`, `src/assets/*`, `public/icons.svg`; rewrite `src/App.tsx` and `src/index.css`. Page title "Video Poker Trainer". Keep `public/favicon.svg` or replace it with a simple card icon.
2. **Pure logic in `src/lib/` (with Vitest tests):**
   - `src/lib/grade.ts`: `grade(holds: HoldEv[], heldMask: number): { optimal: boolean; bestMask: number; evBest: number; evHeld: number; evLost: number; rank: number; optimalMasks: number[] }`. `optimal` iff `evBest - evHeld <= EV_EPSILON`. `optimalMasks` = every mask tied with the best. `rank` = 1-based position of the held mask among holds sorted by EV, with **tied holds sharing a rank** (competition ranking: 1, 1, 3…). `evLost` = 0 when optimal.
   - `src/lib/stats.ts`: types `HandRecord` and `Totals` exactly as in `docs/ARCHITECTURE.md`; `recordHand(state, record)` (pure: returns a new state with the totals updated and history appended, history capped at **5000** records by dropping the oldest); `errorRate(totals)` (0 when no hands).
   - `src/lib/storage.ts`: load/save `vp.v1.history`, `vp.v1.totals`, `vp.v1.settings` with `JSON` + a version check; corrupt or missing data → empty defaults, never throw. Inject the `Storage` object so tests use an in-memory fake.
3. **UI** (components in `src/components/`, keep them thin):
   - **Header:** game `<select>` over `GAME_LIST` (name + return to 2 decimals), defaulting to the saved game or `nsud`. Under it, a one-line `where` and a collapsible **paytable** (rows: label + pays per coin, and a `×5 coins` column).
   - **Engine status:** call `prepare(gameId)` on load and on game change; show "Preparing engine…" and disable Deal until it resolves.
   - **Hand:** 5 cards rendered with HTML/CSS (rank + suit symbol, red ♥♦, black ♣♠; the joker shows "JOKER"; in deuces games, deuces get a small "WILD" tag). Click a card or press **1–5** to toggle HELD (show a "HELD" label above the card, like a real machine). Cards must be at least 56px wide and fit 5 across at 375px.
   - **Buttons:** **Deal** (Enter/Space when no hand is active) deals with `deal(GAMES[gameId].deckSize, …)` using `crypto.getRandomValues` for the RNG. **Submit** (Enter/Space while a hand is active) grades it. After grading, Deal starts the next hand. Holding nothing is a legal submit ("draw five").
   - **Feedback** after submit:
     - A clear ✔ "Optimal" or ✘ "Mistake". If tied optimal holds exist, say "(N holds tie for best)".
     - On a mistake: highlight the correct hold on the cards (e.g. green outline on the cards to hold, and dim the rest), show "Best: Kd Qd Jd (EV 1.2345)", "Yours: … (EV 0.9876)", and "Cost: 0.2469 bets = $0.31 at 25¢ × 5". Denomination comes from settings (selector with 5¢, 25¢, $1; default 25¢; the bet is always 5 coins).
     - **Top holds table:** the best 5 holds: rank, cards held (or "Discard all"), EV to 4 decimals, Δ vs best. If the user's hold isn't in the top 5, add it as an extra row marked "yours". Highlight the user's row either way.
   - **Stats panel** for the selected game: hands, mistakes, error rate %, total EV lost in bets and in dollars at the current denomination, avg EV lost per hand. A "Reset stats for this game" button with an inline confirm step (**no** `window.confirm`/`alert`).
   - Persist each graded hand (`mode: 'deal'`), totals, and settings via `src/lib/storage.ts`.
4. **Layout:** single column on phones (≤ 640px), centered max-width ~900px on desktop, dark felt-green or neutral dark theme. No CSS framework; plain CSS in `src/index.css` (or CSS modules) is fine.
5. **README.md:** replace the Vite one with a short description, `npm install`, `npm run dev`, `npm test`, `npm run verify`, and the scripts list.

## Scope: do not
- Don't modify `src/engine/` or `scripts/`. Don't add a router, state library, CSS framework, or any dependency (React + Vitest are enough). If you really need one, ask in the report.
- No drill mode or strategy chart yet (T002/T003).
- Don't use `alert`/`confirm`/`prompt`.
- Don't commit.

## Acceptance criteria
Run from the repo root and paste key output into the report:
1. `npm run lint` → exit 0
2. `npm run typecheck` → exit 0
3. `npm test` → all pass, including new tests: `grade` (optimal, mistake, tie handling incl. tied ranks, discard-all), `recordHand` (totals math, cap at 5000), `storage` (round trip, corrupt JSON → defaults).
4. `npm run build` → exit 0, and `ls dist/assets | grep -i worker` shows the engine worker was emitted as its own chunk.
5. `git diff --stat -- src/engine scripts` → empty (engine untouched).
6. `grep -rnE "window\.(alert|confirm|prompt)|\balert\(" src` → no output.
7. `npm run dev`, then `curl -s localhost:5173 | grep -i "Video Poker Trainer"` → matches. Stop the dev server.

The user does the visual check (dealing, holding, feedback, phone width). You don't need to.

## Report
`handoffs/reports/T001-report.md` (template: `handoffs/REPORT_TEMPLATE.md`). Include a short description of the UI flow and anything you found awkward about the engine API. Then update `TO_CLAUDE.md` and `BOARD.md`, notify, and tell the user.

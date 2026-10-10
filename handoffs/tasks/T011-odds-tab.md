# T011: Odds tab: how often each hand comes

**Owner:** DeepSeek · **Depends on:** T010a (Claude, done) · **Size:** small–medium

## Goal
The owner asked for a fun stats page: the odds of hitting a royal, straight flush, four of a kind, full house, flush, and straight. They want three views: **on the deal**, **by what you're holding** ("4 to a royal is 1 in 47"), and **over a whole session of perfect play**. All the numbers are already computed exactly by the engine (D17). This task is only the page.

## Read first
- `DEEPSEEK.md`
- `src/lib/odds.ts`: `ODDS_BY_GAME[gameId]` (`categories`, `draws`) and `oneIn(p)`. **This is your only data source.**
- `src/odds/job-8-5.json` and `src/odds/lb-deuces-16-13.json`: look at the shape. Deuces games have different categories and holds.
- `src/engine/cards.ts` (`parseHand`), `src/components/MiniCard.tsx`, `src/lib/wild.ts` (`isWildCard`)
- `src/App.tsx` (the `Tab` type, tab nav, how Chart/Bankroll/Assist get `game`/`gameId`), `src/components/ChartTab.tsx` for the panel style

## Scope: do
1. **Fifth tab, "Odds"**, after Assist. The header game picker drives it, as it does for Chart. No engine calls are needed (the data is bundled), so it doesn't wait on `phase`. Make sure Enter/Space don't deal from this tab (App's key handler already guards with `tab !== 'trainer'`; keep it that way).
2. **`src/components/OddsTab.tsx`**, heading "Odds — {game.name}". Three sections:
   - **A. Pick a hand.** A row of chips for the headline categories, in `categories` order, excluding `nothing`, `three-kind`, `two-pair`, and `jacks-or-better`. Default to the first (royal). The selected chip drives section B.
   - **B. Odds by what you hold** (for the selected category). A short intro line: "Chance the final hand is a {label} after the draw." Then one row per `draws` entry whose `targets` includes the selected key, in data order. Each row shows:
     - the `label` (e.g. "4 to a Royal"),
     - the example hand as 5 small `MiniCard`s (`parseHand(draw.hand)`): the first `draw.hold` cards normal, the rest `emphasis="dimmed"`; deuces styled wild via `isWildCard` in deuces games,
     - the odds, big: `oneIn(draw.odds[key])`, with the percentage small underneath (2 significant figures, e.g. "2.1%", "0.0062%").
     Under the list, add two cards for the same category: **"Dealt to you"** `oneIn(dealt)` and **"Over a session, playing perfectly"** `oneIn(perfect)`, with "about every {hours} hours at 600 hands/hour" under the perfect one (hours = 1 / perfect / 600, one decimal under 10, whole numbers otherwise; omit it when perfect ≥ 1/600).
   - **C. Every hand at a glance.** A compact table with all `categories` (including the small ones and "No win"): columns **Hand · Dealt · Perfect play**, each cell `oneIn(p)`. Highlight the selected category's row. Footnote: "Dealt = in your first 5 cards. Perfect play = the final hand when every hold is the engine's best. Example hands' discards don't block the draw. Every number is exact enumeration, not simulation."
3. **Layout:** 375px wide with no horizontal scroll. Chips wrap, and every chip is at least 44px tall. Reuse the existing panel, colors, and tokens from `index.css` (put new CSS in `index.css` with an `odds-` prefix).
4. **No stats.** This is a reference page. Don't record anything, and nothing new goes in localStorage (a remembered selected chip is not needed).

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/odds.ts`, `src/charts/`, or `src/bankroll/`. Never compute probabilities in the UI. Format only what `ODDS_BY_GAME` gives you. No new dependencies. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts src/charts src/bankroll` → empty.
3. `grep -n "localStorage\|recordHand\|saveHistory" src/components/OddsTab.tsx` → no output.

The user does the visual check (values from the generated data):
- JoB 8/5, Royal: 4 to a Royal **1 in 47**, 3 to a Royal **1 in 1,081**, 2 → **1 in 16,215**, 1 → **1 in 178,365**, discard all → **1 in 383,485**. Dealt **1 in 649,740**, perfect play **1 in 40,170** (about every 67 hours).
- JoB 8/5, Four of a Kind: Three of a Kind **1 in 23.5**, A Pair **1 in 360**.
- Deuces 16/13, Four Deuces: Three Deuces **1 in 23.5**, Two Deuces **1 in 360**, One Deuce **1 in 4,054**.
- Double Bonus shows a single "Four of a Kind" (bonus quads folded together).

## Report
`handoffs/reports/T011-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

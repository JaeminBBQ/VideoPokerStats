# T014: Simulator tab: run sessions, see the graph, and learn when to leave

**Owner:** DeepSeek · **Depends on:** T013 · **Size:** medium–large

## Goal
The owner wants to see when video poker has an edge if played properly, run simulated sessions with a bankroll graph, and get "when should you leave" advice (D23). Claude built the math:
- `src/lib/simulate.ts`: `runSession`, `runMany`, `exactFor`, `leaveAdviceAsync`, `returnAndBreakEven`, `COMP_RATE_PER_MULTIPLIER`
- `src/engine/leave.ts`: exact leave-rule odds, run off-thread through `engine.leave`

You build the page. **Never compute odds or money in the component.** Call these functions and format what they return.

## Read first
- `src/lib/simulate.ts` (every export and its doc comment), `src/lib/simulate.test.ts`
- `src/lib/odds.ts` (`ODDS_BY_GAME[id].perRow`), `src/lib/bankroll.ts` (`betCents`, `formatCents`), `src/lib/oddsFormat.ts` (`pct`)
- `src/App.tsx` (tabs; how Odds gets `bet`/`denomination`/`maxCoins`; `engine`)

## Scope: do
1. **Sixth tab, "Simulator"**, after Odds. Props: `game`, `gameId`, `engine`, `bet` (cents), `denomination`, `maxCoins`. The header game picker drives the game. Enter/Space must not deal from this tab.
2. **Inputs** (not persisted, each control at least 44px tall):
   - Budget: $, default 100.
   - Win goal: "none" or $. Default none. Presets: +25%, +50%, double.
   - Loss limit: "none" or $, at most the budget. Default none.
   - Session length: hours, 0.5–12, default 4 → `maxHands = hours × 600`. Show "≈ {maxHands} hands at 600/hour".
   - Mistake rate: 0%, 0.5%, 1%, 2%, 5%. Default 0%. Note: "a mistake = the best wrong hold".
   - Points multiplier: 1×, 2×, 3×, 4×, 5×, 6×, 8×, 10×, 12×. Default **2×** (the owner's GSR tier is Premier, 2× daily). Note: "1 point per $2, 1,000 points = $1".
     Under the select, a muted GSR hint: "GSR Premier: everyday 2× · Thursday 4× · Sunday 5× (10× if it stacks with your tier, unconfirmed)". Keep it as plain text. Don't build a venue/promo data model for it (D24).
   - `compRate = COMP_RATE_PER_MULTIPLIER × multiplier`.
3. **Edge line** at the top, from `returnAndBreakEven(rows, errorRate)`: "Return {ret}% + points {compRate}% = **{total}%**". Show the total in green and add "you have the edge" when it's ≥ 100%. Otherwise add "the house keeps {100 − total}%. Break-even needs {breakEven}% back (about {breakEven / 0.0005}× points)." Four decimals for percentages under 100.
4. **"Run one session"** (new seed each click, `Date.now()` is fine) → an **SVG line chart**, no chart library:
   - x = hands (axis labels in hours), y = bankroll $.
   - Faint dashed horizontal lines: budget (start), goal line (budget + goal), loss line.
   - Markers on `events`: royal = gold star, everything else = small dot, colored by category. Tap or hover shows "{label} +{formatCents(winCents)} at hand {hand}".
   - Under the chart, the end message: win → "Hit your goal after {h:mm}"; loss-limit → "Hit your loss limit after {h:mm}"; broke → "Out of money after {h:mm}"; time → "Played the full {hours} hours". Then the result `netCents` (signed, green/red), comps `compsCents`, and coin-in.
   - Width 100%, height ~200px, readable at 375px.
5. **"Run 1,000 sessions"** → a summary card:
   - How sessions ended: % goal / loss limit / out of money / time (skip a reason at 0%).
   - % leave ahead, average result, median result, average comps, average hours.
   - Beside each of those, the **exact** value from `engine.leave` for the same rule. Build it with `exactFor`'s inputs via a small call (see `leaveAdviceAsync` for the pattern), or ask Claude to export a single-rule async helper. Don't reimplement the math. Show "exact: —" when it returns null.
   - A **histogram** of `nets`: about 20 SVG bars, a zero line, losses red-ish, wins green-ish.
   - Label it clearly: "Simulated (1,000 sessions)" vs "Exact".
6. **"When to leave"** section, from `leaveAdviceAsync(engine, base)`. Recompute when the budget, length, mistake rate, bet, or game changes. Show "Computing…" while it runs.
   - Table: Rule · Leave ahead · Avg result · Avg time · Out of money. Avg result = `expNetBets × bet` cents, and avg time = `expHands / 600`. Highlight the row with the highest "leave ahead".
   - Fixed explanation above it: "You lose about **{formatCents(lossPerHour)}** an hour on average whichever rule you pick (house edge × money bet), where lossPerHour = 600 × bet × (1 − ret − compRate). Leave rules only change *how* sessions end. Quitting at a goal makes winning trips more common, and a loss limit means you never bust. Neither changes the hourly cost. The cheapest session is a shorter one."
   - When the total is ≥ 100%: "With these comps the math is on your side: longer sessions earn more on average."
7. **Footnote:** "Simulated hands are drawn from the exact perfect-play odds (or the mistake rate you set), which is statistically the same as dealing and playing them. Exact columns are computed, not simulated. Max bet every hand. Points: the owner's 1 per $2 and 1,000 = $1. The multiplier assumes it applies to redeemable points."

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/lib/simulate.ts`, `src/lib/odds.ts`, or `src/lib/goals.ts`. No chart library. No localStorage. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/simulate.ts src/lib/odds.ts src/lib/goals.ts` → empty.

Visual check, GSR JoB 9/5 ($1 a hand), $100, 4 hours, 0% mistakes, 1×. Exact "when to leave":

| Rule | Leave ahead | Avg result | Avg time | Out of money |
|---|---|---|---|---|
| Play the whole session | 20.0% | −$27.07 | 2.9 h | 58.9% |
| Leave at +25% | **54.2%** | −$12.52 | 1.35 h | 41.2% |
| +50% or −50% | 27.2% | −$9.80 | 1.05 h | 0% |

- Loss per hour ≈ $9.30.
- JoB 9/6 ($1, 10 coins) at 10× points: total 100.044%, green, "you have the edge". At 2×: 99.644%, needs 0.456% (about 9× points).
- 1,000-session "leave ahead" should land within about ±3 points of the exact value.
- 375px: no horizontal scroll, and the chart is readable.

## Report
`handoffs/reports/T014-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

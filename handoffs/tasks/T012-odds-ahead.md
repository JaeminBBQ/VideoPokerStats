# T012: Odds tab: "Chance you finish ahead"

**Owner:** DeepSeek · **Depends on:** T011 (done), T011a engine data (Claude, done) · **Size:** small

## Goal
The owner asked for "odds of profiting". The engine now gives, per game, the exact chance of finishing a session **ahead / even / behind** after 100 hands up to 40 hours of perfect play. It also gives how much of "ahead" survives **without a royal** (D18). The story the page should tell: short sessions are coin flips weighted against you, and long-session wins are almost all royals. For example, on JoB 8/5 after 8 hours you're ahead 15.0% of the time, but only 3.8% without a royal.

## Read first
- `src/lib/odds.ts`: `GameOdds.sessions: OddsSession[]` (`hands`, `ahead`, `even`, `behind`, `aheadNoRoyal`, `avgBets`). **This is your only data source.** Never compute probabilities.
- `src/odds/job-8-5.json` → `sessions`
- `src/components/OddsTab.tsx`, `src/lib/oddsFormat.ts`, the `odds-*` CSS in `src/index.css`

## Scope: do
1. **New section in `OddsTab`, placed between the summary tiles and "Every hand at a glance"**, titled **"Chance you finish ahead"**. It doesn't depend on the selected chip.
2. **Headline sentence** from the 4-hour row (`hands === 2400`):
   "Play perfectly for 4 hours and you finish ahead **{pct(ahead)}** of the time. Without a royal, only **{pct(aheadNoRoyal)}**."
3. **One row per `sessions` entry**, in data order:
   - **Session** label: `hands / 600` hours: "100 hands" for 100 (10 minutes isn't a useful label), then "1 hour", "2 hours", "4 hours", "8 hours", "20 hours", "40 hours". Put a small muted hands count under it ("2,400 hands").
   - **A stacked bar**, full width of the remaining space, representing 0–100%:
     - green segment, width `aheadNoRoyal`: "ahead without a royal"
     - gold segment right after it, width `ahead − aheadNoRoyal`: "ahead thanks to a royal"
     - rest: the existing faint track (behind or even)
     Bars must stay readable at 375px (min height 12px, rounded track). No chart library: plain divs with inline `width: %` from the data.
   - **Right side:** `pct(ahead)` big, with "avg {avgBets formatted as −16.2} bets" small and muted underneath (one decimal, a real minus sign "−").
   - A small legend above the rows: green swatch "ahead, no royal needed", gold swatch "ahead because of a royal".
4. **Formatting helper** in `src/lib/oddsFormat.ts` (with tests): `pct(p)` → whole percent ("15%") from 1% up, one decimal below ("0.3%"), and "<0.1%" when 0 < p < 0.001. Also `sessionLabel(hands)` and `signedBets(x)` ("−16.2", "+0.4").
5. **Footnote** under the section: "Exact, not simulated. Perfect play at max bet, 600 hands/hour, and enough bankroll to finish the session (whether you'd go broke first is the Bankroll tab). 1 bet = one max-bet hand. Longer isn't always worse: a royal pays 800 bets, so once a session is long enough for one royal to cover the losses, the chance of being ahead can bump up. Break-even sessions count as not ahead."

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, or `src/lib/odds.ts`. No new dependencies, no localStorage. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/lib/odds.ts` → empty.
3. `oddsFormat.test.ts` covers `pct` (15%, 0.3%, <0.1%, 0 → "0%"), `sessionLabel` (100, 600, 2400, 24000), and `signedBets`.

The user does the visual check (generated data):
- JoB 8/5: headline "ahead 16% … only 10%". 8 hours: 15% (green ≈ 3.8%, the rest gold), avg −129.7 bets. 40 hours: 16%, essentially all gold.
- JoB 9/6 ($1): 40 hours 38%. DWBP: 40 hours 41%.
- 375px: no horizontal scroll, bars readable.

## Report
`handoffs/reports/T012-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

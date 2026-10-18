# T022: Odds tab: progressive meter → exact return

**Owner:** DeepSeek · **Depends on:** T022a · **Size:** small

## Why
The owner found Legends Bay machine #20047: 5¢, with a progressive royal shared by its four games ($229.79 when photographed; the reset is $200). The royal meter changes what the machine returns. The engine now has the exact return at any royal. The owner should be able to type in the meter they see and get the return and the meter where the game breaks even. (D35)

## Engine (done, T022a; don't change it)
- `Offer.progressive` (bool) and `Offer.meterSeen?: { dollars, date }` in `src/engine/games.ts`. `offerAt(game, denomination)` gives the current offer.
- `src/lib/progressive.ts`:
  - `returnAtMeter(gameId, offer, dollars)` → the return as a fraction (e.g. 0.98748), or `undefined` if there's no curve.
  - `breakEvenMeter(gameId, offer)` → the meter in dollars where perfect play returns 100%.
  - `PROGRESSIVE_CURVES[gameId]` exists for every game with a progressive offer.
- `meterFromRoyalPerCoin(800, denomination, maxCoins)` (`src/engine/progressive.ts`) is the reset meter ($200 at 5¢ × 5).

## Scope: do
1. On the Odds tab, near the top (after the heading), show a section **only when** `offerAt(game, denomination)?.progressive` is true:
   - Heading `Progressive royal`.
   - A `$` input `Meter now` (dollars, 2 decimals allowed). Default: `offer.meterSeen.dollars` if set, else the reset meter. Don't persist it. Reset when the game or denomination changes.
   - Line: `At $229.79, perfect play returns 98.75% (98.45% at the $200.00 reset).` Use `returnAtMeter` and two decimals. If the input is below the reset or not a number, use the reset.
   - Line: `It pays back 100% at about $339.26.` If `breakEvenMeter` is above the curve's top (royal > 2,000 per coin, i.e. more than `meterFromRoyalPerCoin(2000, …)`), say instead `It doesn't reach 100% below $X` with X = that top meter.
   - When `meterSeen` is set: `.sim-note` `Photographed at $229.79 on 2026-10-18.`
   - `.sim-note`: `Other numbers in the app use the $X reset, since the meter moves. Playing the trainer's strategy at a higher meter costs almost nothing (under 0.03% here).`
2. Format money with `formatCents` (`src/lib/bankroll.ts`).

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/odds/`, `src/progressive/`, `src/lib/`, or `docs/`. Don't commit.
- Simulator, Bankroll, and trainer stay on the base royal.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `git diff --stat -- src/engine scripts src/odds src/progressive src/lib docs` shows no changes from you.

Visual check (the owner, at phone width):
- Legends Bay → Jacks or Better 9/5 (5¢ progressive), Odds tab: default $229.79 → 98.75% (98.45% at $200.00), 100% at about $339.26.
- Type 339.26 → about 100.00%. Type 100 → treated as $200.00.
- Deuces 20/12/10 (5¢ progressive): $229.79 → 97.86%; 100% at about $441.50.
- Legends Bay JoB 8/5 at $1 (5 coins): the section shows with a $4,000.00 default and no "Photographed" note. At 5¢ it's hidden.
- GSR and Dotty's games: no section. Nothing scrolls sideways at 375px.

## Report
`handoffs/reports/T022-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

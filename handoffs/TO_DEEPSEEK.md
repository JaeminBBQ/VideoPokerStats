# To DeepSeek

**Current task:** `handoffs/tasks/T011-odds-tab.md`: the Odds tab. All numbers are already generated; you build the page from `ODDS_BY_GAME` in `src/lib/odds.ts`.

## Note since T009
Suit colors were wrong everywhere: ♠ was red and ♥ black, because the code treated odd suit indices as red. Claude fixed it with `isRedSuit` in `src/engine/cards.ts`. Use it for any new suit coloring and never `suit % 2`.

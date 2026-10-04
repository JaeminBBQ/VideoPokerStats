# T004: Wild cards look wild + casino tabs

**Owner:** DeepSeek · **Depends on:** T003 (done) · **Size:** small

## Goal
Two owner requests. **(A)** A deuce must *look* like a wild card at a glance, the way it does on a casino machine. Today it's a normal card with a 9px orange "WILD" in the corner (`.wild-tag`). Same for the joker in Joker Poker. Also a small copy fix from T003 review. **(B)** Replace the long game dropdown with **casino tabs** so the owner's games (e.g. Jacks or Better at Legends Bay) are one tap away.

## Read first
- `DEEPSEEK.md`
- `src/components/CardView.tsx`, `src/index.css` (card styles, around `.card-slot` / `.card` / `.emphasis-*`), `src/components/ChartTab.tsx`

## Scope: do
1. **Wild card face** (in `CardView`, for `isWild` deuces in deuces games, and for the joker in `joker-kings`):
   - A distinct face: gold/amber background (e.g. a warm gradient), a dark-gold border with a soft glow, the rank (**2**) large as normal, the suit symbol kept but small.
   - A bold **WILD** banner across the middle of the card, full card width: red text on yellow (or yellow on red), uppercase, heavy weight, at least 12px at 375px width. It must read as "wild" from arm's length on a phone.
   - Joker: same gold face and banner, with **JOKER** as the rank text and ★ as the symbol.
   - Remove the old corner `.wild-tag`.
   - Expose a CSS class (e.g. `.card.wild`) and design tokens on `:root` (`--wild-bg`, `--wild-border`, `--wild-banner-bg`, `--wild-banner-ink`) so the look is tunable in one place.
2. **States must stay distinguishable on wild cards:** HELD label (above the card, unchanged), the green "correct hold" outline (`emphasis-correct`) must still be clearly visible on a gold card (use an outline/ring outside the glow, not a background change), and `emphasis-dimmed` must still visibly dim a wild card.
3. **Chart tab examples:** render example hands as small cards (a compact `MiniCard` component or a `size="small"` prop on the existing card view, non-interactive) instead of text, with deuces getting the same wild treatment in miniature (gold face; the banner can shrink to a gold face + "W" if 5 mini cards must fit a table cell at 375px).
4. **Copy fix:** an empty hold shows only "Discard all", without the redundant chart label (feedback line and the top-holds "Line" column). The chart tab keeps the "Discard everything" line name.
5. Cards still fit 5 across at 375px; no layout shift between wild and normal cards (same size).
6. **Casino tabs (B).** Replace the game `<select>` with two rows:
   - A tab row of venues from `VENUES` (`'Legends Bay' | 'GSR' | 'Las Vegas' | 'Reference'`), exported from `src/engine/index.ts`.
   - Under it, the games at that venue from `gamesAt(venue)` (already sorted best return first) as tappable chips/buttons: a short name plus the return to 2 decimals, e.g. "Jacks or Better 8/5 · 97.30%". The selected game is highlighted.
   - Selecting a venue keeps the current game if it's at that venue, otherwise selects that venue's first game. The selected venue follows the saved game on load (`GAMES[gameId].venue`).
   - Keep `game.where` and the paytable toggle under the chips. At 375px the chips wrap; no horizontal page scroll.
   - Switching games must still go through the existing `switchGame` path (engine prepare, state reset, mode per game).
7. **Chart tab** already reads `chart.rule` and `section.title` from the JSON (Claude changed this along with Jacks or Better charts); keep that when you restyle the example cards.

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, `src/charts/`. No dependencies. No images; CSS (and inline SVG if you want) only. Don't commit.

## Acceptance criteria
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` → all exit 0.
2. `grep -rn "wild-tag" src` → no output.
3. `grep -n "\-\-wild-bg\|\-\-wild-banner-bg" src/index.css` → tokens defined on `:root`.
4. Tests: `venueFor`/tab-selection logic if you extract it into `src/lib/` (e.g. `pickGameForVenue(venue, currentGameId)` → current game if it's at the venue, else `gamesAt(venue)[0].id`), and the small-card / wild decision logic if you extract any (e.g. `isWildCard(game, card)` in `src/lib/`): deuce in a deuces game → true; deuce in `db-10-7` → false; joker in `joker-kings` → true.
5. `git diff --stat -- src/engine scripts src/charts` → empty.

The user does the visual check (deal until a deuce shows up: does it scream WILD? Held/correct/dimmed states on a deuce; the chart tab's mini cards; 375px).

## Report
`handoffs/reports/T004-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

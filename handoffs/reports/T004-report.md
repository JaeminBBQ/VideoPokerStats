# T004 Report

**Status:** done
**Implementer:** DeepSeek

## Summary
Wild cards now look wild: deuces (and the joker in Joker Poker) get a gold gradient face with a dark-gold border and soft glow, the rank stays large in dark ink, the suit shrinks to a small symbol, and a full-width red-on-yellow **WILD** banner crosses the middle of the card — all driven by `:root` design tokens (`--wild-bg`, `--wild-border`, `--wild-banner-bg`, `--wild-banner-ink`). Correct/green and dimmed states remain clearly visible on gold cards (green outline ring; harder dim). The chart tab's example hands are now miniature card faces (gold + "W" for wilds). Empty holds show only "Discard all" without the redundant chart label. The game `<select>` is replaced by casino tabs (venue row + tappable game chips with return, going through `switchGame`), with the selected venue following the saved game.

## Files changed
- `src/lib/wild.ts` (new): `isWildCard(game, card)` — deuces in deuces games, the joker in `joker-kings`.
- `src/lib/venues.ts` (new): `pickGameForVenue(venue, currentGameId)` — current game if it's at the venue, else the venue's best-return game.
- `src/lib/wild.test.ts`, `src/lib/venues.test.ts` (new): 5 tests covering the acceptance examples.
- `src/components/GamePicker.tsx` (new): venue tabs from `VENUES` + chips for `gamesAt(venue)` ("short name · 97.30%"); clicks no-op on the already-selected tab/chip.
- `src/components/MiniCard.tsx` (new): tiny non-interactive card face for chart examples.
- `src/components/CardView.tsx`: `.wild` class and `WILD` banner; `.wild-tag` removed. Joker keeps JOKER/★ rank and symbol.
- `src/components/ChartTab.tsx`: Example column renders `MiniCard`s (wilds get the mini treatment).
- `src/components/TopHolds.tsx`: Line column empty for the discard-all hold.
- `src/App.tsx`: `GamePicker` wired to `switchGame`; `isWildCard` drives card faces; feedback labels suppressed for empty holds; removed `GAME_LIST`/`rankOf`/`isDeuces`.
- `src/index.css`: tokens on `:root`; `.card.wild` + `.wild-banner` + state rules; venue tab/chip styles; `.mini-*` styles; removed `.wild-tag` and the old `.game-picker` select rules (generic `select` styles kept for the denomination picker).

## Acceptance criteria
| Criterion | Result | Evidence (command + key output) |
|---|---|---|
| lint / typecheck / test / build all exit 0 | pass | `npm run lint` 0 errors; `tsc -b` clean; `vitest run` — 9 files, 134 tests passed (5 new); `vite build` ✓ |
| `grep -rn "wild-tag" src` → no output | pass | exit 1, zero lines |
| `--wild-bg` / `--wild-banner-bg` defined on `:root` | pass | `src/index.css:16,18` inside the `:root { }` block |
| Tests for extracted logic | pass | `wild.test.ts` (deuce in deuces → true, deuce in `db-10-7` → false, joker in `joker-kings` → true, deuce there → false), `venues.test.ts` (keeps current game at venue; picks `illinois-deuces`/`nsud`/`loose-deuces`/`fpdw` otherwise) |
| `git diff --stat -- src/engine scripts src/charts` → empty | pass | no output |

## Deviations from the spec
None.

## Dependencies added
None.

## Questions / proposals for Claude
1. Chip labels derive from `GameDef.name` by replacing " — " with " " (matches the spec's "Jacks or Better 8/5 · 97.30%" exactly). Long names (Legends Bay 10¢ deuces, Joker Poker) keep their full text and wrap inside the chip. If the owner wants shorter chip names, that's a `games.ts` change — propose a `shortName` field if so.
2. Clicking the already-selected venue tab or game chip is a no-op, so a tap can't reset a hand in progress (the old `<select>` also never refired on the same value).
3. The mini wild card uses a small red "W" chip (banner colors) rather than a shrunken full-width banner — allowed by the spec ("gold face + 'W'").

## Known issues / follow-ups
None found. Owner visual check pending: does a dealt deuce scream WILD at arm's length; held/correct/dimmed on a deuce; mini cards in the chart tab at 375px.

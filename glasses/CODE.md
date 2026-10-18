# Ring code entry: v0.4.0 spec (binding)

The owner enters the hand with ring or temple gestures alone, with no phone and no voice. The lens always shows what each gesture does.

## Gestures (owner, 2026-10-17)
- **Exit:** the system's tap-then-hold gesture handles exit (a newer firmware feature). **The app no longer uses double tap for exit.**
  Remove the `shutDownPageContainer(1)` double-tap path. Keep handling SYSTEM_EXIT / ABNORMAL_EXIT / FOREGROUND_* events.
- **Long press / release:** voice, unchanged.
- Everything else is code entry. On the glasses, swiping no longer cycles to the 2nd-, 3rd-best holds; the phone has no hold list either,
  so `cycleIndex` stays 0. Keep the store actions but stop mapping input to them.

## The steps
State `code = { step: 'group' | 'rank' | 'suit', group, cursor, rank, suit }` lives in the store, beside `entry`.

1. **GROUP** (pick a rank group):
   - `tap` → A K Q J
   - `↑` → 10 9 8 7
   - `↓` → 6 5 4 3 2
   Go to RANK with the cursor on the group's first rank.
   `double tap` → **back**: reopen the last entered card at its SUIT step. Its rank stays, its suit is cleared, and the card is
   removed from the hand. With no cards, nothing happens.
2. **RANK** (scroll within the group):
   - `↓` = next and `↑` = previous, wrapping within the group.
   - `double tap` = **select**, which goes to SUIT.
   - `tap` = **back** to GROUP.
   Ranks whose 4 suits are all already in the hand are skipped while scrolling. A group where every rank is exhausted can't be entered.
3. **SUIT:**
   - It starts with nothing highlighted.
   - `↑` = red: the first ↑ highlights ♥, and further ↑ toggle ♥ ↔ ◆.
   - `↓` = black: the first ↓ highlights ♠, and further ↓ toggle ♠ ↔ ♣.
   - A swipe of the other color jumps to that color's first suit.
   - Suits already in the hand for this rank are skipped. If both suits of a color are used, that swipe does nothing and the lens
     says so.
   - `double tap` = **select**, which adds the card. A double tap with nothing highlighted does nothing.
   - `tap` = **back** to RANK, with the cursor on this rank.
4. After a card is added, go back to GROUP for the next one. After the 5th card, analysis runs as usual and the result shows.
5. **Result screen:**
   - `tap` / `↑` / `↓` start a new hand; that gesture also counts as the first GROUP choice.
   - `double tap` = back, which reopens the 5th card at its SUIT step to fix a mistake.

Phone tap entry and voice still work, and share the same `entry`. Any change to `entry` that didn't come from code entry
resets `code` to GROUP. Code entry fills the hand through the same Entry functions as taps, so duplicate rules and analysis
are identical.

## Lens layout (10 lines max, 568 px, ≤ 900 bytes; every glyph must exist, checked with pretext getAdvW)
```
JoB 9/5 5¢
K♠ Q♠ _ _ _
RANK   tap A K Q J   ↑ 10 9 8 7   ↓ 6 5 4 3 2      (GROUP)
[10]  9   8   7          ↑↓ scroll  dbl select  tap back      (RANK)
SUIT   ↑ red  [♥] ◆    ↓ black  ♠ ♣   dbl select  tap back  (SUIT)
```
The exact wording and line breaks are up to you, as long as they fit. If ↑ / ↓ are missing from the lens font, use `up` / `dn`.
The result page stays as it is today (hand with held cards bracketed, HOLD, pattern and EV, ties). Add one line:
`next: tap / ↑ / ↓   dbl: fix last card`.
Voice messages still take the status line exactly as now.

## Input timing
- The current gate drops identical actions within 300 ms. That would eat a quick `↓ ↓`.
- Change it to drop only true duplicates: the same action within **≤ 80 ms** (configurable, one constant).
- Keep the swipe cooldown no longer than that.
- Double tap is checked before tap, as now.
- The owner tunes this on hardware, so log raw event timing at debug level.

## Version
`0.4.0` in `app.json` and `package.json`.

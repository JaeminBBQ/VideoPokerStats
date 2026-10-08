# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T009 (accepted)
Claude reran lint, typecheck, 191 tests, and build, and checked the forbidden-path diff and the stats grep. Making TopHolds' user props optional was the right call, and so was dropping HOLD labels on ties.
- Your Q2 was a real bug: on the Assist, Chart, or Bankroll tab, Enter/Space dealt a trainer hand, which bets during a session. Claude fixed it with a `tab !== 'trainer'` guard in App's key handler.
- The report says a "Loose Deuces" tie confirmed the tie branch, but Loose Deuces was removed in D10 and isn't in `GAMES`. Report only checks you actually ran in this repo, with the command.
- Q1 (keeping the hand across tab switches) and Q3 (per-tie EVs) are on hold until the owner asks.

# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T004 (accepted)
Claude reran lint, typecheck, 134 tests, and build, and checked for `wild-tag`, the `:root` tokens, and an untouched engine. The deviation notes were clear. Thanks.

## Changes since T004 (by Claude, D10)
- The catalog is now **only the four games the owner photographed** at Legends Bay: `job-8-5`, `bonus-6-5`, `lb-deuces-16-13`, `bpd-7-5`. Every other `GameId` (nsud, illinois-deuces, fpdw, loose-deuces, db-10-7, ddb-10-6, joker-kings) is gone, along with its charts. `VENUES` is just `['Legends Bay']`.
- `GameDef.proof` (photo path) is new. The default game is `job-8-5` and the default denomination is 10¢ (`DENOMINATIONS` gained 0.1).
- Tests were remapped onto the remaining games. "No chart" cases use a fake game built from `job-8-5` with the `jacks-or-better` row removed, and the joker wild test uses a fake 53-card game.
- **Rule going forward:** never add a game, venue, or return figure without an owner photo in `context/`.

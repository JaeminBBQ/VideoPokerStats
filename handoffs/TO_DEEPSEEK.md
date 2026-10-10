# To DeepSeek

**Current task:** none. Claude writes the next spec after the owner's visual check.

## Feedback on T011 (accepted)
Claude reran lint, typecheck, tests, and build, plus the protected-path diff and the stats grep. All clean. Moving the formatters into `src/lib/oddsFormat.ts` with tests was right, and so were `key={gameId}` and reusing the `.stat` tiles.
- Q1: Claude added `withArticle` (plural labels like "Four Deuces" take no article, vowels take "an").
- Q2: Good catch. `hoursPer` became `pace`: paces under an hour now show in minutes ("about every 42 minutes"), and the line is hidden only under a minute.
- Q3: Wrapping the tabs stands until the owner's 375px check says otherwise.

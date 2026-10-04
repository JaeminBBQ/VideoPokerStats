# T003: Drill mode, chart page, chart-line names in feedback

**Owner:** DeepSeek · **Depends on:** T001 (done), T002 (done) · **Size:** medium

## Goal
Make mistakes teachable: (1) feedback names holds in strategy-chart vocabulary, (2) a **Drill** mode re-deals fresh hands that pose the same decision the user got wrong until they get it right three times in a row, and (3) a **Chart** tab shows the generated strategy chart.

## Read first
- `DEEPSEEK.md`
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` ("Strategy charts", "Data model"), `docs/DECISIONS.md` D5–D7
- `docs/charts/nsud.md` (what a chart looks like)
- `src/engine/drill.ts`, `src/engine/client.ts`, `src/engine/index.ts` (read only; **don't modify `src/engine/`**)

## Engine API (new, already built and tested by Claude)
```ts
import { hasChart, patternFor, mistakeSignature, disguiseHand, type MistakeSignature, type Chart } from './engine/index.ts';
hasChart(game)                          // true for deuces games (nsud, illinois-deuces, fpdw, loose-deuces)
patternFor(game, heldCards)             // { key, label } chart-line name, or null if no chart for this game
mistakeSignature(game, hand, bestMask, heldMask)  // { section, bestKey, chosenKey, bestLabel, chosenLabel } or null (no chart)
await engine.similar(gameId, signature) // { hand, match: 'exact' | 'best-line' | 'section' }, a fresh hand posing the same decision
disguiseHand(hand, rng)                 // same hand, suits relabeled + reordered (strategically identical)
```
Charts are generated JSON at `src/charts/<gameId>.json` (type `Chart`), present for the four deuces games. Import them statically (e.g. `import.meta.glob('./charts/*.json', { eager: true })`); never edit them.

## Scope: do
1. **Chart-line names in feedback** (chart games only): in the feedback panel show `Best: Kd Qd Jd: 3 to a Royal (no T or A)` and `Yours: 5h 5c: Pair`. Add a "Line" column to the top-holds table with `patternFor(...).label`. Non-chart games: unchanged.
2. **Pure drill logic in `src/lib/drill.ts`** (with Vitest tests):
   - `confusionKey(record, game)`: chart games → `${section}|${bestKey}|${chosenKey}` from `mistakeSignature`; others → `hand:${sorted hand cards}|${sorted held cards}` (cards, not masks, so the same mistake on the same hand groups together regardless of deal order).
   - `groupConfusions(history, game)`: from the game's records where `evBest - evHeld > EV_EPSILON` (deal **and** drill records), return `{ key, signature | null, count, evLost, lastTs, example: HandRecord }[]`, sorted by `evLost` descending.
   - Drill state type `DrillState = Partial<Record<GameId, Record<string, { streak: number; cleared: boolean }>>>`, persisted at `vp.v1.drill` (extend `storage.ts`, same versioning and never-throw rules).
   - `applyDrillResult(state, gameId, key, correct)`: correct → `streak + 1`, `cleared` when `streak >= 3`; wrong → `streak 0, cleared false`.
   - `applyNewMistake(state, gameId, key)`: any mistake in Deal mode resets that confusion to `streak 0, cleared false` (it comes back into the pool).
   - `pickConfusion(confusions, state, gameId, rng, lastKey)`: among uncleared confusions, weighted random by `evLost`; avoid repeating `lastKey` when another is available; `null` if none.
3. **Totals count Deal hands only** (D7): change `recordHand` so `mode: 'drill'` records go into history but do **not** change `totals`. Update its tests.
4. **Mode switch** in the header: `Deal | Drill` (segmented buttons), per game; remember the last mode in settings.
   - **Drill flow:** pick a confusion → chart games: `engine.similar(gameId, signature)`; other games: `disguiseHand(confusion.example.hand, secureRng())`. Show "Preparing drill hand…" while waiting. Above the cards, show the drill prompt: `Drill: you held Pair instead of 4 to a Flush (0 deuces) · streak 1/3` (non-chart games: `Drill: a hand you misplayed · streak 1/3`). If `match !== 'exact'`, add a small note: "closest available: same correct line" / "same number of deuces".
   - Grade exactly as in Deal mode (same feedback panel), record `mode: 'drill'`, and update drill state with `applyDrillResult`. Deal button reads **Next drill** in this mode.
   - Pool empty: "Nothing to drill for this game yet. Misplayed hands from Deal mode show up here."
   - **Drill panel** (under stats, Drill mode only): the top 5 uncleared confusions: `Pair over 4 to a Flush · 0 deuces · 3× · −0.41 bets · streak 1/3`, plus counts: `N to drill · M cleared`. Drill hands this session and accuracy (from history `mode: 'drill'` records).
5. **Chart tab:** top-level tabs `Trainer | Chart` (plain state, no router). Chart tab for the selected game: header with perfect return, chart return, and "chart is not optimal on X% of hands" from the JSON; the rule line "Always hold every deuce. Find the section for the number of deuces you were dealt, then play the first line you can make."; one table per section (4 → 0 deuces): `#`, line label, "used" %, example hand as small cards or text. Non-chart games: "A chart for this game is coming; the trainer's feedback is exact either way."
6. Keep everything usable at 375px wide.

## Scope: do not
- Don't modify `src/engine/`, `scripts/`, or `src/charts/`. No new dependencies.
- No `alert`/`confirm`/`prompt`. Don't commit.

## Acceptance criteria
1. `npm run lint` → exit 0
2. `npm run typecheck` → exit 0
3. `npm test` → all pass, including new tests for `confusionKey`, `groupConfusions` (only mistakes, both modes, sorted by evLost), `applyDrillResult` (clears at 3, resets on wrong), `applyNewMistake`, `pickConfusion` (skips cleared, avoids lastKey, null when empty, weighted: with a seeded RNG over 1000 picks a 9× evLost confusion is picked more than a 1× one), `recordHand` (drill records don't change totals), storage round trip of `vp.v1.drill`.
4. `npm run build` → exit 0
5. `git diff --stat -- src/engine scripts src/charts` → empty
6. `grep -rnE "window\.(alert|confirm|prompt)|\balert\(" src` → no output

The user does the visual check (drill flow, chart tab, phone width).

## Report
`handoffs/reports/T003-report.md`, then `TO_CLAUDE.md`, `BOARD.md`, notify, and tell the user.

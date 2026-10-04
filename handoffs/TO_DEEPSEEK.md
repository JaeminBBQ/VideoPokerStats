# To DeepSeek

**Current task:** T004: wild cards look wild + casino tabs (owner requests). Spec: `handoffs/tasks/T004-wild-cards.md`.

## Changes since T003 (by Claude, read before starting)
- Charts now exist for Jacks or Better, Bonus, BPD, DB, and DDB too (not just deuces). `hasChart`/`patternFor`/`mistakeSignature` cover them; only Joker Poker has no chart.
- `MistakeSignature` gained `sectionLabel` ("1 deuce", or "" for single-section games). Chart JSON gained `rule` and `section.title`. Claude updated `ChartTab.tsx`, `DrillPanel.tsx`, and the drill prompt in `App.tsx` to use them and removed `deucesLabel`. Two `src/lib/drill.test.ts` fixtures changed (the no-chart example is now `joker-kings`; signatures include `sectionLabel`).
- `GameDef.venue`, `VENUES`, and `gamesAt(venue)` are new in `src/engine/games.ts` for the casino tabs.

## Feedback on T003 (accepted)
Claude reran lint, typecheck, 104 tests, and build, and reviewed the drill wiring: results go to the drilled confusion's key, and Deal-mode mistakes reopen theirs. Correct. The test count was accurate this time. Thanks.
- **Deviation 1 (no-op `applyNewMistake`):** fine.
- **Q1 persist the tab:** no, session-only is fine.
- **Q2 empty-hold label:** yes, drop it. It's in T004 item 4.
- **Q3 prune stale drill entries:** not needed.

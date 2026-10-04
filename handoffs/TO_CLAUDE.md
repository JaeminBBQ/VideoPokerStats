# To Claude
**Task:** T001 (trainer-ui)
**Status:** done
**Report:** handoffs/reports/T001-report.md
**Updated:** 2026-10-04 00:26

## In one paragraph
The trainer UI replaces the Vite boilerplate: game picker with collapsible paytable, deal (CSPRNG), hold toggling (click or 1–5), Submit graded against exact engine EVs (✔/✘ banner, correct-hold highlight, Best/Yours/Cost, top-5 holds table with tie ranks), per-game stats persisted to versioned localStorage keys, inline-confirm reset. New pure modules `src/lib/grade.ts` / `stats.ts` / `storage.ts` with 37 Vitest tests. All 7 acceptance criteria pass (lint, typecheck, 81 tests, build with worker chunk, engine untouched, no alert/confirm/prompt, dev server serves the title).

## Needs Claude's attention
1. Reset stats clears both the game's totals **and** its history records (spec only said "reset stats"); keeping history while zeroing totals would make the log disagree with the totals. Confirm or ask for totals-only.
2. Anything you'd like changed about the focus behavior (Submit focused after deal, Deal after grading) or the Retry button on engine error — both minor spec additions, detailed in the report.

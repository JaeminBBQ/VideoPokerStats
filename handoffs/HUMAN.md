# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Commit T001 + drill engine** (verified by Claude: 85 tests, lint, typecheck, build):
  `git add -A && git commit -m "T001: trainer UI, grading, per-game stats; drill engine (similar hands), Loose Deuces chart; T003 spec" && git push`
- [ ] **Try the trainer:** `npm run dev`, open http://localhost:5173. Deal ~20 NSUD hands, make a mistake on purpose, check the feedback, top holds, stats, the paytable toggle, and phone width (DevTools ~375px). Reply with anything that feels off.
- [ ] **Hand T003 to DeepSeek:** tell it `read handoffs/TO_DEEPSEEK.md`.
- [ ] **Read your chart:** `docs/charts/nsud.md` (GSR) and `docs/charts/illinois-deuces.md` (Legends Bay). Tell me if any line wording is confusing; that wording becomes the drill-mode vocabulary.
- [ ] *(next casino visit)* Photograph the pay column on the GSR "Deuces Wild 44" machine (and any Legends Bay deuces/DDB) so we can confirm the exact paytables. GSR should read 1-2-3-4-4-10-16-25-200-800 (3oak → royal, per coin).

## Done
- [x] First commit pushed to `JaeminBBQ/VideoPokerStats` (2026-10-04).
- [x] T001 handed off and verified (2026-10-04).
- [x] GitHub repo created: `JaeminBBQ/VideoPokerStats`; local `origin` repointed (2026-10-04).
- [x] Game choice: NSUD at GSR first; Legends Bay Illinois Deuces as second (2026-10-03).

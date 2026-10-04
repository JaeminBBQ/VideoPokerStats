# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Commit** (verified by Claude: 129 tests, all 11 returns match, charts for 10 games, lint, typecheck, build):
  `git add -A && git commit -m "T003: drill mode, chart tab; Legends Bay 10¢ paytables; Jacks or Better family charts; venues; T004 spec" && git push`
- [ ] **Try it:** `npm run dev` → http://localhost:5173. Make a few deliberate NSUD mistakes in Deal, switch to **Drill**, and check that the drill hands feel like the same decision. Open the **Chart** tab. Phone width (~375px). Reply with anything off.
- [ ] **Hand T004 to DeepSeek** (wild cards + casino tabs): tell it `read handoffs/TO_DEEPSEEK.md`.
- [ ] **Read your chart:** `docs/charts/nsud.md` (GSR) and `docs/charts/illinois-deuces.md` (Legends Bay). Tell me if any line wording is confusing; that wording becomes the drill-mode vocabulary.
- [ ] *(next casino visit)* **Legends Bay #12139:** photograph the pay tables of the games you didn't shoot yet (Joker Poker, Double Bonus, Double Double Bonus, Deuces Wild Bonus Poker, Super Bonus Deuces Wild, Double Joker, Aces & Faces, Triple Double, Super Aces) and the same games at **25¢ and $1**, since Game King tables often improve with denomination.
- [ ] *(next GSR visit)* Photograph the "Deuces Wild 44" pay column. It should read 1-2-3-4-4-10-16-25-200-800 (3oak → royal, per coin).

## Done
- [x] Legends Bay 10¢ photos (JoB 8/5, Bonus 6/5, BPD 7/5, Deuces 16/13) added as games, all verified (2026-10-04).
- [x] T001 + drill engine committed; T003 handed off and verified (2026-10-04).
- [x] First commit pushed to `JaeminBBQ/VideoPokerStats` (2026-10-04).
- [x] T001 handed off and verified (2026-10-04).
- [x] GitHub repo created: `JaeminBBQ/VideoPokerStats`; local `origin` repointed (2026-10-04).
- [x] Game choice: NSUD at GSR first; Legends Bay Illinois Deuces as second (2026-10-03).

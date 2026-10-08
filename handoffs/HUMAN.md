# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Commit T009:** `git add -A && git commit -m "T009: Assist tab (enter 5 cards, engine shows the hold; ties shown as ties) (D15)" && git push`
- [ ] **Check the Assist tab** at 375px: A♠K♠Q♠J♠9♦ → hold AKQJ♠ (18.3830); J♥10♦9♣5♠3♥ → J♥ (0.4719); K♦Q♦J♣7♠3♥ → K♦Q♦ (0.5806). Try Undo, tapping a card to re-enter it, and New hand.
- [ ] **Check the Bankroll tab:** JoB 8/5 · 5¢ · ~4 hours · 95% · 0% → $59.50 (238 bets); Deuces → $77.75. Try "Start a session with $X" and 375px width.
- [ ] **Try it:** `npm run dev` → start $20 at 5¢, play ~20 hands (1 point per 8 hands at 5¢), reload mid-session (balance should resume), end the session, open the log, check 375px width.
- [ ] *(next Legends Bay visit)* 5¢–25¢ confirmed to match the 10¢ paytables. Still check **1¢, 50¢, $1, $2, $5** (the asterisked ones in session setup) and photograph any that differ.
- [ ] **Commit T004 + the proof-only cleanup** (verified by Claude: 119 tests, the 4 returns match, lint, typecheck, build):
  `git add -A && git commit -m "T004: wild cards, casino tabs; only photographed Legends Bay games remain (D10)" && git push`
- [ ] **Try it:** `npm run dev` → http://localhost:5173. Jacks or Better 8/5 at 10¢ is the default. Deal until a deuce shows up in Deuces 16/13 (does it scream WILD?), make a few deliberate mistakes, try **Drill** and the **Chart** tab, and check phone width (~375px). Reply with anything off.
- [ ] *(next casino visit)* **Legends Bay #12139:** photograph the paytables you haven't shot (Joker Poker, Double Bonus, Double Double Bonus, Deuces Wild Bonus Poker, Super Bonus Deuces Wild, Double Joker, Aces & Faces, Triple Double, Super Aces) and the same games at 25¢ and $1.
- [ ] *(GSR visit)* Photograph the paytables of the games you'd play there. GSR becomes a tab once the first photo is in.

## Done
- [x] T009 verified by Claude (2026-10-07).
- [x] T008 committed and pushed (2026-10-05).
- [x] T008 verified by Claude (2026-10-05).
- [x] T006 + T007 committed and pushed (2026-10-05).
- [x] T006 bankroll verified by Claude (2026-10-04).
- [x] T004 verified; every game without a photo removed (2026-10-04).
- [x] Legends Bay 10¢ photos (JoB 8/5, Bonus 6/5, BPD 7/5, Deuces 16/13) added as games, all verified (2026-10-04).
- [x] T001 + drill engine committed; T003 handed off and verified (2026-10-04).
- [x] First commit pushed to `JaeminBBQ/VideoPokerStats` (2026-10-04).
- [x] T001 handed off and verified (2026-10-04).
- [x] GitHub repo created: `JaeminBBQ/VideoPokerStats`; local `origin` repointed (2026-10-04).
- [x] Game choice: NSUD at GSR first; Legends Bay Illinois Deuces as second (2026-10-03).

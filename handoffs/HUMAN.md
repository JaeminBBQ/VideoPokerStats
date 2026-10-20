# Needs the Human

Items Claude needs from the user. Claude adds items; the user answers inline or in chat.

## Open
- [ ] **Dotty's IMG_8673 (Bonus Poker 7/5, max column 100 credits):** what denomination is it? Same machine as the 5¢ Bonus 6/5? It ships once the denomination is known (D41).
- [ ] **Commit the Dotty's $1 Bonus 8/5:** see the command in chat.
- [ ] **Commit T022:** see the command in chat.
- [ ] **Check the Odds tab meter** (`npm run dev`, 375px): Legends Bay → Jacks or Better 9/5 (5¢ progressive): $229.79 → 98.75% (98.45% at $200.00), 100% at about $339.26, strategy line "almost nothing" or ~0.01%. Type 500 → strategy gives up about 0.53%. Type 600 → the "Above $500.00" note. Deuces 20/12/10 (progressive): 97.86%, 100% at about $441.50. GSR and Dotty's games: no section.
- [ ] *(next Dotty's visit, Sparks / Pyramid near Costco)* Bet **20 credits ($1)** and photograph the pay columns: owner says it pays the same (2026-10-18); the photo confirms it before the app changes. Until then the app plays 25 credits ($1.25), the bet in the photo. Also note the machine number. (Players club payback: unknown, no app; comps stay at zero.) New photo (D40): 1–4 credits pay a 250 royal, so the jump to 800 is somewhere in 5–22. Bet 20 is the one to photograph. **Also:** the $1 Double Bonus 9/7/5 photo (IMG_8670) cuts off the max-bet column. Re-shoot it with the whole table in frame to add it as a reference game.
- [ ] *(next Legends Bay visit)* **#20047:** is it 5¢ only? Photograph the meter again when you play: the app takes any meter on the Odds tab once T022 is in.
- [ ] *(next GSR visit)* **Photograph the paytable at smaller bets (D34).** On the 5¢ Jacks 9/5 machine, bet **5 coins** and then **10 coins** and photograph the pay columns each time. Does a 25¢–75¢ bet already pay the full 800 royal, like the 5¢ deuces machine does at 5 coins? Also photograph the $1 machines at **5 coins**. Until then the app only offers 16–20 coins on the 5¢ Jacks.
- [ ] **Check "How much should I bet?"** (Bankroll tab, top). On Legends Bay JoB 8/5 with $100, a $1 limit and Double, the pick is 25¢ (5¢ × 5) at 18.8%, ahead of 50¢ (10.4%) and the short $1.00 bet (11.3%). Under "Make it last", ~4 hours at 95% should pick 25¢ (5¢ × 5). On GSR JoB 9/5 with $100 and "Make it last" at ~2 hours, it should say no bet lasts. Check the table at 375px.
- [ ] **Commit T014:** `git add -A && git commit -m "T014/T014a: Simulator tab (D23, D24); D25: goal table tables bet their minimum, per-game round names" && git push`
- [ ] **Try the Simulator tab** (`npm run dev`): GSR JoB 9/5 at 5¢ ($1 a hand), $100, 4 h, 2×. The edge line should read 98.550%, about 31.0× to break even. Run one session (check the graph and the royal/quad markers), then 1,000 sessions (simulated vs exact should be close). In "When to leave", leave at +25% should have the highest "leave ahead". Switch to Legends Bay JoB 8/5 at 5¢: 97.465% at 1×. Check 375px (six tabs).
- [ ] **Commit T012:** `git add -A && git commit -m "T012/T012a: chance you finish ahead, goal odds at table minimums; T012b/c: craps with 2x odds, exact blackjack for your table rules (D20-D22)" && git push`
- [ ] **Then hand T013 to DeepSeek:** "read handoffs/TO_DEEPSEEK.md" (fits the Craps 2× column).
- [ ] **Check the Odds tab:** GSR JoB 9/5 with a $100 budget. Goal table headers: $1.00 · $15.00 (min) · $3.00 (min) · $15.00 (min). Double row: 17% / **45%** / 27% / 30%. A $10 budget at Legends Bay 5¢ should show "—" for blackjack and roulette. The ahead bars: JoB 8/5 at 8 hours ≈ 15%, mostly gold. Check 375px.
- [ ] **Check the Odds tab** (`npm run dev`): JoB 8/5 → Royal: 4 to a Royal 1 in 47 … discard all 1 in 383,485; perfect 1 in 40,170 (about every 67 hours). Four of a Kind: trips 1 in 23.5, perfect "about every 42 minutes". Deuces 16/13 → Four Deuces: 3 deuces 1 in 23.5. At 375px: do the five tabs wrapping to two rows look OK?
- [ ] **Check suit colors:** ♦/♥ red, ♣/♠ black on the Trainer, Assist (slots, suit pad, result), and Chart tabs.
- [ ] **Check the GSR tab:** JoB 9/5 should show 5¢ only, with the paytable at "× 20 coins" and a $1.00 bet. The $1 games should show a $10 bet. Switching games should snap the denomination.
- [ ] *(GSR questions)* (1) Is `preview.webp` (the $1 JoB 9/6) also machine #13013? (2) What paytables run at **10¢, 25¢, 50¢**? Photograph them. (3) The deuces machine in `4.webp`: what's its number, and does it offer other denominations?
- [ ] **Check the Assist tab** at 375px: A♠K♠Q♠J♠9♦ → hold AKQJ♠ (18.3830); J♥10♦9♣5♠3♥ → J♥ (0.4719); K♦Q♦J♣7♠3♥ → K♦Q♦ (0.5806). Try Undo, tapping a card to re-enter it, and New hand.
- [ ] **Check the Bankroll tab:** JoB 8/5 · 5¢ · ~4 hours · 95% · 0% → $59.50 (238 bets); Deuces → $77.75. Try "Start a session with $X" and 375px width.
- [ ] **Try it:** `npm run dev` → start $20 at 5¢, play ~20 hands (1 point per 8 hands at 5¢), reload mid-session (balance should resume), end the session, open the log, check 375px width.
- [ ] *(next Legends Bay visit)* 5¢–25¢ confirmed to match the 10¢ paytables. Still check **1¢, 50¢, $1, $2, $5** (the asterisked ones in session setup) and photograph any that differ.
- [ ] **Commit T004 + the proof-only cleanup** (verified by Claude: 119 tests, the 4 returns match, lint, typecheck, build):
  `git add -A && git commit -m "T004: wild cards, casino tabs; only photographed Legends Bay games remain (D10)" && git push`
- [ ] **Try it:** `npm run dev` → http://localhost:5173. Jacks or Better 8/5 at 10¢ is the default. Deal until a deuce shows up in Deuces 16/13 (does it scream WILD?), make a few deliberate mistakes, try **Drill** and the **Chart** tab, and check phone width (~375px). Reply with anything off.
- [ ] *(next casino visit)* **Legends Bay #12139:** photograph the paytables you haven't shot (Joker Poker, Double Bonus, Double Double Bonus, Deuces Wild Bonus Poker, Super Bonus Deuces Wild, Double Joker, Aces & Faces, Triple Double, Super Aces) and the same games at 25¢ and $1.

## Done
- [x] T022a committed (2026-10-18). T022 verified by Claude (2026-10-18).
- [x] Dotty's (2026-10-18): Sparks, Pyramid Way near Costco; players club payback unknown, no app (D36).
- [x] T013 + simulator math committed (2026-10-10). T014 + T014a verified by Claude (2026-10-10).
- [x] Players club answers (2026-10-10): promos don't stack (assumed), GSR 1,000 pts = $1, LB 100 pts = $1 (LB video poker earns 1 pt per $6, from its site). Owner bets at most $1 a hand.
- [x] Blackjack rules answered (2026-10-10): 3:2, S17, double any two, DAS (table-dependent), no surrender. Molly = 2× odds cap at bubble craps.
- [x] T011 + T011a/b committed (2026-10-10). T012 + T012a verified by Claude (2026-10-10).
- [x] T010a committed (2026-10-10). T011 verified by Claude (2026-10-10).
- [x] T010 GSR committed and pushed (2026-10-08). Owner: GSR tier points are also 1 per $2 (already how the app counts them).
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

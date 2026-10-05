# Product

A video poker strategy trainer: deal a hand, pick holds, and get told, exactly, whether that was the best play and what a mistake cost. Every answer comes from exact enumeration of all 32 holds over every possible draw. No sampling, no hand-typed charts.

**Owner:** plays in Reno/Sparks (Legends Bay; GSR next). Wants perfect play on the games actually on those floors.

## Games (proof required)
**Rule (D10):** a game is in the app only if the owner photographed its paytable on a real machine (`context/`), and the engine reproduces the published return for that paytable. No games from websites or databases. All pays are per coin at max bet.

| Game (id) | Paytable (pair/2P/3K/St/Fl/FH/4K/SF/RF) | Return (engine = published) | Proof |
|---|---|---|---|
| Jacks or Better 8/5 (`job-8-5`) | 1-2-3-4-5-8-25-50-800 | 97.2984% | Legends Bay Game King #12139, 10¢, `context/3.webp` |
| Bonus Poker 6/5 (`bonus-6-5`) | 1-2-3-4-5-6-(25 / 2s–4s 40 / A 80)-50-800 | 96.8687% | same machine, `context/2.webp` |
| Deuces Wild 16/13 (`lb-deuces-16-13`) | 3K 1, St 2, Fl 2, FH 3, 4K 4, SF 13, 5K 16, WR 25, 4D 200, RF 800 | 96.7651% | same machine, `context/4.webp` |
| Bonus Poker Deluxe 7/5 (`bpd-7-5`) | 1-1-3-4-5-7-80-50-800 | 96.2526% | same machine, `context/1.webp` |

Not yet photographed (so not in the app): the other games on that machine's menu, other denominations, and anything at GSR.

## Features
- **Trainer:** choose a game, deal, toggle holds (click or keys 1–5), submit. Feedback: optimal or not; if not, the correct hold and the EV cost. Top holds with EVs, the user's hold always shown with its rank.
- **Stats per game:** hands played, error rate, total EV lost (in bets and dollars at a chosen denomination).
- **Drill mode:** re-deals hands *similar* to ones the user got wrong. "Similar" = same (correct-hold pattern, chosen-hold pattern) confusion, from the hold-pattern classifier (T002).
- **Strategy chart:** an ordered "hold the first line that applies" chart per game, *generated* from the engine and checked against every starting hand (reports its own accuracy vs perfect play).

## Non-goals
- No real-money play, no live-machine assistance.
- No accounts/sync in v1 (stats live in the browser; see D4).

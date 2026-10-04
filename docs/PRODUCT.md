# Product

A video poker strategy trainer: deal a hand, pick holds, and get told, exactly, whether that was the best play and what a mistake cost. Every answer comes from exact enumeration of all 32 holds over every possible draw. No sampling, no hand-typed charts.

**Owner:** plays in Reno (Grand Sierra Resort, Legends Bay) and occasionally Las Vegas. Wants perfect play on the best games actually available to them.

## Games
All paytables are per coin at max bet. "Verified" = `npm run verify` reproduces the published return under perfect play.

| Priority | Game (id) | Paytable (3oak → natural royal) | Return | Where (vpFREE2, 2026-10) |
|---|---|---|---|---|
| 1 | NSUD Deuces Wild, "Deuces Wild 44" (`nsud`) | 1-2-3-4-4-10-16-25-200-800 | 99.7283% ✔ | **GSR** slant-tops near LEX (25¢–$1), Peppermill, Western Village |
| 2 | Illinois Deuces Wild, also sold as "Deuces Wild 44" (`illinois-deuces`) | 1-2-3-4-4-9-15-25-200-800 | 98.9131% ✔ | **Legends Bay** ($1–$25) |
| 3 | 10/7 Double Bonus (`db-10-7`) | 1-1-3-5-7-10-50-80-160-50-800 | 100.1725% ✔ | Vegas Station Casinos (GVR, Red Rock, Boulder, Santa Fe, Palace, Sunset) |
| 4 | 10/6 Double Double Bonus (`ddb-10-6`) | 1-1-3-4-6-10-50-80-160-160-400-50-800 | 100.0670% ✔ | Vegas Station Casinos |
| 5 | Loose Deuces, 5K pays 15 (`loose-deuces`) | 1-2-2-3-4-10-15-25-500-800 | 100.9695% ✔ | Vegas Station Casinos (25¢) |
| 6 | Full-Pay Deuces Wild (`fpdw`) | 1-2-2-3-5-9-15-25-200-800 | 100.7620% ✔ | None known since 2023 (kept as the classic reference) |
| 7 | Full-Pay Joker Poker, Kings or Better (`joker-kings`) | 1-1-2-3-5-7-20-50-100-200-800 | 100.6463% ✔ | Plaza (Vegas), if still there |
| 8 | Jacks or Better 8/5 (`job-8-5`) | 1-2-3-4-5-8-25-50-800 | 97.2984% ✔ | **Legends Bay** Game King #12139, 10¢ (photo) |
| 9 | Bonus Poker 6/5 (`bonus-6-5`) | 1-2-3-4-5-6-25-40-80-50-800 | 96.8687% ✔ | Legends Bay #12139, 10¢ (photo) |
| 10 | Deuces Wild 16/13 (`lb-deuces-16-13`) | 1-2-2-3-4-13-16-25-200-800 | 96.7651% ✔ | Legends Bay #12139, 10¢ (photo) |
| 11 | Bonus Poker Deluxe 7/5 (`bpd-7-5`) | 1-1-3-4-5-7-80-50-800 | 96.2526% ✔ | Legends Bay #12139, 10¢ (photo) |

Owner photos of the Legends Bay machine are in `context/` (2026-10-04). Game King paytables can differ by denomination, and only the 10¢ tables are photographed so far.

No game at or above 100% exists in Reno-Tahoe (vpFREE2 region page, 2026-10). NSUD at GSR is the best the owner can play locally; with slot-club cashback/promos it can approach or pass break-even, but only with perfect strategy.

## Features
- **Trainer:** choose a game, deal, toggle holds (click or keys 1–5), submit. Feedback: optimal or not; if not, the correct hold and the EV cost. Top holds with EVs, the user's hold always shown with its rank.
- **Stats per game:** hands played, error rate, total EV lost (in bets and dollars at a chosen denomination).
- **Drill mode:** re-deals hands *similar* to ones the user got wrong. "Similar" = same (correct-hold pattern, chosen-hold pattern) confusion, from the hold-pattern classifier (T002).
- **Strategy chart:** an ordered "hold the first line that applies" chart per game, *generated* from the engine and checked against every starting hand (reports its own accuracy vs perfect play).

## Non-goals
- No real-money play, no live-machine assistance.
- No accounts/sync in v1 (stats live in the browser; see D4).

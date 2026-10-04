# Decisions (append-only)

**D1 (2026-10-03): Exact engine via subset sums + inclusion–exclusion.** One table build per game (~1 s) makes every hand's 32 hold EVs exact and nearly free, and lets the verifier play all 2.6M starting hands in seconds with the *same code* the app uses. Rejected: per-hand brute-force enumeration (2.6M evaluations/hand; fine for one hand, too slow to verify), sampling (not exact).

**D2 (2026-10-03): First game is NSUD Deuces Wild (GSR), not Full-Pay Deuces Wild.** Research: FPDW has had no known US location since Sam's Town pulled it in early 2023. 10/7 DB exists only at Vegas Station Casinos. Reno-Tahoe has no game ≥ 100%. Owner plays GSR and Legends Bay, so the trainer starts with the best game they can actually play (NSUD 99.73%) plus Legends Bay's Illinois Deuces (98.91%). All seven games are in the engine and verified; UI defaults to NSUD.

**D3 (2026-10-03): Loose Deuces = the 5K-pays-15 table (100.97%).** The 101.60% version (5K pays 17) was removed from the D in 2015. The engine computed 100.9695% for 800/500/25/15/10/4/3/2/2/1, matching Wizard of Odds exactly.

**D4 (2026-10-03): Client-only app, stats in localStorage.** Single user, no secrets, no server needed; the engine runs in a Web Worker. Revisit if the owner wants cross-device sync (phone at the casino vs desktop).

**D5 (2026-10-03): Charts are generated, never typed.** A hold-pattern classifier names every hold (e.g. "2 deuces + 3 to a royal"); the chart is the pattern order that best reproduces perfect play over all starting hands, and the generator reports its error vs perfect play.

**D6 (2026-10-03): Chart lines are ordered by direct EV maximization, not pairwise votes.** The first draft (greedy pairwise ordering) gave up 2.15%; local search on the chart's total EV, plus deuce-aware straight "ways" and A/T qualifiers on small royal draws, brought NSUD to 0.014% given up. The chart is also the drill-mode vocabulary: "similar hands" = same (correct line, chosen line) confusion.

**D7 (2026-10-04): Drill hands don't count toward per-game totals.** Drills are deliberately the user's weak spots, so mixing them in would make the error rate measure the drill mix instead of real play. Drill accuracy is shown separately. A confusion clears after 3 correct drills in a row. Games without a chart classifier drill the same misplayed hand with suits/order disguised. Resetting a game's stats clears its history too (accepted from T001).

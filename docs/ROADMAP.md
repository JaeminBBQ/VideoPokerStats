# Roadmap

**M1: Engine (done, Claude).** Exact hold EVs, every return verified, worker + client. Catalog limited to photographed paytables (D10).

**M2: Trainer.**
- T001 (DeepSeek): trainer UI, game picker, feedback, top holds, per-game stats, localStorage.
- T002 (Claude, done): hold-pattern classifiers + generated charts (`docs/charts/`).
- T001 (done). T003 (DeepSeek, ready): drill mode (engine side built: `findSimilarHand`), chart tab, chart-line names in feedback.

**M3: Polish.** T002b (Claude, done): Jacks-or-Better-family classifier; venues. T004 (done): wild cards, casino tabs. T005 (Claude, done): removed every game without a photo (D10). T004 (owner request, 2026-10-04): casino tabs, and deuces must *look* wild, not a 9px corner tag. Machine-style face: gold/amber card, big rank, a bold red-on-yellow WILD banner across the middle, glowing border; joker gets the same treatment in Joker Poker; must stay distinct from the green "correct hold" outline and the dimmed state; in drills and the chart tab's example cards too. Phone layout pass at the casino, denomination presets, mistake review list, more paytables the owner photographs (each verified before it ships).

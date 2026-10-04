# Video Poker Trainer

A video poker strategy trainer: pick a game, deal, choose holds, and get told exactly whether that was the best play and what a mistake cost. Every answer comes from exact enumeration of all 32 holds over every possible draw in `src/engine/` — no sampling, no hand-typed strategy charts.

Seven verified paytables (NSUD Deuces, Illinois Deuces, Full-Pay Deuces, Loose Deuces, 10/7 Double Bonus, 10/6 Double Double Bonus, Full-Pay Joker Poker), all reproducing their published returns under perfect play. Per-game stats (hands, mistakes, error rate, EV lost) persist in `localStorage`.

## Getting started

```sh
npm install
npm run dev        # local dev server
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check and production build to `dist/` |
| `npm test` | Vitest: engine tests + app logic tests |
| `npm run verify` | Reproduce every game's published return under perfect play |
| `npm run chart` | Regenerate the deuces strategy charts (`scripts/gen-chart.ts`) |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc -b` |

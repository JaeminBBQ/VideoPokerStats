# Video Poker Trainer

A video poker strategy trainer: pick a game, deal, choose holds, and get told exactly whether that was the best play and what a mistake cost. Every answer comes from exact enumeration of all 32 holds over every possible draw in `src/engine/` — no sampling, no hand-typed strategy charts.

Four paytables photographed on a Legends Bay Game King (10¢): Jacks or Better 8/5, Bonus Poker 6/5, Deuces Wild 16/13, Bonus Poker Deluxe 7/5. Each one's perfect-play return is reproduced by the engine (`npm run verify`). Games are added only from photos of real machines.

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

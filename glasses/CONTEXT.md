# Glasses companion (separate project)

**This directory is a separate project** from the VideoPoker web trainer at the repo root.
It is an Even Realities glasses app: the owner types a 5-card video poker hand on their phone, and the
best hold shows on the glasses lenses.

It has its own `package.json`, build, and tests. The root app's docs (`docs/PRODUCT.md`, `ROADMAP.md`,
`handoffs/BOARD.md`) don't track it. Its decisions are logged in `glasses/DECISIONS.md`.

## The one coupling: the engine
- The glasses app **imports the verified engine from `../src/engine/`**. It doesn't copy or fork it.
  Every "best hold" comes from `analyzeHand`/`holdEvs` (exact enumeration). The root `CLAUDE.md` hard rules
  still apply: engine truth, ties are ties (`EV_EPSILON`), photographed paytables only, max bet.
- Engine changes stay Claude-owned and go through the root project's process. The glasses app is a
  consumer only.
- Engine card encoding: `rank*4 + suit`, rank 0 = deuce … 12 = ace, suit 0..3 = c d h s, 52 = joker.
  The game list is `GAME_LIST` / `GAMES` in `src/engine/games.ts`.

## Research
Even Realities platform research (Oct 2026) lives in `glasses/research/`:
- `01-platform-sdk.md`: app model, SDK, tooling, simulator, deploy
- `02-display-ui.md`: lens display specs and rendering API
- `03-input-events-samples.md`: input events, phone↔glasses bridge, sample apps
- `04-validation.md`: gap check before implementation

## Rules carried over
- The user commits and pushes; agents never commit.
- Never print or commit secrets.

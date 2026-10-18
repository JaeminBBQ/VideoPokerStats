# Glasses Hold Helper: v1 spec

The owner is at a video poker machine wearing G2 glasses and the R1 ring. On the phone they tap in the
5 dealt cards. The glasses then show which cards to hold, with no need to look back at the phone.

## Phone (the Even Hub web page)
> **Superseded in v0.2.0 (DECISIONS G5):** the phone is input only (game picker, suit-row grid, Undo/Clear, letter-suits setting). There's no slot row, result panel, or glasses preview, and the default game is `gsr-job-9-5`.

- **Game picker:** every game in `GAME_LIST` (`src/engine/games.ts`), grouped by venue, remembered across
  launches. Picking a game warms that game's engine tables in the background and shows a "ready" state.
- **Card entry:** a 13 × 4 grid (ranks × suits) of large, thumb-friendly buttons with color-coded suits, fitting a
  phone portrait screen without scrolling.
  - Taps fill slots 1–5 in dealt order, left to right as on the machine. A used card is disabled.
  - Tapping a filled slot clears it, and the next tap fills it.
  - **Clear** resets all slots, and **Undo** removes the last card.
  - A joker button appears only for joker games, if any exist.
- **Auto-analyze:** the hand is analyzed when the 5th card goes in, with no extra button. The phone shows:
  - The 5 cards, with the held cards highlighted.
  - The pattern name when the game has a chart (`patternFor`).
  - The EV in bets.
  - Any ties: every hold within `EV_EPSILON` of the best counts as correct.
  - The runner-up holds with how much EV each gives up.
- **Next hand:** after a result, the first tap on the grid starts a new hand. This is the fastest loop.

## Glasses (G2 lenses, text containers only)
> **Superseded by CODE.md (v0.4.0):** ring/temple gestures now enter the hand (tap / ↑ / ↓ / double tap code
> entry); swipes no longer cycle holds, a tap no longer resets to #1, and double tap no longer exits (the system's
> tap-then-hold does). The result page adds a `next:` line. Layout below is otherwise still current.

- Layout:
  - **Line 1:** the 5 cards in dealt order, held cards bracketed, e.g. `[K♠] [Q♠] [J♠]  7◆   3♣`.
    Use ◆ for diamonds (♦ is likely missing from the font), and fall back to letter suits if the glyphs fail.
  - **Line 2:** `HOLD K♠ Q♠ J♠`, or `DRAW 5` when nothing is held.
  - **Line 3:** the pattern name and EV, e.g. `3 to a Royal  EV 1.27`.
  - **Line 4:** `tie: also …` when tied holds exist.
  - **Header:** a short game name.
- Idle and partial states show the cards entered so far, e.g. `K♠ Q♠ _ _ _`, so the owner can confirm entry
  while looking at the machine.
- Updates use `textContainerUpgrade`, serialized and debounced. `createStartUpPageContainer` is called exactly once.
- **R1 ring and temple input:**
  - Swipe up/down cycles through the ranked holds: #1 best, #2, #3, … each with EV and the loss versus best.
  - A tap returns to the best hold.
  - A double tap on the root page exits via `shutDownPageContainer(1)`, as Even Hub QA requires.

## Engine
- Import `../src/engine/` (ev, games, cards, drill) and run it in a Web Worker. Use the existing `worker.ts`
  if it bundles; otherwise add a thin glasses-local worker that imports the same functions.
  Fallback: Vite `?worker&inline`. Never reimplement EV logic.
- Tables take about 12 MB and about 1 s per game. Prepare them on game select, then cache them while the page lives.

## Persistence
- The chosen game and the last hand go through `bridge.setLocalStorage` (strings), so state survives the WebView being killed.

## Out of v1
- Voice entry (Vosk), which is a possible v2.
- Stats, drills, and the camera.

## Done means
- `npm run build`, `npm test` (pure logic: hand-entry state machine, glasses text formatting, hold ranking)
  and `npm run typecheck` all pass inside `glasses/`.
- Format tests check every glasses line against the measured pixel width (576 px) using the pretext metrics,
  or a conservative character budget.
- The app runs in `evenhub-simulator` against the Vite dev server. The owner then sideloads it via `evenhub qr`
  and checks it on the real G2 + R1.

---

# Implementation plan (binding)

`research/04-validation.md` §5 (spec changes 1–12) is **adopted in full** and overrides anything above that
conflicts with it. Use its verbatim API snippets (§1.2, §3) and its safe defaults (§4).
Notable overrides:
- The usable width is 568 px, at most 10 lines, at most 900 bytes.
- EV shows with 4 decimals on the glasses.
- The engine runs in a glasses-local worker loaded with `?worker&inline`, holding one game's tables at a time.
- Storage dual-writes to `localStorage` and the bridge.
- A "Letter suits" toggle is available.

## Stack
Vite 8 + React 19 + TypeScript 6 (strict, erasable syntax, `.ts` import extensions), Vitest 5, Node 24.
`glasses/` has its own `package.json` and `node_modules`. **Never edit anything outside `glasses/`**: `src/engine/` is
imported read-only.

## Module layout (ownership boundaries for parallel agents)
```
glasses/
  package.json  vite.config.ts  tsconfig.json  tsconfig.node.json  app.json  index.html  README.md
  src/
    core/            PURE, no SDK, no DOM, all unit-tested (Phase 1)
      cards.ts       glasses suit map (♠ ♥ ◆ ♣ / letters), card labels, grid ordering
      entry.ts       hand-entry state machine (5 slots, tap card, tap slot, undo, clear, new-hand-on-tap)
      holds.ts       annotate HoldEv[] → ranked holds {mask, held, ev, loss, tie, pattern}
      format.ts      glasses page text (idle / partial / result / cycling) with pretext width checks
      input.ts       (sysType, textType) → action, with dedupe/throttle helpers
      storage.ts     dual-write storage over an injected backend interface
    engine/          (Phase 1)
      engine.worker.ts   prepare/analyze only, one game's tables at a time
      client.ts          promise API over the worker (prepare, analyze)
    app/
      store.ts       (Phase 1) app state + actions + subscribe(); the single source of truth both UIs read
    bridge/          (Phase 2b) the ONLY runtime importer of @evenrealities/even_hub_sdk
      glasses.ts     host detection, page create/rebuild/upgrade queue, event → store actions, exit flow
      storage.ts     bridge storage backend for core/storage.ts
    ui/              (Phase 2a) React phone UI: game picker, card grid, slots, result panel, settings
    main.tsx         (Phase 2a) mounts React, then starts the bridge if a host exists
```

## Store contract (`src/app/store.ts`)
State:
- `gameId`, `engineStatus: 'loading' | 'ready' | 'error'`, `entry` (the slots), `result` (ranked holds | null).
- `cycleIndex`, `letterSuits`, `analyzing`.

Actions:
- `selectGame`, `tapCard`, `tapSlot`, `undo`, `clear`.
- `nextHold`, `prevHold`, `resetHold`, `setLetterSuits`, `hydrate()`.

API:
- `getState()` and `subscribe(fn) → unsubscribe` (compatible with React's `useSyncExternalStore`).
- `glassesText(state) → string`, built from `core/format.ts`.
- Phase 2 agents consume only this contract.

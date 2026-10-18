# Phase 2a report: phone UI

Status: **done**. `npm run typecheck`, `npm test` (99/99, which includes Phase 2b's bridge tests) and `npm run build` pass
inside `glasses/` with the real `src/bridge/glasses.ts`. I edited only `src/ui/**` and `src/main.tsx`. No git commands were run.

## Files
- `src/main.tsx`: `createAppStore()`, render `<App store>`, `store.hydrate()`, then a lazy
  `import('./bridge/glasses.ts').then(m => m.startGlasses(store, { storage: app.storage, engine: app.engine }))`
  with `.catch(console.warn)`. Phase 2b's real signature takes an optional second `GlassesWiring` argument, so I pass the
  storage (for `setRemote`) and the engine (for dispose on exit). The build splits the SDK into its own chunks
  (`glasses-*.js` and `dist-*.js`).
- `src/ui/useStore.ts`: `useAppState` (`useSyncExternalStore`) and `setCycleTo(store, i)`.
- `src/ui/App.tsx`, `GamePicker.tsx`, `SlotRow.tsx`, `CardGrid.tsx`, `ResultPanel.tsx`, `GlassesPreview.tsx`,
  `Settings.tsx`, `CardFace.tsx`, `app.css`.

## Layout choice
- **Game picker:** a native `<select>` with an `<optgroup>` per venue (`VENUES`/`gamesAt`), 44 px tall, plus a status pill
  (loading…, ready, or error · retry). The retry calls `selectGame(sameId)`, which the store treats as a retry. One row keeps
  the vertical budget for the grid.
- **Card grid:** two 7-column bands, A–8 and 7–2. Each band has one row per suit, in the order ♠ ♥ ♦ ♣. Every card is one tap.
  - 13 across is about 24 px per button at 360 px, which is too narrow for a thumb.
  - 4 suit columns × 13 rows is about 500 px tall, which pushes the result off-screen.
  - Two-tap rank+suit entry doubles the taps per hand (10 instead of 5).
  - With two bands, buttons are 46×38 px at 360 px and 50×44 px on phones at least 800 px tall. Ranks still read left to
    right, high to low.
  - The lower band's spare 7th column holds **Undo** and **Clear** as tall buttons, plus **Joker** between them only when
    `deckSize === 53`. That saves a whole row.
- **Slots:** five cards, 68 px tall. The next slot to fill (armed, or else the first empty one) has a blue ring. Tapping a slot
  calls `tapSlot`.
  - After a result, held cards are raised with a gold ring and a "HELD" badge. Discards are dimmed.
  - The slots reflect the hold the glasses are currently showing. At `cycleIndex > 0` the badge reads `#n` instead of
    "HELD", so the phone mirrors the lens.
- **Result:**
  - The best hold, in large inline cards, with its pattern (when the game has a chart) and `EV x.xxxx`.
  - `also correct: …` for tied holds.
  - A ranked list: #1–#4 by default, growing to include the current `cycleIndex` row. Each row shows the hold, pattern, EV,
    and the loss (`best`, `tie`, or `−x.xxxx`).
  - Tapping a row moves the glasses cycle through `setCycleTo`, and the current row gets a green highlight.
- **Glasses preview:** a black box with green monospace text, `aspect-ratio: 576/288`, with the font scaled by
  container-query units. It renders `glassesText(state)` and sits below the fold, together with Settings
  (the Letter suits toggle → `setLetterSuits`).
- **Viewport fit** (measured in iframes): the result bottom is at 724 px in a 360×740 viewport and 769 px in a 390×844 one.
  `scrollWidth` equals the viewport width at both sizes, so there is no horizontal scroll. The CSS is dark-only with no external
  assets, and the select uses a 16 px font so iOS doesn't zoom.

## Verification
```
$ npm run typecheck   → tsc --noEmit, no errors
$ npm test            → Test Files 12 passed (12), Tests 99 passed (99)
$ npm run build       → index css 5.76 kB, glasses chunk 5.08 kB, SDK chunk 80.55 kB, index 377.91 kB; ✓ built
$ npx vite --port 5174 --strictPort; curl → / 200, /src/main.tsx 200, /src/bridge/glasses.ts 200, /src/ui/App.tsx 200
```
**Browser (Chrome).** `glasses.ts` didn't exist yet, so I ran the dev server with a scratchpad-only config that aliased it to a
no-op stub. Nothing was created in `bridge/`, and the final checks above use the real file. I picked `gsr-job-9-6` and tapped
K♠ Q♠ J♠ 7♦ 3♣:
- **Result:** best `K♠ Q♠ J♠` · "3 to a Royal" · EV 1.5328. Rows #2 Q♠J♠ 0.5422 −0.9907, #3 K♠Q♠ 0.5239 −1.0089,
  #4 K♠J♠ 0.5239 −1.0089. Three slots were marked HELD.
- **Lens:** `JoB 9/6 $1 / [K♠] [Q♠] [J♠]  7◆   3♣ / HOLD K♠ Q♠ J♠ / 3 to a Royal  EV 1.5328`.
- **Tap row #4:** the lens shows `#4 HOLD K♠ J♠ / Suited KJ  EV 0.5239  −1.0089` and the badges read `#4`. Tapping #2
  and then #1 moved the cycle correctly.
- **Letter suits:** `[Ks] [Qs] [Js]  7d   3c`.
- **Entry:** tapping slot 2 clears and arms it (`K♠ _ J♠ 7◆ 3♣`, "1 more"). A♥ then fills slot 2. Undo and Clear work.
- **Console:** no errors.
- **Cleanup:** the tab was closed and the dev servers were killed.

## Open issues / notes
- **First analysis is slow in dev:** about 8–12 s in the unbundled dev worker before "ready". The status pill shows "loading…"
  until then. It's worth measuring in the built app and on the phone.
- **Cycle setter:** the store has no `setCycle(i)`, so `setCycleTo` loops `nextHold`/`prevHold`. That fires one notify per
  step, which means up to 31 renders and bridge ticks (the bridge's debounce absorbs them). A `store.setCycle(i)` would be cleaner.
- **Light theme:** dark only. `index.html` still has a light-mode `body` rule, which `html body` in `app.css` overrides.
- **Phone check still needed:** the owner should check the layout in the real Even App WebView, whose height (with the
  app's own chrome) is unknown. On viewports under about 720 px tall the result list needs a short scroll.

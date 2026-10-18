# Phase 1 report: scaffold, core logic, engine worker, store

Status: **done**. `npm run typecheck`, `npm test` (66/66) and `npm run build` pass inside `glasses/`, and the dev server
serves the app. Nothing outside `glasses/` was edited. No git commands were run, and nothing imports the SDK.

## Files created
- **Scaffold:** `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `app.json`, `index.html`, `.gitignore`, `README.md`, `src/main.tsx` (placeholder).
- **Core (pure):** `src/core/{cards,entry,holds,format,input,storage}.ts`, plus a `.test.ts` for each.
- **Engine:** `src/engine/protocol.ts` (the `EngineClient` interface and messages), `engine.worker.ts`, `client.ts` (`createWorkerEngine`), and `direct.ts` (`createDirectEngine`, in-thread, used by the tests).
- **App:** `src/app/store.ts`, `store.test.ts`, and `default.ts` (`createAppStore()`: the worker plus localStorage, no SDK).

## Final store API (`src/app/store.ts`)
```ts
export type EngineStatus = 'loading' | 'ready' | 'error';
export interface AppState {
  readonly gameId: GameId;
  readonly engineStatus: EngineStatus;
  readonly engineError: string | null;
  readonly entry: EntryState;                     // core/entry.ts: { slots: (Card|null)[5], order: number[], armed: number|null }
  readonly result: readonly RankedHold[] | null;  // core/holds.ts; only for the current complete hand + game
  readonly cycleIndex: number;                    // 0 = best
  readonly letterSuits: boolean;
  readonly analyzing: boolean;
  readonly hydrated: boolean;
}
export interface StoreDeps { engine: Pick<EngineClient, 'prepare' | 'analyze'>; storage: AppStorage }
export interface Store {
  getState(): AppState;
  subscribe(fn: () => void): () => void;
  selectGame(id: GameId): void;
  tapCard(card: Card): void;
  tapSlot(slot: number): void;
  undo(): void;
  clear(): void;
  nextHold(): void;
  prevHold(): void;
  resetHold(): void;
  setLetterSuits(on: boolean): void;
  hydrate(opts?: { onlyIfPristine?: boolean }): Promise<void>;
}
export const initialState: AppState;
export function createStore(deps: StoreDeps): Store;
export function glassesText(state: AppState): string;

// src/app/default.ts
export interface AppWiring { store: Store; storage: AppStorage; engine: EngineClient }
export function createAppStore(): AppWiring;

// src/engine/protocol.ts
export interface EngineClient {
  prepare(gameId: GameId): Promise<void>;
  analyze(gameId: GameId, hand: readonly Card[]): Promise<HoldEv[]>;
  dispose(): void;
}
// src/core/holds.ts
export interface RankedHold { rank: number; mask: number; held: Card[]; ev: number; loss: number; tie: boolean; pattern: string | null }
export const tiedBest: (ranked: readonly RankedHold[]) => RankedHold[];
// src/core/storage.ts
export interface AppStorage { read(key): Promise<string|null>; write(key, value): void; setRemote(remote: RemoteBackend|null): void }
export interface RemoteBackend { get(key: string): Promise<string>; set(key: string, value: string): Promise<unknown> }
```
`getState()` returns the same reference until something changes, so it works with `useSyncExternalStore`. No-op actions,
such as tapping a duplicate card or an invalid one, don't notify.

## Behavior and decisions
- **Analysis.** Analysis runs when the 5th card goes in. Analyses are tokenized: a response is applied only if it is the latest
  and the game and hand still match. An incomplete hand cancels it, and so does a game switch. `selectGame` persists the game,
  prepares it (loading → ready), and re-analyzes a complete hand. Selecting the same game again only retries after an error.
  A successful analysis also sets `engineStatus` to `'ready'`. An analysis error sets it to `'error'`, and the glasses show
  "cannot analyze".
- **cycleIndex.** It is clamped to `[0, min(31, holds-1)]` with no wrap, and resets to 0 on every new result and every entry change.
- **hydrate().** Reads storage and restores the game, the last hand (in slots 1..n) and letter suits. It then prepares the game
  and analyzes if the hand is complete.
  - It **never overrides user actions**: anything the user does before the read finishes wins.
  - With `{ onlyIfPristine: true }` it does nothing once the user has acted. This is for a second hydrate after the bridge
    attaches (see the boot order in `default.ts`).
- **Entry.** Tapping an *empty* slot also arms it, so the next card goes there. Undo after `tapSlot` removes the newest
  remaining card and disarms. The joker is accepted only when `deckSize === 53`, which is never the case today (F11).
- **Storage.**
  - **Deviation:** the letter-suits setting is written as `"1"`/`"0"`, not `"1"`/`""`. A non-empty "off" in localStorage
    can't be skipped in favor of a stale bridge value. The parser treats anything except `"1"` as off.
  - `lastHand` is stored compacted (the filled cards in slot order).
  - Bridge reads and writes time out after 2 s.
  - All failures are swallowed.
- **Engine.** The worker and the direct engine each hold one game's tables and evict them on a switch. The client ignores
  responses with unknown ids. A worker `onerror` or `dispose()` rejects all pending calls. I added `direct.ts` beyond scope:
  it is an in-thread engine with the same contract, and the store tests use it.
- **Glasses text.**
  - Header: the short name, plus ` · loading` or ` · engine error`.
  - Idle: `_ _ _ _ _` / `enter cards on phone`.
  - Partial: `K♠ Q♠ _ _ _` / `3 more`.
  - Complete with no result: `analyzing...`.
  - #1: line 1 brackets the held cards (unheld cards are space-padded, trailing space trimmed). Then `HOLD …` or `DRAW 5`,
    then `pattern  EV x.xxxx`, then `tie: also A / B` when tied holds exist.
  - #n: `#n HOLD …`, then `pattern  EV x.xxxx  −y.yyyy`. A tied #n ends in `  tie` instead of the loss.
  - Only the pattern label is truncated, so the EV and loss always show. Every line is also run through `pxTruncate(568)`,
    which appends ASCII `...`.
- **Short names** (`SHORT_NAMES: Record<GameId,string>` in format.ts):
  - JoB 8/5, Bonus 6/5, Deuces 16/13, Bonus Deluxe 7/5
  - JoB 9/5 5¢, JoB 9/6 $1, DB 9/7/5 $1, Deuces Bonus $1, Deuces 20/12/10 5¢
- **pretext.** The real exports, read from `dist/font_measure.d.ts`, are `getAdvW`, `getTextWidth`, `pxTruncate` and
  `measureTextWrap`. Note that a trailing `\n` counts as an extra line, so the page never ends with one.
- **Input.** `mapInput` priority: DOUBLE → SCROLL_TOP/BOTTOM (via `SWIPE_MAP`, default bottom=next) → CLICK → FG_ENTER/FG_EXIT
  → SYS/ABNORMAL_EXIT. `createInputGate({now})` drops repeats of the same action within 300 ms, swipes within 250 ms of any
  swipe, and repeated lifecycle events within 600 ms.

Sample real output (GSR JoB 9/6, `Ks Qs Js 7d 3c`, and quads with a kicker):
```
JoB 9/6 $1                 JoB 9/6 $1                    JoB 9/6 $1
[K♠] [Q♠] [J♠]  7◆   3♣    [K♠]  Q♠  [J♠]  7◆   3♣       [5♥] [5♣] [5♠] [Q♥] [5◆]
HOLD K♠ Q♠ J♠              #4 HOLD K♠ J♠                 HOLD 5♥ 5♣ 5♠ Q♥ 5◆
3 to a Royal  EV 1.5328    Suited KJ  EV 0.5239  −1.0089 Pat Four of a Kind  EV 25.0000
                                                         tie: also 5♥ 5♣ 5♠ 5◆
```

## Tests (66)
| File | Tests | What it covers |
|---|---|---|
| store.test.ts | 15 | Expected values come from the engine. Stale-result discard, late answers from the previous game, prepare error and retry, hydrate, pristine guard |
| entry.test.ts | 11 | |
| format.test.ts | 11 | **All 9 games**: 45 hands each plus up to 3 tie hands found by search, × all 32 cycle indices × both suit modes (≈26k pages). Every line ≤ 568 px, ≤ 10 lines, ≤ 900 B, every glyph `getAdvW > 0` |
| input.test.ts | 9 | |
| storage.test.ts | 9 | |
| holds.test.ts | 6 | EVs are taken from `analyzeHand`; the tie hand is found by a seeded search |
| cards.test.ts | 5 | |

## Command output (tails)
```
$ npm run typecheck
> vp-hold-helper@0.1.0 typecheck
> tsc --noEmit
(no errors; `npx tsc --noEmit -p tsconfig.node.json` also clean)

$ npm test
 Test Files  7 passed (7)
      Tests  66 passed (66)
   Duration  14.84s (tests 99%)

$ npm run build
dist/index.html                  0.65 kB │ gzip:  0.39 kB
dist/assets/index-D2pU8Iuv.js  219.56 kB │ gzip: 68.62 kB
✓ built in 61ms

$ npx vite --port 5173 (background) + curl
GET / → HTTP 200 (index.html with #root and /src/main.tsx)
/src/main.tsx → 200, /src/engine/client.ts → 200,
/src/engine/engine.worker.ts?worker_file&type=module → 200, /@fs/…/src/engine/ev.ts → 200
(server killed afterwards)
```
I also ran a throwaway library build of `src/app/default.ts`, with its output in the scratchpad and the temporary config removed.
It produced one `app.js` (277 KB) containing the inlined worker (`new Blob` / `createObjectURL`), so `?worker&inline` bundles
correctly. The placeholder `main.tsx` doesn't import the store yet, so today's `dist/` has no worker in it.

## What Phase 2 must know
- **2a (UI):**
  - Call `createAppStore()` once and render from `useSyncExternalStore(store.subscribe, store.getState)`.
  - Call `store.hydrate()` at boot. Until then `engineStatus` stays `'loading'` and no tables are built.
  - Use `cardGrid()`, `phoneCard()`, `usedCards(entry)`, `isComplete(entry)` and `entry.armed` (to highlight the slot the
    next card goes into), plus `tiedBest(result)` and `RankedHold.loss` and `.pattern` for the result panel. `GAME_LIST` and
    `gamesAt(venue)` come from the engine.
  - The worker has **not been run in a real browser yet**. Smoke-test that a full hand shows a result in the dev server.
- **2b (bridge):**
  - Feed `mapInput(eventTypeOf(e.sysEvent), eventTypeOf(e.textEvent))` through `createInputGate({ now: () => performance.now() })`,
    then map next/prev/reset to `store.nextHold/prevHold/resetHold`.
  - On `exit`, call `shutDownPageContainer(1)` with the `exitPending` flow (U8). On `sysExit`, call `app.engine.dispose()`.
  - Render `glassesText(store.getState())` on each subscribe tick through one serialized, debounced (~100 ms) write chain,
    skipping text that hasn't changed.
  - Attach bridge storage with `app.storage.setRemote({ get: k => bridge.getLocalStorage(k), set: (k,v) => bridge.setLocalStorage(k,v) })`,
    then call `store.hydrate({ onlyIfPristine: true })`.
- **Orchestrator note (outside my scope):** the root project's Vitest has no `include`/`exclude`, so a root `npm test`
  **also collects the 7 `glasses/src/**/*.test.ts` files** (`npx vitest list --filesOnly | grep -c glasses` → 7).
  They pass there, because pretext resolves from `glasses/node_modules`, but they add about 15 s, and they would fail if
  `glasses/node_modules` were missing. Add `test: { exclude: ['glasses/**', '**/node_modules/**'] }` to the root config,
  and check whether root oxlint should ignore `glasses/`.

# Phase 2b report: glasses bridge

Status: **done**. `npm run typecheck`, `npm test` (99/99, 33 of them new) and `npm run build` pass inside `glasses/`.
I edited only `src/bridge/**` and `scripts/`. No git commands were run.

## Files
- `src/bridge/glasses.ts`: the SDK adapter, exporting `startGlasses(store, wiring?)`. It is the only runtime SDK importer
  and loads the SDK through a dynamic `import()` only after it detects a host. The build puts the SDK in its own 80 KB chunk.
- `src/bridge/lifecycle.ts`: a pure state machine, `createGlassesController({ port, store, text, now, ... })`.
  It handles the page lifecycle, maps input to store actions, and runs the exit flow.
- `src/bridge/queue.ts`: a pure, serialized, debounced write queue (`createUpdateQueue`).
- `src/bridge/storage.ts`: `createBridgeBackend(bridge)`, a `RemoteBackend` for `core/storage.ts`. Calls time out
  after 2 s, and failures resolve to `''` for reads and `false` for writes. It imports the SDK as types only.
- `src/bridge/events.ts`: `eventTypeOf` (§3) and `enumMismatches` (checks the SDK enum against `EVT`).
- `src/bridge/host.ts`: `hasHost()` (§5.6) and a `withTimeout()` that never rejects.
- Tests: `{events,host,storage,queue,lifecycle}.test.ts`. They use fake timers and fake ports/bridges and never
  import the SDK.
- `scripts/sim-smoke.md` (how to run the simulator, plus the automation API) and `scripts/sim-smoke.sh` (scripted
  smoke run).

## Design
- **`startGlasses`**
  1. If there is no host (`flutter_inappwebview.callHandler`), it returns at once. The SDK is not even imported.
  2. It races `waitForEvenAppBridge()` against a 1.5 s timeout and returns if that runs out.
  3. In DEV builds, it warns if `OsEventTypeList` differs from `EVT`.
  4. If `wiring.storage` is given, it calls `setRemote(createBridgeBackend(bridge))` and then
     `store.hydrate({ onlyIfPristine: true })`.
  5. It starts the controller, which calls `createStartUpPageContainer` **once** with the single full-screen
     capture text container (§3: id 1 `main`, 576×288, `paddingLength` 4, `isEventCapture` 1). The result is checked
     against `StartUpPageCreateResult.success`, and any other code is logged by name.
  6. It subscribes to `onEvenHubEvent`, computes `eventTypeOf(sysEvent)` and `eventTypeOf(textEvent)`, and passes them
     to `controller.handle`. `eventSource` is only logged at debug level.
  7. A `pagehide` listener disposes the controller.
  8. A module-level guard stops a second start.
- **Queue**
  - All page writes (create, rebuild, upgrade, shutDown) run on one promise chain, so at most one is in flight
    (tested).
  - A push opens a 100 ms window. The text is read when the chained step runs, so the latest text wins and stale
    intermediate texts are never sent (tested).
  - A text equal to the last successful send is skipped unless `force` is set. A failed send clears `lastSent`, so the
    next push retries.
- **Controller**
  - **Store updates:** the store subscriber re-renders `glassesText` and pushes only when the text changed.
  - **Input:** each event goes through `mapInput` and then `createInputGate` (dedupe/throttle from `core/input.ts`).
    - next/prev/reset call `store.nextHold`, `store.prevHold` and `store.resetHold`.
  - **Exit (U8):**
    - **exit (double tap):** sets `exitPending` synchronously, drops any pending push, then queues `shutDown(1)`.
      If shutDown fails or throws, the flag clears and the page is re-sent.
    - **While `exitPending`:**
      - Swipes and taps, FG_ENTER, a second double tap, and store-driven writes are all ignored.
      - FG_EXIT clears the flag, then runs `rebuildPageContainer` with the same single container and current text, then
        force-sends the latest text.
    - **SYSTEM_EXIT or ABNORMAL_EXIT, at any time:** tears everything down. It unsubscribes the store and hub events,
      stops the queue, removes the `pagehide` listener and calls `wiring.engine.dispose()`.
    - **FG_ENTER outside `exitPending`:** force re-sends the current text.
    - **FG_EXIT outside `exitPending`:** does nothing.

## Contract note for main.tsx (Phase 2a; not edited by me)
`main.tsx` currently calls `m.startGlasses(store)`. Without the second argument, the bridge storage is **not attached**
and the worker is not terminated on SYSTEM_EXIT. It should be:
```ts
import('./bridge/glasses.ts').then((m) => m.startGlasses(store, app))
```
`AppWiring` already fits `GlassesWiring` (`{ storage, engine }`), so this is a one-word change.

## Tests (bridge: 33)
| File | Tests | Covers |
|---|---|---|
| lifecycle.test.ts | 11 | Create once; failed create; debounce and latest wins; skipping unchanged text; updates waiting on an in-flight create; both envelopes and dedupe; exit → No (rebuild + re-send); shutDown failure; Yes → teardown; ABNORMAL_EXIT; FG_ENTER/FG_EXIT outside the dialog; dispose |
| queue.test.ts | 6 | Debounce, force/skip, serialization (max one in flight), shared chain for `run`, retry on failure, cancel and dispose |
| storage.test.ts | 4 | Round-trip; `''` for a missing key; throw, reject and non-string; 2 s timeout; integration with `core/storage` dual-write |
| host.test.ts | 6 | `hasHost` variants; `withTimeout` value, rejection, and a never-settling promise (1.5 s) |
| events.test.ts | 6 | `eventTypeOf` (absent → null, no type → CLICK); enum alignment and mismatch reporting |

## Simulator evidence (evenhub-simulator 0.9.5 on this Mac, `--automation-port 9898`)
1. **Real `index.html` (`scripts/sim-smoke.sh`).**
   - The glasses screenshot after boot shows `Deuces 16/13` / `_ _ _ _ _` / `enter cards on phone`. The page was
     created and has content.
   - After `double_click` the lens is blank, because `shutDownPageContainer(1)` was called. The simulator shows no
     dialog and sends no follow-up events.
2. **Full path with a throwaway harness** (in the scratchpad, not the project). The harness seeds localStorage with
   GSR JoB 9/6 and `Ks Qs Js 7d 3c`, then runs `createAppStore()` and `startGlasses(app.store, app)`.
   - boot: `[K♠] [Q♠] [J♠]  7◆   3♣` / `HOLD K♠ Q♠ J♠` / `3 to a Royal  EV 1.5328`
   - down: `#2 HOLD Q♠ J♠` / `Suited QJ  EV 0.5422  -0.9907`
   - down: `#3 HOLD K♠ Q♠` / `Suited KQ  EV 0.5239  -1.0089`
   - up: back to #2
   - down, down, click: back to #1
   - double_click: the page is cleared
   - The console showed no warnings from the bridge, so create and every upgrade succeeded.
   - When the simulator reloaded the page, `[glasses] teardown (dispose)` was logged, which shows the `pagehide`
     guard works.
3. **How the simulator delivers events.**
   - Swipes come as `textEvent.eventType` 1/2 (no `sysEvent`).
   - A tap comes as `sysEvent: { eventSource: 1 }` with **no** `eventType`, which `eventTypeOf` turns into CLICK.
     This confirms the §3 default.
   - A double tap comes as `sysEvent.eventType = 3`.

All Vite and simulator processes I started were killed (`ps` was clean afterwards).

## Open hardware unknowns
- **U8:** the real exit-dialog event sequence (FG_EXIT on "No", SYSTEM_EXIT on "Yes") is unverified, because the
  simulator emits neither event.
  - **Risk:** if the firmware cancels the dialog without sending FG_EXIT, `exitPending` stays set. Input is then
    ignored until a lifecycle event arrives.
  - **Recovery:** relaunch the app. A heuristic is possible if this shows up on hardware.
- **U1:** which envelope the R1 ring uses on the owner's firmware. Both envelopes are handled and deduped.
- **U2:** whether the swipe direction feels right. It is one constant, `SWIPE_MAP`, in `core/input.ts`.
- **U3:** whether a non-overflowing capture container emits scroll events on hardware. The simulator does.
- **U6/U9:** whether bridge storage persists. The bridge backend is attached once main.tsx passes `app`.
- **U10:** the waitForEvenAppBridge behavior in a real non-host browser is moot, because the SDK isn't imported
  without a host.

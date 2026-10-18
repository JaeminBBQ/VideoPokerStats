# 03 — Input, events, phone-side UI, bridge, storage, and sample apps (Even Hub / G2)

Research agent 3 of 3, 2026-10-16. Scope: input events, phone WebView UI, phone↔glasses bridge, lifecycle, storage, network, Workers/WASM, and a survey of official and community sample apps.

**Confidence markers:** **[verified]** means I read it in the published SDK `.d.ts`/README or in official docs or repo source. **[docs-conflict]** means official sources disagree. **[uncertain]** means it is inferred or not documented.

## Primary sources (read directly)

| Source | What / version |
|---|---|
| npm `@evenrealities/even_hub_sdk@0.0.16` (published 2026-09-24, `minAppVersion: 2.2.10`) | Tarball extracted. Read `README.md` and `dist/index.d.ts` (1535 lines) |
| https://hub.evenrealities.com/docs/... | Official docs. Pages read: get-started/architecture, build/page-lifecycle, build/device-apis, build/contextual-menu, build/networking, build/background-lifecycle, test/local-testing, ship/packaging, reference/faq, reference/changelog, get-started/quickstart/templates |
| https://github.com/even-realities/evenhub-templates (commit 8cb0135, 2026-08-07) | Official templates: minimal, asr, image, text-heavy |
| https://github.com/even-realities/everything-evenhub (commit 176999c, 2026-07-14) | Official Claude Code / Codex skill plugin. Read the `handle-input`, `background-state`, `device-features` and `build-and-deploy` skills |
| https://github.com/even-realities/EH-InNovel | Official Kotlin Multiplatform demo (JS plus **Kotlin/Wasm**) |
| https://github.com/even-realities/EvenDemoApp | Older G1 raw-BLE Flutter demo (not Even Hub) |
| https://github.com/dmyster145/EvenChess (commit 426a689, 2026-08-21) | Community app. **Web Worker + WASM Stockfish + offline Vosk voice**. The most relevant precedent |
| https://github.com/nickustinov/even-g2-notes | Community dev notes |
| https://github.com/BxNxM/even-dev | Community multi-app simulator that indexes community apps |

The repos were cloned read-only to `/private/tmp/claude-501/-Users-jaemin-Projects-VideoPoker/bafee554-c7bf-45ce-aac8-2f2bbd25ab51/scratchpad/er-repos/`. I installed nothing and ran nothing.

---

## 1. Architecture in one paragraph [verified]

The official architecture page (hub.evenrealities.com/docs/get-started/architecture) describes the model:

> "The phone runs the Even Realities App (Flutter), which hosts your plugin in a WebView - Chromium on Android, WKWebView on iOS. Your app logic runs inside that WebView. The Even Realities App relays everything to and from the glasses over Bluetooth. The glasses render UI containers and emit input events - presses, scrolls, swipes. Apart from native scroll handling, no app logic runs on them."

> "Web → Glasses: your JS calls `bridge.callEvenApp(method, params)` → WebView bridge → Even Realities App → Bluetooth → glasses. Glasses → Web: input events travel Bluetooth → Even Realities App → `window._listenEvenAppMessage(...)` → your callback."

The SDK README lists the runtime requirement: "Even App WebView with `window.flutter_inappwebview.callHandler`". Outside the Even App, calls fail with "Flutter handler not available".

**What this means for us:** the whole app, including our engine Worker, runs in an ordinary phone WebView. The glasses are only a display and input device. Our existing web stack transfers almost as-is. The bridge object exists only on the main thread, so the Worker posts results to the main thread and the main thread calls the bridge.

---

## 2. Input events

### 2.1 Available inputs [verified: official Device APIs page, 2026-08-29]

| Source | Gestures / data |
|---|---|
| G2 temple touchpads | Press, double press, swipe up, swipe down, long press and release |
| R1 ring touchpads | Same gesture set, distinguishable by `eventSource` |
| IMU | x/y/z floats streamed via `imuControl` |
| Microphone | PCM 16 kHz s16le mono from the glasses 4-mic array or the phone mic |
| Contextual menu | Up to 10 app items in the OS menu (opened by tap then long press) |

**Not available:**
- **Head-up gesture:** the OS head-up dashboard is not exposed. No such event appears in `OsEventTypeList`. You could approximate head tilt from raw IMU, but IMU units are "TBD" per the FAQ. **[uncertain]**
- **Left/right swipe:** there is no left/right swipe event, only up/down (`SCROLL_TOP`/`SCROLL_BOTTOM`).
- **Haptics:** FAQ: "Can I trigger haptics on the glasses or R1? No."

### 2.2 Exact enums, verbatim from `dist/index.d.ts` (0.0.16) [verified]

```ts
declare enum OsEventTypeList {
    CLICK_EVENT = 0,
    SCROLL_TOP_EVENT = 1,
    SCROLL_BOTTOM_EVENT = 2,
    DOUBLE_CLICK_EVENT = 3,
    FOREGROUND_ENTER_EVENT = 4,
    FOREGROUND_EXIT_EVENT = 5,
    ABNORMAL_EXIT_EVENT = 6,
    SYSTEM_EXIT_EVENT = 7,
    IMU_DATA_REPORT = 8,
    /** User starts a sustained press on the glasses input surface. */
    LONG_PRESS_EVENT = 9,
    /** User releases the sustained press; kept separate from the start event. */
    LONG_PRESS_RELEASE_EVENT = 10
}

declare enum EventSourceType {
    TOUCH_EVENT_FORM_DUMMY_NULL = 0,
    TOUCH_EVENT_FROM_GLASSES_R = 1,
    TOUCH_EVENT_FROM_RING = 2,
    TOUCH_EVENT_FROM_GLASSES_L = 3
}

type EvenHubEvent = {
    listEvent?: List_ItemEvent;      // containerID, containerName, currentSelectItemName, currentSelectItemIndex, eventType
    textEvent?: Text_ItemEvent;      // containerID, containerName, eventType
    sysEvent?: Sys_ItemEvent;        // eventType, eventSource, imuData{x,y,z}, systemExitReasonCode
    audioEvent?: AudioEventPayload;  // audioPcm: Uint8Array, source, direction, speakerRole
    menuItemClickEvent?: MenuItemClickEvent; // itemID
    jsonData?: Record<string, any>;
};
```

### 2.3 How to subscribe [verified]

There is **one subscription for everything**:

```ts
const unsubscribe = bridge.onEvenHubEvent((event: EvenHubEvent) => { ... }) // returns () => void
```

Other subscriptions:
- `onLaunchSource(cb)` reports `'appMenu' | 'glassesMenu'`. It is pushed once after load, so register it early.
- `onDeviceStatusChanged(cb)` reports `connectType`, `isWearing`, `batteryLevel`, `isCharging` and `isInCase`.
- `onAppLocationChanged(cb)` reports location updates.

### 2.4 Routing rules and gotchas [docs-conflict, so code defensively]

- **Protobuf drops zero values.** `CLICK_EVENT` (0) arrives with **no `eventType` field at all**. The `currentSelectItemIndex` of list item 0 also arrives as `undefined`. The evenhub-templates README says:
  > "A single tap therefore arrives as an envelope with **no `eventType` field at all** … `{ "sysEvent": { "eventSource": 1 } }` // note: no eventType"
- **Where taps arrive.** The official sources disagree:
  - The templates and the `handle-input` skill say taps and double taps on a text-capture page arrive on `sysEvent`, and scrolls arrive on `textEvent`.
  - The official Device APIs page shows taps handled in the `textEvent` switch, and says a text-capture page delivers events "as `event.textEvent`".
  - Community notes say: "The simulator sends `sysEvent` for button clicks, while real hardware sends `textEvent` or `listEvent` depending on the active container. Handle all three event sources."
  - **Recommendation:** use the templates' `eventTypeOf` pattern, which checks both `sysEvent` and `textEvent`. It is reproduced in section 6.2.
- **List-capture page.** Firmware scrolls the list natively and sends no per-step event. A press arrives on `listEvent` with `currentSelectItemIndex` (use `?? 0`). Double press arrives on `sysEvent`.
- **Long press:**
  - It always arrives on `sysEvent`, whatever container is capturing (official docs).
  - Device APIs says "`eventSource` is absent on them". But SDK 0.0.15's changelog says "Long-press and release `sysEvent` payloads preserve `eventSource`, allowing callers to distinguish the right temple, ring, and left temple." **[docs-conflict]**: the newer SDK note probably wins.
  - The OS reserves "tap then long press" for its contextual menu, so treat long press as an enhancement only.
- **Only one container per page** may have `isEventCapture: 1`.
- **Root page:** double tap must call `shutDownPageContainer(1)`, which shows the system exit dialog. QA rejects apps that skip this (page-lifecycle doc: "Apps that exit silently with mode 0 from the root - or use a custom in-app exit UI in its place - get rejected."). **So double tap is not available as an app gesture on the root page.**
- **Swipe throttling.** Community advice is a cooldown of about 300 ms, because scroll events can fire in bursts.

### 2.5 Contextual menu (SDK 0.0.14+, Even App 2.2.9+) [verified]

- Pass `menuObject: { menuItems: [{ itemName, itemID }] }` to create or rebuild.
- Limits: at most 10 items. `itemID` must be non-zero and unique. `itemName` is at most 32 UTF-8 bytes.
- A selection arrives as `event.menuItemClickEvent.itemID`. The sequence is `FOREGROUND_ENTER_EVENT -> menuItemClickEvent -> FOREGROUND_EXIT_EVENT`, so **FOREGROUND_EXIT does not mean the app was torn down**.
- Items are fire-and-forget, and the menu is replaced wholesale on every rebuild.
- **Use for us:** menu items such as "New hand", "Next game" or "Show EV".

### 2.6 Voice: could the user speak the hand? [verified API; feasibility partly uncertain]

**The SDK has no built-in speech recognition.** It only streams PCM:

```ts
await bridge.audioControl(true, AudioInputSource.Glasses) // or AudioInputSource.Phone
bridge.onEvenHubEvent(e => { const pcm = e.audioEvent?.audioPcm /* Uint8Array, 16 kHz s16le mono */ })
await bridge.audioControl(false)
```

Mic rules:
- The glasses mic needs `createStartUpPageContainer` to have run first. The phone mic does not.
- Permissions: `g2-microphone` or `phone-microphone` in `app.json`.

The official `asr` template's STT is "a blank stub. You pick your own provider (Deepgram, AssemblyAI, Whisper, Soniox…)". Cloud STT would need a `network` whitelist plus CORS, and an API key behind our own proxy (the FAQ says never ship keys in a `.ehpk`).

**Offline precedent (best fit):** EvenChess 2.0.3 added "Push-to-talk voice moves … Speech is recognized locally via a bundled, grammar-constrained Vosk model — no server, no network, no API key. The mic uses the SDK `audioControl` PCM bridge." It uses `vosk-browser`, whose Kaldi WASM runs in an inlined Blob Worker, with a constrained grammar (`new model.KaldiRecognizer(16000, JSON.stringify(grammar))`).

A 5-card poker grammar is tiny: 13 ranks × 4 suits, plus "ten/jack/queen/king/ace" and "of hearts…". So the same approach should give high accuracy.

Caveat from their changelog: "_Note: iOS WKWebView memory under the model is pending real-hardware verification._" **[uncertain on iOS]**

Pattern worth copying: **show "Heard: K♠ Q♠ …" on the glasses and require a tap to confirm**, as EvenChess does.

---

## 3. Phone-side UI (the companion WebView)

### 3.1 What the phone shows [verified]

The phone shows **our full HTML page**: `index.html` is the WebView document, and anything in it renders on the phone. The templates mount ordinary DOM. In the `asr` template, `ui.ts` builds a status chip and a transcript panel with injected CSS, and `text-heavy` mirrors the current page into the companion DOM. **So our phone tap-entry UI is just our web UI.** React is allowed. The FAQ says: "Can I build with React / Vue / Svelte? Yes - the SDK is framework-agnostic."

The template `index.html` locks zoom and rubber-banding. This is worth copying for a fast tap grid:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin: 0; height: 100%; background: #232323; color: #E5E5E5;
    touch-action: manipulation; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
</style>
```

The design guidance is a dark theme: surface `#232323`, text `#E5E5E5`, ER green `#3CFA44`.

The phone page and the glasses page are **one JS context**. There is no message passing between "phone UI" and "glasses app": a phone tap handler can call `bridge.textContainerUpgrade(...)` directly.

### 3.2 Bridge init [verified]

```ts
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
const bridge = await waitForEvenAppBridge()   // resolves on 'evenAppBridgeReady' (polls 100ms fallback)
const r = await bridge.createStartUpPageContainer(...) // exactly once; 0 success, 1 invalid, 2 oversize, 3 OOM
```

Every glasses call is async and returns a Promise:
- `rebuildPageContainer` does a full redraw, causes flicker, and returns `boolean`.
- `textContainerUpgrade` does an in-place, flicker-free text update and returns `boolean`. The ID and name must match, or it silently no-ops.
- `updateImageRawData` returns a status. **Do not call it concurrently.**
- `shutDownPageContainer(0|1)`: 0 exits immediately, 1 shows the exit dialog.

The text-heavy template serializes writes with a promise chain:

```ts
let rendering: Promise<unknown> = Promise.resolve()
rendering = rendering.then(async () => { await bridge.textContainerUpgrade(...) })
```

The ASR template debounces glasses writes to 120 ms because "the BLE render queue is slow". The FAQ gives BLE bandwidth as about 10–30 KB/s.

### 3.3 Lifecycle [verified, with platform nuance]

- **Events:**
  - `FOREGROUND_ENTER_EVENT` (4) and `FOREGROUND_EXIT_EVENT` (5) fire on app foreground and background. They also fire when the contextual menu opens and closes.
  - `ABNORMAL_EXIT_EVENT` (6) is an unexpected disconnect.
  - `SYSTEM_EXIT_EVENT` (7) means the user confirmed the exit dialog.
  - Clean up (unsubscribe, `audioControl(false)`, `imuControl(false)`) on 6 and 7, and also on `beforeunload`.
- **Backgrounding** (build/background-lifecycle):

  | Platform | Behavior |
  |---|---|
  | iOS (WKWebView) | "Clean. The WebView keeps running. In-memory JS state survives." |
  | Android (Chromium) | "May be suspended under memory pressure … above it, the process is reclaimed and in-memory state is gone." |

  The guidance is to "Treat Android suspend as 'the app starts cold.'" **For us, after a cold start the Worker must rebuild its ~12 MB tables (about 1 s), so persist the current hand and game and re-derive.**
- **Network while backgrounded:** the FAQ says "WebView is suspended on background; in-flight requests stall."
- **Launch source:** `onLaunchSource` reports `appMenu` (opened on the phone) or `glassesMenu`.
- **Undocumented in 0.0.16 [uncertain]:** the official `background-state` skill describes `setBackgroundState(key, exporter)` / `onBackgroundRestore(key, restorer)` and a "Headless WebView migration" on background. **These functions are not present in SDK 0.0.16's `.d.ts` or `dist/index.js`** (grep found 0 hits). Either they are unreleased or they are host-injected. Do not depend on them.

### 3.4 Storage [docs-conflict]

The SDK provides `bridge.setLocalStorage(key, value: string): Promise<boolean>` and `bridge.getLocalStorage(key): Promise<string>`. A missing key returns `''`, and there is no remove method.

The sources disagree on browser `localStorage`:

| Source | Says |
|---|---|
| Official FAQ (2026-08-29) | "Can I use `localStorage`? Yes - survives suspension, kill, and update. Cleared on uninstall." Also: "IndexedDB or OPFS? Yes, but quotas are not yet documented. Treat as 'best-effort, persistent.'" |
| Background-lifecycle doc | "`localStorage` Always survives (persisted to disk)." |
| Official `device-features` skill | "Browser IndexedDB and browser `localStorage` do NOT reliably persist across app restarts … Use `bridge.setLocalStorage`." |
| Community even-g2-notes | Browser `localStorage` "is wiped when the Even Hub app or the glasses restart." |

**Recommendation:** use `bridge.setLocalStorage` for anything that must persist (paytable choice, settings, stats), stored as JSON strings and chunked if large. Treat IndexedDB as a cache only. For example, **don't rely on caching our 12 MB tables in IndexedDB; just rebuild them (about 1 s).** Storage is sandboxed per `package_id`.

### 3.5 Network / CORS [verified]

"Two independent gates" apply to every request:
1. The `app.json` `network` permission `whitelist` must list the full origin. Wildcards are not supported. The Even app blocks anything else.
2. Normal browser CORS still applies: "The whitelist is not a CORS bypass."

The FAQ adds: "Can I `fetch()` arbitrary URLs? No." **Our app needs no network**, because the engine is local. Keep `permissions: []`, which also simplifies review.

### 3.6 Web Workers and WASM [partly verified; not officially documented]

- **Official docs and SDK say nothing about Workers or WASM.** I grepped all docs pages and skills. **[uncertain officially]**
- Evidence that they work:
  - The official **EH-InNovel** demo targets **Kotlin/Wasm** (`wasmJsMain`, README: "Wasm (recommended, modern browsers)"). So WASM in the Even WebView is something Even Realities itself ships.
  - **EvenChess** uses `new Worker('/stockfish/stockfish.wasm.js', { type: 'classic' })` with Stockfish WASM, plus vosk-browser, which uses a Blob Worker and WASM. It is a packaged Even Hub app (`app.json` `package_id: com.harmon.chess`, `min_sdk_version: 0.0.14`). It is written defensively and falls back to random moves "If the engine doesn't load".
  - Both engines are Chromium on Android and WKWebView on iOS, and both support dedicated Workers, WASM and typed arrays natively.
- **Open risks to verify on hardware:**
  1. **Origin of a packaged `.ehpk`.** How the Even app serves packaged files is undocumented (custom scheme vs local https vs file). This affects `new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })`. Vite's `?worker&inline` (Blob worker) or a classic worker are the safest fallbacks. vosk-browser's inlined Blob worker is known to work for EvenChess.
  2. **Memory on iOS WKWebView** with ~12 MB tables. This is likely fine (Vosk models are bigger), but unverified.
  3. **Android cold restarts:** expect the table rebuild on resume.
  4. **SDK timer shim:** SDK 0.0.16's `package.json` declares a side-effect module `./src/shadow-timers.ts`, and its changelog says "Fixed repeated execution of `setTimeout` / `setInterval` callbacks". The SDK appears to wrap main-thread timers for background keep-alive. This doesn't affect Worker code, but be aware of it. **[uncertain]**
- Package size: the FAQ says "Practical cap is currently ~10 MB". Generating tables at runtime rather than bundling them is the right call.

---

## 4. Packaging and app manifest [verified]

`app.json` (from the minimal template):

```json
{
  "package_id": "com.example.evenhubminimal",
  "edition": "202601",
  "name": "Even Hub Minimal",
  "version": "0.1.0",
  "min_app_version": "2.0.0",
  "min_sdk_version": "0.0.10",
  "entrypoint": "index.html",
  "permissions": [],
  "supported_languages": ["en"]
}
```

Rules:
- `package_id` is lowercase reverse-DNS with no hyphens.
- `name` is at most 20 characters.
- Permissions are an array of `{name, desc, whitelist?}`. Valid names: `network`, `location`, `g2-microphone`, `phone-microphone`, `album`, `camera`.
- The CLI auto-derives `min_app_version` from the SDK version at pack time.

Dev loop:
- `npm run dev`, then `npx evenhub qr --url http://<lan-ip>:5173`, then scan it from the Even app (Developer Mode). HMR works over the LAN.
- Or run the simulator: `npx evenhub-simulator http://localhost:5173`.
- Ship with `npx evenhub pack app.json dist -o app.ehpk`, then upload at https://evenhub.evenrealities.com.
- Console logs appear in the phone app's dev console in Developer Mode.
- The FAQ also mentions "PWA as an alternative" (a hosted URL outside the store). The architecture page lists it. **[uncertain]** whether a plain PWA gets the bridge; most likely it does not.

---

## 5. Sample-app survey

### Official (github.com/even-realities)

| Repo | Demonstrates | Stack |
|---|---|---|
| `evenhub-templates/minimal` | Bridge init, one full-screen text container, tap counter, double-tap exit | Vite 5 + vanilla TS, SDK ^0.0.10, evenhub-cli, simulator |
| `evenhub-templates/asr` | Glasses mic to STT stub, 120 ms debounced glasses render, companion DOM UI (`ui.ts`), tap toggles mic | Vite + vanilla TS |
| `evenhub-templates/text-heavy` | Pixel-accurate pagination (`@evenrealities/pretext`), two text containers (body + pager), swipe/tap paging, serialized writes | Vite + vanilla TS |
| `evenhub-templates/image` | Image container + `updateImageRawData`, tap to reload | Vite + vanilla TS |
| `everything-evenhub` | Claude Code/Codex plugin: skills for quickstart, glasses-ui, handle-input, device-features, background-state, design-guidelines, font-measurement, build-and-deploy, simulator-automation, plus a test harness | Markdown skills |
| `EH-InNovel` | Novel reader: bookshelf on phone, reading on glasses, image test, all container APIs | Kotlin Multiplatform + Compose, **Kotlin/JS and Kotlin/Wasm**, SDK ^0.0.6 |
| `EvenDemoApp` | **G1** raw BLE protocol (Even AI, BMP, text), not Even Hub | Flutter/C, 2024 |
| `lvgl-sys-v9` | Rust LVGL bindings (firmware-side) | Rust, not relevant |

### Community (indexed by BxNxM/even-dev; not exhaustive)

| Repo | Why it matters to us |
|---|---|
| **dmyster145/EvenChess** | **Closest analog.** Local engine in a Web Worker + WASM, offline grammar-constrained voice input (Vosk) with tap-to-confirm, SDK 0.0.14, Vite 8 + TS 6 + Vitest 4 (the same toolchain as our repo), Redux-like store |
| **dmyster145/EvenSolitaire** | Card game on G2. "Three gestures run the whole game: scroll, tap, double-tap." It renders cards and suit glyphs as **bitmap images**, not font text (`src/render/card-canvas.ts`: "Suit glyphs … use bitmap assets only"). That hints that suit characters may not render in the system font. Agent 2 should verify ♠♥♦♣ in text containers. **[uncertain]** |
| takashicompany/make20, nickustinov/{weather,snake,pong,tetris,stt}-even-g2, chortya/epub-reader-g2, fuutott/rdt-even-g2-rddit-client, langerhans/even-transit, thibautrey/even-stars | Assorted patterns. `stt-even-g2` shows cloud STT (Soniox) |
| nickustinov/even-g2-notes | Community docs. Useful, but partially outdated vs the official docs |

### Recommended templates for us

1. **`evenhub-templates/minimal`** as the scaffold: it is the smallest and matches the official conventions and the QA exit rule. We would swap in React for the phone UI, or keep vanilla.
2. **EvenChess** as the architecture reference for Worker + WASM engine loading with fallback, offline voice, and tap-to-confirm.

---

## 6. Key template code, verbatim

### 6.1 `minimal/` file structure

```
minimal/
  app.json          # manifest, permissions: []
  index.html        # WebView host; zoom-locked viewport; <div id="app">; <script type="module" src="/src/main.ts">
  package.json      # scripts: dev=vite, build="tsc --noEmit && vite build", pack="npm run build && evenhub pack app.json dist", simulate
  tsconfig.json     # ES2022, bundler resolution, strict
  vite.config.ts    # server: { host: true, port: 5173 }, build: { target: 'esnext' }
  src/main.ts
```

### 6.2 `minimal/src/main.ts` (complete)

```ts
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: 1,
  containerName: 'main',
  content: 'Hello from G2!\nTap to count · double-tap to exit.',
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  }),
)

console.log('Page created:', result === 0 ? 'success' : `failed (${result})`)

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

let taps = 0
const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    taps += 1
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'main',
        content: `Taps: ${taps}\nTap to count · double-tap to exit.`,
      }),
    )
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
```

(I removed the comment block in the middle. Its key line: "Writing `event.sysEvent?.eventType ?? OsEventTypeList.CLICK_EVENT` instead would read CLICK on events that carry no `sysEvent` at all, so every scroll, exit and audio frame would fire the tap handler." In text-heavy, scrolls are matched before CLICK: `if (textType === OsEventTypeList.SCROLL_TOP_EVENT) …`.)

### 6.3 EvenChess Worker loading (`src/engine/stockfishbridge.ts`)

```ts
async init(): Promise<void> {
  const workerUrl = '/stockfish/stockfish.wasm.js';
  try {
    if (typeof WebAssembly !== 'object') {
      throw new Error('WebAssembly not supported');
    }
    this.worker = new Worker(workerUrl, { type: 'classic' });
    await this.waitForReady();
    this.ready = true;
  } catch (err) {
    console.warn('[StockfishBridge] WASM init failed, using fallback mode:', err);
    this.worker = null;
    this.ready = false;
  }
}
```

### 6.4 EvenChess offline voice (`src/voice/recognizer.ts`, excerpt)

```ts
// vosk-browser is fully self-contained: its worker is an inlined Blob and the Kaldi
// WASM is embedded in the bundle, so there is NO CDN/network dependency.
// The recognizer is grammar-constrained ... shrinks decoder memory (important on iOS WKWebView).
import { createModel, type Model } from 'vosk-browser';
const model = await preloadVoiceModel(modelUrl);            // createModel('/vosk/model.tar.gz')
const rec = new model.KaldiRecognizer(VOICE_SAMPLE_RATE, JSON.stringify(VOICE_GRAMMAR));
rec.on('result', (m) => { const text = m?.result?.text?.trim(); if (text) cb.onFinal(text); });
// PCM from bridge.audioControl(true) → converted to Float32 → rec.acceptWaveformFloat(samples, 16000)
```

---

## 7. Implications for the video-poker glasses app

- **Phone entry UI.** Our React tap grid runs as the WebView page, and the engine Worker runs alongside it. When a hand completes, the main thread sends the best hold via `textContainerUpgrade`, which is flicker-free. Use one text container with `isEventCapture: 1`, or a list container if we want native up/down cycling.
- **Glasses-side input.** We have tap, swipe up/down, long press, and contextual-menu items. A plausible mapping:
  - Swipe up/down cycles the ranked holds (best, 2nd, …) or EV detail.
  - Tap confirms or shows the next item.
  - Menu items handle "New hand" and "Change game".
  - Double tap on the root page is reserved for exit (a QA requirement).
  - The R1 ring sends the same events (`eventSource === 2`).
- **Voice entry is feasible offline**, following the EvenChess Vosk pattern with a 52-card grammar and tap-to-confirm. It needs the `g2-microphone` permission and a bundled model, which must fit the ~10 MB package cap. iOS memory is unverified.
- **No network permission needed.** Persist settings via `bridge.setLocalStorage`. Rebuild the tables on cold start, which matters on Android.
- **Verify first on real hardware:**
  1. A module Worker loads from the packaged `.ehpk` origin. If not, fall back to Vite `?worker&inline`.
  2. Our ~12 MB tables build in a reasonable time in WKWebView and Android WebView.
  3. Which envelope taps arrive in on the user's firmware.
  4. Whether suit glyphs render in text containers (cross-check with agent 2).

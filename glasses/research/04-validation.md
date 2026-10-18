# 04: Validation (gap check before implementation)

Validation agent, 2026-10-16. Inputs: `01-platform-sdk.md`, `02-display-ui.md`, `03-input-events-samples.md`,
`../SPEC.md`, `../CONTEXT.md`, and the engine in `../../src/engine/`.

## Verdict: **SUFFICIENT WITH CAVEATS**

Every API the spec relies on exists with the expected signature in the published `@evenrealities/even_hub_sdk@0.0.16`
`dist/index.d.ts`. I checked them myself against a fresh tarball from registry.npmjs.org. The engine imports, builds,
and tests from a sibling Vite project. The tooling (simulator, CLI, pretext) is specified well enough to run.

Dev agents can build v1 end to end without guessing, provided they adopt the **spec changes in §5**. Three of those are
correctness blockers that I proved empirically:
1. The Vite dev server returns **403 for the engine worker** unless `server.fs.allow` includes the repo root.
2. In Node or Vitest, **importing the SDK throws `ReferenceError: document is not defined`**. Pure, tested modules must not
   import it at runtime.
3. The 576 px line budget in the spec is wrong for a padded container. The inner width is **568 px**.

The items that are still unknown (§4) can only be settled on the real G2 + R1. Each one has a safe default that works
whichever way the answer goes.

### How I verified (primary sources, Oct 16 2026)
- **npm registry metadata** for all four packages, plus their tarballs downloaded fresh into the scratchpad (`val/`).
- **SDK `dist/index.d.ts`** (1535 lines) and the README, read directly. `dist/index.js` is obfuscated, so I probed its
  behavior instead of reading it (see F6).
- **pretext 0.1.4.** I read `font_measure.d.ts`, confirmed the JS has no environment dependencies (it is a pure data table
  plus functions), and executed it in Node to measure real strings.
- **CLI 0.1.14 `main.js`.** I extracted the zod manifest schema and the command/option table.
- **Simulator 0.9.5.** I read the README and changelog.
- **Engine integration.** I built a throwaway copy of the `glasses/` layout in the scratchpad, ran it with the repo's
  Vite 8.3.2 and Vitest 5.0.3, and ran the dev server to test `fs.allow`.
- **Read-only greps of the cloned samples:** evenhub-templates, everything-evenhub skills, EvenChess, EvenSolitaire, and
  even-g2-notes. Nothing from them was executed.

---

## 1. Verified facts

### 1.1 Package versions (registry, `dist-tags.latest`)

| Package | Version | Published | Notes |
|---|---|---|---|
| `@evenrealities/even_hub_sdk` | **0.0.16** | 2026-09-24 | ESM `dist/index.js` + CJS; types `./dist/index.d.ts`; `engines.node ^20 \|\| >=22`; `minAppVersion: "2.2.10"`; `sideEffects: ["./src/shadow-timers.ts", "./dist/index.js", "./dist/index.cjs"]`; no dependencies |
| `@evenrealities/evenhub-cli` | **0.1.14** | 2026-08-20 | bins `evenhub`, `eh`; **`peerDependencies: { typescript: "^5" }`**, which conflicts with our TS 6 (see §5.9) |
| `@evenrealities/evenhub-simulator` | **0.9.5** | 2026-09-01 | bin `evenhub-simulator`; `optionalDependencies` `@evenrealities/sim-darwin-arm64@0.9.5` and other platform builds |
| `@evenrealities/pretext` | **0.1.4** | 2026-04-16 | ESM only; `exports["."].import = ./dist/font_measure.js`; types `dist/font_measure.d.ts`; no dependencies; 674 KB JS |

### 1.2 Canonical SDK API (verbatim from `even_hub_sdk@0.0.16/dist/index.d.ts`)

```ts
declare function waitForEvenAppBridge(): Promise<EvenAppBridge>;

declare class EvenAppBridge {
    setLocalStorage(key: string, value: string): Promise<boolean>;
    getLocalStorage(key: string): Promise<string>;
    createStartUpPageContainer(container: CreateStartUpPageContainer): Promise<StartUpPageCreateResult>;
    rebuildPageContainer(container: RebuildPageContainer): Promise<boolean>;
    textContainerUpgrade(container: TextContainerUpgrade): Promise<boolean>;
    shutDownPageContainer(exitMode?: number): Promise<boolean>;   // 0 = exit now; 1 = system exit dialog
    onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void;
    onLaunchSource(callback: (source: LaunchSource) => void): () => void;
    onDeviceStatusChanged(callback: (status: DeviceStatus) => void): () => void;
    getDeviceInfo(): Promise<DeviceInfo | null>;
    // (also: getUserInfo, callEvenApp, updateImageRawData, audioControl, imuControl, location/album/camera)
}

declare class TextContainerProperty {
    xPosition?: number;
    yPosition?: number;
    width?: number;
    height?: number;
    borderWidth?: number;
    borderColor?: number;
    borderRadius?: number;
    paddingLength?: number;
    containerID?: number;
    containerName?: string;
    isEventCapture?: number;
    zOrderIndex?: number;
    content?: string;
    textColor?: number;          // brightness 0–4; omitted on create/rebuild = 4
    constructor(data?: Partial<TextContainerProperty>);
}

declare class CreateStartUpPageContainer {
    containerTotalNum?: number;  // 1–12
    listObject?: ListContainerProperty[];
    textObject?: TextContainerProperty[];   // max 8
    imageObject?: ImageContainerProperty[]; // max 4
    menuObject?: MenuContainerProperty;
    widgetId?: number;           // injected by the bridge; don't set
    constructor(data?: Partial<CreateStartUpPageContainer>);
}

declare class RebuildPageContainer {
    containerTotalNum?: number;
    listObject?: ListContainerProperty[];
    textObject?: TextContainerProperty[];
    imageObject?: ImageContainerProperty[];
    menuObject?: MenuContainerProperty;     // omitted = custom menu cleared
    constructor(data?: Partial<RebuildPageContainer>);
}

declare class TextContainerUpgrade {
    containerID?: number;
    containerName?: string;
    contentOffset?: number;
    contentLength?: number;
    content?: string;
    textColor?: number;          // omitted = keep current brightness
    constructor(data?: Partial<TextContainerUpgrade>);
}

declare enum StartUpPageCreateResult { success = 0, invalid = 1, oversize = 2, outOfMemory = 3 }

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
    LONG_PRESS_EVENT = 9,
    LONG_PRESS_RELEASE_EVENT = 10
}

declare enum EventSourceType {
    TOUCH_EVENT_FORM_DUMMY_NULL = 0,
    TOUCH_EVENT_FROM_GLASSES_R = 1,
    TOUCH_EVENT_FROM_RING = 2,       // R1 ring
    TOUCH_EVENT_FROM_GLASSES_L = 3
}

type EvenHubEvent = {
    listEvent?: List_ItemEvent;
    textEvent?: Text_ItemEvent;      // { containerID?, containerName?, eventType? }  (NO eventSource)
    sysEvent?: Sys_ItemEvent;        // { eventType?, eventSource?, imuData?, systemExitReasonCode? }
    audioEvent?: AudioEventPayload;
    menuItemClickEvent?: MenuItemClickEvent;
    jsonData?: Record<string, any>;
};
```

The import names are all in the export list: `waitForEvenAppBridge`, `TextContainerProperty`, `CreateStartUpPageContainer`,
`RebuildPageContainer`, `TextContainerUpgrade`, `StartUpPageCreateResult`, `OsEventTypeList`, `EventSourceType`, and the
type-only `EvenHubEvent` and `EvenAppBridge`. These are real TS `enum`s from a `.d.ts`. Consuming them is allowed under
`erasableSyntaxOnly`, which only forbids *declaring* enums.

### 1.3 Facts established by experiment

| # | Fact | Evidence |
|---|---|---|
| F1 | A sibling project `glasses/src/main.ts` can import `../../src/engine/*.ts` (with `.ts` extensions) and **`vite build` succeeds**. `new URL('./worker.ts', import.meta.url)` inside `client.ts` is emitted as a separate worker chunk (`dist/assets/worker-*.js`, 22.6 KB). | Built with repo Vite 8.3.2 |
| F2 | **Without config, the dev server answers 403** for `/@fs/<repo>/src/engine/worker.ts?worker_file&type=module`, with the log "outside of Vite serving allow list". Normal ESM imports of `client.ts` are served (they are "imported from an allowed file"), but the worker URL is not. Adding `server.fs.allow: [<repo root>]` makes it 200. | Ran `vite` dev and curled the worker URL |
| F3 | A **glasses-local worker imported via `?worker&inline`** that imports `../../src/engine/ev.ts` and `games.ts` builds into a single JS file. The worker becomes a Blob URL with a `data:` URL fallback, so it does not depend on the origin the packaged `.ehpk` is served from. | Built; inspected output |
| F4 | **Vitest 5 run from `glasses/`** imports `../../src/engine/*` directly with no config. `buildTables(GAMES['gsr-job-9-6'])` + `analyzeHand(KsQsJs7d3c)` takes **1.2 s** in Node; `sums.byteLength = 11,572,656` (11.6 MB). Best hold mask 7, EV 1.5328, `patternFor` → `{key:'royal3', label:'3 to a Royal'}`. | Ran Vitest |
| F5 | **Importing the SDK in Node throws** `ReferenceError: document is not defined`, because of its top-level side effects. Any Vitest file that imports it transitively at runtime fails under the default `node` environment. | `node -e "import(sdk)"` |
| F6 | With a stubbed `window`/`document` and **no Flutter host**, `waitForEvenAppBridge()` **resolves immediately**. It does not hang or throw. Afterwards `getLocalStorage` resolves `""` and `textContainerUpgrade` resolves `false`, and each logs `postMessage: Flutter handler not available`. So the `try/catch` fallback in EvenSolitaire never fires. Host detection has to be explicit (see §5.6). | Node probe with stubs; a real desktop browser should match, but that is unverified |
| F7 | pretext runs in plain Node with no globals. **`getAdvW(0x2666 ♦) === 0`** (missing; `getTextWidth` charges a 4 px placeholder). `getAdvW` is 320 (20 px) for ♠ ♣ ♥ ◆. `[`/`]` = 7 px, `_` = 9, space = 5, `@` = 17 (widest ASCII), `—`/`–` present (15), `¢` present, `·` present. **Missing:** ✓ (U+2713), ► (U+25BA). | Executed pretext |
| F8 | Measured widths: `[K♠] [Q♠] [J♠]  7◆   3♣` = 237 px; `[T♥] [T◆] [T♣] [T♠] [T♥]` = 253; `HOLD T♥ T◆ T♣ T♠ 9♥` = 227; widest game name (`Deuces Wild Bonus Poker ($1)`) = 263. The **widest pattern label** across all 9 games (sampled from 36k hands × 32 holds, 208 labels) plus `"  EV 0.1234"` is **531 px** (`2 deuces + 4 to a Straight Flush (needs the 2 slot)`). That fits 568, but with little margin, so any longer EV suffix or a "#2 … −0.0123" variant must be truncated. | Executed pretext over `patternFor` output |
| F9 | The **CLI manifest schema** (zod, from `main.js`): `package_id` regex `^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$`; `edition` enum (`"202601"`); `name` max 20; `version` semver; `min_app_version` optional; `min_sdk_version` string; `entrypoint` string; `permissions` array (discriminated by `name`, `desc` 1–300 chars); `supported_languages` ⊂ `en,de,fr,es,it,zh,ja,ko`. `qr` options: `-u/--url`, `-i/--ip`, `-p/--port`, `--path`, `--https`, `--http`, `-e/--external`, `-s/--scale`, `--clear`. `pack` options: `-o`, `--no-ignore`, `-c/--check`, `--sdk-ver`, `--enforce-manual-version`. | Parsed `main.js` |
| F10 | **Simulator 0.9.5:** `evenhub-simulator [OPTIONS] [targetUrl]`, `--automation-port <PORT>`. It **hardcodes `sysEvent.eventSource = 1`** (GLASSES_R), so ring events cannot be simulated. It emits no status events. Text containers are capped at **999 bytes**. "Input is only effective when the app has an active event container." | Simulator README and changelog |
| F11 | The engine has **no joker games**: all 9 `GAME_LIST` entries have `deckSize: 52`, so the spec's joker button never renders in v1. `SUIT_SYMBOLS` in `cards.ts` uses ♦. Glasses code must use its own suit map, not `SUIT_SYMBOLS`. | Read `games.ts`, `cards.ts` |
| F12 | `src/engine/worker.ts` caches tables in an **unbounded `Map`** (one 11.6 MB entry per game). Cycling through all 9 games keeps about **104 MB** resident. It also bundles craps, leave, and blackjack code the glasses don't need. | Read `worker.ts` |

### 1.4 Engine API the glasses app uses (verbatim signatures)

```ts
// ev.ts
export function buildTables(game: GameDef): Tables;                      // ~1.2 s, 11.6 MB
export interface HoldEv { mask: number; held: Card[]; ev: number }       // mask bit i = position i as dealt
export function analyzeHand(t: Tables, hand: readonly Card[]): HoldEv[]; // all 32 holds, best first
export const EV_EPSILON = 1e-9;
// drill.ts
export const hasChart = (game: GameDef): boolean;
export function patternFor(game: GameDef, held: readonly Card[]): Pattern | null; // Pattern = { key, label }
// games.ts
export const GAME_LIST: GameDef[];            // .id, .name, .venue, .deckSize
export const VENUES: Venue[];                 // ['Legends Bay', 'GSR']
export const gamesAt = (venue: Venue): GameDef[];
// cards.ts
export type Card = number;  // rank*4 + suit; rank 0=2 … 12=A; suit 0..3 = c d h s
export const RANKS = '23456789TJQKA'; export const SUITS = 'cdhs';
export const rankOf, suitOf, isRedSuit, parseHand, cardToString;
```

`EV` is the expected return per unit bet, because pays are per coin at max bet. A hold is "correct" when
`best.ev - h.ev <= EV_EPSILON`.

---

## 2. Contradictions resolved

| Topic | Conflict | Resolution |
|---|---|---|
| **Where taps arrive** | Docs first-app: `textEvent`. Template and `handle-input` skill: `sysEvent`. Community: simulator uses `sysEvent`, hardware sometimes uses `textEvent`. | **Handle both.** Use the template's `eventTypeOf(envelope)` on both `sysEvent` and `textEvent` (see §3). Only read `eventType ?? CLICK` *inside a present envelope*. Check DOUBLE_CLICK before CLICK. Dedupe the same action within ~300 ms, because hardware can emit duplicates. |
| **Swipe direction names** | Official `handle-input` skill: swipe up = `SCROLL_TOP_EVENT` (1), swipe down = `SCROLL_BOTTOM_EVENT` (2). The official text-heavy template maps TOP → previous page and BOTTOM → next. EvenChess and EvenSolitaire map TOP → next. | Default to the **official template**: `SCROLL_BOTTOM` (swipe down) = next hold (#n+1) and `SCROLL_TOP` (swipe up) = previous (#n−1, clamped at #1). Keep the mapping in one constant so the owner can flip it after trying the ring. |
| **Scroll envelope** | Skill: scrolls arrive on `textEvent`. EvenChess also handles scrolls on `sysEvent`. | Accept scroll types from **either** envelope. |
| **`eventSource` for R1** | Docs say long press has no `eventSource`; SDK 0.0.15+ says it is preserved on `sysEvent`. | `eventSource` exists only on `sysEvent` (`Text_ItemEvent` has no such field), and the simulator hardcodes 1. **Never branch on `eventSource`.** Treat ring and temples identically. It is optional for debug logs only. |
| **Storage** | Official FAQ and background-lifecycle docs: browser `localStorage` always survives. Official `device-features` skill and EvenSolitaire: browser localStorage does NOT persist, so use the bridge. EvenChess: the bridge store "silently drops settings across iOS restarts", so it treats localStorage as authoritative. | **Dual-write** both (§5.6). On read, prefer a non-empty value from `window.localStorage`, else the bridge value. Wrap bridge calls with a 2 s timeout. |
| **♦ glyph** | The design-guidelines skill lists `♠♣♥♦`; the font tables and the community survey say ♦ is missing. | **Verified missing** in the firmware font tables (`getAdvW(0x2666) = 0`). Use ◆ (U+25C6, 20 px, present), as the spec says. Add a persisted "letter suits" toggle as the fallback, because there is no way to detect a dropped glyph at runtime. |
| **"createStartUpPageContainer exactly once"** vs the exit dialog | Docs: create once, then rebuild. Community (even-g2-notes): after `shutDownPageContainer(1)` the host clears the page and fires `FOREGROUND_ENTER`. "No" fires `FOREGROUND_EXIT`; "Yes" fires `SYSTEM_EXIT`. | Keep **create exactly once**. If the user cancels the exit dialog, restore the page with **`rebuildPageContainer`** (same single container), then re-send the content (§5.5). |
| **SDK / sim / CLI versions** | The docs changelog says SDK 0.0.14 and sim 0.9.3; the template pins 0.0.10. | Use npm's current versions: **SDK 0.0.16, CLI 0.1.14, simulator 0.9.5**. `min_sdk_version: "0.0.16"`. |
| **`app.json` permissions shape** | Old examples use an empty array; `evenhub init` emits objects. | `permissions: []` is valid (zod array of objects; empty is allowed). We need no permissions. |
| **Text content limit** | Docs: 1000 chars on create/rebuild, 2000 on upgrade. Simulator: 999 bytes. | Our page is under 300 bytes. Add a test that the content stays **≤ 900 UTF-8 bytes**. |

---

## 3. Canonical glasses adapter pattern (safe defaults)

```ts
// glasses/src/bridge/glasses.ts — the ONLY runtime importer of the SDK
import {
  waitForEvenAppBridge, TextContainerProperty, CreateStartUpPageContainer,
  RebuildPageContainer, TextContainerUpgrade, StartUpPageCreateResult, OsEventTypeList,
  type EvenAppBridge, type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'

const MAIN = { containerID: 1, containerName: 'main' } as const
const page = (content: string) => ({
  containerTotalNum: 1,
  textObject: [new TextContainerProperty({
    xPosition: 0, yPosition: 0, width: 576, height: 288,
    borderWidth: 0, borderColor: 0, paddingLength: 4,
    ...MAIN, content, isEventCapture: 1,
  })],
})
// create: await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page(text)))  → check === StartUpPageCreateResult.success
// restore: await bridge.rebuildPageContainer(new RebuildPageContainer(page(text)))
// update:  await bridge.textContainerUpgrade(new TextContainerUpgrade({ ...MAIN, content: text }))

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}
// in onEvenHubEvent: const s = eventTypeOf(e.sysEvent), t = eventTypeOf(e.textEvent)
// order: DOUBLE_CLICK → SCROLL_TOP/BOTTOM → CLICK → FOREGROUND_ENTER/EXIT, SYSTEM_EXIT, ABNORMAL_EXIT
```

The pure input mapper takes `(sysType: number | null, textType: number | null)` and returns an action. It is tested with
plain numbers (0, 1, 2, 3, …) from a local `const EVT = { CLICK: 0, SCROLL_TOP: 1, SCROLL_BOTTOM: 2, DOUBLE: 3, FG_ENTER: 4, FG_EXIT: 5, ABNORMAL_EXIT: 6, SYS_EXIT: 7 } as const`.
That way the mapper never imports the SDK at runtime. The adapter feeds it values from the SDK enum, which has the same
numbers.

---

## 4. Remaining unknowns and safe defaults

| # | Unknown (only hardware can answer) | Safe default |
|---|---|---|
| U1 | Which envelope carries taps and swipes on the owner's firmware and R1 | Read both envelopes (§3), and dedupe identical actions within 300 ms. Throttle swipes with a 250–300 ms cooldown. |
| U2 | Swipe direction feel on the R1 | Swipe down (`SCROLL_BOTTOM`) = next hold, as in the official template. One constant; the owner confirms. |
| U3 | Whether a non-overflowing capture text container emits scroll events on hardware | The official text-heavy template depends on it, so assume yes. **Never let the content overflow the capture container**, or the firmware scrolls the text itself. Test: `measureTextWrap(content, 568).lineCount ≤ 10`. |
| U4 | Whether a module Worker loads from the packaged `.ehpk` origin | Sidestep it: use a glasses-local worker via **`?worker&inline`** (F3). It does not depend on the origin. QR dev mode serves from the Vite server either way. |
| U5 | iOS WKWebView memory with 11.6 MB tables | Keep **only the current game's tables** in the worker (evict on switch; at most one `Tables`). That caps it at ~12 MB. |
| U6 | Whether bridge storage and/or browser `localStorage` persist on the owner's phone | Dual-write both. Read localStorage first, then the bridge. Values are small JSON strings. |
| U7 | ◆ rendering on the real lenses (the font table says yes) | ◆ by default, plus a "Letter suits (Kd)" toggle on the phone, persisted. |
| U8 | Event sequence after the exit dialog, and duplicate sys events | Set the flag `exitPending = true` synchronously when calling `shutDownPageContainer(1)`. While it is set: `FOREGROUND_EXIT` (user said No) → clear the flag, `rebuildPageContainer` + re-render. `SYSTEM_EXIT`/`ABNORMAL_EXIT` → unsubscribe and terminate the worker. Ignore `FOREGROUND_ENTER` while the flag is set. Outside the flag, `FOREGROUND_ENTER` → just re-send the current text with `textContainerUpgrade` (cheap, idempotent). Dedupe sys events of the same type within 600 ms. |
| U9 | Whether the simulator implements `setLocalStorage` | Irrelevant thanks to dual-write. |
| U10 | Real-browser behavior of `waitForEvenAppBridge` outside the Even App (F6 used Node stubs) | Never block the phone UI on the bridge. Race it against a 1.5 s timeout and gate glasses calls on `hasHost()` (§5.6). |
| U11 | Store review policy for a casino-strategy app | Out of scope for v1. QR sideload, private builds, or a beta group with only the owner need no review. |

---

## 5. Recommended spec changes

1. **Engine worker: use a glasses-local worker; don't reuse `src/engine/worker.ts`.**
   - Create `glasses/src/engine.worker.ts`. It imports `buildTables`, `analyzeHand` from `../../src/engine/ev.ts` and `GAMES` from
     `../../src/engine/games.ts`, handles only `prepare` and `analyze`, and holds **at most one game's tables**.
   - Load it with `import EngineWorker from './engine.worker.ts?worker&inline'`.
   - Pattern names and tie detection run on the main thread over the returned `HoldEv[]`: `patternFor` and `EV_EPSILON`
     are cheap and pure.
   - Reasons: F12 (unbounded cache, unneeded code), U4 (origin independence), and `src/engine/` stays untouched (Claude-owned).
   - Still no reimplementation of EV logic.
2. **`glasses/vite.config.ts`** (verified necessary, F2):
   ```ts
   import { defineConfig } from 'vite'
   import { fileURLToPath } from 'node:url'
   export default defineConfig({
     server: { host: true, port: 5173, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
     build: { target: 'esnext' },
     test: { environment: 'node', include: ['src/**/*.test.ts'] },
   })
   ```
   React is optional. If used, add `@vitejs/plugin-react` and match the root versions (React 19, plugin-react 6).
3. **`glasses/tsconfig.json`** should mirror the root `tsconfig.app.json`:
   - `target es2023`, `lib ["ES2023","DOM"]`, `module esnext`, `moduleResolution bundler`, `allowImportingTsExtensions`,
     `verbatimModuleSyntax`, `erasableSyntaxOnly`, `strict`, `noUnusedLocals/Parameters`, `noEmit`, `skipLibCheck`,
     `types ["vite/client"]`, `include ["src"]`.
   - `tsc` follows imports into `../src/engine`. The engine already compiles under these exact options, and `worker.ts`
     carries its own `/// <reference lib="webworker" />`.
   - Typecheck script: `tsc --noEmit -p tsconfig.json`.
   - If `vite.config.ts` is typechecked, give it a separate node tsconfig (as at the root) or exclude it.
4. **Fix the pixel budget in "Done means".** With `paddingLength: 4` and `borderWidth: 0`, the inner width is
   **576 − 2×4 = 568 px** and the height is 280 px. That is **10 lines max** at 27 px.
   - Tests assert `getTextWidth(line) ≤ 568` for every line.
   - They also assert `measureTextWrap(content, 568).lineCount ≤ 10` and `new TextEncoder().encode(content).length ≤ 900`.
   - They also assert **every code point in the output has `getAdvW(cp) > 0`**, which catches ♦, ✓, ► and anything else
     the firmware drops.
   - Lines that can grow (the pattern label, line 4 `tie: also …`, the cycling view) are clipped at runtime with pretext's
     `pxTruncate(line, 568)`.
   - Make pretext a **dependency** (it is used at runtime, 674 KB raw, well under the ~10 MB package cap). If it is not
     used at runtime, the conservative budget is **28 characters** (widest glyph 20 px).
5. **Lifecycle wording.** Replace "createStartUpPageContainer is called exactly once" with: *"Called exactly once. After a
   cancelled exit dialog, restore the page with `rebuildPageContainer` using the same single container, then re-render
   (§4 U8)."*
   - Writes go through one promise chain: every `textContainerUpgrade`/`rebuildPageContainer` call awaits the previous one.
   - They are debounced at ~100 ms, and only the latest content is sent.
6. **Persistence and host detection.**
   - `hasHost = typeof (window as any).flutter_inappwebview?.callHandler === 'function'`.
   - Storage keys: `vp.game` (a GameId), `vp.lastHand` (a JSON array of card ints, 0–5 entries), `vp.letterSuits`
     (`"1"`/`""`).
   - Write to `window.localStorage` (try/catch) **and**, if `hasHost`, `bridge.setLocalStorage` (2 s timeout, result
     ignored).
   - Read localStorage first; if it is empty and `hasHost`, read the bridge (`''` = missing).
   - Validate on load: an unknown GameId falls back to the first game in `GAME_LIST`, and an invalid hand falls back to
     empty.
7. **SDK isolation.** Only `glasses/src/bridge/*.ts` may import `@evenrealities/even_hub_sdk` at runtime (`import type`
   is fine anywhere). The tested modules must never import it, because it throws in Node (F5). Those modules are the
   hand-entry state machine, the formatter, the hold ranking, and the input mapper.
8. **Input specifics.**
   - **Swipe cycling.** It moves through the holds from `analyzeHand` in rank order. Clamp the index at 0 and at
     `min(31, holds.length − 1)`; no wrap-around.
   - **Cycling view.** Line 2 shows `#n HOLD …` (or `#n DRAW 5`), and line 3 shows `pattern  EV x.xxxx  −y.yyyy` (the
     loss versus best).
   - **Tap** returns to #1.
   - **Double tap** calls `shutDownPageContainer(1)`. The root page is the only page.
   - New hand data resets the index to #1.
   - EV is formatted with 4 decimals on the glasses, so ties that round alike stay explicit.
9. **Tooling install.**
   - Do **not** add `@evenrealities/evenhub-cli` to devDependencies: its `peerDependencies.typescript ^5` conflicts with
     TS 6 (ERESOLVE). EvenChess, on the same toolchain, also omits it.
   - Run it with `npx -y @evenrealities/evenhub-cli@0.1.14 qr --url "http://$(ipconfig getifaddr en0):5173"`.
   - `@evenrealities/evenhub-simulator@0.9.5` *can* be a devDependency (its platform binaries are optionalDependencies).
   - Scripts: `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`,
     `"sim": "evenhub-simulator http://localhost:5173"`,
     `"pack": "npm run build && npx -y @evenrealities/evenhub-cli@0.1.14 pack app.json dist -o vpholdhelper.ehpk --sdk-ver 0.0.16"`.
   - Dependencies: `@evenrealities/even_hub_sdk@0.0.16` (exact pin) and `@evenrealities/pretext@0.1.4`. Dev
     dependencies: `typescript ~6.0.2`, `vite ^8.3.0`, `vitest ^5.0.3`, `@types/node ^24`.
10. **`glasses/app.json`.** The schema is verified (F9); `pack` is optional for v1:
    ```json
    {
      "package_id": "com.jaeminbbq.vpholdhelper",
      "edition": "202601",
      "name": "VP Hold Helper",
      "version": "0.1.0",
      "min_sdk_version": "0.0.16",
      "entrypoint": "index.html",
      "permissions": [],
      "supported_languages": ["en"]
    }
    ```
    The name is 14 characters and does not contain "Even". Omit `min_app_version`; `pack --sdk-ver 0.0.16` stamps 2.2.10.
11. **Simulator run (verified CLI):** `npm run dev` in one shell, then `npx evenhub-simulator http://localhost:5173` (add
    `--automation-port 9898` for scripted smoke tests: `POST /api/input {"action":"down"}`, `GET /api/screenshot/glasses`).
    Ring events can't be simulated (F10); the owner tests the R1 on the hardware.
12. **Minor.**
    - The spec example `3 to a Royal  EV 1.27` is illustrative. The real 9/6 JoB value for KQJ♠ is 1.5328. Tests must take
      expected values from the engine, never hand-typed EVs.
    - The joker button is dead code for v1 (F11). Implement it behind `game.deckSize === 53` and leave it untested.
    - Don't use `SUIT_SYMBOLS` from `cards.ts` on the glasses, because it contains ♦.

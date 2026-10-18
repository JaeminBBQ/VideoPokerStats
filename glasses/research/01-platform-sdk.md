# 01 — Even Realities platform, SDK, tooling, and dev/test/deploy workflow

Research agent 1 of 3. Researched 2026-10-16.

Sources: the official docs at https://hub.evenrealities.com/docs/... (each page shows a "Last updated" date between 2026-06 and 2026-09), the npm registry, and the official GitHub org https://github.com/even-realities. Repos were cloned read-only into `/private/tmp/claude-501/-Users-jaemin-Projects-VideoPoker/bafee554-c7bf-45ce-aac8-2f2bbd25ab51/scratchpad/er-repos/`. Nothing was installed or run.

Legend: **[verified]** = I read it in an official doc, the npm registry, or a package tarball. **[uncertain]** = inferred, conflicting between sources, or not checked.

---

## 1. TL;DR

- **Official, current platform:** **Even Hub**. It targets the **Even G2** glasses and the optional **R1** ring. A third-party app (the docs call it a "plugin") is a **web app (HTML/CSS/JS/TS)**. It runs **inside a WebView in the Even Realities phone app** (Flutter; WKWebView on iOS, Chromium on Android). The phone app relays display commands and input over BLE. **No app code runs on the glasses.** [verified: /docs/get-started/architecture, /docs/get-started/overview]
- **Three official npm packages:** `@evenrealities/even_hub_sdk` (project dependency), `@evenrealities/evenhub-cli` (`evenhub`/`eh` binary), and `@evenrealities/evenhub-simulator` (desktop simulator). [verified: npm]
- **No hardware needed** for UI and logic work, because the simulator is a desktop LVGL window with an HTTP automation API. To run on a real device: **QR sideload** from a local Vite dev server (Developer Mode), then **private builds** and **beta builds** through the portal. To ship: `evenhub pack` → `.ehpk` → upload to the dev portal → review.
- **G1:** no official app platform. Even Hub is G2-only. G1 only has the official low-level BLE protocol demo `even-realities/EvenDemoApp` plus community reverse-engineered SDKs. See §8.

---

## 2. Developer platforms and which are official

| Thing | Official? | Glasses | Status | Source |
|---|---|---|---|---|
| **Even Hub** (SDK + CLI + simulator + dev portal at hub.evenrealities.com) | Yes | **G2** (+ R1 ring) | Current. The docs say "Today, one surface is live: plugins… Three more surfaces are coming: dashboard widgets, dashboard layouts, and AI skills." | /docs/get-started/overview |
| `@evenrealities/even_hub_sdk` | Yes | G2 | **0.0.16** (2026-09-24), MIT | registry.npmjs.org |
| `@evenrealities/evenhub-cli` | Yes | – | **0.1.14** (2026-08-20) | registry.npmjs.org |
| `@evenrealities/evenhub-simulator` | Yes | – | **0.9.5** (2026-09-01). Platform binaries: `@evenrealities/sim-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64,win32-arm64}` | registry.npmjs.org |
| `@evenrealities/pretext` 0.1.4 | Yes (npm scope) | G2 | "Pixel-accurate font measurement library for Even Realities G2 glasses" | npm search |
| `everything-evenhub` Claude Code plugin | Yes (official org) | G2 | 12+ skills. `/plugin marketplace add even-realities/everything-evenhub` | /docs/learn/claude-code; github.com/even-realities/everything-evenhub |
| `evenhub-templates` | Yes | G2 | `minimal`, `text-heavy`, `asr`, `image` | github.com/even-realities/evenhub-templates |
| `EH-InNovel` | Yes | G2 | "web demo of Even Hub, a simple novel reader" | GitHub org listing |
| `EvenDemoApp` | Yes | **G1** | Raw BLE protocol demo (Flutter). Not an app platform | github.com/even-realities/EvenDemoApp |
| PWA route | Docs-endorsed | G2 | "build a Progressive Web App and point users at your hosted URL… skip the dev portal entirely". **[uncertain]** The docs do not explain how a PWA outside Even Hub drives the glasses. Presumably it still opens inside the Even app WebView. | /docs/get-started/architecture |
| Community: `@jappyjan/even-better-sdk`, `@even-toolkit/create-even-app` 1.1.5, `even-dev`, `even-g2-notes`, `ehup` (portal-upload CLI), MentraOS, etc. | **No** | mostly G2 | Unofficial | github.com/pangoleen/awesome-even-realities-g2 |

The GitHub org `even-realities` currently has five public repos: `EvenDemoApp`, `EH-InNovel`, `lvgl-sys-v9`, `everything-evenhub` (pushed 2026-10-16), and `evenhub-templates` (pushed 2026-08-07). [verified: api.github.com/orgs/even-realities/repos]

Enterprise and government users can get deeper hardware access or custom firmware through software@evenrealities.com (/docs/reference/glossary). That is out of scope for us.

---

## 3. App model: where code runs

From /docs/get-started/architecture (verbatim):

```
┌──────────────────┐    HTTPS     ┌────────────────────┐   Bluetooth    ┌─────────────────────┐
│  Even Hub Cloud  │ ◄──────────► │  Phone             │ ◄────────────► │  Even G2 Glasses    │
│  (distribution   │              │  (Even Realities   │                │  (display + input)  │
│   & hosting)     │              │   App + WebView)   │                │                     │
└──────────────────┘              └────────────────────┘                └─────────────────────┘
```

> The phone runs the Even Realities App (Flutter), which hosts your plugin in a WebView - Chromium on Android, WKWebView on iOS. Your app logic runs inside that WebView. The Even Realities App relays everything to and from the glasses over Bluetooth.
> The glasses render UI containers and emit input events - presses, scrolls, swipes. Apart from native scroll handling, no app logic runs on them.

> The SDK injects a JavaScript bridge (`EvenAppBridge`) into the WebView. … Web → Glasses: your JS calls `bridge.callEvenApp(method, params)` → WebView bridge → Even Realities App → Bluetooth → glasses. Glasses → Web: input events travel Bluetooth → Even Realities App → `window._listenEvenAppMessage(...)` → your callback.

The SDK README (0.0.16) says it needs a runtime that provides `window.flutter_inappwebview.callHandler`, i.e. the Even App WebView. In a normal browser the native capabilities are unavailable. [verified: npm readme]

Consequences for us:
- **Language and framework:** any web stack. Vite + TypeScript is the documented default, and the FAQ says React, Vue, and Svelte all work. The SDK is ESM-first and ships `.d.ts` files. It is CJS + ESM (`dist/index.cjs`, `dist/index.js`, `dist/index.d.ts`) and has no runtime dependencies.
- **The engine runs on the phone,** so our pure-TS `src/engine/` could be bundled straight into the plugin with no server.
- The phone-side WebView page itself is visible in the Even app. The templates' `index.html` shows a "Companion app is running. Check the glasses display." screen, so you can also build phone-side UI.
- **Glasses display:** a container model (text, list, and image containers) on a 576×288 px canvas per eye, monochrome green with 16 levels. No arbitrary pixels, no custom fonts, no emoji. BLE throughput is about 10–30 KB/s. (Details belong to the other research agents. Sources: /docs/get-started/overview, /docs/reference/faq.)
- **Storage:** `localStorage` survives suspension, kill, and update, and is cleared on uninstall. It is sandboxed per `package_id` (FAQ).
- **Networking:** `fetch` only to domains on the `app.json` `network` whitelist, and the remote server **must still send CORS headers** (architecture page).
- **Lifecycle:** the WebView is suspended when the phone app is backgrounded. Beta and released builds survive a locked phone, but QR-sideloaded dev builds do not (/docs/test/local-testing, /docs/ship/app-submission).

---

## 4. Requirements and exact versions

| Item | Value | Source |
|---|---|---|
| Node | `^20.0.0 \|\| >=22.0.0` (the SDK's `engines.node`). Node 18 is not supported. | SDK package.json; /docs/get-started/quickstart/install-node |
| SDK latest | `@evenrealities/even_hub_sdk@0.0.16` (2026-09-24). npm metadata `minAppVersion: 2.2.10` | registry |
| SDK history | 0.0.13 (2026-07-31, floor 2.2.6) · 0.0.14 (2026-08-20, floor 2.2.9: contextual menu, long press, `textColor`) · 0.0.15 (2026-09-07, floor **2.2.10**; long-press `sysEvent` keeps `eventSource`) · 0.0.16 (2026-09-24; "fixes `setTimeout`/`setInterval` callbacks firing twice", translated from the Chinese changelog) | registry + SDK README changelog |
| CLI latest | `@evenrealities/evenhub-cli@0.1.14`. Bins `evenhub` and `eh`. Commands in the tarball: `init`, `login`, `qr`, `pack <json> <project>`, plus hidden `self-check` | tarball `package/main.js` |
| Simulator latest | `@evenrealities/evenhub-simulator@0.9.5` (macOS, Linux, Windows; arm64 Linux and Windows builds are experimental) | registry, simulator README |
| Even Realities App (phone) | ≥ 2.2.10 for SDK 0.0.15+ | SDK README |
| `edition` | `"202601"` | /docs/ship/packaging |

> **Doc drift [verified]:** the docs site still lists SDK 0.0.14 and simulator 0.9.3 as "current" (/docs/reference/changelog, last updated 2026-08-29), but npm has 0.0.16 and 0.9.5. The review rubric says `min_sdk_version` floor `"0.0.14"`. The official template repo pins even older versions (`even_hub_sdk ^0.0.10`, `evenhub-cli ^0.1.12`, `evenhub-simulator ^0.7.2`, `vite ^5.4.0`, `typescript ^5.7.0`, `min_app_version "2.0.0"`) and its README still says "Node.js v18+", which contradicts the docs. **Recommendation:** pin `@evenrealities/even_hub_sdk@0.0.16` and set `min_sdk_version: "0.0.16"`. Pack with `--sdk-ver 0.0.16`.

---

## 5. Setup and scaffolding (exact commands)

### 5.1 One-time setup
From /docs/get-started/quickstart/index and /docs/get-started/quickstart/hardware:
1. Install the **Even Realities App** on the phone (`evenapp.evenrealities.com`) and register an account.
2. Sign in at **https://hub.evenrealities.com/login** with the same account. This turns on **Developer Mode**; there is no toggle.
3. Force-quit and reopen the phone app. The Even Hub tab now shows a developer section (top right) with a **Scan QR** button.
4. Pair the G2 (Devices → Add device) and **take the firmware update first**.
5. Install the global tools:

```bash
npm install -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator
```

(The `npx @evenrealities/evenhub-cli ...` form also works without a global install, and the templates put both tools in devDependencies.)

### 5.2 Route A: hand-built Vite app (verbatim, /docs/get-started/quickstart/first-app)

```bash
npm create vite@latest my-first-app -- --template vanilla-ts
cd my-first-app
npm install
npm install @evenrealities/even_hub_sdk@latest
evenhub init
```

> `evenhub init` creates `app.json`; it does not scaffold the Vite project.

### 5.3 Route B: official template (verbatim, /docs/get-started/quickstart/templates)

```bash
npx degit even-realities/evenhub-templates/minimal my-app
cd my-app
npm install
npm run dev
```

Swap `minimal` for `text-heavy`, `asr`, or `image`. If you use Claude Code, the official plugin wraps this:

```
/plugin marketplace add even-realities/everything-evenhub
/plugin install everything-evenhub
```

### 5.4 Project layout (docs)

```
my-first-app/
├── src/
│   └── main.ts            ← your app's entry point
├── public/
│   └── icon.png           ← greyscale app icon (24×24)
├── index.html             ← Vite HTML entry - keep as-is
├── package.json
├── vite.config.ts         ← Vite config - keep as-is for now
├── tsconfig.json
└── app.json               ← Even Hub manifest (required for packaging)
```

(The `minimal` template actually ships no `public/icon.png`. The store icon and background art appear to be uploaded through the portal. **[uncertain]**)

### 5.5 `minimal` template files (verbatim, `er-repos/evenhub-templates/minimal/`, commit 8cb0135, 2026-08-07)

`package.json` scripts (the versions are stale; see §4):
```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "pack": "npm run build && evenhub pack app.json dist",
  "simulate": "evenhub-simulator http://localhost:5173"
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
})
```
`server.host: true` matters because the phone has to reach the dev server over the LAN. `target: 'esnext'` allows top-level `await`. For flaky HMR the docs also suggest `hmr: { host: '<your-lan-ip>' }` (/docs/test/local-testing).

`index.html` is a normal Vite entry with `<script type="module" src="/src/main.ts"></script>`. Its body is the phone-side companion page.

---

## 6. Manifest: `app.json`

### Minimal (verbatim, /docs/get-started/quickstart/first-app)
```json
{
  "package_id": "com.exampleco.exampleapp",
  "name": "My First App",
  "version": "0.1.0",
  "edition": "202601",
  "min_sdk_version": "0.0.12",
  "entrypoint": "index.html",
  "permissions": [],
  "supported_languages": ["en"]
}
```

### `evenhub init` output (verbatim, /docs/ship/packaging)
```json
{
  "package_id": "com.example.g2demo",
  "edition": "202601",
  "name": "G2 Demo",
  "version": "0.1.0",
  "min_app_version": "2.2.6",
  "min_sdk_version": "0.0.7",
  "entrypoint": "index.html",
  "permissions": [
    {
      "name": "network",
      "desc": "This app needs to access the network in order to ...",
      "whitelist": ["https://example.com"]
    },
    {
      "name": "location",
      "desc": "This app needs to access the location in order to ..."
    }
  ],
  "supported_languages": ["en"]
}
```

### Field rules (/docs/ship/packaging and /docs/ship/app-submission)
| Field | Req | Rule |
|---|---|---|
| `package_id` | yes | Reverse-DNS, at least 2 segments, each segment starts with a lowercase letter, only lowercase letters and digits. **No hyphens or underscores.** Permanent once released. |
| `edition` | yes | Exactly `"202601"` |
| `name` | yes | At most 20 characters. **Must not contain "Even"** (case-insensitive), or it is auto-rejected as impersonation. |
| `version` | yes | `x.y.z` semver, no `v` prefix, no pre-release suffix |
| `min_sdk_version` | yes | Match the installed SDK (`npm list @evenrealities/even_hub_sdk`) |
| `min_app_version` | no | The CLI 0.1.14+ derives it from the SDK's npm `minAppVersion` and stamps it into the `.ehpk`. Set it only to require a newer app than the SDK does. |
| `entrypoint` | yes | Must exist in the build folder (e.g. `dist/index.html`) |
| `permissions` | yes | **Array of objects** `{name, desc}` (desc is 1–300 characters). `name` ∈ `network`, `location`, `g2-microphone`, `phone-microphone`, `album`, `camera`. `network` takes `whitelist: string[]`. Unused permissions get flagged in review. |
| `supported_languages` | yes | Subset of `en, de, fr, es, it, zh, ja, ko` |

A video-poker trainer with a bundled engine needs `"permissions": []`, because it makes no network calls.

---

## 7. Minimal hello world

The official docs version, verbatim from /docs/get-started/quickstart/first-app (`src/main.ts`):

```ts
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
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
  content: 'Hello from G2!\n\nTap to count: 0\nDouble-tap to exit',
  isEventCapture: 1,           // ← receive click events on this container
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  }),
)
if (result !== 0) {
  console.error('createStartUpPageContainer failed:', result)
  // 1 = invalid params, 2 = oversize, 3 = out of memory
}

let count = 0
bridge.onEvenHubEvent((event) => {
  const textEvent = event.textEvent
  if (!textEvent || textEvent.containerID !== 1) return
  switch (textEvent.eventType) {
    case OsEventTypeList.CLICK_EVENT:
    case undefined: // SDK normalizes 0 to undefined in some cases
      count += 1
      bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: 1,
        containerName: 'main',
        content: `Hello from G2!\n\nTap to count: ${count}\nDouble-tap to exit`,
      }))
      break
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      bridge.shutDownPageContainer(1)
      break
  }
})
```

**Use the template's event routing instead.** The official `minimal` template (`er-repos/evenhub-templates/minimal/src/main.ts`) contradicts the docs snippet above. It says taps, double-taps, and lifecycle events arrive on **`event.sysEvent`**, while scrolls arrive on `event.textEvent`. It also says `CLICK_EVENT` is `0` and protobuf drops zero-valued fields, so a tap looks like `{ "sysEvent": { "eventSource": 1 } }` with no `eventType`. The template's handler (verbatim excerpt):

```ts
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
    bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1, containerName: 'main',
      content: `Taps: ${taps}\nTap to count · double-tap to exit.`,
    }))
    return
  }
  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
```

I confirmed that every symbol used here is exported in `@evenrealities/even_hub_sdk@0.0.16` `dist/index.d.ts` by downloading the tarball and grepping it, without running it.

Key rules (first-app page and review rubric):
- `await waitForEvenAppBridge()` before any SDK call. Calls made earlier silently do nothing.
- A container needs `isEventCapture: 1` to receive input.
- Use `textContainerUpgrade` for flicker-free text updates and `rebuildPageContainer` for layout changes.
- **A root-page double-tap must call `shutDownPageContainer(1)`,** which shows the system exit dialog. Mode 0 or a custom exit UI gets rejected in QA.

---

## 8. Glasses-model support

- **G2:** the only target of Even Hub. Every docs page, the hardware page, and the review rubric are written for the G2 and R1. The SDK's `getDeviceInfo` comment lists models "G1/G2/Ring1" (/docs/build/device-apis), but **nothing in the docs says Even Hub plugins run on G1. [uncertain, likely no]** The support article "What is Even Hub?" (support.evenrealities.com, which returned 403 to my fetch) is described in search results as "designed specifically for the Even G2".
- **G1:** the only official developer material is `even-realities/EvenDemoApp`, a Flutter demo of the raw **dual-BLE protocol** (one BLE connection per arm, send left then right, opcodes such as `0xF5` for touch events and `0x15` for BMP packets, 1-bit 576×136 BMP images). That means writing your own native phone app instead of a hosted plugin. Community G1 SDKs include `gabrielevierti/openg1-sdk` (Python plus a simulator), `Thepizzapie/OpenEvenSdk`, and MentraOS. All are unofficial.

---

## 9. Dev → test → ship workflow

| Mode | How | Needs glasses | Notes |
|---|---|---|---|
| **Simulator** | `npm run dev` then `evenhub-simulator http://localhost:5173` | No | Node + LVGL window, 576×288. Input: Up, Down, Click, Double Click, long press. Not an emulator: no BLE timing, no permissions, no lifecycle, and fonts and grey levels are not pixel-exact. `RUST_LOG=debug` logs every bridge call. Right-click → Inspect Element opens devtools for the WebView. A screenshot button saves a PNG. |
| **Simulator, headless** | `evenhub-simulator http://localhost:5173 --automation-port 9898` | No | `GET /api/ping`, `GET /api/screenshot/glasses` (RGBA PNG; lit pixel = alpha > 0), `GET /api/screenshot/webview`, `GET/DELETE /api/console[?since_id=N]`, `POST /api/input {"action":"up\|down\|click\|double_click\|long_press\|long_press_release\|context_menu"}`. Wait about 4 s, or for a ready log line, before sending input. Good for CI smoke tests. |
| **Local / QR sideload** | `npm run dev`, then `evenhub qr --url "http://<LAN-IP>:5173"`, then Scan QR in the phone app's Even Hub tab | Yes | Hot reload on the glasses. **Dies when the phone locks or backgrounds** (re-scan to recover). On macOS, allow `node` through the Application Firewall. Wi-Fi AP isolation blocks it; work around with a phone hotspot or Tailscale. Get the LAN IP with `ipconfig getifaddr en0`. |
| **Private build** | `npm run build && evenhub pack app.json dist -o myapp.ehpk`, upload in Portal → project → Private builds, then install from phone: Me → Apps → Private builds | Yes | Real manifest validation and permission prompts. No HMR. |
| **Beta build** | Same `.ehpk`. Portal → Beta groups (add your email) → Builds → push to the group. Phone: Me → Beta tester → Install | Yes | Only mode identical to a released app (survives a locked phone). **Required before submitting.** |
| **Submit** | Portal: Draft → Test → Submitted → Released (reviewers install it as a beta) | – | Fix-forward only, no rollback. Needs a changelog, release notes per language, a privacy policy covering every permission, a greyscale icon plus background, and screenshots (take them with the simulator). A max `.ehpk` of about 10 MB is practical. |

### CLI reference (v0.1.14, /docs/reference/cli plus tarball)
```bash
evenhub init [-d <dir>] [-o <path>]                # writes app.json
evenhub login [-e <email>]                         # "Log in to EvenHub with your account" (in tarball; not on docs CLI page)
evenhub qr --url "http://192.168.1.100:5173"       # or -i <ip> -p <port> --path <p> [--https] [-e external] [-s scale] [--clear]
evenhub pack app.json dist -o myapp.ehpk [--sdk-ver 0.0.16] [-c|--check] [--no-ignore] [--enforce-manual-version]
evenhub --completion-zsh
# `eh` is an alias for `evenhub`
```
`pack` with `--sdk-ver` looks up the SDK's `minAppVersion` on npm and stamps it as `min_app_version`. Without that flag it uses whichever SDK version npm tags `latest`. Since 0.1.14 a failed pack exits non-zero. `-c` checks whether the `package_id` is available. **[uncertain]** I don't know whether any CLI command uploads to the portal; the docs show only web upload. The community tool `takashicompany/even-hub-uploader` (`ehup`) claims to do it.

The `.ehpk` file is "a zip of your built web assets plus the manifest" (glossary). `.ehp` and `.evenpkg` are deprecated names.

---

## 10. Review rules that affect a video-poker app

- The rubric bans "**financial advice**" (and medical or emergency features). The docs don't mention gambling at all; I grepped every page for gambl/casino/bet/wager. **[uncertain]** We don't know whether a casino-strategy trainer would pass review. **Fallback:** the docs explicitly allow private and beta builds, and a PWA, without public release. For the owner's personal use, a **beta group containing only the owner** gives full production behaviour with no public listing.
- The name can't contain "Even" and must be at most 20 characters.
- Strict review checks include: no black screen on first run, works with the phone locked, alive after 2 minutes idle, system exit dialog on root double-tap, and the WebView closes on exit.
- Never bundle API keys, because anyone can extract a released `.ehpk`.

---

## 11. Open questions and unverified items

1. Does Even Hub support G1 at all? Probably not (see §8). Confirm with the owner which glasses they have.
2. Is a casino or video-poker strategy trainer allowed in public release (§10)?
3. CLI-based upload: the docs show only the web portal. `evenhub login` exists, but no upload command does.
4. Where do the icon and store assets go (`public/icon.png` vs the portal)? The docs and the template disagree.
5. The docs' "current version" tables are stale (SDK 0.0.14 / simulator 0.9.3, while npm has 0.0.16 / 0.9.5). Re-check npm before pinning.
6. The SDK uses TS `enum` (`OsEventTypeList` etc.). That's fine in a Vite bundle, but **[unchecked]** it means SDK types can't be imported into our Node type-stripping engine scripts. Keep the glasses adapter separate from `src/engine/`.

## Key URLs
- Docs root: https://hub.evenrealities.com/docs/get-started/overview · architecture `/docs/get-started/architecture` · first app `/docs/get-started/quickstart/first-app` · packaging `/docs/ship/packaging` · submission `/docs/ship/app-submission` · simulator `/docs/test/simulator` · CLI `/docs/reference/cli` · changelog `/docs/reference/changelog` · FAQ `/docs/reference/faq`
- Portal: https://hub.evenrealities.com/login
- npm: https://www.npmjs.com/package/@evenrealities/even_hub_sdk · `/evenhub-cli` · `/evenhub-simulator`
- GitHub: https://github.com/even-realities/evenhub-templates · https://github.com/even-realities/everything-evenhub · https://github.com/even-realities/EvenDemoApp (G1)
- Community index: https://github.com/pangoleen/awesome-even-realities-g2
- Press: https://www.digitaltrends.com/wearables/even-realities-launches-even-hub-to-turn-g2-smart-glasses-into-a-full-app-ecosystem/

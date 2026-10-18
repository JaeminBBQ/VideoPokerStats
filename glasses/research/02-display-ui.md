# 02: Even G2 display and rendering APIs (Even Hub SDK)

Research agent 2 of 3. Researched 2026-10-16. Scope: how to put a video poker result such as
`HOLD: K♠ Q♠ J♠ — 4 to Royal, EV 18.4` on the lenses, and how to update and clear it.

Confidence key: **[official]** means Even Realities docs or the published SDK `.d.ts`.
**[community]** means third-party notes, measured once or tested only on the simulator.
**[derived]** means computed by me from official data. **[UNCERTAIN]** means sources conflict
or it has not been checked on hardware.

## Sources

| Ref | What | Where |
|---|---|---|
| S1 | `@evenrealities/even_hub_sdk` **0.0.16** (latest, published 2026-09-24), README and `dist/index.d.ts` | https://registry.npmjs.org/@evenrealities/even_hub_sdk , local copy `scratchpad/er-pkgs/sdk/package/` |
| S2 | Official docs: Display & UI System (updated 2026-08-25) | https://hub.evenrealities.com/docs/build/display |
| S3 | Official docs: Page Lifecycle (2026-08-25) | https://hub.evenrealities.com/docs/build/page-lifecycle |
| S4 | Official docs: Design Guidelines (2026-07-10) | https://hub.evenrealities.com/docs/build/design-guidelines |
| S5 | Official docs: Overview, Architecture, FAQ, Glossary, Simulator, Changelog | https://hub.evenrealities.com/docs/get-started/overview , `/get-started/architecture`, `/reference/faq`, `/reference/glossary`, `/test/simulator`, `/reference/changelog` |
| S6 | `@evenrealities/pretext` 0.1.4 (official font-metrics library; embeds the firmware's LVGL font tables) | https://registry.npmjs.org/@evenrealities/pretext , local `scratchpad/er-pkgs/pretext/package/dist/font_measure.js` |
| S7 | Official template repo, `minimal/src/main.ts` | https://github.com/even-realities/evenhub-templates |
| S8 | Community notes linked from the official Design Guidelines (nickustinov/even-g2-notes, `docs/display.md`, `docs/performance.md`, `docs/page-lifecycle.md`; last commit 2026-07-31) | https://github.com/nickustinov/even-g2-notes |

The scratchpad is `/private/tmp/claude-501/-Users-jaemin-Projects-VideoPoker/bafee554-c7bf-45ce-aac8-2f2bbd25ab51/scratchpad/`.
Nothing was installed and no downloaded code was run. The pretext font tables were read as
JSON data with my own Python script.

---

## 1. TL;DR for the poker HUD

- **G2 only.** The Even Hub SDK targets the G2. `DeviceModel` has a `G1` value, but every doc,
  spec, template and the simulator describe only the G2. Assume **no G1 support** for third-party
  plugins **[official docs are G2-only; no explicit G1 statement found]**.
- **Canvas:** 576 × 288 px for each eye, monochrome green, 4-bit (16 levels). The origin is the
  top-left corner. Both eyes show the same page, and the SDK has no per-eye API **[official S2, S5]**.
- **Text:** one fixed proportional LVGL font. You cannot change the font, its size, bold, or
  alignment. The line height is **27 px**, so a full-height container fits about **10 lines**.
  Glyphs are about 12 px wide for capitals and digits, so about **45 characters fit per line**
  **[official S2, S6; derived]**.
- **Suits: ♠ ♣ ♥ render. ♦ (U+2666) is almost certainly NOT in the firmware font. [UNCERTAIN, sources conflict]**
  The design-guidelines page lists `♠♣♥♦` as card suits. However, the official font-metrics
  package (S6) has no glyph for U+2666 (or for ♢ U+2662), and the community glyph survey (S8)
  also lists ♦ as missing. The firmware silently drops missing characters. **Use ◆ (U+25C6) for
  diamonds**, which is in the font at the same 20 px width as the other suits. Alternatively,
  use letter suits (`Kd`). Confirm on the simulator or the glasses before shipping.
- **Primitives:** text, list and image containers, placed by absolute x/y/w/h. A page holds at
  most 12 containers: up to 8 text/list and up to 4 image. **Exactly one** container must have
  `isEventCapture: 1`.
- **Lifecycle:** call `createStartUpPageContainer` **exactly once**. After that, use
  `rebuildPageContainer` to change the layout (about 165 ms, brief flicker) or
  `textContainerUpgrade` to change text in place (about 83 ms, no flicker). Exit with
  `shutDownPageContainer(1)`, which shows the system exit dialog; the store requires this on the
  root page.
- **Recommended for v1:** one full-screen text container, or two to three stacked ones, created
  at launch. Each time the phone computes a new best hold, send one `textContainerUpgrade`.

---

## 2. Display specs

| Spec | Value | Source |
|---|---|---|
| Resolution | 576 × 288 px **per eye** ("dual micro-LED display - one per lens") | S5 Overview: "Display: 576 x 288 px per eye"; S2: "Each eye displays a 576 x 288 pixel canvas." |
| Color | "4-bit greyscale - 16 levels of green. White pixels show as bright green; black pixels are off (transparent)." | S2 |
| Background fill | None. "There is no background or fill property. The border is the only visual decoration." | S2 |
| Coordinates | Origin top-left; X right, Y down; absolute pixels | S2, S1 README ("Coordinate origin: top-left.") |
| Font | "a single LVGL font baked into firmware. No font selection, no size control, not monospaced. Characters outside the font set are silently dropped." | S2 "Font and Unicode support" |
| Custom fonts | No. "The glasses render with a fixed system font." | S5 FAQ |
| Emoji | FAQ says "No". The pretext 0.1.4 changelog says "add Emoji font", and its table has about 100 emoji codepoints (for example U+2665 and some U+1F6xx). **[UNCERTAIN; don't rely on emoji]** | S5 FAQ, S6 |
| Line height | **27 px** fixed ("The G2 glasses have a 576 x 288 pixel display rendered by LVGL with a fixed line height of 27px.") | S6 README |
| Capacity | "A full-screen text container holds roughly 400-500 characters." | S2 |
| Both eyes | Same page is shown to both eyes; no API selects an eye. Input events do carry `eventSource` `GLASSES_L` / `GLASSES_R` / `RING`. | S2, S1 README |
| Simulator fidelity | "Display rendering isn't pixel-perfect with hardware (font, greyscale levels)." | S5 Simulator |

### 2.1 Glyph widths for our strings [derived from S6 font tables, kerning included where present]

Font fallback chain (S6 `getAdvW` doc): `evenroster -> evenroster_crylgrek -> cn -> evenemoji`.
A missing printable glyph gets a 4 px placeholder advance in pretext's model, and firmware skips
it (S2, S8).

| Char | Codepoint | In font? | Width px |
|---|---|---|---|
| ♠ | U+2660 | yes (cn) | 20 |
| ♣ | U+2663 | yes (cn) | 20 |
| ♥ | U+2665 | yes (cn) | 20 |
| ♡ ♤ ♧ (outline) | U+2661/2664/2667 | yes | 20 |
| **♦** | **U+2666** | **NO** | dropped |
| ♢ | U+2662 | NO | dropped |
| ◆ / ◇ | U+25C6 / U+25C7 | yes | 20 |
| `A K Q J T` | | yes | 14, 12, 12, 9, 12 |
| digits | | yes | 8 (`1`) to 13; `0` = 12 |
| space | | yes | 5 |
| `—` / `–` | U+2014 / U+2013 | yes | 15 |
| `→` | U+2192 | yes | 17 |
| `•` / `·` | | yes | 9 / 5 |
| `×` | U+00D7 | yes | 10 |
| `$` | | yes | 13 |
| `▶ ● ○ ■ □ █` | | yes | 20 |
| `✓ ✔ ✗ ►` | | **NO** | dropped |

Sample string widths, computed with the firmware rounding formula `(adv + kern + 8) >> 4` per glyph:

| String | px |
|---|---|
| `HOLD: K♠ Q♠ J♠ — 4 to Royal, EV 18.4` | ~346 (fits one 576-wide line) |
| `HOLD K♠ Q♠ J♠` | ~154 |
| `K♠ Q♠ J♠ T♠ 2♦` (♦ will be dropped) | ~160 |
| `EV 18.4` | ~65 |

**Tip:** add `@evenrealities/pretext` as a dev or runtime dependency and call
`measureTextWrap(text, innerWidth)` / `pxTruncate(text, maxPx)` to make sure a line never wraps.

```ts
// S6 README (verbatim API)
getTextWidth(text: string): number
measureTextWrap(text: string, maxWidth: number): { lineCount: number; height: number; lineWidths: number[] } // height = lineCount * 27
pxTruncate(text: string, maxPx: number): string
getAdvW(cp: number): number // 1/16 px units
```

### 2.2 Aligning columns

The font is proportional, so spaces do not line up columns. "Centering" means padding with
spaces (S2). The community workaround is fullwidth characters such as U+3000 or `Ａ`–`Ｚ` (S8).
For a 5-card row, separate cards with single spaces, or use **five side-by-side text containers**
(about 110 px wide each) to get exact columns. That uses 5 of the 8 non-image container slots.

---

## 3. Rendering primitives (SDK 0.0.16 types, verbatim from `dist/index.d.ts`)

### 3.1 Container limits [official S1, S2]

- `containerTotalNum`: **1 to 12**, and it must equal the number of containers passed.
- `textObject`: at most **8**. `imageObject`: at most **4**. Docs: "At most 4 image containers
  and 8 other containers per page (mix freely)."
- "Exactly one container should use `isEventCapture: 1`." That container receives all input,
  and only it scrolls overflowing text; overflowing text in other containers is clipped (S8).
- `containerName`: at most 16 chars, unique per page. `containerID`: unique per page.
- `zOrderIndex` (SDK 0.0.12+): all-or-nothing per page and unique; larger values draw in front.
  Without it, later declarations draw on top.
- Text content limits: **1,000 chars** in `createStartUpPageContainer` or
  `rebuildPageContainer`, and **2,000 chars** in `textContainerUpgrade` (S2).
- Lists: at most 20 items, at most 64 chars per item, no in-place update (rebuild required),
  and the firmware moves the highlight on scroll.
- Images: width 20 to 288 and height 20 to 144 px for each container, 4-bit greyscale, filled
  only through `updateImageRawData` after creation, no concurrent sends, and at least 100 ms
  between sends (SDK 0.0.14+).

### 3.2 Border/padding (text and list only) [official S2]

| Property | Range |
|---|---|
| `borderWidth` | 0–5 (0 = none) |
| `borderColor` | 0–15 (list) / 0–16 (text), greyscale level |
| `borderRadius` | 0–10 |
| `paddingLength` | 0–32, uniform |
| `textColor` (text only, SDK 0.0.14+) | **brightness 0–4**, default 4. Not a color. Level 0 may be invisible. |

### 3.3 Types

```ts
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
    /** 对应 PB：z_order_index，用于控制多个容器的前后叠放顺序。 */
    zOrderIndex?: number;
    /** 对应 PB：Content */
    content?: string;
    /** 文本亮度（0~4）；创建或重建时省略该字段使用设备默认亮度 4。 */
    textColor?: number;
    constructor(data?: Partial<TextContainerProperty>);
    ...
}

declare class ListItemContainerProperty {
    itemCount?: number;            // 1–20
    itemWidth?: number;            // 0 = auto
    isItemSelectBorderEn?: number; // 0/1
    itemName?: string[];           // ≤64 chars each
}

declare class ListContainerProperty {
    xPosition?: number; yPosition?: number; width?: number; height?: number;
    borderWidth?: number; borderColor?: number; borderRadius?: number; paddingLength?: number;
    containerID?: number; containerName?: string;
    itemContainer?: ListItemContainerProperty;
    isEventCapture?: number; zOrderIndex?: number;
}

declare class ImageContainerProperty {
    xPosition?: number;
    yPosition?: number;
    /** PB：Width，范围 20~288 */
    width?: number;
    /** PB：Height，范围 20~144 */
    height?: number;
    containerID?: number;
    containerName?: string;
    zOrderIndex?: number;
}

declare class CreateStartUpPageContainer {
    /** 对应 PB：ContainerTotalNum（1~12） */
    containerTotalNum?: number;
    listObject?: ListContainerProperty[];
    /** 对应 PB：Text_Object（max_count 8） */
    textObject?: TextContainerProperty[];
    /** 对应 PB：Image_Object（max_count 4） */
    imageObject?: ImageContainerProperty[];
    menuObject?: MenuContainerProperty;   // optional contextual menu (≤10 items, names ≤32 UTF-8 bytes)
    widgetId?: number;                    // injected by bridge
}
// RebuildPageContainer: same fields minus widgetId. Omitting menuObject clears the custom menu.

declare class TextContainerUpgrade {
    containerID?: number;
    containerName?: string;
    contentOffset?: number;   // partial-string replace
    contentLength?: number;
    content?: string;
    /** 文本亮度（0~4）；省略表示保持容器当前亮度。 */
    textColor?: number;
}

declare class ImageRawDataUpdate {
    containerID?: number;
    containerName?: string;
    imageData?: number[] | string | Uint8Array | ArrayBuffer;
}
```

The Chinese comments say: `textColor` is "text brightness (0–4); omitted on create or rebuild
means the device default of 4", and on upgrade "omitted means keep the current brightness".
`z_order_index` "controls the stacking order of multiple containers".

### 3.4 Bridge methods (`EvenAppBridge`) [official S1]

```ts
declare function waitForEvenAppBridge(): Promise<EvenAppBridge>;

/** 发送创建启动页容器指令（启动自定义APP时必须调用，后续用 rebuildPageContainer 重建页面） */
createStartUpPageContainer(container: CreateStartUpPageContainer): Promise<StartUpPageCreateResult>;
rebuildPageContainer(container: RebuildPageContainer): Promise<boolean>;
updateImageRawData(data: ImageRawDataUpdate): Promise<ImageRawDataUpdateResult>;
textContainerUpgrade(container: TextContainerUpgrade): Promise<boolean>;
/** exitMode: 0 立即退出；1 弹出前台交互层，由用户操作决定是否退出 */
shutDownPageContainer(exitMode?: number): Promise<boolean>;
onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void;
callEvenApp(method: EvenAppMethod | string, params?: any): Promise<any>;
getDeviceInfo(): Promise<DeviceInfo | null>;   // model: DeviceModel.G1 | G2 | Ring1

declare enum StartUpPageCreateResult { success = 0, invalid = 1, oversize = 2, outOfMemory = 3 }
declare enum ImageRawDataUpdateResult { success, imageException, imageSizeInvalid, imageToGray4Failed, sendFailed } // string values
declare enum OsEventTypeList {
    CLICK_EVENT = 0, SCROLL_TOP_EVENT = 1, SCROLL_BOTTOM_EVENT = 2, DOUBLE_CLICK_EVENT = 3,
    FOREGROUND_ENTER_EVENT = 4, FOREGROUND_EXIT_EVENT = 5, ABNORMAL_EXIT_EVENT = 6,
    SYSTEM_EXIT_EVENT = 7, IMU_DATA_REPORT = 8, LONG_PRESS_EVENT = 9, LONG_PRESS_RELEASE_EVENT = 10
}
```

The `createStartUpPageContainer` comment says it "must be called when launching a custom app;
later use rebuildPageContainer to rebuild the page". `exitMode` 0 exits immediately; 1 pops a
foreground layer and the user decides.

The SDK validates z-order, menu limits and `textColor` range **before** calling native. On a
failure, create returns `invalid`, rebuild returns `false`, and the SDK logs an
`EvenHubPageContainerValidationErrorCode` (`MISSING_Z_ORDER_INDEX`, `DUPLICATE_Z_ORDER_INDEX`,
`INVALID_TEXT_BRIGHTNESS`, `TOO_MANY_MENU_ITEMS`, ...).

Requirements: SDK 0.0.16 needs **Even App 2.2.10+** (S1 README). The app runs inside the Even
App WebView ("Flutter handler not available" outside it).

---

## 4. Lifecycle: show, update, clear, exit [official S3 unless noted]

| Method | Purpose | Notes |
|---|---|---|
| `createStartUpPageContainer` | Create the initial page | "Called exactly once at startup." Must come before any other glasses UI call or glasses MIC. |
| `rebuildPageContainer` | Replace the entire page | "Full redraw - all state is lost, brief flicker on hardware." Use only when the layout changes. |
| `textContainerUpgrade` | Update text in place | "Faster, flicker-free on hardware. Requires matching containerID + containerName." Mismatches **silently no-op**. |
| `updateImageRawData` | Fill or replace an image | No concurrent sends; await each one. |
| `shutDownPageContainer` | Exit | "Pass 1 for the system exit-confirmation dialog (required on the root page); pass 0 for immediate exit (internal pages only)." Reviewers reject silent root exits. |

**Clearing the display:** there is no "clear" call. Options:
(a) `textContainerUpgrade` with `content: ' '` (one container, about 83 ms);
(b) `rebuildPageContainer` to a single blank text container (about 165 ms flat, S8);
(c) exit with `shutDownPageContainer`.

**Exit pattern from the official template (S7):** double-tap calls `shutDownPageContainer(1)`.
Check `DOUBLE_CLICK_EVENT` before `CLICK_EVENT`. Note that `CLICK_EVENT` = 0 is omitted on the
wire, so `eventType` arrives as `undefined` inside a present `sysEvent` / `textEvent` envelope.

**Exit-dialog event gotcha [community S8]:** after `shutDownPageContainer(1)`, the host fires
`FOREGROUND_ENTER` when the dialog appears (the page is already cleared, so rebuild),
`FOREGROUND_EXIT` if the user answers No, and `SYSTEM_EXIT` if the user answers Yes. Events can
duplicate about 50–100 ms apart, so dedupe them.

### 4.1 Latency [community S8, measured on G2 fw 2.2.7.14 / SDK 0.0.13, one data point]

| Call | Cost |
|---|---|
| `textContainerUpgrade` | ~83 ms per call |
| `rebuildPageContainer` | ~165 ms flat, whatever the container count |
| `createStartUpPageContainer` | ~100–135 ms |
| `updateImageRawData` | ~104 ms fixed + ~3.9 ms per KB of gray4 (w×h/2 bytes); max about 9.5 fps |

Break-even: updating more than 2 text containers in place is slower than one rebuild. The
official FAQ gives BLE bandwidth as "~10–30 KB/s".

---

## 5. Images (if we ever draw card art) [official S2 + community S8]

- At most 288 × 144 px per container and 4 containers, so card graphics are cramped. The
  canvas is 576 wide, so 5 cards would need 2 image containers or about 57 px per card.
- `imageData` may be PNG bytes as `number[]`, a base64 PNG (without the `data:` prefix), or raw
  greyscale bytes. The host converts to gray4 (`imageToGray4`). Black means off. Don't dither.
  Match the image size to the container size, or the hardware tiles it (S8).
- **Recommendation: use text, not images, for v1.** Text is faster, needs no conversion, and
  uses less BLE.

---

## 6. Proposed poker layout (v1) [derived]

There is one text container per row, so each row can be updated independently. Row height is
27 px per line plus padding.

```ts
import {
  waitForEvenAppBridge, CreateStartUpPageContainer, TextContainerProperty,
  TextContainerUpgrade, StartUpPageCreateResult, OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

const bridge = await waitForEvenAppBridge()
const row = (id: number, name: string, y: number, h: number, content: string, capture = 0, bright = 4) =>
  new TextContainerProperty({
    xPosition: 0, yPosition: y, width: 576, height: h,
    borderWidth: 0, paddingLength: 4,
    containerID: id, containerName: name, content,
    isEventCapture: capture, textColor: bright,
  })

const res = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 3,
  textObject: [
    row(1, 'hand', 0, 70,  'Waiting for hand…', 1),      // receives taps/double-tap
    row(2, 'hold', 70, 120, ''),                          // "HOLD  K♠ Q♠ J♠"
    row(3, 'info', 190, 98, '', 0, 2),                    // dimmer: "4 to Royal · EV 18.4"
  ],
}))
if (res !== StartUpPageCreateResult.success) console.warn('create failed', res)

// On each new result from the phone UI (≤3 calls ≈ 250 ms; or one rebuild ≈ 165 ms):
const suit = (s: 's'|'h'|'d'|'c') => ({ s: '♠', h: '♥', d: '◆', c: '♣' })[s]   // ♦ not in font → ◆
await bridge.textContainerUpgrade(new TextContainerUpgrade({
  containerID: 2, containerName: 'hold', content: `HOLD  K${suit('s')} Q${suit('s')} J${suit('s')}`,
}))
```

Simplest alternative: use **one** full-screen text container and send the whole message, with
`\n` line breaks, in a single `textContainerUpgrade`. That is one call, about 83 ms, with no
flicker.

---

## 7. Open questions / to verify on the simulator or glasses

1. **♦ rendering.** The design guidelines list it, but the font tables (S6) and the glyph survey
   (S8) say it is missing. Render `♠♥♦♣◆` in `evenhub-simulator` 0.9.5 and on the glasses.
2. Whether emoji or the `evenemoji` font reaches plugins (S6 0.1.4 added it; the FAQ says no).
3. Whether a text container's height is clipped exactly at line boundaries (27 px per line plus
   padding). Check in the simulator.
4. Whether any G1 path exists for third-party apps. No official doc mentions G1 support for
   Even Hub plugins; only the `DeviceModel.G1` enum value exists.
5. How readable the brightness levels 1–3 are on hardware. The simulator's alpha levels are not
   photometrically matched (S5).

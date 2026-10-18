/**
 * Glasses input mapping (pure; never imports the SDK, which throws in Node). The bridge adapter reads
 * `eventType` from both `sysEvent` and `textEvent` (an envelope present without eventType means CLICK) and
 * passes the two numbers here. Ring and temple input are treated the same; eventSource is never used.
 */

/** OsEventTypeList values (SDK 0.0.16), duplicated as plain numbers. */
export const EVT = {
  CLICK: 0,
  SCROLL_TOP: 1,
  SCROLL_BOTTOM: 2,
  DOUBLE: 3,
  FG_ENTER: 4,
  FG_EXIT: 5,
  ABNORMAL_EXIT: 6,
  SYS_EXIT: 7,
  /** Long press on ring/temple (voice: open the mic). */
  LONG_PRESS: 9,
  /** Long-press release (voice: finish). */
  LONG_RELEASE: 10,
} as const;

/**
 * Code-entry gestures (core/code.ts, CODE.md): tap, swipe up (↑), swipe down (↓), double tap. Since v0.4.0 the
 * app never uses double tap for exit; the system's tap-then-hold gesture exits, and arrives as SYSTEM_EXIT.
 */
export type CodeInput = 'tap' | 'up' | 'down' | 'double';
export type InputAction = CodeInput | 'fgEnter' | 'fgExit' | 'sysExit' | 'talkStart' | 'talkEnd';

/**
 * Swipe event → code gesture: SCROLL_TOP = ↑, SCROLL_BOTTOM = ↓ (the simulator's "up"/"down"). Flip here if the
 * R1 feels backwards on hardware.
 */
export const SWIPE_MAP: { readonly scrollTop: CodeInput; readonly scrollBottom: CodeInput } = {
  scrollTop: 'up',
  scrollBottom: 'down',
};

export const CODE_INPUTS: ReadonlySet<InputAction> = new Set<InputAction>(['tap', 'up', 'down', 'double']);

const has = (sys: number | null, text: number | null, t: number): boolean => sys === t || text === t;

/**
 * Maps the two envelopes' event types to one action. Priority: double tap, swipe, long-press release, long
 * press, tap, lifecycle. Long press beats tap because an envelope without eventType reads as CLICK.
 */
export function mapInput(sysType: number | null, textType: number | null): InputAction | null {
  if (has(sysType, textType, EVT.DOUBLE)) return 'double';
  if (has(sysType, textType, EVT.SCROLL_TOP)) return SWIPE_MAP.scrollTop;
  if (has(sysType, textType, EVT.SCROLL_BOTTOM)) return SWIPE_MAP.scrollBottom;
  if (has(sysType, textType, EVT.LONG_RELEASE)) return 'talkEnd';
  if (has(sysType, textType, EVT.LONG_PRESS)) return 'talkStart';
  if (has(sysType, textType, EVT.CLICK)) return 'tap';
  if (has(sysType, textType, EVT.FG_ENTER)) return 'fgEnter';
  if (has(sysType, textType, EVT.FG_EXIT)) return 'fgExit';
  if (has(sysType, textType, EVT.SYS_EXIT) || has(sysType, textType, EVT.ABNORMAL_EXIT)) return 'sysExit';
  return null;
}

/**
 * A repeat of the same action this soon (≤, in ms) is a hardware duplicate and is dropped. Anything slower is a
 * real gesture: a quick ↓ ↓ while scrolling ranks must both count. Tune on hardware (raw timing is logged at
 * debug level by the bridge).
 */
export const DUPLICATE_MS = 80;

export interface InputGateOptions {
  /** Clock in ms (inject for tests; e.g. () => performance.now()). */
  now: () => number;
  /** Drop a repeat of the same action within this window (≤). Default DUPLICATE_MS. */
  sameActionMs?: number;
  /** Minimum gap between any two swipes (up/down), ≤. Default DUPLICATE_MS; never set it above sameActionMs. */
  swipeCooldownMs?: number;
  /** Drop a repeat of the same lifecycle action (fgEnter/fgExit/sysExit) within this window. */
  systemMs?: number;
}

const SYSTEM: ReadonlySet<InputAction> = new Set(['fgEnter', 'fgExit', 'sysExit']);
const SWIPE: ReadonlySet<InputAction> = new Set(['up', 'down']);

/**
 * Dedupe gate: `accept(action)` returns false for an action to drop. Defaults: same action ≤ DUPLICATE_MS
 * (80 ms), swipes ≤ DUPLICATE_MS apart, lifecycle < 600 ms (research/04-validation.md U8). Double tap is
 * mapped before tap (mapInput), so one event never yields both.
 * Talk (long press) pairs: a talkEnd right after a talkStart is always accepted, however fast, and a talkStart
 * after a talkEnd is too; only a repeat of the same talk action within sameActionMs is dropped.
 */
export function createInputGate(opts: InputGateOptions): { accept: (action: InputAction) => boolean } {
  const { now, sameActionMs = DUPLICATE_MS, swipeCooldownMs = DUPLICATE_MS, systemMs = 600 } = opts;
  const lastAt = new Map<InputAction, number>();
  let lastSwipe = -Infinity;
  let lastTalk: InputAction | null = null;
  return {
    accept(action) {
      const t = now();
      if (action === 'talkStart' || action === 'talkEnd') {
        const prevTalk = lastAt.get(action) ?? -Infinity;
        if (lastTalk === action && t - prevTalk <= sameActionMs) return false;
        lastTalk = action;
        lastAt.set(action, t);
        return true;
      }
      const prev = lastAt.get(action) ?? -Infinity;
      if (SYSTEM.has(action) ? t - prev < systemMs : t - prev <= sameActionMs) return false;
      if (SWIPE.has(action) && t - lastSwipe <= swipeCooldownMs) return false;
      lastAt.set(action, t);
      if (SWIPE.has(action)) lastSwipe = t;
      return true;
    },
  };
}

/**
 * Glasses page lifecycle and input → store state machine (pure; no SDK). glasses.ts adapts the SDK to
 * `GlassesPort` and feeds `handle(sysType, textType)` from onEvenHubEvent.
 *
 * research/04-validation.md §4 U1/U8, §5.5, and CODE.md (v0.4.0):
 * - The page is created exactly once (`start`). All page writes go through one serialized, debounced queue.
 * - Store changes re-render `text()`; a change is pushed only when the text differs from the last render.
 * - tap / up / down / double → store.codeGesture (ring code entry). The app has no exit gesture of its own
 *   since v0.4.0: the system's tap-then-hold exits and arrives here as SYSTEM_EXIT.
 * - Voice (VOICE.md, optional `voice` dep): talkStart (long press) → voice.start(); talkEnd (release) →
 *   voice.stop(), always, so the mic never stays open. FOREGROUND_EXIT (backgrounded) and teardown → voice.cancel().
 * - FOREGROUND_ENTER → force-send the current text (cheap, idempotent).
 * - SYSTEM_EXIT / ABNORMAL_EXIT → tear down (unsubscribe store, stop the queue, onTeardown('sysExit')).
 * - Inputs pass through core/input.ts's duplicate gate first. Every raw event is logged at debug level with its
 *   time and the gap since the previous one, so the gate can be tuned on hardware.
 */
import { createInputGate, mapInput, type CodeInput, type InputAction } from '../core/input.ts';
import { createUpdateQueue, DEFAULT_DEBOUNCE_MS, type UpdateQueue } from './queue.ts';

/** The page operations, SDK-free. Each resolves true on success. */
export interface GlassesPort {
  create(text: string): Promise<boolean>;
  upgrade(text: string): Promise<boolean>;
}

export interface CodeStore {
  subscribe(fn: () => void): () => void;
  codeGesture(g: CodeInput): void;
}

/** Voice capture driven by the long press. All three must be safe to call in any state (idempotent). */
export interface VoiceControl {
  /** Long press: open the mic (or show the no-model message). */
  start(): void;
  /** Release: finish and recognize. */
  stop(): void;
  /** Backgrounded/teardown: close the mic and drop any audio. */
  cancel(): void;
}

export type TeardownReason = 'sysExit' | 'dispose';
export type LogFn = (level: 'debug' | 'warn', msg: string, ...data: unknown[]) => void;

export interface ControllerDeps {
  port: GlassesPort;
  store: CodeStore;
  /** The current glasses page text (glassesText(store.getState())). */
  text: () => string;
  /** Clock for the input gate, ms. */
  now: () => number;
  debounceMs?: number;
  onTeardown?: (reason: TeardownReason) => void;
  log?: LogFn;
  voice?: VoiceControl;
}

export interface GlassesController {
  /** Creates the page (once) and subscribes to the store. Resolves with whether create succeeded. */
  start(): Promise<boolean>;
  /** One onEvenHubEvent, as the two envelopes' event types. Returns the action taken, or null. */
  handle(sysType: number | null, textType: number | null): InputAction | null;
  dispose(): void;
  readonly disposed: boolean;
  /** For tests: the underlying queue. */
  readonly queue: UpdateQueue;
}

export function createGlassesController(deps: ControllerDeps): GlassesController {
  const { port, store, text, now, onTeardown, voice, log = () => {} } = deps;
  const queue = createUpdateQueue({
    send: (t) => port.upgrade(t),
    debounceMs: deps.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    onError: (err) => log('warn', 'glasses write failed', err),
  });
  const gate = createInputGate({ now });
  let started = false;
  let disposed = false;
  let lastRendered: string | null = null;
  let unsubStore: (() => void) | null = null;
  let lastEventAt: number | null = null;

  const resync = () => {
    const t = text();
    lastRendered = t;
    queue.push(t, { force: true });
  };

  const cancelVoice = () => {
    try {
      voice?.cancel();
    } catch (err) {
      log('warn', 'voice.cancel threw', err);
    }
  };

  const teardown = (reason: TeardownReason) => {
    if (disposed) return;
    disposed = true;
    cancelVoice();
    unsubStore?.();
    unsubStore = null;
    queue.dispose();
    onTeardown?.(reason);
  };

  return {
    start() {
      if (started || disposed) return Promise.resolve(false);
      started = true;
      const t = text();
      lastRendered = t;
      const created = queue.run(async () => {
        const ok = await port.create(t);
        queue.markSent(ok ? t : null);
        if (!ok) log('warn', 'createStartUpPageContainer did not succeed');
        return ok;
      });
      unsubStore = store.subscribe(() => {
        if (disposed) return;
        const next = text();
        if (next === lastRendered) return;
        lastRendered = next;
        queue.push(next);
      });
      return created.then((ok) => ok === true);
    },
    handle(sysType, textType) {
      if (disposed) return null;
      const t = now();
      const action = mapInput(sysType, textType);
      const accepted = action !== null && gate.accept(action);
      log('debug', 'input', { sysType, textType, action, accepted, t: Math.round(t), dt: lastEventAt === null ? null : Math.round(t - lastEventAt) });
      lastEventAt = t;
      if (!accepted) return null;
      switch (action) {
        case 'tap':
        case 'up':
        case 'down':
        case 'double':
          store.codeGesture(action);
          return action;
        case 'talkStart':
          if (!voice) return null;
          voice.start();
          return action;
        case 'talkEnd':
          if (!voice) return null;
          voice.stop();
          return action;
        case 'fgExit':
          // Backgrounded: never leave the mic open behind the user's back.
          cancelVoice();
          return action;
        case 'fgEnter':
          resync();
          return action;
        case 'sysExit':
          teardown('sysExit');
          return action;
      }
      return null;
    },
    dispose: () => teardown('dispose'),
    get disposed() {
      return disposed;
    },
    queue,
  };
}

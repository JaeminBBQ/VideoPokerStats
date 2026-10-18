import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVT } from '../core/input.ts';
import type { CodeInput } from '../core/input.ts';
import { createGlassesController, type GlassesPort, type LogFn, type TeardownReason, type VoiceControl } from './lifecycle.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Minimal store: a "hand" label and a gesture counter; text = `${hand} #${i + 1}`. */
function fakeStore() {
  const listeners = new Set<() => void>();
  const s = { hand: 'idle', i: 0 };
  const gestures: CodeInput[] = [];
  const emit = () => listeners.forEach((f) => f());
  return {
    s,
    listeners,
    text: () => `${s.hand} #${s.i + 1}`,
    setHand(h: string) {
      s.hand = h;
      s.i = 0;
      emit();
    },
    poke: emit,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    gestures,
    codeGesture: vi.fn((g: CodeInput) => {
      gestures.push(g);
      s.i++;
      emit();
    }),
  };
}

/** Fake bridge port recording every call in order. */
function fakePort(over: Partial<Record<keyof GlassesPort, () => Promise<boolean>>> = {}) {
  const log: string[] = [];
  const port: GlassesPort = {
    create: async (t) => (log.push(`create:${t}`), over.create ? over.create() : true),
    upgrade: async (t) => (log.push(`upgrade:${t}`), over.upgrade ? over.upgrade() : true),
  };
  return { port, log };
}

function setup(over: Parameters<typeof fakePort>[0] = {}, voice?: VoiceControl) {
  const store = fakeStore();
  const { port, log } = fakePort(over);
  let t = 0;
  const teardowns: TeardownReason[] = [];
  const debug: unknown[][] = [];
  const logFn: LogFn = (level, msg, ...data) => {
    if (level === 'debug') debug.push([msg, ...data]);
  };
  const c = createGlassesController({ port, store, text: store.text, now: () => t, onTeardown: (r) => teardowns.push(r), voice, log: logFn });
  const advance = async (ms: number) => {
    t += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };
  return { store, log, c, advance, teardowns, debug };
}

describe('glasses controller', () => {
  it('creates the page exactly once with the current text', async () => {
    const { c, log } = setup();
    await expect(c.start()).resolves.toBe(true);
    await expect(c.start()).resolves.toBe(false);
    expect(log).toEqual(['create:idle #1']);
    expect(c.queue.lastSent).toBe('idle #1');
  });

  it('reports a failed create and still accepts later updates', async () => {
    const { c, log, store, advance } = setup({ create: async () => false });
    await expect(c.start()).resolves.toBe(false);
    store.setHand('KQJ');
    await advance(100);
    expect(log).toEqual(['create:idle #1', 'upgrade:KQJ #1']);
  });

  it('store changes → one debounced upgrade with the latest text; unchanged text is skipped', async () => {
    const { c, log, store, advance } = setup();
    await c.start();
    store.setHand('K');
    store.setHand('KQ');
    store.setHand('KQJ');
    await advance(99);
    expect(log).toEqual(['create:idle #1']);
    await advance(1);
    expect(log).toEqual(['create:idle #1', 'upgrade:KQJ #1']);
    store.poke(); // a store change that doesn't change the text
    await advance(200);
    expect(log).toHaveLength(2);
  });

  it('updates during an in-flight create wait for it', async () => {
    let finish!: (ok: boolean) => void;
    const { c, log, store, advance } = setup({ create: () => new Promise((r) => (finish = r)) });
    const started = c.start();
    store.setHand('A');
    await advance(500);
    expect(log).toEqual(['create:idle #1']);
    finish(true);
    await started;
    await advance(0);
    expect(log).toEqual(['create:idle #1', 'upgrade:A #1']);
  });

  it('maps tap / swipes / double tap from either envelope to codeGesture, dropping only ≤ 80 ms duplicates', async () => {
    const { c, store, advance, log } = setup();
    await c.start();
    expect(c.handle(null, EVT.SCROLL_BOTTOM)).toBe('down');
    expect(c.handle(EVT.SCROLL_BOTTOM, null)).toBeNull(); // duplicate (same instant)
    await advance(81);
    expect(c.handle(EVT.SCROLL_BOTTOM, null)).toBe('down'); // a quick second ↓ counts
    await advance(100);
    expect(c.handle(null, EVT.SCROLL_TOP)).toBe('up');
    await advance(100);
    expect(c.handle(null, 8)).toBeNull(); // IMU and other unmapped types
    expect(c.handle(EVT.CLICK, null)).toBe('tap');
    expect(c.handle(EVT.DOUBLE, EVT.CLICK)).toBe('double'); // double wins over a click
    expect(store.gestures).toEqual(['down', 'down', 'up', 'tap', 'double']);
    expect(c.handle(null, null)).toBeNull();
    await advance(100);
    expect(log.at(-1)).toBe('upgrade:idle #6');
  });

  it('double tap never exits: no teardown, the page keeps updating', async () => {
    const { c, log, store, advance, teardowns } = setup();
    await c.start();
    expect(c.handle(EVT.DOUBLE, null)).toBe('double');
    await advance(100);
    expect(c.disposed).toBe(false);
    expect(teardowns).toEqual([]);
    expect(log).toEqual(['create:idle #1', 'upgrade:idle #2']);
    store.setHand('KQJ');
    await advance(100);
    expect(log.at(-1)).toBe('upgrade:KQJ #1');
  });

  it('logs every raw event at debug level with its time and the gap since the previous one', async () => {
    const { c, advance, debug } = setup();
    await c.start();
    c.handle(null, EVT.SCROLL_BOTTOM);
    await advance(30);
    c.handle(EVT.SCROLL_BOTTOM, null); // dropped, still logged
    await advance(200);
    c.handle(EVT.CLICK, null);
    const inputs = debug.filter((d) => d[0] === 'input').map((d) => d[1]);
    expect(inputs).toEqual([
      { sysType: null, textType: EVT.SCROLL_BOTTOM, action: 'down', accepted: true, t: 0, dt: null },
      { sysType: EVT.SCROLL_BOTTOM, textType: null, action: 'down', accepted: false, t: 30, dt: 30 },
      { sysType: EVT.CLICK, textType: null, action: 'tap', accepted: true, t: 230, dt: 200 },
    ]);
  });

  it('SYSTEM_EXIT (the system tap-then-hold) → teardown: unsubscribed, no more writes or input', async () => {
    const { c, log, store, advance, teardowns } = setup();
    await c.start();
    expect(c.handle(EVT.SYS_EXIT, null)).toBe('sysExit');
    expect(c.disposed).toBe(true);
    expect(teardowns).toEqual(['sysExit']);
    expect(store.listeners.size).toBe(0);
    expect(c.handle(null, EVT.SCROLL_BOTTOM)).toBeNull();
    store.setHand('X');
    await advance(500);
    expect(log).toEqual(['create:idle #1']);
    c.dispose();
    expect(teardowns).toEqual(['sysExit']);
  });

  it('ABNORMAL_EXIT also tears down', async () => {
    const { c, teardowns } = setup();
    await c.start();
    expect(c.handle(null, EVT.ABNORMAL_EXIT)).toBe('sysExit');
    expect(teardowns).toEqual(['sysExit']);
  });

  it('FG_ENTER force-re-sends the current text; FG_EXIT writes nothing', async () => {
    const { c, log, advance } = setup();
    await c.start();
    expect(c.handle(EVT.FG_EXIT, null)).toBe('fgExit');
    await advance(100);
    expect(log).toEqual(['create:idle #1']);
    expect(c.handle(EVT.FG_ENTER, null)).toBe('fgEnter');
    await advance(100);
    expect(log).toEqual(['create:idle #1', 'upgrade:idle #1']);
    expect(c.handle(EVT.FG_ENTER, null)).toBeNull(); // lifecycle dedupe 600 ms (U8)
  });

  it('dispose() (pagehide) tears down with reason "dispose"', async () => {
    const { c, teardowns, store } = setup();
    await c.start();
    c.dispose();
    expect(teardowns).toEqual(['dispose']);
    expect(store.listeners.size).toBe(0);
    await expect(c.start()).resolves.toBe(false);
  });
});

describe('glasses controller: voice (long press)', () => {
  const fakeVoice = () => {
    const calls: string[] = [];
    const voice: VoiceControl = {
      start: () => void calls.push('start'),
      stop: () => void calls.push('stop'),
      cancel: () => void calls.push('cancel'),
    };
    return { voice, calls };
  };

  it('long press → start, release → stop, from either envelope; a fast release is never dropped', async () => {
    const { voice, calls } = fakeVoice();
    const { c, advance } = setup({}, voice);
    await c.start();
    expect(c.handle(EVT.LONG_PRESS, null)).toBe('talkStart');
    expect(c.handle(null, EVT.LONG_PRESS)).toBeNull(); // duplicate press
    expect(c.handle(null, EVT.LONG_RELEASE)).toBe('talkEnd'); // same instant
    expect(c.handle(EVT.LONG_RELEASE, null)).toBeNull(); // duplicate release
    await advance(50);
    expect(c.handle(null, EVT.LONG_PRESS)).toBe('talkStart');
    expect(c.handle(EVT.LONG_RELEASE, EVT.CLICK)).toBe('talkEnd'); // not a tap
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
  });

  it('without a voice dep, long press does nothing', async () => {
    const { c, store } = setup();
    await c.start();
    expect(c.handle(EVT.LONG_PRESS, null)).toBeNull();
    expect(c.handle(EVT.LONG_RELEASE, null)).toBeNull();
    expect(store.codeGesture).not.toHaveBeenCalled();
  });

  it('a double tap while listening is a code gesture; it does not cancel voice', async () => {
    const { voice, calls } = fakeVoice();
    const { c, store } = setup({}, voice);
    await c.start();
    c.handle(EVT.LONG_PRESS, null);
    expect(c.handle(EVT.DOUBLE, null)).toBe('double');
    expect(store.gestures).toEqual(['double']);
    expect(c.handle(EVT.LONG_RELEASE, null)).toBe('talkEnd');
    expect(calls).toEqual(['start', 'stop']);
  });

  it('FOREGROUND_EXIT (backgrounded) while listening cancels voice, so the mic goes off', async () => {
    const { voice, calls } = fakeVoice();
    const { c, advance } = setup({}, voice);
    await c.start();
    c.handle(EVT.LONG_PRESS, null);
    await advance(50);
    expect(c.handle(EVT.FG_EXIT, null)).toBe('fgExit');
    expect(calls).toEqual(['start', 'cancel']);
    expect(c.disposed).toBe(false);
    await advance(700);
    expect(c.handle(EVT.FG_ENTER, null)).toBe('fgEnter');
    expect(calls).toEqual(['start', 'cancel']);
  });

  it('SYSTEM_EXIT and dispose cancel voice once; a throwing cancel still tears down', async () => {
    const a = fakeVoice();
    const one = setup({}, a.voice);
    await one.c.start();
    one.c.handle(EVT.SYS_EXIT, null);
    one.c.dispose();
    expect(a.calls).toEqual(['cancel']);
    const b = fakeVoice();
    const two = setup({}, b.voice);
    two.c.dispose();
    expect(b.calls).toEqual(['cancel']);
    const three = setup({}, { start() {}, stop() {}, cancel: () => { throw new Error('mic'); } });
    three.c.dispose();
    expect(three.teardowns).toEqual(['dispose']);
  });
});

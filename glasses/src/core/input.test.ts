import { describe, expect, it } from 'vitest';
import { CODE_INPUTS, DUPLICATE_MS, EVT, SWIPE_MAP, createInputGate, mapInput } from './input.ts';

describe('mapInput', () => {
  it('matches the SDK OsEventTypeList numbers', () => {
    expect(EVT).toEqual({
      CLICK: 0, SCROLL_TOP: 1, SCROLL_BOTTOM: 2, DOUBLE: 3, FG_ENTER: 4, FG_EXIT: 5, ABNORMAL_EXIT: 6, SYS_EXIT: 7,
      LONG_PRESS: 9, LONG_RELEASE: 10,
    });
  });

  it('maps each event from either envelope', () => {
    const cases: [number, string][] = [
      [EVT.CLICK, 'tap'],
      [EVT.SCROLL_TOP, 'up'],
      [EVT.SCROLL_BOTTOM, 'down'],
      [EVT.DOUBLE, 'double'],
      [EVT.FG_ENTER, 'fgEnter'],
      [EVT.FG_EXIT, 'fgExit'],
      [EVT.SYS_EXIT, 'sysExit'],
      [EVT.ABNORMAL_EXIT, 'sysExit'],
      [EVT.LONG_PRESS, 'talkStart'],
      [EVT.LONG_RELEASE, 'talkEnd'],
    ];
    for (const [t, action] of cases) {
      expect(mapInput(t, null)).toBe(action);
      expect(mapInput(null, t)).toBe(action);
    }
  });

  it('swipes: SCROLL_TOP = ↑, SCROLL_BOTTOM = ↓; the four code inputs', () => {
    expect(SWIPE_MAP).toEqual({ scrollTop: 'up', scrollBottom: 'down' });
    expect([...CODE_INPUTS].sort()).toEqual(['double', 'down', 'tap', 'up']);
  });

  it('double tap is checked before tap, and never means exit', () => {
    expect(mapInput(EVT.CLICK, EVT.DOUBLE)).toBe('double');
    expect(mapInput(EVT.DOUBLE, EVT.CLICK)).toBe('double');
    expect(mapInput(EVT.CLICK, EVT.SCROLL_BOTTOM)).toBe('down');
  });

  it('nothing or unknown types → null', () => {
    expect(mapInput(null, null)).toBeNull();
    expect(mapInput(8, null)).toBeNull(); // IMU
    expect(mapInput(11, null)).toBeNull();
  });
});

describe('mapInput: long press', () => {
  it('beats a CLICK in the other envelope (an envelope without eventType reads as CLICK)', () => {
    expect(mapInput(EVT.LONG_PRESS, EVT.CLICK)).toBe('talkStart');
    expect(mapInput(EVT.CLICK, EVT.LONG_RELEASE)).toBe('talkEnd');
    expect(mapInput(EVT.LONG_PRESS, EVT.LONG_RELEASE)).toBe('talkEnd');
    expect(mapInput(EVT.LONG_PRESS, EVT.DOUBLE)).toBe('double');
  });
});

describe('createInputGate', () => {
  const clock = () => {
    let t = 1000;
    return { now: () => t, at: (ms: number) => (t = ms) };
  };

  it('one constant: 80 ms', () => {
    expect(DUPLICATE_MS).toBe(80);
  });

  it('drops only true duplicates: the same action within ≤ 80 ms', () => {
    const c = clock();
    const g = createInputGate({ now: c.now });
    for (const a of ['tap', 'double', 'up', 'down'] as const) {
      c.at(c.now() + 1000);
      const t0 = c.now();
      expect(g.accept(a)).toBe(true);
      c.at(t0 + DUPLICATE_MS);
      expect(g.accept(a)).toBe(false);
      c.at(t0 + DUPLICATE_MS + 1);
      expect(g.accept(a)).toBe(true);
    }
  });

  it('a quick ↓ ↓ (and ↑ ↑) at a human pace both count', () => {
    const c = clock();
    const g = createInputGate({ now: c.now });
    expect(g.accept('down')).toBe(true);
    c.at(1120);
    expect(g.accept('down')).toBe(true);
    c.at(1240);
    expect(g.accept('up')).toBe(true);
    c.at(1340);
    expect(g.accept('up')).toBe(true);
  });

  it('swipe cooldown across directions is no longer than the duplicate window', () => {
    const c = clock();
    const g = createInputGate({ now: c.now });
    expect(g.accept('down')).toBe(true);
    c.at(1050);
    expect(g.accept('up')).toBe(false);
    expect(g.accept('tap')).toBe(true); // taps aren't throttled by swipes
    expect(g.accept('double')).toBe(true); // nor is a double tap by a tap
    c.at(1081);
    expect(g.accept('up')).toBe(true);
  });

  it('dedupes lifecycle events for 600 ms', () => {
    const c = clock();
    const g = createInputGate({ now: c.now });
    expect(g.accept('fgExit')).toBe(true);
    c.at(1500);
    expect(g.accept('fgExit')).toBe(false);
    expect(g.accept('sysExit')).toBe(true);
    c.at(1600);
    expect(g.accept('fgExit')).toBe(true);
  });

  it('a dropped event does not extend the window', () => {
    const c = clock();
    const g = createInputGate({ now: c.now });
    g.accept('tap');
    c.at(1050);
    g.accept('tap'); // dropped
    c.at(1081);
    expect(g.accept('tap')).toBe(true);
  });
});

describe('createInputGate: talk', () => {
  it('a release right after a press is never dropped; repeats are', () => {
    let t = 1000;
    const g = createInputGate({ now: () => t });
    expect(g.accept('talkStart')).toBe(true);
    expect(g.accept('talkStart')).toBe(false); // duplicate press
    t += 1;
    expect(g.accept('talkEnd')).toBe(true); // 1 ms later: still accepted
    expect(g.accept('talkEnd')).toBe(false); // duplicate release
    t += 1;
    expect(g.accept('talkStart')).toBe(true); // a new press after a release
    expect(g.accept('talkEnd')).toBe(true);
    t += 300;
    expect(g.accept('talkEnd')).toBe(true); // a stray release after the window passes (stop is idempotent)
    expect(g.accept('tap')).toBe(true); // talk doesn't throttle taps or swipes
    expect(g.accept('down')).toBe(true);
  });
});

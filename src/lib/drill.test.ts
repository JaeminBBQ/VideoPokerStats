import { describe, expect, it } from 'vitest';
import { GAMES, mulberry32 } from '../engine/index.ts';
import type { HandRecord } from './stats.ts';
import {
  applyDrillResult,
  applyNewMistake,
  confusionKey,
  drillSessionStats,
  groupConfusions,
  pickConfusion,
  type Confusion,
  type DrillState,
} from './drill.ts';

// 2c 3d 4d 5d 6h: best is 2c 3d 4d 5d ("1 deuce + 4 to a Straight Flush (1 way)"), holding all 5 is
// "Pat Straight" (the worst chart error for NSUD). Defaults make a mistake: evBest - evHeld = 0.2.
const rec = (over: Partial<HandRecord>): HandRecord => ({
  ts: 0,
  gameId: 'nsud',
  hand: [0, 5, 9, 13, 18],
  heldMask: 31,
  bestMask: 15,
  evHeld: 0.4,
  evBest: 0.6,
  mode: 'deal',
  ...over,
});

describe('confusionKey', () => {
  it('uses chart vocabulary for deuces games', () => {
    expect(confusionKey(rec({}), GAMES.nsud)).toBe('1|d1:sf4w1|made:Straight');
  });

  it('is the same for the same mistake dealt in a different order', () => {
    // Same five cards permuted; masks adjusted so best (2c 3d 4d 5d) and chosen (all) are unchanged.
    const permuted = rec({ hand: [9, 5, 18, 0, 13], bestMask: 27, heldMask: 31 });
    expect(confusionKey(permuted, GAMES.nsud)).toBe(confusionKey(rec({}), GAMES.nsud));
  });

  it('groups by hand and held cards (not masks) for games without a chart', () => {
    const a = rec({ gameId: 'joker-kings', hand: [4, 0, 12, 8, 16], bestMask: 5, heldMask: 5 });
    const b = rec({ gameId: 'joker-kings', hand: [12, 4, 16, 8, 0], bestMask: 3, heldMask: 3 });
    expect(confusionKey(a, GAMES['joker-kings'])).toBe('hand:0,4,8,12,16|4,12');
    expect(confusionKey(b, GAMES['joker-kings'])).toBe(confusionKey(a, GAMES['joker-kings']));
  });
});

describe('groupConfusions', () => {
  it('groups only mistakes, across deal and drill, sorted by EV lost', () => {
    const history = [
      rec({ ts: 100, evHeld: 0.5, evBest: 0.7 }), // key A, lost 0.2
      rec({ ts: 200, evHeld: 0.6, evBest: 0.7, mode: 'drill' }), // key A, lost 0.1
      rec({ ts: 150, heldMask: 0, evHeld: 0.4, evBest: 0.45 }), // key B, lost 0.05
      rec({ ts: 90, evHeld: 0.7, evBest: 0.7 }), // optimal — excluded
      rec({ ts: 300, gameId: 'fpdw' }), // other game — excluded
    ];
    const groups = groupConfusions(history, GAMES.nsud);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('1|d1:sf4w1|made:Straight');
    expect(groups[0].count).toBe(2);
    expect(groups[0].evLost).toBeCloseTo(0.3, 12);
    expect(groups[0].lastTs).toBe(200);
    expect(groups[0].example).toBe(history[1]);
    expect(groups[0].signature).toEqual({
      section: 1,
      sectionLabel: '1 deuce',
      bestKey: 'd1:sf4w1',
      chosenKey: 'made:Straight',
      bestLabel: '1 deuce + 4 to a Straight Flush (1 way)',
      chosenLabel: 'Pat Straight',
    });
    expect(groups[1].key).toBe('1|d1:sf4w1|none');
    expect(groups[1].count).toBe(1);
    expect(groups[1].evLost).toBeCloseTo(0.05, 12);
    expect(groups[1].lastTs).toBe(150);
    expect(groups[1].signature?.chosenKey).toBe('none');
  });

  it('returns an empty list with no mistakes', () => {
    expect(groupConfusions([rec({ evHeld: 0.6, evBest: 0.6 })], GAMES.nsud)).toEqual([]);
  });
});

describe('applyDrillResult', () => {
  it('builds a streak and clears after three correct in a row', () => {
    let s: DrillState = {};
    s = applyDrillResult(s, 'nsud', 'k', true);
    expect(s.nsud?.k).toEqual({ streak: 1, cleared: false });
    s = applyDrillResult(s, 'nsud', 'k', true);
    expect(s.nsud?.k).toEqual({ streak: 2, cleared: false });
    s = applyDrillResult(s, 'nsud', 'k', true);
    expect(s.nsud?.k).toEqual({ streak: 3, cleared: true });
    s = applyDrillResult(s, 'nsud', 'k', true);
    expect(s.nsud?.k).toEqual({ streak: 4, cleared: true });
  });

  it('resets on a wrong answer, even from cleared', () => {
    const s: DrillState = { nsud: { k: { streak: 3, cleared: true } } };
    expect(applyDrillResult(s, 'nsud', 'k', false).nsud?.k).toEqual({ streak: 0, cleared: false });
  });

  it('does not mutate the input', () => {
    const s: DrillState = { nsud: { k: { streak: 1, cleared: false } } };
    const out = applyDrillResult(s, 'nsud', 'k', true);
    expect(s.nsud?.k).toEqual({ streak: 1, cleared: false });
    expect(out).not.toBe(s);
  });
});

describe('applyNewMistake', () => {
  it('reopens a cleared confusion', () => {
    const s: DrillState = { nsud: { k: { streak: 3, cleared: true } } };
    expect(applyNewMistake(s, 'nsud', 'k').nsud?.k).toEqual({ streak: 0, cleared: false });
  });

  it('resets a streak in progress', () => {
    const s: DrillState = { nsud: { k: { streak: 2, cleared: false } } };
    expect(applyNewMistake(s, 'nsud', 'k').nsud?.k).toEqual({ streak: 0, cleared: false });
  });

  it('leaves untouched confusions alone', () => {
    const s: DrillState = {};
    expect(applyNewMistake(s, 'nsud', 'k')).toBe(s);
  });
});

const conf = (key: string, evLost: number): Confusion => ({
  key,
  signature: null,
  count: 1,
  evLost,
  lastTs: 0,
  example: rec({}),
});

describe('pickConfusion', () => {
  const confusions = [conf('a', 0.9), conf('b', 0.1), conf('c', 0.5)];
  const empty: DrillState = {};

  it('returns null when the pool is empty or everything is cleared', () => {
    expect(pickConfusion([], empty, 'nsud', mulberry32(1))).toBeNull();
    const allCleared: DrillState = {
      nsud: { a: { streak: 3, cleared: true }, b: { streak: 3, cleared: true }, c: { streak: 3, cleared: true } },
    };
    expect(pickConfusion(confusions, allCleared, 'nsud', mulberry32(1))).toBeNull();
  });

  it('skips cleared confusions', () => {
    const state: DrillState = { nsud: { a: { streak: 3, cleared: true }, b: { streak: 3, cleared: true } } };
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      expect(pickConfusion(confusions, state, 'nsud', rng)?.key).toBe('c');
    }
  });

  it('avoids repeating lastKey when another is available', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      expect(pickConfusion(confusions, empty, 'nsud', rng, 'c')?.key).not.toBe('c');
    }
  });

  it('uses lastKey when it is the only one left', () => {
    const state: DrillState = { nsud: { a: { streak: 3, cleared: true }, b: { streak: 3, cleared: true } } };
    expect(pickConfusion(confusions, state, 'nsud', mulberry32(1), 'c')?.key).toBe('c');
  });

  it('is weighted by evLost: a 9× confusion is picked more than a 1× one', () => {
    const rng = mulberry32(42);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickConfusion([conf('a', 0.9), conf('b', 0.1)], empty, 'nsud', rng)?.key === 'a') a++;
      else b++;
    }
    expect(a + b).toBe(1000);
    expect(a).toBeGreaterThan(b);
  });
});

describe('drillSessionStats', () => {
  it('counts only this session’s drill hands for the game', () => {
    const history = [
      rec({ ts: 50, mode: 'drill', evHeld: 0.6, evBest: 0.7 }), // before the session
      rec({ ts: 150, mode: 'drill', evHeld: 0.6, evBest: 0.7 }), // wrong
      rec({ ts: 160, mode: 'drill', evHeld: 0.7, evBest: 0.7 }), // correct
      rec({ ts: 170, evHeld: 0.6, evBest: 0.7 }), // deal mode — excluded
      rec({ ts: 180, gameId: 'fpdw', mode: 'drill' }), // other game — excluded
    ];
    expect(drillSessionStats(history, 'nsud', 100)).toEqual({ hands: 2, correct: 1 });
  });
});

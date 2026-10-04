import { describe, expect, it } from 'vitest';
import { errorRate, HISTORY_CAP, recordHand, resetGame, type HandRecord, type TrainerState } from './stats.ts';

const record = (over: Partial<HandRecord>): HandRecord => ({
  ts: 0,
  gameId: 'nsud',
  hand: [0, 4, 8, 12, 16],
  heldMask: 1,
  bestMask: 1,
  evHeld: 1.2,
  evBest: 1.2,
  mode: 'deal',
  ...over,
});

const empty = (): TrainerState => ({ history: [], totals: {} });

describe('recordHand', () => {
  it('appends to history newest last without mutating the input', () => {
    const before = empty();
    const after = recordHand(before, record({ ts: 1 }));
    expect(before.history).toHaveLength(0);
    expect(after.history).toHaveLength(1);
    expect(after.history[0].ts).toBe(1);
  });

  it('counts an optimal hand without mistakes or EV lost', () => {
    const after = recordHand(empty(), record({ evHeld: 1.2345, evBest: 1.2345 }));
    expect(after.totals.nsud).toEqual({ hands: 1, mistakes: 0, evLost: 0 });
  });

  it('counts a mistake and the exact EV lost', () => {
    const after = recordHand(empty(), record({ evHeld: 0.9876, evBest: 1.2345 }));
    expect(after.totals.nsud).toMatchObject({ hands: 1, mistakes: 1 });
    expect(after.totals.nsud?.evLost).toBeCloseTo(0.2469, 12);
  });

  it('accumulates totals across hands and games separately', () => {
    const one = recordHand(empty(), record({ evHeld: 0.5, evBest: 1 }));
    const two = recordHand(one, record({ evHeld: 1, evBest: 1 }));
    const three = recordHand(two, record({ gameId: 'fpdw', evHeld: 2, evBest: 3 }));
    expect(three.totals.nsud).toEqual({ hands: 2, mistakes: 1, evLost: 0.5 });
    expect(three.totals.fpdw).toEqual({ hands: 1, mistakes: 1, evLost: 1 });
  });

  it('caps history at 5000 records, dropping the oldest', () => {
    let state = empty();
    for (let i = 0; i < HISTORY_CAP; i++) state = recordHand(state, record({ ts: i }));
    expect(state.history).toHaveLength(HISTORY_CAP);
    expect(state.history[0].ts).toBe(0);
    const after = recordHand(state, record({ ts: HISTORY_CAP }));
    expect(after.history).toHaveLength(HISTORY_CAP);
    expect(after.history[0].ts).toBe(1);
    expect(after.history[HISTORY_CAP - 1].ts).toBe(HISTORY_CAP);
    // Totals survive the cap untouched.
    expect(after.totals.nsud?.hands).toBe(HISTORY_CAP + 1);
  });

  it('records drill hands in history but leaves totals alone (D7)', () => {
    let state = recordHand(empty(), record({ evHeld: 0.5, evBest: 1 }));
    state = recordHand(state, record({ ts: 1, mode: 'drill', evHeld: 0.5, evBest: 1 }));
    expect(state.history).toHaveLength(2);
    expect(state.totals.nsud).toEqual({ hands: 1, mistakes: 1, evLost: 0.5 });
    // A drill-only session records no totals at all.
    const only = recordHand(empty(), record({ mode: 'drill' }));
    expect(only.history).toHaveLength(1);
    expect(only.totals.nsud).toBeUndefined();
  });
});

describe('errorRate', () => {
  it('is 0 when no hands have been played', () => {
    expect(errorRate({ hands: 0, mistakes: 0, evLost: 0 })).toBe(0);
  });

  it('returns the mistake percentage', () => {
    expect(errorRate({ hands: 12, mistakes: 3, evLost: 1 })).toBe(25);
    expect(errorRate({ hands: 8, mistakes: 0, evLost: 0 })).toBe(0);
  });
});

describe('resetGame', () => {
  it('clears one game and leaves the others alone', () => {
    const state: TrainerState = {
      history: [record({ gameId: 'nsud' }), record({ gameId: 'fpdw' }), record({ gameId: 'nsud' })],
      totals: { nsud: { hands: 2, mistakes: 1, evLost: 0.5 }, fpdw: { hands: 1, mistakes: 0, evLost: 0 } },
    };
    const after = resetGame(state, 'nsud');
    expect(after.history.map((r) => r.gameId)).toEqual(['fpdw']);
    expect(after.totals.nsud).toBeUndefined();
    expect(after.totals.fpdw).toEqual({ hands: 1, mistakes: 0, evLost: 0 });
    expect(state.history).toHaveLength(3);
    expect(state.totals.nsud).toBeDefined();
  });
});

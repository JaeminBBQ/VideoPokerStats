import { describe, expect, it } from 'vitest';
import { EV_EPSILON, type HoldEv } from '../engine/index.ts';
import { competitionRanks, grade } from './grade.ts';

const hev = (mask: number, ev: number): HoldEv => ({ mask, held: [], ev });

describe('grade', () => {
  it('marks the unique best hold optimal', () => {
    const holds = [hev(1, 5), hev(2, 4.75), hev(0, 4.5)];
    const g = grade(holds, 1);
    expect(g.optimal).toBe(true);
    expect(g.bestMask).toBe(1);
    expect(g.evBest).toBe(5);
    expect(g.evHeld).toBe(5);
    expect(g.evLost).toBe(0);
    expect(g.rank).toBe(1);
    expect(g.optimalMasks).toEqual([1]);
  });

  it('marks a suboptimal hold a mistake with the EV cost', () => {
    const holds = [hev(1, 1.2345), hev(0, 0.9876), hev(4, 0.5)];
    const g = grade(holds, 0);
    expect(g.optimal).toBe(false);
    expect(g.bestMask).toBe(1);
    expect(g.evHeld).toBe(0.9876);
    expect(g.evLost).toBeCloseTo(0.2469, 12);
    expect(g.rank).toBe(2);
    expect(g.optimalMasks).toEqual([1]);
  });

  it('treats holds within EV_EPSILON of the best as tied optimal', () => {
    const holds = [hev(2, 1.5), hev(5, 1.5), hev(1, 1.2)];
    const g = grade(holds, 5);
    expect(g.optimal).toBe(true);
    expect(g.evLost).toBe(0);
    expect(g.rank).toBe(1);
    expect(g.optimalMasks).toEqual([2, 5]);
  });

  it('does not treat a near-but-not-exact tie as optimal', () => {
    const holds = [hev(2, 1.5), hev(5, 1.5 - 2 * EV_EPSILON)];
    const g = grade(holds, 5);
    expect(g.optimal).toBe(false);
    expect(g.rank).toBe(2);
    expect(g.evLost).toBeCloseTo(2 * EV_EPSILON, 15);
  });

  it('gives tied holds the same competition rank', () => {
    // EV order: 3 (rank 1), 2 and 2 (rank 2), 1 (rank 4).
    const holds = [hev(1, 3), hev(2, 2), hev(4, 2), hev(8, 1)];
    expect(competitionRanks(holds)).toEqual([1, 2, 2, 4]);
    expect(grade(holds, 4).rank).toBe(2);
    expect(grade(holds, 8).rank).toBe(4);
  });

  it('ranks a hold below a tie group by its position, not its count', () => {
    // Best two tie: 1, 1, then the third-best hold gets rank 3.
    const holds = [hev(1, 5), hev(2, 5), hev(4, 4), hev(8, 3)];
    const g = grade(holds, 4);
    expect(g.optimal).toBe(false);
    expect(g.rank).toBe(3);
    expect(g.optimalMasks).toEqual([1, 2]);
  });

  it('accepts holding nothing ("draw five") as a legal hold', () => {
    const holds = [hev(0, 3.2), hev(1, 3.0), hev(2, 2.9)];
    const g = grade(holds, 0);
    expect(g.optimal).toBe(true);
    expect(g.bestMask).toBe(0);
    expect(g.rank).toBe(1);
    expect(g.evLost).toBe(0);
  });
});

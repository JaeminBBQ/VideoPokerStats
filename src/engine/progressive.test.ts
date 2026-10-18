import { describe, expect, it } from 'vitest';
import { GAMES } from './games.ts';
import { interpolateReturn, meterFromRoyalPerCoin, royalPerCoinFromMeter, withRoyal, type ProgressiveCurve } from './progressive.ts';
import { PROGRESSIVE_CURVES, breakEvenMeter, returnAtMeter } from '../lib/progressive.ts';

describe('progressive royals (D35)', () => {
  it('converts the photographed meter to pays per coin and back', () => {
    // #20047: $229.79 for a 5-coin 5¢ royal (base $200 = 800 per coin).
    expect(royalPerCoinFromMeter(229.79, 0.05, 5)).toBeCloseTo(919.16, 10);
    expect(royalPerCoinFromMeter(200, 0.05, 5)).toBeCloseTo(800, 10);
    expect(meterFromRoyalPerCoin(800, 1, 5)).toBe(4000);
  });

  it('reprices only the natural royal', () => {
    const g = withRoyal(GAMES['lb-job-9-5'], 919);
    expect(g.rows[0].pays).toBe(919);
    expect(g.rows.slice(1)).toEqual(GAMES['lb-job-9-5'].rows.slice(1));
    expect(GAMES['lb-job-9-5'].rows[0].pays).toBe(800);
  });

  it('interpolates between grid points and clamps at the ends', () => {
    const c: ProgressiveCurve = { points: [{ royal: 800, return: 0.98 }, { royal: 850, return: 0.99 }], breakEvenRoyal: 900 };
    expect(interpolateReturn(c, 825)).toBeCloseTo(0.985, 12);
    expect(interpolateReturn(c, 700)).toBe(0.98);
    expect(interpolateReturn(c, 9999)).toBe(0.99);
  });

  it('has a curve for every game with a progressive offer, starting at its published return', () => {
    for (const g of Object.values(GAMES).filter((g) => g.offers.some((o) => o.progressive))) {
      const c = PROGRESSIVE_CURVES[g.id]!;
      expect(c, g.id).toBeDefined();
      expect(Math.abs(c.points[0].return - g.publishedReturn) * 100).toBeLessThanOrEqual(0.5 * 10 ** -g.publishedDecimals + 1e-9);
      // Rising, and 100% sits at the break-even royal.
      for (let i = 1; i < c.points.length; i++) expect(c.points[i].return).toBeGreaterThan(c.points[i - 1].return);
      if (c.breakEvenRoyal <= 2000) expect(interpolateReturn(c, c.breakEvenRoyal)).toBeCloseTo(1, 3);
    }
  });

  it('reads the photographed #20047 meter as a higher return than the base royal', () => {
    const offer = GAMES['lb-job-9-5'].offers[0];
    const atMeter = returnAtMeter('lb-job-9-5', offer, offer.meterSeen!.dollars)!;
    expect(atMeter).toBeGreaterThan(GAMES['lb-job-9-5'].publishedReturn);
    expect(atMeter).toBeLessThan(1);
    expect(breakEvenMeter('lb-job-9-5', offer)!).toBeGreaterThan(offer.meterSeen!.dollars);
  });
});

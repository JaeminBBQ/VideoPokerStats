import { describe, expect, it } from 'vitest';
import { GAME_LIST } from '../engine/index.ts';
import { RISK, bankrollBets, betsToCents, nearestErrorRate, riskFor } from './riskData.ts';

describe('risk data', () => {
  it('covers every game, error rate, horizon and target', () => {
    for (const g of GAME_LIST) {
      expect(riskFor(g.id)?.returnBest).toBeCloseTo(g.publishedReturn, 4);
      for (const e of RISK.errorRates)
        for (const h of RISK.horizons)
          for (const t of RISK.targets) expect(bankrollBets(g.id, e, h, t)).toBeGreaterThan(0);
    }
  });

  it('matches the verified headline numbers (D14, simulation-checked)', () => {
    expect(bankrollBets('job-8-5', 0, 2000, 0.95)).toBe(238);
    expect(bankrollBets('job-8-5', 0.01, 2000, 0.95)).toBe(241);
    expect(bankrollBets('lb-deuces-16-13', 0, 2000, 0.95)).toBe(311);
    expect(bankrollBets('bpd-7-5', 0.01, 10000, 0.95)).toBe(1261);
  });

  it('needs more with more hands, a higher target, or more errors', () => {
    for (const g of GAME_LIST) {
      expect(bankrollBets(g.id, 0, 500, 0.95)!).toBeLessThan(bankrollBets(g.id, 0, 2000, 0.95)!);
      expect(bankrollBets(g.id, 0, 2000, 0.9)!).toBeLessThan(bankrollBets(g.id, 0, 2000, 0.99)!);
      expect(bankrollBets(g.id, 0, 10000, 0.95)!).toBeLessThanOrEqual(bankrollBets(g.id, 0.02, 10000, 0.95)!);
    }
  });

  it('snaps to the nearest error-rate column and converts to cents', () => {
    expect(nearestErrorRate(0)).toBe(0);
    expect(nearestErrorRate(0.012)).toBe(0.01);
    expect(nearestErrorRate(0.004)).toBe(0.005);
    expect(nearestErrorRate(0.09)).toBe(0.02);
    expect(betsToCents(238, 0.05, 5)).toBe(5950); // $59.50
    expect(betsToCents(241, 1, 5)).toBe(120500);
  });

  it('returns undefined for combinations not in the data', () => {
    expect(bankrollBets('job-8-5', 0.03, 2000, 0.95)).toBeUndefined();
    expect(bankrollBets('job-8-5', 0, 1234, 0.95)).toBeUndefined();
  });
});

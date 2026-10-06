import { describe, expect, it } from 'vitest';
import {
  bankrollNeeded,
  capSensitivity,
  collapseOutcomes,
  mixDistribution,
  moments,
  survivalTable,
  survivalTables,
} from './risk.ts';

/** Brute force: enumerate every outcome sequence of length n. */
function bruteSurvival(pays: number[], probs: number[], n: number, b: number): number {
  if (n === 0) return 1;
  if (b < 1) return 0;
  let s = 0;
  for (let k = 0; k < pays.length; k++) s += probs[k] * bruteSurvival(pays, probs, n - 1, b - 1 + pays[k]);
  return s;
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Fair +/-1 walk from b: P(no ruin in n hands) = 1 - P(hit 0 within n-1 steps) via the reflection principle. */
function reflectionSurvival(n: number, b: number): number {
  if (n === 0) return 1;
  if (b < 1) return 0;
  const m = n - 1;
  let pLt0 = 0;
  let pEq0 = 0;
  for (let up = 0; up <= m; up++) {
    const x = b + up - (m - up);
    const p = binom(m, up) / 2 ** m;
    if (x < 0) pLt0 += p;
    else if (x === 0) pEq0 += p;
  }
  return 1 - (2 * pLt0 + pEq0);
}

const COIN = { pays: [2, 0], probs: [0.5, 0.5] };
// A small game shaped like video poker: mostly losses, some pushes, rare big wins.
const TOY = { pays: [0, 1, 2, 3, 25], probs: [0.55, 0.21, 0.13, 0.1, 0.01] };

describe('mixDistribution', () => {
  it('mixes and sums to 1', () => {
    const best = [0.1, 0.2, 0.7];
    const second = [0.05, 0.15, 0.8];
    for (const e of [0, 0.01, 0.5, 1]) {
      const m = mixDistribution(best, second, e);
      expect(m.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 14);
    }
    expect(mixDistribution(best, second, 0)).toEqual(best);
    expect(mixDistribution(best, second, 1)).toEqual(second);
    expect(mixDistribution(best, second, 0.25)[2]).toBeCloseTo(0.75 * 0.7 + 0.25 * 0.8, 15);
  });
  it('rejects bad input', () => {
    expect(() => mixDistribution([1], [0.5, 0.5], 0)).toThrow();
    expect(() => mixDistribution([1], [1], 1.5)).toThrow();
  });
});

describe('collapseOutcomes / moments', () => {
  it('merges equal pays', () => {
    const c = collapseOutcomes([3, 0, 3, 1, 0], [0.1, 0.4, 0.2, 0.3, 0]);
    expect(c.pays).toEqual([0, 1, 3]);
    expect(c.probs[2]).toBeCloseTo(0.3, 15);
  });
  it('rejects non-integer pays and bad sums', () => {
    expect(() => collapseOutcomes([1.5, 0], [0.5, 0.5])).toThrow();
    expect(() => collapseOutcomes([1, 0], [0.5, 0.4])).toThrow();
  });
  it('coin flip has return 1 and sd 1', () => {
    expect(moments(COIN.pays, COIN.probs)).toEqual({ ret: 1, sd: 1 });
  });
});

describe('survivalTable: exact small cases', () => {
  it('coin flip by hand', () => {
    expect(survivalTable(COIN.pays, COIN.probs, 0, 3)[0]).toBe(1); // no hands: can't go broke
    const s1 = survivalTable(COIN.pays, COIN.probs, 1, 3);
    expect([...s1]).toEqual([0, 1, 1, 1]);
    const s2 = survivalTable(COIN.pays, COIN.probs, 2, 3);
    expect([...s2]).toEqual([0, 0.5, 1, 1]);
    const s3 = survivalTable(COIN.pays, COIN.probs, 3, 3);
    expect([...s3]).toEqual([0, 0.5, 0.75, 1]);
    const s4 = survivalTable(COIN.pays, COIN.probs, 4, 3);
    expect([...s4]).toEqual([0, 0.375, 0.75, 0.875]);
  });

  it('coin flip matches the reflection principle for long horizons', () => {
    for (const n of [1, 2, 7, 50, 201]) {
      const s = survivalTable(COIN.pays, COIN.probs, n, 40);
      for (const b of [0, 1, 2, 5, 13, 40]) expect(s[b]).toBeCloseTo(reflectionSurvival(n, b), 12);
    }
  });

  it('toy game matches brute-force enumeration', () => {
    for (const n of [1, 2, 3, 5, 7]) {
      const s = survivalTable(TOY.pays, TOY.probs, n, 8);
      for (let b = 0; b <= 8; b++) expect(s[b]).toBeCloseTo(bruteSurvival(TOY.pays, TOY.probs, n, b), 13);
    }
  });

  it('a game that always pays 1 never ruins', () => {
    const s = survivalTable([1], [1], 5000, 10);
    expect(s[0]).toBe(0);
    for (let b = 1; b <= 10; b++) expect(s[b]).toBe(1);
  });

  it('a game that always loses survives exactly b hands', () => {
    const s = survivalTable([0], [1], 5, 8);
    expect([...s]).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1]);
  });
});

describe('survivalTable: structure', () => {
  const horizons = [0, 1, 10, 100, 1000];
  const tabs = survivalTables(TOY.pays, TOY.probs, horizons, 300);

  it('multi-horizon pass equals separate passes', () => {
    for (let h = 0; h < horizons.length; h++) {
      const single = survivalTable(TOY.pays, TOY.probs, horizons[h], 300);
      expect([...tabs[h]]).toEqual([...single]);
    }
  });

  it('non-decreasing in bankroll, non-increasing in hands, within [0,1]', () => {
    for (const s of tabs) {
      for (let b = 1; b < s.length; b++) expect(s[b]).toBeGreaterThanOrEqual(s[b - 1] - 1e-15);
      for (const x of s) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
    for (let h = 1; h < tabs.length; h++)
      for (let b = 0; b <= 300; b++) expect(tabs[h][b]).toBeLessThanOrEqual(tabs[h - 1][b] + 1e-15);
  });

  it('truncation only understates survival and is negligible with the default margin', () => {
    const tight = survivalTables(TOY.pays, TOY.probs, [1000], 300, 0)[0];
    const loose = survivalTables(TOY.pays, TOY.probs, [1000], 300, 3000)[0];
    for (let b = 0; b <= 300; b++) expect(tight[b]).toBeLessThanOrEqual(loose[b] + 1e-15);
    const diffs = capSensitivity(TOY.pays, TOY.probs, [100, 1000], 300);
    for (const d of diffs) expect(d).toBeLessThan(1e-12);
  });
});

describe('bankrollNeeded', () => {
  it('finds the smallest bankroll meeting the target', () => {
    const s = survivalTable(COIN.pays, COIN.probs, 4, 3); // [0, .375, .75, .875]
    expect(bankrollNeeded(s, 0.3)).toBe(1);
    expect(bankrollNeeded(s, 0.75)).toBe(2);
    expect(bankrollNeeded(s, 0.8)).toBe(3);
    expect(bankrollNeeded(s, 0.9)).toBe(-1);
  });
  it('rejects a non-monotone table', () => {
    expect(() => bankrollNeeded([0, 0.5, 0.4, 0.9], 0.9)).toThrow();
  });
});

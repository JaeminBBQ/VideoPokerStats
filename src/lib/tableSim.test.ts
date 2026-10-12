import { describe, expect, it } from 'vitest';
import { leaveOdds, leaveOddsTiered } from '../engine/leave.ts';
import { ODDS_BY_GAME } from './odds.ts';
import { exactTable, runTableMany, runTableSession, tableEdge, tableLeaveAdvice, tableModel, type TableSimParams } from './tableSim.ts';

describe('leaveOddsTiered (D29)', () => {
  it('matches leaveOdds exactly on video poker (one tier, whole bets)', () => {
    const rows = ODDS_BY_GAME['gsr-job-9-5']!.perRow;
    const pays = rows.map((r) => r.pays);
    const probs = rows.map((r) => r.best);
    const steps = new Map<number, number>();
    pays.forEach((v, i) => probs[i] > 0 && steps.set(v - 1, (steps.get(v - 1) ?? 0) + probs[i]));
    const tiers = [{ coverUnits: 1, steps: [...steps] }];
    for (const rule of [
      { winBets: Infinity, lossBets: Infinity, maxHands: 600 },
      { winBets: 50, lossBets: Infinity, maxHands: 1200 },
      { winBets: Infinity, lossBets: 40, maxHands: 1200 },
      { winBets: 30, lossBets: 30, maxHands: 2400 },
    ]) {
      const a = leaveOdds(pays, probs, 100, rule)!;
      const b = leaveOddsTiered(tiers, 100, 1, { winUnits: rule.winBets, lossUnits: rule.lossBets, maxRounds: rule.maxHands })!;
      for (const k of ['pWin', 'pLossLimit', 'pBroke', 'pTime', 'pAhead', 'expHands', 'expNetBets'] as const)
        expect(b[k], `${JSON.stringify(rule)} ${k}`).toBeCloseTo(a[k], 9);
    }
  });

  it('a fair ±1 coin: textbook gambler’s ruin', () => {
    const tiers = [{ coverUnits: 1, steps: [[1, 0.5], [-1, 0.5]] as [number, number][] }];
    const o = leaveOddsTiered(tiers, 10, 1, { winUnits: 10, lossUnits: Infinity, maxRounds: 100_000 })!;
    expect(o.pWin).toBeCloseTo(0.5, 9);
    expect(o.pBroke).toBeCloseTo(0.5, 9);
    expect(o.expHands).toBeCloseTo(100, 4); // start × (goal − start) = 10 × 10
  });
});

const base: TableSimParams = {
  game: 'bj-table',
  crapsOdds: true,
  betCents: 1500,
  budgetCents: 30000,
  winGoalCents: 15000,
  lossLimitCents: null,
  maxRounds: 240,
};

describe('table models', () => {
  it('units per bet and edges', () => {
    expect(tableModel('bj-table', true).unitsPerBet).toBe(2);
    expect(tableModel('bj-machine', true).unitsPerBet).toBe(5);
    expect(tableModel('craps', true).unitsPerBet).toBe(5);
    expect(tableModel('craps', false).unitsPerBet).toBe(1);
    expect(tableEdge('bj-table', true).perBet).toBeCloseTo(0.007311, 5);
    expect(tableEdge('bj-machine', true).perBet).toBeCloseTo(0.020840, 5);
    expect(tableEdge('craps', false).perBet).toBeCloseTo(7 / 495, 12);
    expect(tableEdge('craps', true).perBet).toBeCloseTo(7 / 495, 12);
    expect(tableEdge('craps', true).perWagered).toBeCloseTo(3 / 495, 12);
  });

  it('a tier never risks more than it covers', () => {
    for (const id of ['bj-table', 'bj-machine', 'craps'] as const)
      for (const t of tableModel(id, true).tiers) expect(Math.min(...t.steps.map(([d]) => d))).toBeGreaterThanOrEqual(-t.coverUnits);
  });
});

describe('table simulator', () => {
  it('is deterministic per seed and never goes below zero', () => {
    const a = runTableSession(base, 7);
    expect(runTableSession(base, 7)).toEqual(a);
    expect(a.path[0]).toEqual({ hand: 0, cents: 30000 });
    expect(a.path[a.path.length - 1]).toEqual({ hand: a.rounds, cents: a.finalCents });
    for (let s = 1; s <= 300; s++) {
      const r = runTableSession({ ...base, game: 'bj-machine', betCents: 300, budgetCents: 2000, winGoalCents: null }, s);
      expect(r.finalCents).toBeGreaterThanOrEqual(0);
      for (const q of r.path) expect(q.cents).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    ['bj-table', true, 1500, 30000, 15000, null, 240],
    ['bj-machine', true, 300, 10000, null, 5000, 600],
    ['craps', true, 300, 10000, 10000, null, 120],
    ['craps', false, 500, 5000, null, null, 120],
  ] as const)('%s (odds %s): 4,000 runs agree with the exact odds (sampled check only)', (game, crapsOdds, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds) => {
    const p: TableSimParams = { game, crapsOdds, betCents, budgetCents, winGoalCents, lossLimitCents, maxRounds };
    const exact = exactTable(p)!;
    expect(exact.pWin + exact.pLossLimit + exact.pBroke + exact.pTime).toBeCloseTo(1, 10);
    const m = runTableMany(p, 4000, 99);
    // ±0.03 is over 3.8 standard errors for any share at n = 4,000.
    expect(Math.abs(m.ends.win - exact.pWin)).toBeLessThan(0.03);
    expect(Math.abs(m.ends.broke - exact.pBroke)).toBeLessThan(0.03);
    expect(Math.abs(m.ends['loss-limit'] - exact.pLossLimit)).toBeLessThan(0.03);
    expect(Math.abs(m.pAhead - exact.pAhead)).toBeLessThan(0.03);
    expect(Math.abs(m.avgRounds - exact.expHands) / exact.expHands).toBeLessThan(0.03);
  });

  it('leave advice: six exact rules', () => {
    const rows = tableLeaveAdvice({ game: 'craps', crapsOdds: true, betCents: 300, budgetCents: 10000, maxRounds: 120 });
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.odds).not.toBeNull();
  });

  it('a long cheap machine session is still computable', () => {
    const t0 = performance.now();
    const o = exactTable({ ...base, game: 'bj-machine', betCents: 300, budgetCents: 50000, winGoalCents: null, maxRounds: 1800 });
    expect(o).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

import { describe, expect, it } from 'vitest';
import { leaveOdds, leaveOddsTiered } from '../engine/leave.ts';
import { ODDS_BY_GAME } from './odds.ts';
import { sideBetCostPerRollCents, exactTable, runTableMany, runTableSession, tableEdge, tableLeaveAdvice, tableModel, type TableSimParams } from './tableSim.ts';

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
    expect(tableModel('bj-table').unitsPerBet).toBe(2);
    expect(tableModel('bj-machine').unitsPerBet).toBe(5);
    expect(tableEdge({ game: 'bj-table', crapsOdds: true }).perBet).toBeCloseTo(0.007311, 5);
    expect(tableEdge({ game: 'bj-machine', crapsOdds: true }).perBet).toBeCloseTo(0.020840, 5);
    expect(tableEdge({ game: 'bj-machine', crapsOdds: true }).perRound).toBeCloseTo(0.020840, 5);
    // Craps (D31): per flat bet, per dollar put out (odds at 1× on 4/10, 2× elsewhere), any style.
    for (const crapsStyle of ['single', 'molly'] as const) {
      expect(tableEdge({ game: 'craps', crapsOdds: false, crapsStyle }).perBet).toBeCloseTo(7 / 495, 12);
      expect(tableEdge({ game: 'craps', crapsOdds: true, crapsStyle }).perBet).toBeCloseTo(7 / 495, 12);
      expect(tableEdge({ game: 'craps', crapsOdds: true, crapsStyle }).perWagered).toBeCloseTo(42 / 6435, 12);
      expect(tableEdge({ game: 'craps', crapsOdds: false, crapsSide: 'dont', crapsStyle }).perBet).toBeCloseTo(3 / 220, 12);
      expect(tableEdge({ game: 'craps', crapsOdds: true, crapsSide: 'dont', crapsStyle }).perWagered).toBeCloseTo(3 / 220 / (8 / 3), 12);
    }
    // A single line bet resolves every 1 / 0.2962 = 3.376 rolls (557/165); the molly keeps ~2.4× the action.
    expect(tableEdge({ game: 'craps', crapsOdds: true }).perRound).toBeCloseTo((7 / 495) * (165 / 557), 12);
  });

  it('a tier never risks more than it covers', () => {
    for (const id of ['bj-table', 'bj-machine'] as const)
      for (const t of tableModel(id).tiers) expect(Math.min(...t.steps.map(([d]) => d))).toBeGreaterThanOrEqual(-t.coverUnits);
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
    ['craps', true, 300, 10000, 10000, null, 300],
    ['craps', false, 500, 5000, null, null, 300],
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
    const rows = tableLeaveAdvice({ game: 'craps', crapsOdds: true, betCents: 300, budgetCents: 10000, maxRounds: 200 });
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

describe('craps side bets in the simulator (D32)', () => {
  it('make the exact odds unavailable and cost what the exact rate says (sampled check only)', () => {
    const stakes = { small: 100, tall: 100, all: 100 };
    const base: TableSimParams = { game: 'craps', crapsOdds: false, betCents: 300, budgetCents: 10_000_000, winGoalCents: null, lossLimitCents: null, maxRounds: 30_000, sideBetsCents: stakes };
    expect(exactTable(base)).toBeNull();
    expect(tableLeaveAdvice(base).every((r) => r.odds === null)).toBe(true);
    // Same seeds with and without side bets differ in their dice, so compare each to its exact rate.
    const runs = 20;
    let rolls = 0;
    let net = 0;
    for (let s = 1; s <= runs; s++) {
      const r = runTableSession(base, s);
      rolls += r.rounds;
      net += r.netCents;
    }
    const mainPerRoll = tableEdge({ game: 'craps', crapsOdds: false }).perRound * 300;
    const expected = -(mainPerRoll + sideBetCostPerRollCents(stakes)) * rolls;
    // Side bets dominate the swing: per round, stakes of $1 paying 31 / 151 → sd ≈ $12.6; ~100,000 rounds.
    const sd = 1260 * Math.sqrt(rolls / 6);
    expect(Math.abs(net - expected)).toBeLessThan(4 * sd);
    expect(sideBetCostPerRollCents(stakes)).toBeCloseTo((100 * (0.18302881 * 2 + 0.20608668)) / 6, 4);
  });
});

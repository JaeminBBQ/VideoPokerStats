import { describe, expect, it } from 'vitest';
import { ODDS_BY_GAME } from './odds.ts';
import { COMP_RATE_PER_MULTIPLIER, compRatePerMultiplier, exactFor, leaveAdvice, returnAndBreakEven, runMany, runSession, type SimParams } from './simulate.ts';

const rows = ODDS_BY_GAME['gsr-job-9-5']!.perRow;
const base: SimParams = {
  rows,
  errorRate: 0,
  betCents: 100,
  budgetCents: 10000,
  winGoalCents: 5000,
  lossLimitCents: null,
  maxHands: 2400,
  compRate: COMP_RATE_PER_MULTIPLIER,
};

describe('simulator', () => {
  it('is deterministic per seed and keeps its books straight', () => {
    const a = runSession(base, 42);
    expect(runSession(base, 42)).toEqual(a);
    expect(a.finalCents - 10000).toBe(a.netCents);
    expect(a.coinInCents).toBe(a.hands * 100);
    expect(a.compsCents).toBe(Math.round(a.hands * 100 * 0.0005));
    expect(a.path[0]).toEqual({ hand: 0, cents: 10000 });
    expect(a.path[a.path.length - 1]).toEqual({ hand: a.hands, cents: a.finalCents });
    expect(a.path.length).toBeLessThanOrEqual(2 * 300 + 3);
    if (a.end === 'win') expect(a.netCents).toBeGreaterThanOrEqual(5000);
  });

  it('many runs agree with the exact leave odds (sampled check only)', () => {
    const exact = exactFor(base)!;
    const runs = 4000;
    const m = runMany(base, runs, 7);
    const within = (got: number, p: number) => expect(Math.abs(got - p)).toBeLessThan(4.5 * Math.sqrt((p * (1 - p)) / runs) + 1e-9);
    within(m.ends.win, exact.pWin);
    within(m.ends.broke, exact.pBroke);
    within(m.ends.time, exact.pTime);
    within(m.pAhead, exact.pAhead);
    expect(Math.abs(m.avgHands - exact.expHands)).toBeLessThan(0.05 * exact.expHands);
  });

  it('a mistake rate lowers the return; break-even comps follow', () => {
    const perfect = returnAndBreakEven(rows, 0);
    expect(perfect.ret).toBeCloseTo(0.984498, 5);
    expect(perfect.breakEvenCompRate).toBeCloseTo(0.015502, 5);
    expect(returnAndBreakEven(rows, 0.05).ret).toBeLessThan(perfect.ret);
  });

  it('leave advice: six exact rules, all with the same loss per hand', () => {
    const adv = leaveAdvice({ ...base, maxHands: 1200 });
    expect(adv).toHaveLength(6);
    const perHand = adv.map((r) => r.odds!.expNetBets / r.odds!.expHands);
    for (const x of perHand) expect(x).toBeCloseTo(0.984498 - 1, 5);
    // Quitting while ahead raises the chance of leaving a winner over playing it out.
    expect(adv[1].odds!.pAhead).toBeGreaterThan(adv[0].odds!.pAhead);
  });
});

describe('comps by venue', () => {
  it('GSR 0.05% and Legends Bay 1/6% of coin-in per 1×', () => {
    expect(compRatePerMultiplier('GSR')).toBe(0.0005);
    expect(compRatePerMultiplier('Legends Bay')).toBeCloseTo(1 / 600, 15);
  });
});

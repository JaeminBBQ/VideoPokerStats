import { describe, expect, it } from 'vitest';
import { GAMES } from '../engine/games.ts';
import { goalProbability } from '../engine/goals.ts';
import { leaveOdds } from '../engine/leave.ts';
import { betOptions, bestForGoal, bestForLasting, goalChance, lastChanceShortcut, lastRule, lossPerHourCents } from './betSize.ts';
import { ODDS_BY_GAME } from './odds.ts';

const lbJob = betOptions(GAMES['job-8-5'], ODDS_BY_GAME['job-8-5']!);
const gsrJob = betOptions(GAMES['gsr-job-9-5'], ODDS_BY_GAME['gsr-job-9-5']!);
const gsr96 = betOptions(GAMES['gsr-job-9-6'], ODDS_BY_GAME['gsr-job-9-6']!);
const gsrDeuces = betOptions(GAMES['gsr-deuces-20-12-10'], ODDS_BY_GAME['gsr-deuces-20-12-10']!);

describe('betOptions', () => {
  it('lists photographed bets only, one per amount, smallest first, up to $10', () => {
    // LB 1¢–25¢ × 1–5 coins, then $1 and $2 at max (their short bets aren't photographed).
    expect(lbJob.map((o) => o.betCents)).toEqual([1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 500, 1000]);
    // 25¢ is 5¢ × 5 (full royal), not 25¢ × 1 (short): same bet, higher return.
    expect(lbJob.find((o) => o.betCents === 25)).toMatchObject({ denomination: 0.05, coins: 5, royalPerCoin: 800 });
    expect(lbJob.find((o) => o.betCents === 100)).toMatchObject({ denomination: 0.25, coins: 4, royalPerCoin: 250 });
    expect(gsrJob.map((o) => [o.coins, o.royalPerCoin])).toEqual([[16, 800], [17, 800], [18, 800], [19, 800], [20, 800]]);
    expect(gsr96.map((o) => o.betCents)).toEqual([100, 200, 300, 400, 1000]);
    expect(gsrDeuces.map((o) => [o.coins, o.royalPerCoin])).toEqual([[2, 250], [3, 250], [4, 250], [5, 800], [20, 800]]);
  });

  it('full-royal bets return the published figure; short bets match a full enumeration with the max-bet strategy', () => {
    for (const o of [...lbJob, ...gsrJob, ...gsr96, ...gsrDeuces].filter((x) => x.royalPerCoin === 800)) {
      expect(o.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
    expect(lbJob.at(-1)!.ret).toBeCloseTo(0.973, 4);
    expect(gsr96.at(-1)!.ret).toBeCloseTo(0.9954, 4);
    // node scratch enumeration (outcomeDistribution of the max-bet game, royal repriced to 250): 95.9292%, 98.1822%.
    expect(lbJob[0].ret).toBeCloseTo(0.959292, 6);
    expect(gsr96[0].ret).toBeCloseTo(0.981822, 6);
  });

  it('loss per hour is edge × bet × 500', () => {
    const o = gsrJob.at(-1)!;
    expect(lossPerHourCents(o)).toBeCloseTo(0.0155 * 100 * 500, 0);
  });
});

describe('choosing a bet', () => {
  it('goal chance is the exact goal solver in this bet\'s units', () => {
    const o = gsrJob.at(-1)!; // $1
    const outcomes = o.pays.map((v, i) => ({ net: v - 1, p: o.probs[i] }));
    expect(goalChance(o, 10000, 2000)).toBeCloseTo(goalProbability(outcomes, 100, 20), 15);
    expect(goalChance(o, 50, 2000)).toBe(0);
  });

  it('best for a goal is the highest chance, ties to the smaller bet', () => {
    expect(bestForGoal([0.2, 0.5, 0.5, 0.1])).toBe(1);
  });

  it('lasting: shortcut when certain, otherwise the leave DP; picks the biggest full-royal bet that lasts', () => {
    const o = lbJob.find((x) => x.betCents === 25)!;
    expect(lastChanceShortcut(o, 10000, 400)).toBe(1); // 400 bets can't go broke in 400 hands
    expect(lastChanceShortcut(o, 20, 400)).toBe(0);
    expect(lastChanceShortcut(o, 10000, 500)).toBeUndefined();
    const dp = leaveOdds(o.pays, o.probs, 100, lastRule(500))!; // $25 at 25¢ for ~1 hour
    expect(dp.pBroke).toBeGreaterThan(0.01); // 3.2%
    expect(dp.pBroke).toBeLessThan(0.1);
    expect(dp.pBroke + dp.pTime).toBeCloseTo(1, 12);
    // 25¢ = 5¢ × 5 (full royal), 40¢ = 10¢ × 4 (short), $1.25 = 25¢ × 5 (full).
    const opts = lbJob.filter((x) => [25, 40, 125].includes(x.betCents));
    expect(opts.map((x) => x.royalPerCoin)).toEqual([800, 250, 800]);
    expect(bestForLasting(opts, [1, 0.96, 0.9], 0.95)).toBe(0); // the short 40¢ lasts, but take the full royal
    expect(bestForLasting(opts, [1, 0.96, 0.97], 0.95)).toBe(2);
    expect(bestForLasting(opts.slice(1, 2), [0.96], 0.95)).toBe(0); // only a short bet lasts
    expect(bestForLasting(opts, [0.5, 0.4, 0.3], 0.95)).toBe(-1);
    expect(bestForLasting(opts, [null, 0.97, null], 0.95)).toBe(1);
  });
});

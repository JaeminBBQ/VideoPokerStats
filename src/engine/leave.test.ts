import { describe, expect, it } from 'vitest';
import { goalProbability } from './goals.ts';
import { leaveOdds } from './leave.ts';

// A jackpot-shaped toy game (pays in bets returned per bet).
const pays = [0, 1, 2, 3, 9, 50];
const probs = [0.55, 0.21, 0.13, 0.08, 0.025, 0.005];
const ret = pays.reduce((a, v, i) => a + v * probs[i], 0);

describe('leaveOdds', () => {
  it('ends sum to 1 and E[net] = E[hands] × (return − 1)', () => {
    const o = leaveOdds(pays, probs, 40, { winBets: 30, lossBets: 25, maxHands: 500 })!;
    expect(o.pWin + o.pLossLimit + o.pBroke + o.pTime).toBeCloseTo(1, 12);
    expect(o.expNetBets).toBeCloseTo(o.expHands * (ret - 1), 12);
    expect(o.pBroke).toBe(0); // a loss limit inside the budget is hit first
  });

  it('with a long enough session, the win chance matches the no-time-limit goal solver', () => {
    const o = leaveOdds(pays, probs, 20, { winBets: 15, lossBets: Infinity, maxHands: 20000 })!;
    const outcomes = pays.map((v, i) => ({ net: v - 1, p: probs[i] }));
    expect(o.pWin).toBeCloseTo(goalProbability(outcomes, 20, 15), 9);
    expect(o.pTime).toBeLessThan(1e-9);
  });

  it('no goal: P(ahead) and E[hands] agree with brute-force enumeration over a short session', () => {
    const start = 3;
    const N = 6;
    // Enumerate every sequence of N outcomes, stopping when the bankroll can't cover a bet.
    let pAhead = 0;
    let expHands = 0;
    let pBroke = 0;
    const walk = (bank: number, n: number, p: number) => {
      if (bank < 1 && n > 0) {
        pBroke += p;
        return;
      }
      if (n === N) {
        if (bank > start) pAhead += p;
        return;
      }
      pays.forEach((v, i) => {
        expHands += p * probs[i];
        walk(bank - 1 + v, n + 1, p * probs[i]);
      });
    };
    walk(start, 0, 1);
    const o = leaveOdds(pays, probs, start, { winBets: Infinity, lossBets: Infinity, maxHands: N })!;
    expect(o.pAhead).toBeCloseTo(pAhead, 12);
    expect(o.expHands).toBeCloseTo(expHands, 12);
    expect(o.pBroke).toBeCloseTo(pBroke, 12);
  });

  it('refuses work that would freeze the page', () => {
    expect(leaveOdds(pays, probs, 50000, { winBets: Infinity, lossBets: Infinity, maxHands: 50000 })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { TABLE_GAMES, goalProbability } from '../engine/goals.ts';
import { ODDS_BY_GAME } from './odds.ts';
import { GOALS, MAX_BUDGET_BETS, goalTable } from './goals.ts';

const job95 = ODDS_BY_GAME['gsr-job-9-5']!.perHand;

describe('goalTable', () => {
  it('builds one row per goal and one column per game, video poker first', () => {
    const t = goalTable('JoB 9/5', job95, 10000, 100); // $100 budget, $1 bets
    if (!t.ok) throw new Error('expected a table');
    expect(t.budgetBets).toBe(100);
    expect(t.columns.map((c) => c.id)).toEqual(['video-poker', 'blackjack', 'craps', 'roulette', 'craps-odds']);
    expect(t.rows.map((r) => r.label)).toEqual(GOALS.map((g) => g.label));
    expect(t.rows.map((r) => r.goalBets)).toEqual([5, 10, 15, 25, 50, 100, 200]);
    expect(t.rows[0].odds[0]).toBeCloseTo(goalProbability(job95, 100, 5), 15);
    expect(t.rows[0].odds[2]).toBeCloseTo(goalProbability(TABLE_GAMES[1].outcomes, 100 / 3, 5 / 3), 15);
    expect(t.columns[0].edge).toBeCloseTo(1 - 0.984498, 5);
    expect(t.columns[3].edge).toBeCloseTo(2 / 38, 12);
    expect(t.columns[4].edge).toBeCloseTo(3 / 495, 12);
    for (const r of t.rows) expect(r.odds[r.best]).toBe(Math.max(...r.odds));
  });

  it('bets each table its minimum, whatever the video poker bet', () => {
    const t = goalTable('JoB 9/5', job95, 10000, 100); // $100, $1 video poker
    if (!t.ok) throw new Error('expected a table');
    expect(t.columns.map((c) => c.betCents)).toEqual([100, 1500, 300, 1500, 300]);
    expect(t.columns[1].budgetBets).toBeCloseTo(100 / 15, 12);
    // +$5 at $15 blackjack: any result of at least +0.5 bet. Same as asking for +$7.50.
    expect(t.rows[0].odds[1]).toBeCloseTo(goalProbability(TABLE_GAMES[0].outcomes, 100 / 15, 0.5), 15);
    // Roulette at $15: +$5 needs one winning spin, the same as +$15.
    expect(t.rows[0].odds[3]).toBeCloseTo(t.rows[2].odds[3], 15);
    const big = goalTable('DWBP', job95, 10000, 1000); // $10 video poker
    if (!big.ok) throw new Error('expected a table');
    expect(big.columns.map((c) => c.betCents)).toEqual([1000, 1500, 300, 1500, 300]);
    expect(big.columns.map((c) => c.unit)).toEqual(['hand', 'hand', 'bet', 'spin', 'bet']);
  });

  it('marks tables the budget cannot cover as unplayable with 0 odds', () => {
    const t = goalTable('x', job95, 1000, 25); // $10 budget at 25¢
    if (!t.ok) throw new Error('expected a table');
    expect(t.columns.map((c) => c.playable)).toEqual([true, false, true, false, true]);
    expect(t.rows.every((r) => r.odds[1] === 0 && r.odds[3] === 0)).toBe(true);
  });

  it('rounds goals up to whole bets and floors the budget', () => {
    const t = goalTable('x', job95, 10050, 1000); // $100.50 budget, $10 bets
    if (!t.ok) throw new Error('expected a table');
    expect(t.budgetBets).toBe(10);
    expect(t.rows[0].goalBets).toBe(1); // +$5 needs one $10 win
    expect(t.rows[5].goalCents).toBe(10050); // double = +$100.50
    expect(t.rows[5].goalBets).toBe(11);
  });

  it('refuses budgets below one bet or above the cap', () => {
    expect(goalTable('x', job95, 50, 100)).toEqual({ ok: false, reason: 'below-one-bet', budgetBets: 0 });
    expect(goalTable('x', job95, (MAX_BUDGET_BETS + 1) * 100, 100)).toMatchObject({ ok: false, reason: 'too-many-bets' });
  });
});

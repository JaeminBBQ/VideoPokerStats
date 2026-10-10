import { describe, expect, it } from 'vitest';
import { goalProbability } from '../engine/goals.ts';
import { ODDS_BY_GAME } from './odds.ts';
import { GOALS, MAX_BUDGET_BETS, goalTable } from './goals.ts';

const job95 = ODDS_BY_GAME['gsr-job-9-5']!.perHand;

describe('goalTable', () => {
  it('builds one row per goal and one column per game, video poker first', () => {
    const t = goalTable('JoB 9/5', job95, 10000, 100); // $100 budget, $1 bets
    if (!t.ok) throw new Error('expected a table');
    expect(t.budgetBets).toBe(100);
    expect(t.columns.map((c) => c.id)).toEqual(['video-poker', 'blackjack', 'craps', 'roulette']);
    expect(t.rows.map((r) => r.label)).toEqual(GOALS.map((g) => g.label));
    expect(t.rows.map((r) => r.goalBets)).toEqual([5, 10, 15, 25, 50, 100, 200]);
    expect(t.rows[0].odds[0]).toBeCloseTo(goalProbability(job95, 100, 5), 15);
    expect(t.columns[0].edge).toBeCloseTo(1 - 0.984498, 5);
    expect(t.columns[3].edge).toBeCloseTo(2 / 38, 12);
    for (const r of t.rows) expect(r.odds[r.best]).toBe(Math.max(...r.odds));
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

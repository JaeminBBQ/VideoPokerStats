import { describe, expect, it } from 'vitest';
import { compareRows, mineFromTotals, rateLabel, type CompareRow } from './bankrollTab.ts';

describe('bankroll tab helpers', () => {
  it('builds one row per game offered at the denomination, sorted by the 2,000-hand column (cheapest first)', () => {
    const rows = compareRows(0.05, 0, 0.95);
    expect(rows.map((r) => r.game.id)).toEqual([
      'job-8-5',
      'bonus-6-5',
      'lb-deuces-16-13',
      'bpd-7-5',
      'gsr-job-9-5',
      'gsr-deuces-20-12-10',
    ]);
    const mid = rows.map((r) => r.cells.find((c) => c.hands === 2000)!.cents);
    expect(mid).toEqual([...mid].sort((a, b) => a - b));
    expect(mid[0]).toBe(5950); // JoB 238 bets at 5¢ = $59.50
    expect(mid[1]).toBe(6600); // Bonus 264 bets at 5¢ = $66.00
    expect(mid[2]).toBe(7775); // Deuces 311 bets at 5¢ = $77.75
    expect(mid[3]).toBe(10325); // BPD 413 bets at 5¢ = $103.25
    expect(mid[4]).toBe(22000); // GSR JoB 9/5: 220 bets × 20 coins × 5¢ = $220
    expect(mid[5]).toBe(27900); // GSR Deuces 20/12/10: 279 bets × 20 coins × 5¢
  });

  it('uses each machine\'s max bet: GSR $1 plays 10 coins, Legends Bay 5', () => {
    const at = (id: string) => compareRows(1, 0, 0.95).find((r) => r.game.id === id)!.cells.find((c) => c.hands === 2000)!.cents;
    expect(at('gsr-job-9-6')).toBe(202000); // 202 bets × $10
    expect(at('job-8-5')).toBe(119000); // 238 bets × $5
    expect(compareRows(0.25, 0, 0.95).some((r) => r.game.venue === 'GSR')).toBe(false); // no GSR photo at 25¢ yet
  });

  it('fills every horizon column for each row', () => {
    const cents = (r: CompareRow, hands: number) => r.cells.find((c) => c.hands === hands)!.cents;
    const job = compareRows(0.05, 0, 0.95).find((r) => r.game.id === 'job-8-5')!;
    expect(job.cells.map((c) => c.hands)).toEqual([500, 2000, 10000]);
    expect(cents(job, 500)).toBe(2350); // 94 bets
    expect(cents(job, 10000)).toBe(19300); // 772 bets
    const bpd = compareRows(0.05, 0.01, 0.95).find((r) => r.game.id === 'bpd-7-5')!;
    expect(cents(bpd, 10000)).toBe(31525); // 1,261 bets at 5¢ = $315.25
  });

  it('builds mine state: 0 hands → disabled; 1.3% → 0.01', () => {
    const none = mineFromTotals({ hands: 0, mistakes: 0, evLost: 0 });
    expect(none.available).toBe(false);
    expect(none.rate).toBe(0);
    const mine = mineFromTotals({ hands: 1000, mistakes: 13, evLost: 0.4 });
    expect(mine.available).toBe(true);
    expect(mine.percent).toBeCloseTo(1.3, 6);
    expect(mine.rate).toBe(0.01);
  });

  it('snaps small error rates to the nearest column and labels rates', () => {
    expect(mineFromTotals({ hands: 1000, mistakes: 5, evLost: 0.2 }).rate).toBe(0.005);
    expect(mineFromTotals({ hands: 1000, mistakes: 0, evLost: 0 }).rate).toBe(0);
    expect(rateLabel(0)).toBe('0%');
    expect(rateLabel(0.005)).toBe('0.5%');
    expect(rateLabel(0.01)).toBe('1%');
    expect(rateLabel(0.02)).toBe('2%');
  });
});

import { describe, expect, it } from 'vitest';
import { parseHand } from './cards.ts';
import { buildTables } from './ev.ts';
import { GAMES } from './games.ts';
import { canonicalHands, chartKind, deucesPattern, generateChart, naturalPattern, straightWays } from './strategy.ts';

const label = (held: string) => deucesPattern(GAMES.nsud, held ? parseHand(held) : []).label;

describe('deucesPattern', () => {
  it.each([
    ['', 'Discard everything'],
    ['2c 2d', '2 deuces only'],
    ['2c 2d 2h 2s', 'Four deuces'],
    ['3c 3d', 'Pair'],
    ['3c 3d 5d', 'other (3 cards)'],
    ['3c 3d 4c 4h', 'Two Pair'],
    ['2c 9h 9d', 'Three of a Kind (1 deuce + 2 natural)'],
    ['Th Jh Qh Kh', '4 to a Royal'],
    ['2c Jh Qh', '1 deuce + 3 to a Royal (no T or A)'],
    ['Jh Ah', '2 to a Royal (with A)'],
    ['5h 6h 7h 8h', '4 to a Straight Flush (2 ways)'],
    ['3c 4c 5c Ac', '4 to a Straight Flush (needs the 2 slot)'],
    ['2c 3d 4h 5c 6s', 'Pat Straight'],
    ['3c 4d 5h 7c', '4 to a Straight (1 way)'],
  ])('%s → %s', (held, want) => expect(label(held)).toBe(want));

  it('counts clean straight windows only', () => {
    expect(straightWays(0b0000_0111_1000)).toBe(2); // 6 7 8 9 → 5-9, 6-T
    expect(straightWays((1 << 12) | 0b1110)).toBe(0); // A 3 4 5 → only the wheel
  });
});

const jobLabel = (held: string) => naturalPattern(GAMES['job-8-5'], held ? parseHand(held) : []).label;

describe('naturalPattern', () => {
  it.each([
    ['', 'Discard everything'],
    ['Jc Jd', 'High Pair (JJ–AA)'],
    ['5c 5d', 'Low Pair (22–TT)'],
    ['5c 5d 9h 9s', 'Two Pair'],
    ['Th Jh Qh', '3 to a Royal'],
    ['Jh Qh', 'Suited QJ'],
    ['Th Jh', 'Suited JT'],
    ['Jc Qh Kd', 'KQJ unsuited'],
    ['Ah', 'A only'],
    ['5h 6h 7h 9h', '4 to a Straight Flush'],
    ['5h 6h 8h', '3 to a Straight Flush (0 high, 1 gap)'],
    ['2c 3c Ac', '3 to a Straight Flush (1 high, no gaps)'],
    ['5c 6d 7h 8s', '4 to an Open Straight'],
    ['9c Jd Qh Ks', '4 to an Inside Straight (3 high)'],
    ['2h 5h 8h Jh', '4 to a Flush (1 high)'],
    ['5c 5d 9h', 'other (3 cards)'],
  ])('%s → %s', (held, want) => expect(jobLabel(held)).toBe(want));

  it('splits aces out in bonus games', () => {
    expect(naturalPattern(GAMES['bonus-6-5'], parseHand('Ac Ad')).label).toBe('Pair of Aces');
    expect(naturalPattern(GAMES['bonus-6-5'], parseHand('Kc Kd')).label).toBe('High Pair (JJ–KK)');
  });

  it('has chart kinds for deuces and Jacks-or-Better games, not Joker Poker', () => {
    expect(chartKind(GAMES['job-8-5'])?.sectionLabel(0)).toBe('');
    expect(chartKind(GAMES.nsud)?.sectionLabel(1)).toBe('1 deuce');
    expect(chartKind(GAMES['joker-kings'])).toBeNull();
  });
});

describe('canonicalHands', () => {
  it('covers every hand exactly once in 134,459 suit classes', { timeout: 60_000 }, () => {
    const hands = canonicalHands();
    expect(hands.length).toBe(134_459);
    expect(hands.reduce((n, h) => n + h.weight, 0)).toBe(2_598_960);
  });
});

describe('NSUD chart', () => {
  it('reproduces the verified return and stays within 0.02% of perfect play', { timeout: 180_000 }, () => {
    const chart = generateChart(buildTables(GAMES.nsud), chartKind(GAMES.nsud)!, canonicalHands());
    expect(chart.perfectReturn).toBeCloseTo(0.997283, 6);
    expect(chart.perfectReturn - chart.chartReturn).toBeLessThan(0.0002);
    expect(chart.sections.map((s) => s.section)).toEqual([4, 3, 2, 1, 0]);
  });
});

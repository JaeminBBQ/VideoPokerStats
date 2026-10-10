import { describe, expect, it } from 'vitest';
import { GAME_LIST } from '../engine/index.ts';
import { ODDS_BY_GAME, oneIn } from './odds.ts';

describe('odds data', () => {
  it('exists for every game, with probabilities that sum to 1', () => {
    for (const game of GAME_LIST) {
      const o = ODDS_BY_GAME[game.id];
      expect(o, game.id).toBeDefined();
      const sum = (f: 'dealt' | 'perfect') => o!.categories.reduce((a, c) => a + c[f], 0);
      expect(sum('dealt')).toBeCloseTo(1, 9);
      expect(sum('perfect')).toBeCloseTo(1, 9);
      expect(o!.draws.length).toBeGreaterThan(0);
    }
  });
});

describe('oneIn', () => {
  it('formats', () => {
    expect(oneIn(1 / 47)).toBe('1 in 47');
    expect(oneIn(1 / 40170.4)).toBe('1 in 40,170');
    expect(oneIn(9 / 47)).toBe('1 in 5.2');
    expect(oneIn(2 / 47)).toBe('1 in 23.5');
    expect(oneIn(0)).toBe('—');
  });
});

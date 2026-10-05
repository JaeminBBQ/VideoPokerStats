import { describe, expect, it } from 'vitest';
import { GAMES, JOKER } from '../engine/index.ts';
import { isWildCard } from './wild.ts';

describe('isWildCard', () => {
  it('marks deuces wild in deuces games only', () => {
    expect(isWildCard(GAMES['lb-deuces-16-13'], 0)).toBe(true);
    expect(isWildCard(GAMES['job-8-5'], 0)).toBe(false);
  });

  it('marks the joker wild in a 53-card game, but not its deuces', () => {
    const jokerGame = { ...GAMES['job-8-5'], deckSize: 53 as const };
    expect(isWildCard(jokerGame, JOKER)).toBe(true);
    expect(isWildCard(jokerGame, 0)).toBe(false);
  });

  it('marks nothing wild in natural-card games', () => {
    expect(isWildCard(GAMES['job-8-5'], 8)).toBe(false);
  });
});

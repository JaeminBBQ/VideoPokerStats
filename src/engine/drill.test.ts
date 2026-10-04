import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32, parseHand, rankOf, suitOf } from './cards.ts';
import { analyzeHand, buildTables, type Tables } from './ev.ts';
import { GAMES } from './games.ts';
import { disguiseHand, findSimilarHand, mistakeSignature, patternFor } from './drill.ts';

describe('drill', () => {
  let t: Tables;
  beforeAll(() => {
    t = buildTables(GAMES.nsud);
  });

  it('names holds only for games with a chart', () => {
    expect(patternFor(GAMES.nsud, parseHand('3c 3d'))?.label).toBe('Pair');
    expect(patternFor(GAMES['db-10-7'], parseHand('3c 3d'))).toBeNull();
  });

  it('finds fresh hands posing the same decision', { timeout: 60_000 }, () => {
    // Pair vs 4 to a Flush, 0 deuces: best is the flush draw, the player held the pair.
    const hand = parseHand('5h 5c 8h Jh Kh');
    const best = analyzeHand(t, hand)[0];
    const sig = mistakeSignature(GAMES.nsud, hand, best.mask, 0b00011)!;
    expect(sig).toMatchObject({ section: 0, bestLabel: '4 to a Flush', chosenLabel: 'Pair' });
    const rng = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      const { hand: h, match } = findSimilarHand(t, sig, rng);
      expect(match).toBe('exact');
      expect(h.filter((c) => rankOf(c) === 0)).toHaveLength(0);
      const holds = analyzeHand(t, h);
      expect(patternFor(GAMES.nsud, holds[0].held)!.key).toBe(sig.bestKey);
    }
  });

  it('keeps the deuce count of the section', () => {
    const sig = { section: 2, bestKey: 'd2', chosenKey: 'none', bestLabel: '', chosenLabel: '' };
    const { hand } = findSimilarHand(t, sig, mulberry32(7), 200);
    expect(hand.filter((c) => rankOf(c) === 0)).toHaveLength(2);
  });

  it('disguises a hand without changing its strategy', () => {
    const hand = parseHand('2c Th Jh Qh 4s');
    const d = disguiseHand(hand, mulberry32(3));
    expect(d.map(rankOf).sort()).toEqual(hand.map(rankOf).sort());
    expect(new Set(d.filter((c) => rankOf(c) !== 0 && rankOf(c) !== 2).map(suitOf)).size).toBe(1); // T J Q stay suited
    expect(analyzeHand(t, d)[0].ev).toBeCloseTo(analyzeHand(t, hand)[0].ev, 12);
  });
});

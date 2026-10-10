import { describe, expect, it } from 'vitest';
import { mulberry32, parseHand } from './cards.ts';
import { GAMES, GAME_LIST } from './games.ts';
import { byCategory, dealtCounts, drawExamples, drawOdds, exampleHand, oddsCategories, sessionOdds } from './odds.ts';

const job = GAMES['job-8-5'];
const cats = oddsCategories(job);
const p = (perOutcome: number[], key: string) => byCategory(cats, perOutcome)[cats.findIndex((c) => c.key === key)];

describe('oddsCategories', () => {
  it('folds bonus quads, five-of-a-kind and four-deuces rows into one category each', () => {
    expect(oddsCategories(GAMES['bonus-6-5']).map((c) => c.key)).toEqual(oddsCategories(job).map((c) => c.key));
    const dwbp = oddsCategories(GAMES['gsr-dwbp']).map((c) => c.key);
    expect(dwbp.filter((k) => k === 'four-deuces' || k === 'five-kind' || k === 'four-kind')).toEqual([
      'four-deuces',
      'five-kind',
      'four-kind',
    ]);
  });
});

describe('dealtCounts', () => {
  it('matches the textbook 5-card poker frequencies (JoB 8/5)', () => {
    const counts = byCategory(cats, dealtCounts(job));
    const at = (key: string) => counts[cats.findIndex((c) => c.key === key)];
    expect(at('royal')).toBe(4);
    expect(at('straight-flush')).toBe(36);
    expect(at('four-kind')).toBe(624);
    expect(at('full-house')).toBe(3744);
    expect(at('flush')).toBe(5108);
    expect(at('straight')).toBe(10200);
    expect(at('three-kind')).toBe(54912);
    expect(at('two-pair')).toBe(123552);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2598960);
  });
});

describe('drawOdds', () => {
  const odds = (hand: string, hold: number) => drawOdds(job, parseHand(hand), (1 << hold) - 1);
  it.each([
    ['As Ks Qs Js 3d', 4, 'royal', 1 / 47],
    ['8s 7s 6s 5s Kd', 4, 'straight-flush', 2 / 47],
    ['8s 8d 8h Kc 3d', 3, 'four-kind', 2 / 47],
    ['8s 8d 5h 5c Kd', 4, 'full-house', 4 / 47],
    ['Ks 9s 6s 3s 7d', 4, 'flush', 9 / 47],
    ['9d 8c 7h 6s Kd', 4, 'straight', 8 / 47],
    ['9d 8c 6h 5s Kd', 4, 'straight', 4 / 47],
    ['As Ks Qs 7d 3c', 3, 'royal', 1 / 1081],
  ])('%s holding %i → P(%s) = %f', (hand, hold, key, want) => {
    expect(p(odds(hand, hold), key)).toBeCloseTo(want, 12);
  });

  it('sums to 1 for every example in every game', () => {
    for (const game of GAME_LIST)
      for (const e of drawExamples(game).filter((x) => x.hold >= 3)) {
        const { hand, mask } = exampleHand(e);
        const sum = drawOdds(game, hand, mask).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 12);
      }
  });
});

describe('drawExamples', () => {
  it('only targets categories the game pays, and every target is reachable', () => {
    for (const game of GAME_LIST) {
      const gc = oddsCategories(game);
      for (const e of drawExamples(game)) {
        const { hand, mask } = exampleHand(e);
        expect(hand).toHaveLength(5);
        if (e.hold < 3) continue; // discard-heavy draws are covered by the generator script
        const byCat = byCategory(gc, drawOdds(game, hand, mask));
        for (const t of e.targets) expect(byCat[gc.findIndex((c) => c.key === t)], `${game.id} ${e.label} → ${t}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('sessionOdds', () => {
  // A toy game: no pay 60%, pays 1 (push) 25%, pays 2 10%, pays 9 4%, pays 50 1%.
  const pays = [50, 9, 2, 1, 0];
  const probs = [0.01, 0.04, 0.1, 0.25, 0.6];

  /** Independent check: plain uncapped convolution of the total paid. */
  function bruteForce(hands: number) {
    let dist = new Map<number, number>([[0, 1]]);
    for (let h = 0; h < hands; h++) {
      const next = new Map<number, number>();
      for (const [t, m] of dist) pays.forEach((v, i) => next.set(t + v, (next.get(t + v) ?? 0) + m * probs[i]));
      dist = next;
    }
    let ahead = 0, even = 0, behind = 0;
    for (const [t, m] of dist) if (t > hands) ahead += m; else if (t === hands) even += m; else behind += m;
    return { ahead, even, behind };
  }

  it('matches an uncapped convolution at every checkpoint', () => {
    const got = sessionOdds(pays, probs, [1, 2, 7, 30, 60], 0);
    for (const g of got) {
      const want = bruteForce(g.hands);
      expect(g.ahead).toBeCloseTo(want.ahead, 12);
      expect(g.even).toBeCloseTo(want.even, 12);
      expect(g.behind).toBeCloseTo(want.behind, 12);
    }
  });

  it('drops the royal row for aheadNoRoyal', () => {
    const [one] = sessionOdds(pays, probs, [1], 0);
    expect(one.ahead).toBeCloseTo(0.15, 12);
    expect(one.aheadNoRoyal).toBeCloseTo(0.14, 12);
  });

  it('agrees with a simulation (sampled cross-check only)', () => {
    const hands = 200;
    const [exact] = sessionOdds(pays, probs, [hands], 0);
    const rand = mulberry32(7);
    const sessions = 20000;
    let ahead = 0;
    for (let s = 0; s < sessions; s++) {
      let total = 0;
      for (let h = 0; h < hands; h++) {
        let r = rand();
        let i = 0;
        while (r >= probs[i]) r -= probs[i++];
        total += pays[i];
      }
      if (total > hands) ahead++;
    }
    const sd = Math.sqrt((exact.ahead * (1 - exact.ahead)) / sessions);
    expect(Math.abs(ahead / sessions - exact.ahead)).toBeLessThan(4 * sd);
  });
});

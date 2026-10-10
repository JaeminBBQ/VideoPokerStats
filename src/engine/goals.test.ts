import { describe, expect, it } from 'vitest';
import { mulberry32 } from './cards.ts';
import { TABLE_GAMES, banded, edgeOf, goalProbability, ladder, type Outcome } from './goals.ts';

const steps = (outcomes: Outcome[]) => new Map(outcomes.map((o) => [o.net, o.p]));
const roulette = TABLE_GAMES.find((g) => g.id === 'roulette')!.outcomes;
const blackjack = TABLE_GAMES.find((g) => g.id === 'blackjack')!.outcomes;
const craps = TABLE_GAMES.find((g) => g.id === 'craps')!.outcomes;

/** Classic gambler's ruin: P(reach b + g before 0) with win prob p per ±1 bet. */
const gamblersRuin = (p: number, b: number, g: number) => {
  const r = (1 - p) / p;
  return (r ** b - 1) / (r ** (b + g) - 1);
};

// A video-poker-like toy: big rare jackpot, only −1 losses.
const toyVp: Outcome[] = [
  { net: -1, p: 0.55 },
  { net: 0, p: 0.21 },
  { net: 1, p: 0.13 },
  { net: 2, p: 0.08 },
  { net: 8, p: 0.025 },
  { net: 49, p: 0.005 },
];

describe('goalProbability', () => {
  it.each([
    [20, 10],
    [100, 100],
    [40, 5],
  ])('roulette from %i bets to +%i matches the gambler\'s-ruin formula (both solvers)', (b, g) => {
    const want = gamblersRuin(18 / 38, b, g);
    expect(goalProbability(roulette, b, g)).toBeCloseTo(want, 12);
    expect(ladder(steps(roulette), b, b + g)).toBeCloseTo(want, 12);
    expect(banded(steps(roulette), 1, b, b + g)).toBeCloseTo(want, 12);
  });

  it('ladder and banded agree on a jackpot-shaped game', () => {
    for (const [b, g] of [
      [10, 10],
      [30, 60],
      [5, 200],
    ])
      expect(ladder(steps(toyVp), b, b + g)).toBeCloseTo(banded(steps(toyVp), 1, b, b + g), 11);
  });

  it('blackjack: half-bet scale, sane bounds, and a simulation cross-check (sampled check only)', () => {
    expect(edgeOf(blackjack)).toBeCloseTo(-0.00277282, 6);
    const exact = goalProbability(blackjack, 20, 10);
    // Close to a fair coin's 2/3 but a little lower (house edge).
    expect(exact).toBeLessThan(2 / 3);
    expect(exact).toBeGreaterThan(0.6);
    const rand = mulberry32(99);
    const cum: number[] = [];
    blackjack.reduce((a, o, i) => (cum[i] = a + o.p), 0);
    const runs = 20000;
    let hits = 0;
    for (let r = 0; r < runs; r++) {
      let bank = 20;
      while (bank >= 1 && bank < 30) {
        const u = rand();
        let i = 0;
        while (i < cum.length - 1 && u >= cum[i]) i++;
        bank += blackjack[i].net;
      }
      if (bank >= 30) hits++;
    }
    const sd = Math.sqrt((exact * (1 - exact)) / runs);
    expect(Math.abs(hits / runs - exact)).toBeLessThan(4 * sd);
  });

  it('handles the edges: can\'t cover a bet, zero goal, spare change', () => {
    expect(goalProbability(craps, 0.5, 10)).toBe(0);
    expect(goalProbability(craps, 10, 0)).toBe(1);
    expect(goalProbability(craps, 10.9, 4)).toBeCloseTo(goalProbability(craps, 10, 4), 15);
    expect(goalProbability(craps, 10, 3.2)).toBeCloseTo(goalProbability(craps, 10, 4), 15);
  });

  it('craps has its exact edge', () => {
    expect(edgeOf(craps)).toBeCloseTo(-7 / 495, 15);
  });
});

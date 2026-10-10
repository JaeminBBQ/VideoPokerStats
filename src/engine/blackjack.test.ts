import { describe, expect, it } from 'vitest';
import { mulberry32 } from './cards.ts';
import { OWNER_RULES, blackjackOdds, dealerOdds, firstAction, strategy, type BlackjackRules } from './blackjack.ts';

const LIBERAL: BlackjackRules = { ...OWNER_RULES, surrender: true, resplitAces: true };

describe('dealerOdds (infinite deck, S17)', () => {
  it('bust rates by upcard (blackjack counted as not bust)', () => {
    const bust = (u: number) => {
      const d = dealerOdds(u, OWNER_RULES);
      return d.final[5] * (1 - d.bj);
    };
    expect(bust(2)).toBeCloseTo(0.353608, 6);
    expect(bust(5)).toBeCloseTo(0.416404, 6);
    expect(bust(7)).toBeCloseTo(0.262312, 6);
    expect(bust(10)).toBeCloseTo(0.212109, 6);
    expect(dealerOdds(1, OWNER_RULES).bj).toBeCloseTo(4 / 13, 15);
  });
});

describe('blackjackOdds', () => {
  it('sums to 1 and its EV matches the outcome distribution', () => {
    const o = blackjackOdds(OWNER_RULES);
    expect(o.outcomes.reduce((a, x) => a + x.p, 0)).toBeCloseTo(1, 12);
    expect(o.ev).toBeCloseTo(-0.005117, 5);
  });

  it('rule effects match the published sizes', () => {
    const edge = (r: BlackjackRules) => -blackjackOdds(r).ev;
    const base = edge(OWNER_RULES);
    expect(edge({ ...OWNER_RULES, hitSoft17: true }) - base).toBeCloseTo(0.0022, 3); // ~0.22%
    expect(edge({ ...OWNER_RULES, das: false }) - base).toBeCloseTo(0.0014, 3); // ~0.14%
    expect(edge({ ...OWNER_RULES, bjPays: 1.2 }) - base).toBeCloseTo(0.3 * 2 * (4 / 169) * (1 - 0.0473), 3); // ~1.35%
  });

  it('liberal rules land just above the published 6-deck 0.28% (infinite deck costs ~0.07%)', () => {
    const e = -blackjackOdds(LIBERAL).ev;
    expect(e).toBeGreaterThan(0.0028);
    expect(e).toBeLessThan(0.0040);
  });

  it('basic strategy spot checks', () => {
    const a = (x: number, y: number, u: number) => firstAction(OWNER_RULES, x, y, u);
    expect(a(10, 6, 10)).toBe('hit');
    expect(a(1, 7, 3)).toBe('double');
    expect(a(10, 2, 4)).toBe('stand');
    expect(a(8, 8, 10)).toBe('split');
    expect(a(10, 10, 6)).toBe('stand');
    expect(a(5, 5, 9)).toBe('double');
    expect(a(4, 4, 5)).toBe('split');
    expect(firstAction(LIBERAL, 10, 6, 10)).toBe('surrender');
  });

  it('matches an independent card-by-card simulation of the same strategy (sampled check only)', () => {
    const rules = OWNER_RULES;
    const s = strategy(rules);
    const exact = new Map(blackjackOdds(rules).outcomes.map((o) => [o.net, o.p]));
    const rand = mulberry32(31337);
    const card = () => Math.min(10, 1 + Math.floor(rand() * 13));
    const total = (hard: number, ace: boolean) => (ace && hard + 10 <= 21 ? hard + 10 : hard);
    const dealerFinish = (hard: number, ace: boolean) => {
      for (;;) {
        const t = total(hard, ace);
        const soft = ace && hard + 10 <= 21;
        if (hard > 21) return 22;
        if (t > 17 || (t === 17 && !(rules.hitSoft17 && soft))) return t;
        const c = card();
        hard += c;
        ace ||= c === 1;
      }
    };
    /** Plays a hand from (hard, ace) after its first decision `action`; returns [total (22 = bust), multiplier]. */
    const finish = (hard: number, ace: boolean, up: number, action: string): [number, number] => {
      const draw = () => {
        const c = card();
        hard += c;
        ace ||= c === 1;
      };
      if (action === 'double') {
        draw();
        return [hard > 21 ? 22 : total(hard, ace), 2];
      }
      if (action === 'hit') {
        draw();
        while (hard <= 21 && total(hard, ace) < 21 && s.later(hard, ace, up) === 'hit') draw();
      }
      return [hard > 21 ? 22 : total(hard, ace), 1];
    };
    const runs = 400000;
    const got = new Map<number, number>();
    for (let r = 0; r < runs; r++) {
      const up = card();
      const hole = card();
      const a = card();
      const b = card();
      const dealerBj = (up === 1 && hole === 10) || (up === 10 && hole === 1);
      const playerBj = (a === 1 && b === 10) || (a === 10 && b === 1);
      let net: number;
      if (playerBj) net = dealerBj ? 0 : rules.bjPays;
      else if (dealerBj) net = -1;
      else {
        const action = s.first(a, b, up);
        const hands: [number, number][] = [];
        if (action === 'split') {
          const pending = [a, a];
          let count = 2;
          while (pending.length) {
            const c = pending.pop()!;
            const x = card();
            if (x === c && count < rules.maxHands && (c !== 1 || rules.resplitAces)) {
              pending.push(c, c);
              count++;
            } else if (c === 1) hands.push([total(1 + x, true), 1]);
            else hands.push(finish(c + x, x === 1, up, s.afterSplit(c, x, up)));
          }
        } else if (action !== 'surrender') hands.push(finish(a + b, a === 1 || b === 1, up, action));
        const d = hands.some(([t]) => t <= 21) ? dealerFinish(up + hole, up === 1 || hole === 1) : 0;
        net = action === 'surrender' ? -0.5 : 0;
        for (const [t, m] of hands) net += t > 21 ? -m : d > 21 || t > d ? m : t < d ? -m : 0;
      }
      got.set(net, (got.get(net) ?? 0) + 1);
    }
    for (const [net, p] of exact) {
      if (p < 1e-4) continue;
      const sd = Math.sqrt((p * (1 - p)) / runs);
      expect(Math.abs((got.get(net) ?? 0) / runs - p), `net ${net}`).toBeLessThan(4.5 * sd);
    }
  });
});

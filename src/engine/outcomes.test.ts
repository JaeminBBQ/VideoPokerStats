import { beforeAll, describe, expect, it } from 'vitest';
import { parseHand } from './cards.ts';
import { buildTables, EV_EPSILON, holdEvs, type Tables } from './ev.ts';
import { GAMES } from './games.ts';
import { bestAndSecond, buildOutcomeTables, holdOutcomes } from './outcomes.ts';

describe.each(['job-8-5', 'lb-deuces-16-13'] as const)('outcome tables: %s', (id) => {
  const game = GAMES[id];
  let tables: Tables;
  let outcomeTables: Tables[];
  beforeAll(() => {
    tables = buildTables(game);
    outcomeTables = buildOutcomeTables(game);
  }, 60_000);

  const hands = ['As Ks Qs Js 9d', 'Jc Jd 3h 4s 5c', '2c 2d 7h 9s Kd', '3c 6d 9h Js Kh', '8c 8d 8h 8s 2c', '2c Ah 3d 4s 9c'];

  it.each(hands)('%s: Σ P = 1 and Σ P·pays = holdEvs for every hold', (text) => {
    const hand = parseHand(text);
    const evs = holdEvs(tables, hand);
    const pays = [...game.rows.map((r) => r.pays), 0];
    for (let mask = 0; mask < 32; mask++) {
      const p = holdOutcomes(outcomeTables, hand, mask);
      expect(p).toHaveLength(game.rows.length + 1);
      expect(Math.abs(p.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
      expect(Math.abs(p.reduce((acc, v, i) => acc + v * pays[i], 0) - evs[mask])).toBeLessThan(1e-12);
      // Indicator tables agree with holdEvs run on them directly.
      p.forEach((v, k) => expect(Math.abs(v - holdEvs(outcomeTables[k], hand)[mask])).toBeLessThan(1e-12));
    }
  });

  it.each(hands)('%s: the mistake hold is strictly worse than the best', (text) => {
    const hand = parseHand(text);
    const evs = holdEvs(tables, hand);
    const { best, second } = bestAndSecond(tables, hand);
    expect(evs[second]).toBeLessThan(evs[best] - EV_EPSILON);
    for (let m = 0; m < 32; m++) expect(evs[m] <= evs[best] + EV_EPSILON).toBe(true);
    for (let m = 0; m < 32; m++) if (evs[m] < evs[best] - EV_EPSILON) expect(evs[m]).toBeLessThanOrEqual(evs[second]);
  });
});

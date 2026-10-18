import { beforeAll, describe, expect, it } from 'vitest';
import { deal, mulberry32, parseHand, type Card } from '../../../src/engine/cards.ts';
import { EV_EPSILON, analyzeHand, buildTables, type HoldEv, type Tables } from '../../../src/engine/ev.ts';
import { patternFor } from '../../../src/engine/drill.ts';
import { GAMES, type GameDef } from '../../../src/engine/games.ts';
import { rankHolds, tiedBest } from './holds.ts';

const game = GAMES['gsr-job-9-6'];
let tables: Tables;
beforeAll(() => {
  tables = buildTables(game);
}, 60_000);

/** Deterministic search for a dealt hand whose best two holds tie exactly (per the engine). */
function findTie(t: Tables): { hand: Card[]; holds: HoldEv[] } {
  const rng = mulberry32(1);
  for (let i = 0; i < 50_000; i++) {
    const hand = deal(52, rng);
    const holds = analyzeHand(t, hand);
    if (holds[0].ev - holds[1].ev <= EV_EPSILON) return { hand, holds };
  }
  throw new Error('no tie found');
}

describe('rankHolds', () => {
  it('mirrors the engine: order, EVs, masks, loss, patterns', () => {
    const hand = parseHand('Ks Qs Js 7d 3c');
    const holds = analyzeHand(tables, hand);
    const ranked = rankHolds(holds, game);
    expect(ranked).toHaveLength(32);
    const best = holds[0];
    ranked.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
      expect(r.mask).toBe(holds[i].mask);
      expect(r.held).toEqual(holds[i].held);
      expect(r.ev).toBe(holds[i].ev);
      expect(r.loss).toBeCloseTo(best.ev - holds[i].ev, 12);
      expect(r.loss).toBeGreaterThanOrEqual(0);
      expect(r.pattern).toBe(patternFor(game, holds[i].held)!.label);
    });
    expect(ranked[0].loss).toBe(0);
    expect(ranked[0].tie).toBe(true);
    expect(ranked[1].tie).toBe(best.ev - holds[1].ev <= EV_EPSILON);
    // Losses never decrease down the ranking.
    for (let i = 1; i < 32; i++) expect(ranked[i].loss).toBeGreaterThanOrEqual(ranked[i - 1].loss);
  });

  it('marks exact ties as ties (ties are ties)', () => {
    const { holds } = findTie(tables);
    const ranked = rankHolds(holds, game);
    const ties = tiedBest(ranked);
    expect(ties.length).toBeGreaterThanOrEqual(2);
    for (const h of ties) expect(holds[0].ev - h.ev).toBeLessThanOrEqual(EV_EPSILON);
    // Every non-tie really is worse by more than epsilon.
    for (const h of ranked.filter((r) => !r.tie)) expect(h.loss).toBeGreaterThan(EV_EPSILON);
    expect(ties.map((h) => h.mask)).toEqual(holds.filter((h) => holds[0].ev - h.ev <= EV_EPSILON).map((h) => h.mask));
  });

  it('a hand with a single best hold has one tied-best entry', () => {
    const ranked = rankHolds(analyzeHand(tables, parseHand('Ks Qs Js 7d 3c')), game);
    expect(tiedBest(ranked)).toHaveLength(ranked.filter((r) => r.tie).length);
    expect(tiedBest(ranked)[0]).toBe(ranked[0]);
  });

  it('re-sorts unsorted input', () => {
    const holds = analyzeHand(tables, parseHand('Ah Ad 9c 5s 2h'));
    const shuffled = holds.slice().reverse();
    expect(rankHolds(shuffled, game).map((h) => h.ev)).toEqual(holds.map((h) => h.ev));
  });

  it('pattern is null for a game without a chart', () => {
    const noChart: GameDef = { ...game, rows: game.rows.map((r) => (r.key === 'jacks-or-better' ? { ...r, key: 'pair' } : r)) };
    const ranked = rankHolds(analyzeHand(tables, parseHand('Ks Qs Js 7d 3c')), noChart);
    expect(ranked.every((r) => r.pattern === null)).toBe(true);
  });

  it('empty input gives an empty ranking', () => {
    expect(rankHolds([], game)).toEqual([]);
  });
});

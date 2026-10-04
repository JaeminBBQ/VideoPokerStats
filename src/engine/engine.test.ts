import { beforeAll, describe, expect, it } from 'vitest';
import { deal, mulberry32, parseHand, type Card } from './cards.ts';
import { analyzeHand, buildTables, holdEvs, BINOM, type Tables } from './ev.ts';
import { GAMES, payout, type GameDef, type GameId } from './games.ts';

const rowKey = (game: GameDef, hand: string) => {
  const i = game.evaluate(parseHand(hand));
  return i < 0 ? 'nothing' : game.rows[i].key;
};

describe('deuces evaluator', () => {
  const g = GAMES.nsud;
  it.each([
    ['As Ks Qs Js Ts', 'natural-royal'],
    ['2c 2d 2h 2s 9c', 'four-deuces'],
    ['2c As Ks Qs Ts', 'wild-royal'],
    ['2c 2d As Ks Qs', 'wild-royal'],
    ['2c 9h 9d 9s 9c', 'five-kind'],
    ['2c 2d 2h 7s 7d', 'five-kind'],
    ['2c 5h 6h 8h 9h', 'straight-flush'],
    ['2c 2d Ah 3h 4h', 'straight-flush'],
    ['2c 2d 2h 7s 9d', 'four-kind'],
    ['2c 8h 8d Ks Kc', 'full-house'],
    ['8c 8h 8d Ks Kc', 'full-house'],
    ['2c 3h 7h 9h Kh', 'flush'],
    ['2c 2d 6h 9s Ts', 'straight'],
    ['2c Ah 3d 4s 5c', 'straight'],
    ['2c 9h 9d 4s 5c', 'three-kind'],
    ['2c 9h Jd 4s 5c', 'nothing'],
    ['9c 9h Jd Js 5c', 'nothing'],
  ])('%s → %s', (hand, key) => expect(rowKey(g, hand)).toBe(key));
});

describe('joker evaluator', () => {
  const g = GAMES['joker-kings'];
  it.each([
    ['As Ks Qs Js Ts', 'natural-royal'],
    ['Jk As Ks Qs Ts', 'joker-royal'],
    ['Jk 9h 9d 9s 9c', 'five-kind'],
    ['Jk 8h 8d Ks Kc', 'full-house'],
    ['Jk 7h 7d 3s 4c', 'three-kind'],
    ['7c 7h 3d 3s Kc', 'two-pair'],
    ['Jk Ah 7d 3s 4c', 'kings-or-better'],
    ['Kc Kh 7d 3s 4c', 'kings-or-better'],
    ['Qc Qh 7d 3s 4c', 'nothing'],
    ['Jk Qh 7d 3s 9c', 'nothing'],
  ])('%s → %s', (hand, key) => expect(rowKey(g, hand)).toBe(key));
});

describe('bonus evaluators', () => {
  it.each([
    ['db-10-7', 'Ac Ad Ah As 3c', 'four-aces'],
    ['db-10-7', '3c 3d 3h 3s Kc', 'four-2-4'],
    ['db-10-7', '9c 9d 9h 9s Kc', 'four-5-k'],
    ['ddb-10-6', 'Ac Ad Ah As 3c', 'four-aces-kicker'],
    ['ddb-10-6', 'Ac Ad Ah As 5c', 'four-aces'],
    ['ddb-10-6', '3c 3d 3h 3s Ac', 'four-2-4-kicker'],
    ['ddb-10-6', '3c 3d 3h 3s 5c', 'four-2-4'],
    ['db-10-7', 'Ac 2d 3h 4s 5c', 'straight'],
    ['db-10-7', 'Jc Jd 3h 4s 5c', 'jacks-or-better'],
    ['db-10-7', 'Tc Td 3h 4s 5c', 'nothing'],
    ['db-10-7', '9h Th Jh Qh Kh', 'straight-flush'],
  ])('%s: %s → %s', (id, hand, key) => expect(rowKey(GAMES[id as GameId], hand)).toBe(key));
});

/** Brute force: enumerate every draw for every hold and evaluate directly. */
function bruteForceEvs(game: GameDef, hand: Card[]): number[] {
  const deck = Array.from({ length: game.deckSize }, (_, i) => i).filter((c) => !hand.includes(c));
  const evs: number[] = [];
  for (let mask = 0; mask < 32; mask++) {
    const held = hand.filter((_, i) => mask & (1 << i));
    const need = 5 - held.length;
    let total = 0;
    let count = 0;
    const pick: Card[] = [];
    const rec = (start: number) => {
      if (pick.length === need) {
        total += payout(game, [...held, ...pick]);
        count++;
        return;
      }
      for (let i = start; i <= deck.length - (need - pick.length); i++) {
        pick.push(deck[i]);
        rec(i + 1);
        pick.pop();
      }
    };
    rec(0);
    expect(count).toBe(BINOM[deck.length][need]);
    evs.push(total / count);
  }
  return evs;
}

describe.each(['nsud', 'db-10-7', 'joker-kings'] as GameId[])('%s hold EVs match brute force', (id) => {
  let tables: Tables;
  beforeAll(() => {
    tables = buildTables(GAMES[id]);
  });
  it('on random hands', { timeout: 120_000 }, () => {
    const rng = mulberry32(id.length * 7919);
    for (let i = 0; i < 2; i++) {
      const hand = deal(GAMES[id].deckSize, rng);
      const fast = holdEvs(tables, hand);
      const slow = bruteForceEvs(GAMES[id], hand);
      for (let m = 0; m < 32; m++) expect(fast[m]).toBeCloseTo(slow[m], 10);
    }
  });
});

describe('analyzeHand (NSUD)', () => {
  let tables: Tables;
  beforeAll(() => {
    tables = buildTables(GAMES.nsud);
  });
  it('holds a dealt natural royal and four deuces', () => {
    expect(analyzeHand(tables, parseHand('Ts Js Qs Ks As'))[0].mask).toBe(31);
    expect(analyzeHand(tables, parseHand('2c 2d 2h 2s 9c'))[0].ev).toBe(200);
  });
  it('masks refer to positions as dealt', () => {
    const best = analyzeHand(tables, parseHand('9c 2d 4h Ks 7s'))[0];
    expect(best.held).toEqual(parseHand('2d'));
    expect(best.mask).toBe(0b00010);
  });
  it('discarding everything equals the average over all hands from the 47 left', () => {
    const hand = parseHand('3c 5d 7h 9s Jc');
    expect(analyzeHand(tables, hand).find((h) => h.mask === 0)!.ev).toBeCloseTo(bruteForceEvs(GAMES.nsud, hand)[0], 10);
  });
});

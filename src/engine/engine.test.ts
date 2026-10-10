import { beforeAll, describe, expect, it } from 'vitest';
import { SUIT_SYMBOLS, deal, isRedSuit, mulberry32, parseHand, type Card } from './cards.ts';
import { analyzeHand, buildTables, holdEvs, BINOM, type Tables } from './ev.ts';
import { GAMES, GAME_LIST, VENUES, gamesAt, maxCoinsAt, offerAt, payout, snapDenomination, type GameDef, type GameId } from './games.ts';

const rowKey = (game: GameDef, hand: string) => {
  const i = game.evaluate(parseHand(hand));
  return i < 0 ? 'nothing' : game.rows[i].key;
};

describe('suit colors', () => {
  it('diamonds and hearts are red, clubs and spades black', () => {
    expect(SUIT_SYMBOLS.filter((_, s) => isRedSuit(s))).toEqual(['♦', '♥']);
  });
});

describe('deuces evaluator', () => {
  const g = GAMES['lb-deuces-16-13'];
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

describe('offers (D16)', () => {
  it('every game has offers, smallest denomination first', () => {
    for (const g of GAME_LIST) {
      expect(g.offers.length).toBeGreaterThan(0);
      const d = g.offers.map((o) => o.denomination);
      expect(d).toEqual([...d].sort((a, b) => a - b));
    }
  });
  it('GSR max bets and Legends Bay 5 coins', () => {
    expect(maxCoinsAt(GAMES['gsr-job-9-5'], 0.05)).toBe(20);
    expect(maxCoinsAt(GAMES['gsr-deuces-20-12-10'], 0.05)).toBe(20);
    expect(maxCoinsAt(GAMES['gsr-job-9-6'], 1)).toBe(10);
    expect(maxCoinsAt(GAMES['job-8-5'], 0.25)).toBe(5);
    expect(offerAt(GAMES['gsr-job-9-6'], 0.05)).toBeUndefined();
    expect(() => maxCoinsAt(GAMES['gsr-job-9-6'], 0.05)).toThrow();
  });
  it('snaps a denomination the game is not offered at to the closest one', () => {
    expect(snapDenomination(GAMES['gsr-job-9-6'], 0.05)).toBe(1);
    expect(snapDenomination(GAMES['gsr-job-9-5'], 1)).toBe(0.05);
    expect(snapDenomination(GAMES['job-8-5'], 0.1)).toBe(0.1);
  });
});

describe('deuces wild bonus poker evaluator', () => {
  const g = GAMES['gsr-dwbp'];
  it.each([
    ['As Ks Qs Js Ts', 'natural-royal'],
    ['2c 2d 2h 2s Ac', 'four-deuces-ace'],
    ['2c 2d 2h 2s 3c', 'four-deuces'],
    ['2c 2d Ah Ad As', 'five-aces'],
    ['2c 3h 3d 3s 3c', 'five-3-5'],
    ['2c 2d 2h 5s 5d', 'five-3-5'],
    ['2c 2d 2h 6s 6d', 'five-6-k'],
    ['2c 2d Kh Ks Kd', 'five-6-k'],
    ['2c As Ks Qs Ts', 'wild-royal'],
    ['2c 5h 6h 8h 9h', 'straight-flush'],
    ['2c 2d 2h 7s 9d', 'four-kind'],
    ['2c 8h 8d Ks Kc', 'full-house'],
    ['2c 3h 7h 9h Kh', 'flush'],
    ['2c 2d 6h 9s Ts', 'straight'],
    ['2c 9h 9d 4s 5c', 'three-kind'],
    ['2c 9h Jd 4s 5c', 'nothing'],
  ])('%s → %s', (hand, key) => expect(rowKey(g, hand)).toBe(key));
});

describe('bonus evaluators', () => {
  it.each([
    ['bonus-6-5', 'Ac Ad Ah As 3c', 'four-aces'],
    ['bonus-6-5', '3c 3d 3h 3s Kc', 'four-2-4'],
    ['bonus-6-5', '9c 9d 9h 9s Kc', 'four-5-k'],
    ['job-8-5', 'Ac 2d 3h 4s 5c', 'straight'],
    ['job-8-5', 'Jc Jd 3h 4s 5c', 'jacks-or-better'],
    ['job-8-5', 'Tc Td 3h 4s 5c', 'nothing'],
    ['job-8-5', '9h Th Jh Qh Kh', 'straight-flush'],
    ['job-8-5', '9c 9d 9h 9s Kc', 'four-kind'],
    ['job-8-5', '7c 7h 3d 3s Kc', 'two-pair'],
    ['bonus-6-5', 'Ac Ad Ah As 3c', 'four-aces'],
    ['bonus-6-5', '4c 4d 4h 4s 3c', 'four-2-4'],
    ['bpd-7-5', '6c 6d 6h 6s 3c', 'four-kind'],
    ['gsr-db-9-7-5', 'Ac Ad Ah As 3c', 'four-aces'],
    ['gsr-db-9-7-5', '2c 2d 2h 2s Kc', 'four-2-4'],
    ['gsr-db-9-7-5', 'Kc Kd Kh Ks 3c', 'four-5-k'],
    ['gsr-db-9-7-5', '7c 7h 3d 3s Kc', 'two-pair'],
  ])('%s: %s → %s', (id, hand, key) => expect(rowKey(GAMES[id as GameId], hand)).toBe(key));

  it('pays two pair as on the photographed Legends Bay machine', () => {
    const twoPair = (id: GameId) => GAMES[id].rows.find((r) => r.key === 'two-pair')!.pays;
    expect([twoPair('job-8-5'), twoPair('bonus-6-5'), twoPair('bpd-7-5')]).toEqual([2, 2, 1]);
  });
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

describe.each(['lb-deuces-16-13', 'job-8-5', 'bonus-6-5'] as GameId[])('%s hold EVs match brute force', (id) => {
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

describe('analyzeHand (Legends Bay deuces)', () => {
  let tables: Tables;
  beforeAll(() => {
    tables = buildTables(GAMES['lb-deuces-16-13']);
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
    expect(analyzeHand(tables, hand).find((h) => h.mask === 0)!.ev).toBeCloseTo(bruteForceEvs(GAMES['lb-deuces-16-13'], hand)[0], 10);
  });
});

describe('venues', () => {
  it('lists every game under exactly one casino tab, best return first', () => {
    const listed = VENUES.flatMap((v) => gamesAt(v).map((g) => g.id));
    expect(listed.sort()).toEqual(GAME_LIST.map((g) => g.id).sort());
    const lb = gamesAt('Legends Bay').map((g) => g.publishedReturn);
    expect(lb).toEqual([...lb].sort((a, b) => b - a));
    expect(GAME_LIST.every((g) => g.proof.startsWith('context/'))).toBe(true);
  });
});

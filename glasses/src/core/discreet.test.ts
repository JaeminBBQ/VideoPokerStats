import { describe, expect, it } from 'vitest';
import { JOKER, parseHand } from '../../../src/engine/cards.ts';
import { DRAFT_JOKER, canAddRank, canAddSuit, draftFromHand, draftHand, draftPhase, emptyDraft, pendingIndex, tapRank, tapSuit, undoDraft, type Draft } from './discreet.ts';

const C = 0, D = 1, H = 2, S = 3;
const K = 11, Q = 10, J = 9, SEVEN = 5, THREE = 1;
const ranks = (rs: number[], joker = false): Draft => rs.reduce((d, r) => tapRank(d, r, joker), emptyDraft);
const suits = (d: Draft, ss: number[]): Draft => ss.reduce((x, s) => tapSuit(x, s), d);

describe('discreet draft', () => {
  it('ranks first, then suits in dealt order, then a whole hand', () => {
    let d = ranks([K, Q, J, SEVEN]);
    expect(draftPhase(d)).toBe('ranks');
    expect(tapSuit(d, S)).toBe(d); // no suits before five ranks
    d = tapRank(d, THREE, false);
    expect(draftPhase(d)).toBe('suits');
    expect(tapRank(d, K, false)).toBe(d); // no sixth rank
    expect(pendingIndex(d)).toBe(0);
    d = suits(d, [S, S, S, D]);
    expect(pendingIndex(d)).toBe(4);
    expect(draftHand(d)).toBeNull();
    expect(draftHand(tapSuit(d, C))).toEqual(parseHand('Ks Qs Js 7d 3c'));
  });

  it('a rank caps at four; suits that would repeat a card are refused', () => {
    const d = ranks([K, K, K, K]);
    expect(canAddRank(d, K, false)).toBe(false);
    expect(tapRank(d, K, false)).toBe(d);
    const full = suits(tapRank(d, Q, false), [S, H]);
    expect(canAddSuit(full, S)).toBe(false);
    expect(canAddSuit(full, H)).toBe(false);
    expect(canAddSuit(full, D)).toBe(true);
    expect(draftHand(suits(full, [D, C, H]))).toEqual(parseHand('Ks Kh Kd Kc Qh'));
  });

  it('the joker needs a joker deck, appears once, and takes no suit', () => {
    expect(tapRank(emptyDraft, DRAFT_JOKER, false)).toBe(emptyDraft);
    const d = ranks([K, DRAFT_JOKER, Q, J, SEVEN], true);
    expect(canAddRank(ranks([DRAFT_JOKER], true), DRAFT_JOKER, true)).toBe(false);
    const done = suits(d, [S, S, S, S]);
    expect(draftHand(done)).toEqual([...parseHand('Ks'), JOKER, ...parseHand('Qs Js 7s')]);
  });

  it('undo removes the last suit, then ranks; draftFromHand reopens the last suit', () => {
    let d = suits(ranks([K, Q, J, SEVEN, THREE]), [S, S]);
    d = undoDraft(d);
    expect(d.cards.map((c) => c.suit)).toEqual([S, null, null, null, null]);
    d = undoDraft(undoDraft(d));
    expect(d.cards.map((c) => c.rank)).toEqual([K, Q, J, SEVEN]);
    expect(undoDraft(emptyDraft)).toBe(emptyDraft);
    const back = draftFromHand(parseHand('Ks Qs Js 7d 3c'));
    expect(pendingIndex(back)).toBe(4);
    expect(draftHand(tapSuit(back, H))).toEqual(parseHand('Ks Qs Js 7d 3h'));
  });
});

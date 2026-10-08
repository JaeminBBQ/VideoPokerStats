import { describe, expect, it } from 'vitest';
import { RANKS, cardToString } from '../engine/index.ts';
import {
  RANK_LABELS,
  clear,
  emptyEntry,
  pickRank,
  pickSuit,
  rankDisabled,
  selectSlot,
  suitDisabled,
  toHand,
  undo,
  type EntryState,
} from './handEntry.ts';

/** 5 ranks then 5 suits, one tap each (the 10-tap happy path). */
function enter(ranks: number[], suits: number[]): EntryState {
  let s = emptyEntry();
  for (const r of ranks) s = pickRank(s, r);
  for (const su of suits) s = pickSuit(s, su);
  return s;
}

describe('hand entry', () => {
  it('enters a hand in 10 taps: 5 ranks then 5 suits, cards in slot order', () => {
    let s = emptyEntry();
    for (const r of [12, 11, 10, 9]) {
      s = pickRank(s, r);
      expect(s.stage).toBe('rank');
    }
    s = pickRank(s, 7);
    // After the 5th rank the stage flips to suits, starting at slot 0.
    expect(s.stage).toBe('suit');
    expect(s.cursor).toBe(0);
    for (const su of [3, 3, 3, 3, 1]) s = pickSuit(s, su);
    expect(toHand(s)).toEqual([51, 47, 43, 39, 29]); // As Ks Qs Js 9d
    expect(toHand(s)!.map(cardToString)).toEqual(['As', 'Ks', 'Qs', 'Js', '9d']);
  });

  it('refuses a suit that would duplicate a card already in another slot', () => {
    // Slot 0 = A♠, slot 1 = K♠; picking ♠ for slot 2 (another ace) must not land.
    let s = enter([12, 11, 12, 9, 7], [3, 3]);
    expect(s.cursor).toBe(2);
    expect(suitDisabled(s, 3)).toBe(true);
    expect(pickSuit(s, 3)).toBe(s); // no-op
    s = pickSuit(s, 2); // A♥ is fine
    expect(s.cursor).toBe(3);
    s = pickSuit(s, 1); // Jd
    s = pickSuit(s, 0); // 9c
    expect(toHand(s)!.map(cardToString)).toEqual(['As', 'Ks', 'Ah', 'Jd', '9c']);
  });

  it('caps a rank at 4 slots: the 5th pick is refused', () => {
    let s = emptyEntry();
    for (let i = 0; i < 4; i++) s = pickRank(s, 0);
    expect(s.cursor).toBe(4);
    expect(rankDisabled(s, 0)).toBe(true);
    expect(pickRank(s, 0)).toBe(s); // no-op, still 4 deuces
  });

  it('selectSlot clears the card and re-entry flows rank then suit', () => {
    let s = enter([12, 11, 10, 9, 7], [3, 3, 3, 3, 1]); // As Ks Qs Js 9d
    s = selectSlot(s, 2); // re-enter the Q♠ slot
    expect(s.stage).toBe('rank');
    expect(s.cursor).toBe(2);
    expect(toHand(s)).toBeNull();
    s = pickRank(s, 6); // 8
    expect(s.stage).toBe('suit'); // all ranks in again
    expect(s.cursor).toBe(2); // the only slot still missing a suit
    s = pickSuit(s, 0); // 8♣
    expect(toHand(s)!.map(cardToString)).toEqual(['As', 'Ks', '8c', 'Js', '9d']);
  });

  it('re-picking a rank mid-entry continues ranks while others are missing', () => {
    let s = emptyEntry();
    s = pickRank(s, 12); // slot 0
    s = pickRank(s, 11); // slot 1
    s = selectSlot(s, 0);
    s = pickRank(s, 9); // slot 0 again; slots 2–4 still lack ranks
    expect(s.stage).toBe('rank');
    expect(s.cursor).toBe(2);
  });

  it('undo clears suits right-to-left, then ranks right-to-left', () => {
    let s = enter([12, 11, 10, 9, 7], [3, 3, 3, 3, 1]);
    expect(s.cursor).toBe(4); // complete: cursor stays on the last card
    s = undo(s);
    expect(s.suits).toEqual([3, 3, 3, 3, null]);
    expect(s.stage).toBe('suit');
    expect(s.cursor).toBe(4);
    s = undo(s);
    expect(s.suits).toEqual([3, 3, 3, null, null]);
    expect(s.cursor).toBe(3);
    s = undo(s);
    s = undo(s);
    s = undo(s);
    expect(s.suits).toEqual([null, null, null, null, null]);
    expect(s.cursor).toBe(0);
    s = undo(s); // no suits left: the rightmost rank goes
    expect(s.ranks).toEqual([12, 11, 10, 9, null]);
    expect(s.stage).toBe('rank');
    expect(s.cursor).toBe(4);
  });

  it('undo on the empty state is a no-op', () => {
    const s = emptyEntry();
    expect(undo(s)).toBe(s);
  });

  it("reads rank index 8 as '10' while the card encodes as 'T'", () => {
    expect(RANK_LABELS[8]).toBe('10');
    expect(RANKS[8]).toBe('T');
    const s = enter([8, 12, 11, 10, 9], [0, 3, 3, 3, 3]);
    expect(cardToString(toHand(s)![0])).toBe('Tc');
  });

  it('toHand is null until all 5 ranks and suits are in', () => {
    let s = emptyEntry();
    expect(toHand(s)).toBeNull();
    for (const r of [12, 11, 10, 9]) s = pickRank(s, r);
    expect(toHand(s)).toBeNull();
    s = pickRank(s, 7);
    expect(toHand(s)).toBeNull(); // ranks done, no suits yet
  });

  it('picks only in their stage', () => {
    let s = emptyEntry();
    expect(pickSuit(s, 0)).toBe(s); // a suit pick before any rank is a no-op
    for (const r of [12, 11, 10, 9, 7]) s = pickRank(s, r);
    expect(pickRank(s, 0)).toBe(s); // a rank pick during the suit stage is a no-op
  });

  it('clear resets to the empty state', () => {
    enter([12, 11, 10, 9, 7], [3, 3, 3, 3, 1]);
    expect(clear()).toEqual(emptyEntry());
    expect(clear().stage).toBe('rank');
    expect(clear().cursor).toBe(0);
  });
});

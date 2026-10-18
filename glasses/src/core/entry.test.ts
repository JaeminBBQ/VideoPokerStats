import { describe, expect, it } from 'vitest';
import { parseHand } from '../../../src/engine/cards.ts';
import { clear, emptyEntry, entryFromHand, handOf, isComplete, tapCard, tapSlot, undo, usedCards, type EntryState } from './entry.ts';

const [K, Q, J, SEVEN, THREE, ACE] = parseHand('Ks Qs Js 7d 3c Ah');
const tapAll = (s: EntryState, cards: number[]) => cards.reduce(tapCard, s);

describe('entry', () => {
  it('fills slots left to right and completes at five', () => {
    let s = emptyEntry;
    s = tapAll(s, [K, Q]);
    expect(s.slots).toEqual([K, Q, null, null, null]);
    expect(isComplete(s)).toBe(false);
    s = tapAll(s, [J, SEVEN, THREE]);
    expect(isComplete(s)).toBe(true);
    expect(handOf(s)).toEqual([K, Q, J, SEVEN, THREE]);
    expect(usedCards(s)).toEqual(new Set([K, Q, J, SEVEN, THREE]));
  });

  it('rejects duplicates by returning the same state', () => {
    const s = tapAll(emptyEntry, [K, Q]);
    expect(tapCard(s, K)).toBe(s);
  });

  it('does not mutate the previous state', () => {
    const a = tapCard(emptyEntry, K);
    const b = tapCard(a, Q);
    expect(a.slots).toEqual([K, null, null, null, null]);
    expect(b.slots).toEqual([K, Q, null, null, null]);
    expect(emptyEntry.slots).toEqual([null, null, null, null, null]);
  });

  it('starts a new hand on the tap after a complete hand', () => {
    const full = tapAll(emptyEntry, [K, Q, J, SEVEN, THREE]);
    const next = tapCard(full, K); // even a card from the old hand is fine
    expect(next.slots).toEqual([K, null, null, null, null]);
    expect(next.order).toEqual([0]);
    expect(tapCard(full, ACE).slots).toEqual([ACE, null, null, null, null]);
  });

  it('tapSlot clears and arms the slot; the next card goes there', () => {
    let s = tapAll(emptyEntry, [K, Q, J, SEVEN, THREE]);
    s = tapSlot(s, 2);
    expect(s.slots).toEqual([K, Q, null, SEVEN, THREE]);
    expect(s.armed).toBe(2);
    expect(isComplete(s)).toBe(false);
    expect(usedCards(s).has(J)).toBe(false);
    s = tapCard(s, ACE);
    expect(s.slots).toEqual([K, Q, ACE, SEVEN, THREE]);
    expect(s.armed).toBeNull();
    expect(isComplete(s)).toBe(true);
  });

  it('armed slot beats the first empty slot', () => {
    let s = tapAll(emptyEntry, [K, Q, J]);
    s = tapSlot(s, 0);
    s = tapSlot(s, 4); // arming an empty slot moves the target
    s = tapCard(s, ACE);
    expect(s.slots).toEqual([null, Q, J, null, ACE]);
    s = tapCard(s, K);
    expect(s.slots).toEqual([K, Q, J, null, ACE]);
  });

  it('tapSlot ignores bad indices and re-arming the same empty slot', () => {
    const s = tapSlot(tapCard(emptyEntry, K), 3);
    expect(tapSlot(s, 3)).toBe(s);
    expect(tapSlot(s, 5)).toBe(s);
    expect(tapSlot(s, -1)).toBe(s);
    expect(tapSlot(s, 1.5)).toBe(s);
  });

  it('undo removes the most recently added card, wherever it went', () => {
    let s = tapAll(emptyEntry, [K, Q, J]);
    s = tapSlot(s, 0);
    s = tapCard(s, ACE); // ACE back into slot 0, now the newest
    expect(undo(s).slots).toEqual([null, Q, J, null, null]);
    expect(undo(undo(s)).slots).toEqual([null, Q, null, null, null]);
    let e = emptyEntry;
    expect(undo(e)).toBe(e);
    e = tapSlot(e, 2);
    expect(undo(e).armed).toBeNull();
  });

  it('undo on a complete hand reopens the last slot', () => {
    const s = undo(tapAll(emptyEntry, [K, Q, J, SEVEN, THREE]));
    expect(s.slots).toEqual([K, Q, J, SEVEN, null]);
    expect(tapCard(s, ACE).slots).toEqual([K, Q, J, SEVEN, ACE]);
  });

  it('clear empties everything', () => {
    expect(clear(tapAll(emptyEntry, [K, Q]))).toBe(emptyEntry);
    expect(clear(emptyEntry)).toBe(emptyEntry);
  });

  it('entryFromHand restores a saved hand and rejects bad input', () => {
    const s = entryFromHand([K, Q, J]);
    expect(s.slots).toEqual([K, Q, J, null, null]);
    expect(undo(s).slots).toEqual([K, Q, null, null, null]);
    expect(entryFromHand([K, K])).toBe(emptyEntry);
    expect(entryFromHand([K, Q, J, SEVEN, THREE, ACE])).toBe(emptyEntry);
    expect(isComplete(entryFromHand([K, Q, J, SEVEN, THREE]))).toBe(true);
  });
});

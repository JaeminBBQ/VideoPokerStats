/**
 * Hand-entry state machine (pure, immutable). Five slots in dealt order, left to right as on the machine.
 *
 * - `tapCard` fills the armed slot (set by `tapSlot`) or else the first empty slot. A card already in the
 *   hand is rejected (the state is returned unchanged). On a complete hand, the next tap starts a new hand
 *   with that card in slot 1, which is the fast "next hand" loop.
 * - `tapSlot` clears that slot and arms it, so the next card goes there.
 * - `undo` removes the most recently added card. `clear` empties everything.
 *
 * Every action returns the same object when nothing changed, so callers can compare by reference.
 */
import type { Card } from './cards.ts';

export const SLOTS = 5;

export interface EntryState {
  /** Slot i holds the card dealt at position i, or null. */
  readonly slots: readonly (Card | null)[];
  /** Filled slot indices, oldest first (for undo). */
  readonly order: readonly number[];
  /** Slot the next card goes into, set by tapSlot; null = first empty slot. */
  readonly armed: number | null;
}

export const emptyEntry: EntryState = Object.freeze({
  slots: Object.freeze([null, null, null, null, null]),
  order: Object.freeze([]),
  armed: null,
}) as EntryState;

/** An entry with `cards` in slots 1..n (used to restore a saved hand). Invalid input → empty. */
export function entryFromHand(cards: readonly Card[]): EntryState {
  if (cards.length > SLOTS || new Set(cards).size !== cards.length) return emptyEntry;
  if (cards.length === 0) return emptyEntry;
  const slots: (Card | null)[] = [null, null, null, null, null];
  cards.forEach((c, i) => (slots[i] = c));
  return { slots, order: cards.map((_, i) => i), armed: null };
}

export const isComplete = (s: EntryState): boolean => s.slots.every((c) => c !== null);

/** Filled cards in slot (dealt) order. Five cards when complete. */
export const handOf = (s: EntryState): Card[] => s.slots.filter((c): c is Card => c !== null);

/** Cards currently in the hand (to disable them in the grid). */
export const usedCards = (s: EntryState): Set<Card> => new Set(handOf(s));

export function tapCard(s: EntryState, card: Card): EntryState {
  if (isComplete(s)) return { slots: [card, null, null, null, null], order: [0], armed: null };
  if (s.slots.includes(card)) return s;
  const target = s.armed !== null && s.slots[s.armed] === null ? s.armed : s.slots.indexOf(null);
  const slots = s.slots.slice();
  slots[target] = card;
  return { slots, order: [...s.order, target], armed: null };
}

export function tapSlot(s: EntryState, slot: number): EntryState {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS) return s;
  if (s.slots[slot] === null) return s.armed === slot ? s : { ...s, armed: slot };
  const slots = s.slots.slice();
  slots[slot] = null;
  return { slots, order: s.order.filter((i) => i !== slot), armed: slot };
}

export function undo(s: EntryState): EntryState {
  if (s.order.length === 0) return s.armed === null ? s : { ...s, armed: null };
  const last = s.order[s.order.length - 1];
  const slots = s.slots.slice();
  slots[last] = null;
  return { slots, order: s.order.slice(0, -1), armed: null };
}

export const clear = (s: EntryState): EntryState => (s === emptyEntry ? s : emptyEntry);

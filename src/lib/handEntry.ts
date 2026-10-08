/**
 * Pure entry state for the Assist tab: the user taps 5 ranks then 5 suits (10 taps) and `toHand`
 * yields the dealt hand in slot order — the machine's position order the hold mask maps to.
 */
import type { Card } from '../engine/index.ts';

export type EntryStage = 'rank' | 'suit';

/** Rank (0 = deuce … 12 = ace) or suit (0..3 = c d h s) of one slot, or null when not entered. */
export type SlotField = number | null;
export type SlotFields = [SlotField, SlotField, SlotField, SlotField, SlotField];

export interface EntryState {
  /** Slot i's rank, or null when empty. */
  ranks: SlotFields;
  /** Slot i's suit, or null when empty. */
  suits: SlotFields;
  /** The slot the next tap goes to. */
  cursor: number;
  stage: EntryStage;
}

export const NUM_SLOTS = 5;

/** Rank pad labels, slot order; index 8 reads "10" (the card itself encodes as 'T'). */
export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const emptyEntry = (): EntryState => ({
  ranks: [null, null, null, null, null],
  suits: [null, null, null, null, null],
  cursor: 0,
  stage: 'rank',
});

const firstMissing = (slots: readonly (number | null)[]): number => slots.findIndex((v) => v === null);

/** True when rank `r` already fills 4 slots — a 5th is impossible (4 suits per rank). */
export function rankDisabled(s: EntryState, r: number): boolean {
  return s.ranks.filter((x) => x === r).length >= 4;
}

/** True when the card (ranks[cursor], suit) already sits in another slot. */
export function suitDisabled(s: EntryState, suit: number): boolean {
  const rank = s.ranks[s.cursor];
  if (rank === null) return false;
  return s.suits.some((su, i) => i !== s.cursor && su === suit && s.ranks[i] === rank);
}

/** Records rank `r` in the cursor slot and advances the cursor. After the 5th rank, switches to suits. */
export function pickRank(s: EntryState, r: number): EntryState {
  if (s.stage !== 'rank' || rankDisabled(s, r)) return s;
  const ranks = [...s.ranks] as SlotFields;
  ranks[s.cursor] = r;
  const next = firstMissing(ranks);
  if (next !== -1) return { ...s, ranks, cursor: next };
  // All ranks in: fill suits from the first slot that still needs one.
  return { ...s, ranks, stage: 'suit', cursor: firstMissing(s.suits) };
}

/** Records a suit in the cursor slot unless that card already sits in another slot. */
export function pickSuit(s: EntryState, suit: number): EntryState {
  if (s.stage !== 'suit' || suitDisabled(s, suit)) return s;
  const suits = [...s.suits] as SlotFields;
  suits[s.cursor] = suit;
  const next = firstMissing(suits);
  // When the hand is complete there is nowhere to advance; the cursor stays on the last card.
  return { ...s, suits, cursor: next === -1 ? s.cursor : next };
}

/** Re-enter slot `i`: clears its rank and suit and starts a rank pick there. */
export function selectSlot(s: EntryState, i: number): EntryState {
  const ranks = [...s.ranks] as SlotFields;
  const suits = [...s.suits] as SlotFields;
  ranks[i] = null;
  suits[i] = null;
  return { ...s, ranks, suits, cursor: i, stage: 'rank' };
}

/** Removes the most recent entry: suits right-to-left, then ranks right-to-left. */
export function undo(s: EntryState): EntryState {
  for (let i = NUM_SLOTS - 1; i >= 0; i--) {
    if (s.suits[i] !== null) {
      const suits = [...s.suits] as SlotFields;
      suits[i] = null;
      return { ...s, suits, cursor: i, stage: 'suit' };
    }
  }
  for (let i = NUM_SLOTS - 1; i >= 0; i--) {
    if (s.ranks[i] !== null) {
      const ranks = [...s.ranks] as SlotFields;
      ranks[i] = null;
      return { ...s, ranks, cursor: i, stage: 'rank' };
    }
  }
  return s;
}

export const clear = (): EntryState => emptyEntry();

/** The 5 cards in slot order, or null while any field is missing. */
export function toHand(s: EntryState): Card[] | null {
  const hand: Card[] = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    const rank = s.ranks[i];
    const suit = s.suits[i];
    if (rank === null || suit === null) return null;
    hand.push(rank * 4 + suit);
  }
  return hand;
}

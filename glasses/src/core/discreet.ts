/**
 * Discreet entry (phone, v0.5.0): a plain keypad of 13 ranks and 4 suits. The owner taps the five ranks in dealt
 * order, then the five suits in the same order; the phone never shows a card, and the lens shows the draft.
 * Pure and immutable; an action that can't act returns the same object.
 *
 *   RANKS   tapRank adds a rank (a rank already 4× in the draft, or a 2nd joker, is rejected). Five ranks → SUITS.
 *   SUITS   tapSuit gives the pending card (the first non-joker without a suit) its suit; a suit that would
 *           duplicate a card already in the draft is rejected. The last suit completes the hand (draftHand).
 *   undo    removes the last suit, or in RANKS the last rank.
 *
 * Ranks are engine ranks (0 = deuce … 12 = ace); DRAFT_JOKER stands for the joker, which takes no suit.
 */
import { JOKER, type Card } from './cards.ts';
import { SLOTS } from './entry.ts';

export const DRAFT_JOKER = 13;

export interface DraftCard {
  /** Engine rank, or DRAFT_JOKER. */
  readonly rank: number;
  /** Engine suit once tapped; null until then (always null for the joker). */
  readonly suit: number | null;
}

export interface Draft {
  /** Cards in dealt order. */
  readonly cards: readonly DraftCard[];
}

export const emptyDraft: Draft = Object.freeze({ cards: Object.freeze([]) }) as Draft;

export type DraftPhase = 'ranks' | 'suits';

export const draftPhase = (d: Draft): DraftPhase => (d.cards.length < SLOTS ? 'ranks' : 'suits');

/** Index of the card the next suit goes to, or -1 (still entering ranks, or every suit given). */
export function pendingIndex(d: Draft): number {
  if (d.cards.length < SLOTS) return -1;
  return d.cards.findIndex((c) => c.rank !== DRAFT_JOKER && c.suit === null);
}

const cardOf = (c: DraftCard): Card | null => (c.rank === DRAFT_JOKER ? JOKER : c.suit === null ? null : c.rank * 4 + c.suit);

/** Cards already fixed in the draft (suited cards and the joker). */
const fixedCards = (d: Draft): Set<Card> => new Set(d.cards.map(cardOf).filter((c): c is Card => c !== null));

/** True when `rank` can be added (fewer than 4 of it, or no joker yet). */
export function canAddRank(d: Draft, rank: number, jokerDeck: boolean): boolean {
  if (draftPhase(d) !== 'ranks' || !Number.isInteger(rank) || rank < 0 || rank > DRAFT_JOKER) return false;
  if (rank === DRAFT_JOKER && !jokerDeck) return false;
  const n = d.cards.filter((c) => c.rank === rank).length;
  return rank === DRAFT_JOKER ? n === 0 : n < 4;
}

/** True when `suit` can go on the pending card. */
export function canAddSuit(d: Draft, suit: number): boolean {
  const i = pendingIndex(d);
  if (i < 0 || !Number.isInteger(suit) || suit < 0 || suit > 3) return false;
  return !fixedCards(d).has(d.cards[i].rank * 4 + suit);
}

export function tapRank(d: Draft, rank: number, jokerDeck: boolean): Draft {
  if (!canAddRank(d, rank, jokerDeck)) return d;
  return { cards: [...d.cards, { rank, suit: null }] };
}

export function tapSuit(d: Draft, suit: number): Draft {
  if (!canAddSuit(d, suit)) return d;
  const i = pendingIndex(d);
  const cards = d.cards.slice();
  cards[i] = { ...cards[i], suit };
  return { cards };
}

export function undoDraft(d: Draft): Draft {
  for (let i = d.cards.length - 1; i >= 0; i--) {
    if (d.cards[i].suit !== null) {
      const cards = d.cards.slice();
      cards[i] = { ...cards[i], suit: null };
      return { cards };
    }
  }
  return d.cards.length === 0 ? d : { cards: d.cards.slice(0, -1) };
}

/** The five cards when every rank has its suit; otherwise null. */
export function draftHand(d: Draft): Card[] | null {
  if (d.cards.length !== SLOTS) return null;
  const cards = d.cards.map(cardOf);
  return cards.every((c): c is Card => c !== null) ? cards : null;
}

/** A complete hand reopened for a fix: every card kept, the last suited card's suit cleared. */
export function draftFromHand(hand: readonly Card[]): Draft {
  const cards: DraftCard[] = hand.map((c) => (c === JOKER ? { rank: DRAFT_JOKER, suit: null } : { rank: c >> 2, suit: c & 3 }));
  return undoDraft({ cards });
}

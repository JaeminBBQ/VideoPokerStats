/**
 * Card labels for the glasses and the phone. Engine encoding (read-only, ../../src/engine/cards.ts):
 * card = rank * 4 + suit, rank 0 = deuce .. 12 = ace, suit 0..3 = c d h s, 52 = joker.
 *
 * Never use the engine's SUIT_SYMBOLS on the glasses: it contains ♦ (U+2666), which the G2 firmware font
 * lacks (research/04-validation.md F7). The glasses use ◆ (U+25C6) instead.
 */
import { JOKER, RANKS, isRedSuit, rankOf, suitOf, type Card } from '../../../src/engine/cards.ts';

export type { Card };
export { JOKER, isRedSuit, rankOf, suitOf };

/** Glasses suit glyphs, indexed by engine suit (c d h s). All four are in the firmware font. */
export const GLASSES_SUITS = ['♣', '◆', '♥', '♠'] as const;
/** Letter-suit fallback ("Kd"), indexed by engine suit. */
export const LETTER_SUITS = ['c', 'd', 'h', 's'] as const;
/** Phone suit glyphs (the phone's fonts have ♦), indexed by engine suit. */
export const PHONE_SUITS = ['♣', '♦', '♥', '♠'] as const;

/** Rank label on the glasses: "T" for ten keeps every card two glyphs wide. */
export const glassesRank = (rank: number): string => RANKS[rank];
/** Rank label on the phone: "10" for ten. */
export const phoneRank = (rank: number): string => (rank === 8 ? '10' : RANKS[rank]);

/** Card label on the glasses, e.g. "K♠" (or "Ks" with letter suits). Joker = "Jk". */
export function glassesCard(c: Card, letterSuits = false): string {
  if (c === JOKER) return 'Jk';
  return glassesRank(rankOf(c)) + (letterSuits ? LETTER_SUITS : GLASSES_SUITS)[suitOf(c)];
}

/** Card label on the phone, e.g. "10♦". Joker = "Joker". */
export function phoneCard(c: Card): string {
  if (c === JOKER) return 'Joker';
  return phoneRank(rankOf(c)) + PHONE_SUITS[suitOf(c)];
}

/** Grid rows for the phone's card picker: ranks high to low (A .. 2). */
export const GRID_RANKS: readonly number[] = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
/** Grid columns: suits ♠ ♥ ♦ ♣ (black/red alternating). */
export const GRID_SUITS: readonly number[] = [3, 2, 1, 0];

/** The 13 × 4 card grid, rows = GRID_RANKS, columns = GRID_SUITS. */
export const cardGrid = (): Card[][] => GRID_RANKS.map((r) => GRID_SUITS.map((s) => r * 4 + s));

/** True for an engine card valid in a deck of `deckSize` (52, or 53 with the joker). */
export const isValidCard = (c: unknown, deckSize: number): c is Card =>
  typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < deckSize;

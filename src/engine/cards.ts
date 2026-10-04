/**
 * Card encoding: 0..51 = rank * 4 + suit, rank 0 = deuce .. 12 = ace, suit 0..3 = c d h s.
 * 52 = joker (Joker Poker only). Ascending card order is ascending rank.
 */
export type Card = number;

export const JOKER: Card = 52;
export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];

export const ACE = 12;
export const KING = 11;
export const JACK = 9;
export const TEN = 8;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;

export function cardToString(c: Card): string {
  if (c === JOKER) return 'Jk';
  return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

/** Parses "As", "td", "10h", "Jk"/"JK"/"joker". Throws on bad input. */
export function parseCard(s: string): Card {
  const t = s.trim();
  if (/^(jk|joker)$/i.test(t)) return JOKER;
  const m = /^(10|[2-9tjqka])([cdhs])$/i.exec(t);
  if (!m) throw new Error(`bad card: "${s}"`);
  const r = RANKS.indexOf(m[1] === '10' ? 'T' : m[1].toUpperCase());
  return r * 4 + SUITS.indexOf(m[2].toLowerCase());
}

/** Parses a whitespace/comma separated hand, e.g. "As Kd 2c 2h 9s". */
export function parseHand(s: string): Card[] {
  const cards = s.split(/[\s,]+/).filter(Boolean).map(parseCard);
  if (new Set(cards).size !== cards.length) throw new Error(`duplicate card in "${s}"`);
  return cards;
}

export const handToString = (hand: readonly Card[]): string => hand.map(cardToString).join(' ');

/** Returns a random number in [0, 1). */
export type Rng = () => number;

/** Small seeded PRNG for tests and reproducible deals. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deals `n` distinct cards from a deck of `deckSize` (52, or 53 with the joker). */
export function deal(deckSize: number, rng: Rng = Math.random, n = 5): Card[] {
  const deck = Array.from({ length: deckSize }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (deckSize - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, n);
}

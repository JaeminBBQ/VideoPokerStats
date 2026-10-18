/**
 * Voice entry grammar and parsing (pure; VOICE.md "Grammar and parsing"). The recognizer (Vosk) is restricted
 * to VOICE_WORDS; its transcript goes through parseSpoken, then applySpoken merges the cards into the entry.
 *
 * Parsing, left to right: a rank word goes onto a pending list; a suit word gives that suit to every pending
 * rank in order, then clears the list ("king queen jack of spades" → K♠ Q♠ J♠). "of", "[unk]" and any word
 * outside the grammar are ignored. Errors are values, never throws.
 */
import { glassesCard, type Card } from './cards.ts';
import * as Entry from './entry.ts';

/** Rank words → engine rank (0 = deuce .. 12 = ace). */
export const RANK_WORDS: Readonly<Record<string, number>> = {
  two: 0, deuce: 0, three: 1, four: 2, five: 3, six: 4, seven: 5, eight: 6, nine: 7, ten: 8,
  jack: 9, queen: 10, king: 11, ace: 12,
};

/** Suit words → engine suit (c d h s = 0..3). */
export const SUIT_WORDS: Readonly<Record<string, number>> = {
  club: 0, clubs: 0, diamond: 1, diamonds: 1, heart: 2, hearts: 2, spade: 3, spades: 3,
};

/** The Vosk grammar, exactly as VOICE.md lists it. */
export const VOICE_WORDS: readonly string[] = [
  'ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'deuce',
  'spade', 'spades', 'heart', 'hearts', 'diamond', 'diamonds', 'club', 'clubs',
  'of',
  '[unk]',
];

/** Voice UI phase: idle, mic open (long press held), transcribing, or showing an error line. */
export type VoicePhase = 'idle' | 'listening' | 'recognizing' | 'error';

/** Hard cap on cards in one utterance and in a hand. */
export const MAX_CARDS = 5;

/** `heard` is the transcript's grammar words (lowercase, "[unk]" dropped), for the glasses message. */
export type VoiceError =
  | { kind: 'empty'; heard: string }
  /** Rank words at the end with no suit after them; `words` are those rank words. */
  | { kind: 'trailing-rank'; heard: string; words: string[] }
  /** A suit word with no rank before it. */
  | { kind: 'suit-without-rank'; heard: string; suit: string }
  /** A card said twice (inHand false), or (applySpoken) already in the partial hand (inHand true). */
  | { kind: 'duplicate'; heard: string; card: Card; inHand: boolean }
  /** More than 5 cards; `count` is how many the hand would have. */
  | { kind: 'too-many'; heard: string; count: number };

export type ParseResult = { ok: true; cards: Card[] } | { ok: false; error: VoiceError };
export type ApplyResult = { ok: true; entry: Entry.EntryState } | { ok: false; error: VoiceError };

const lookup = (table: Readonly<Record<string, number>>, word: string): number | undefined =>
  Object.prototype.hasOwnProperty.call(table, word) ? table[word] : undefined;

/** Lowercase grammar tokens of a transcript (punctuation stripped, "[unk]" kept). */
export function tokenize(transcript: string): string[] {
  return transcript.toLowerCase().match(/\[unk\]|[a-z]+/g) ?? [];
}

export function parseSpoken(transcript: string): ParseResult {
  const tokens = tokenize(transcript).filter((t) => t !== '[unk]');
  const heard = tokens.join(' ');
  const cards: Card[] = [];
  const pending: { word: string; rank: number }[] = [];
  for (const word of tokens) {
    const rank = lookup(RANK_WORDS, word);
    if (rank !== undefined) {
      pending.push({ word, rank });
      continue;
    }
    const suit = lookup(SUIT_WORDS, word);
    if (suit === undefined) continue; // "of" and anything off-grammar
    if (pending.length === 0) return { ok: false, error: { kind: 'suit-without-rank', heard, suit: word } };
    for (const p of pending) {
      const card = p.rank * 4 + suit;
      if (cards.includes(card)) return { ok: false, error: { kind: 'duplicate', heard, card, inHand: false } };
      cards.push(card);
    }
    pending.length = 0;
  }
  if (pending.length > 0) return { ok: false, error: { kind: 'trailing-rank', heard, words: pending.map((p) => p.word) } };
  if (cards.length === 0) return { ok: false, error: { kind: 'empty', heard } };
  if (cards.length > MAX_CARDS) return { ok: false, error: { kind: 'too-many', heard, count: cards.length } };
  return { ok: true, cards };
}

/**
 * Merges spoken cards into the entry: 5 cards replace the hand; fewer append to a partial hand (filling the
 * armed slot, then empty slots, like taps) or start a fresh hand when the current one is complete or empty.
 * Rejected when the result would exceed 5 cards or repeat a card. `heard` labels the error.
 */
export function applySpoken(entry: Entry.EntryState, cards: readonly Card[], heard = ''): ApplyResult {
  if (cards.length === 0) return { ok: false, error: { kind: 'empty', heard } };
  const dup = cards.find((c, i) => cards.indexOf(c) !== i);
  if (dup !== undefined) return { ok: false, error: { kind: 'duplicate', heard, card: dup, inHand: false } };
  if (cards.length > MAX_CARDS) return { ok: false, error: { kind: 'too-many', heard, count: cards.length } };
  if (cards.length === MAX_CARDS) return { ok: true, entry: Entry.entryFromHand(cards) };
  const current = Entry.handOf(entry);
  const base = Entry.isComplete(entry) || current.length === 0 ? Entry.emptyEntry : entry;
  const have = Entry.handOf(base);
  if (have.length + cards.length > MAX_CARDS) return { ok: false, error: { kind: 'too-many', heard, count: have.length + cards.length } };
  const inHand = cards.find((c) => have.includes(c));
  if (inHand !== undefined) return { ok: false, error: { kind: 'duplicate', heard, card: inHand, inHand: true } };
  return { ok: true, entry: cards.reduce(Entry.tapCard, base) };
}

/** Shown when a long press arrives before the model is downloaded and ready. */
export const VOICE_NO_MODEL = 'Voice: download model on phone';
const RETRY = 'Hold to retry';

/** One-line glasses message for an error, e.g. `Heard "king queen" — no suit. Hold to retry`. */
export function voiceErrorMessage(e: VoiceError, letterSuits = false): string {
  switch (e.kind) {
    case 'empty':
      return `Heard nothing. ${RETRY}`;
    case 'trailing-rank':
      return `Heard "${e.words.join(' ')}" — no suit. ${RETRY}`;
    case 'suit-without-rank':
      return `Heard "${e.suit}" with no card. ${RETRY}`;
    case 'duplicate':
      return `${glassesCard(e.card, letterSuits)} ${e.inHand ? 'already in hand' : 'said twice'}. ${RETRY}`;
    case 'too-many':
      return `${e.count} cards — max 5. ${RETRY}`;
  }
}

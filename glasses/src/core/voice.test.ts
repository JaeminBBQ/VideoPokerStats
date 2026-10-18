import { describe, expect, it } from 'vitest';
import { parseHand, type Card } from '../../../src/engine/cards.ts';
import * as Entry from './entry.ts';
import { RANK_WORDS, SUIT_WORDS, VOICE_NO_MODEL, VOICE_WORDS, applySpoken, parseSpoken, tokenize, voiceErrorMessage, type VoiceError } from './voice.ts';

const cards = (t: string): Card[] => {
  const r = parseSpoken(t);
  if (!r.ok) throw new Error(`expected ok for "${t}": ${JSON.stringify(r.error)}`);
  return r.cards;
};
const err = (t: string): VoiceError => {
  const r = parseSpoken(t);
  if (r.ok) throw new Error(`expected error for "${t}"`);
  return r.error;
};

describe('grammar', () => {
  it('is exactly the VOICE.md word list', () => {
    expect([...VOICE_WORDS].sort()).toEqual(
      [
        'ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'deuce',
        'spade', 'spades', 'heart', 'hearts', 'diamond', 'diamonds', 'club', 'clubs', 'of', '[unk]',
      ].sort(),
    );
    const parsed = new Set([...Object.keys(RANK_WORDS), ...Object.keys(SUIT_WORDS), 'of', '[unk]']);
    expect(parsed).toEqual(new Set(VOICE_WORDS));
  });

  it('every rank word and suit word maps to the engine encoding', () => {
    const ranks = '23456789TJQKA';
    const words = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
    words.forEach((w, r) => {
      expect(cards(`${w} of spades`)).toEqual(parseHand(`${ranks[r]}s`));
      expect(cards(`${w} of club`)).toEqual(parseHand(`${ranks[r]}c`));
    });
    expect(cards('deuce of hearts')).toEqual(parseHand('2h'));
    expect(cards('two diamond')).toEqual(parseHand('2d'));
  });

  it('tokenize lowercases, strips punctuation, keeps [unk]', () => {
    expect(tokenize('King, Queen [unk] of SPADES.')).toEqual(['king', 'queen', '[unk]', 'of', 'spades']);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('parseSpoken', () => {
  it('the VOICE.md example: a suit applies to every pending rank', () => {
    expect(cards('king queen jack of spades seven of diamonds three of clubs')).toEqual(parseHand('Ks Qs Js 7d 3c'));
  });

  it('keeps spoken order; of and [unk] and off-grammar words are ignored', () => {
    expect(cards('[unk] ace of [unk] hearts of of king spade')).toEqual(parseHand('Ah Ks'));
    expect(cards('ace hearts uh king spades')).toEqual(parseHand('Ah Ks'));
    expect(cards('ten nine eight seven six of clubs')).toEqual(parseHand('Tc 9c 8c 7c 6c'));
  });

  it('prototype names are not words', () => {
    expect(err('constructor').kind).toBe('empty');
    expect(err('toString hasownproperty').kind).toBe('empty');
  });

  it('partial hands parse (fewer than 5)', () => {
    expect(cards('ace of spades')).toEqual(parseHand('As'));
    expect(cards('ace king of hearts')).toEqual(parseHand('Ah Kh'));
  });

  it('empty', () => {
    expect(err('')).toEqual({ kind: 'empty', heard: '' });
    expect(err('[unk] [unk]')).toEqual({ kind: 'empty', heard: '' });
    expect(err('of of')).toEqual({ kind: 'empty', heard: 'of of' });
  });

  it('trailing-rank lists the unsuited rank words', () => {
    expect(err('king queen')).toEqual({ kind: 'trailing-rank', heard: 'king queen', words: ['king', 'queen'] });
    expect(err('ace of spades seven three of')).toEqual({ kind: 'trailing-rank', heard: 'ace of spades seven three of', words: ['seven', 'three'] });
  });

  it('suit-without-rank', () => {
    expect(err('spades')).toEqual({ kind: 'suit-without-rank', heard: 'spades', suit: 'spades' });
    expect(err('ace of spades of hearts')).toMatchObject({ kind: 'suit-without-rank', suit: 'hearts' });
  });

  it('duplicate names the card (deuce and two are the same rank)', () => {
    expect(err('king of spades king of spades')).toMatchObject({ kind: 'duplicate', card: parseHand('Ks')[0], inHand: false });
    expect(err('two deuce of hearts')).toMatchObject({ kind: 'duplicate', card: parseHand('2h')[0] });
  });

  it('too-many', () => {
    expect(err('ace king queen jack ten nine of spades')).toMatchObject({ kind: 'too-many', count: 6 });
  });
});

describe('applySpoken', () => {
  const [K, Q, J, S7, T3, A] = parseHand('Ks Qs Js 7d 3c Ah');
  const partial = Entry.entryFromHand([K, Q]);
  const full = Entry.entryFromHand([K, Q, J, S7, T3]);
  const ok = (r: ReturnType<typeof applySpoken>) => {
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.entry;
  };

  it('5 cards replace any hand', () => {
    const five = parseHand('Ah Ad 9c 5s 2h');
    for (const e of [Entry.emptyEntry, partial, full]) expect(Entry.handOf(ok(applySpoken(e, five)))).toEqual(five);
    expect(Entry.isComplete(ok(applySpoken(partial, five)))).toBe(true);
  });

  it('fewer than 5 append to a partial hand', () => {
    const e = ok(applySpoken(partial, [J, S7]));
    expect(e.slots).toEqual([K, Q, J, S7, null]);
    expect(Entry.handOf(ok(applySpoken(e, [T3])))).toEqual([K, Q, J, S7, T3]);
  });

  it('fill a gap/armed slot first, like taps', () => {
    const gap = Entry.tapSlot(Entry.entryFromHand([K, Q, J]), 1); // slot 2 cleared and armed
    expect(ok(applySpoken(gap, [A, S7])).slots).toEqual([K, A, J, S7, null]);
  });

  it('start a fresh hand when the current one is empty or complete', () => {
    expect(ok(applySpoken(Entry.emptyEntry, [A])).slots).toEqual([A, null, null, null, null]);
    expect(ok(applySpoken(full, [A, K])).slots).toEqual([A, K, null, null, null]); // K was in the old hand: fine
  });

  it('rejects overflow and duplicates against the partial hand', () => {
    expect(applySpoken(partial, [J, S7, T3, A], 'x')).toEqual({ ok: false, error: { kind: 'too-many', heard: 'x', count: 6 } });
    expect(applySpoken(partial, [J, K])).toEqual({ ok: false, error: { kind: 'duplicate', heard: '', card: K, inHand: true } });
    expect(applySpoken(partial, [])).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(applySpoken(partial, [J, J])).toMatchObject({ ok: false, error: { kind: 'duplicate', inHand: false } });
    expect(applySpoken(partial, [A, K, Q, J, S7, T3])).toMatchObject({ ok: false, error: { kind: 'too-many', count: 6 } });
  });

  it('never mutates its input', () => {
    const before = JSON.stringify(partial);
    applySpoken(partial, [J]);
    expect(JSON.stringify(partial)).toBe(before);
  });
});

describe('voiceErrorMessage', () => {
  it('one line per error, matching the VOICE.md example', () => {
    expect(voiceErrorMessage(err('king queen'))).toBe('Heard "king queen" — no suit. Hold to retry');
    expect(voiceErrorMessage(err(''))).toBe('Heard nothing. Hold to retry');
    expect(voiceErrorMessage(err('spades king of hearts'))).toBe('Heard "spades" with no card. Hold to retry');
    expect(voiceErrorMessage(err('king of spades king of spades'))).toBe('K♠ said twice. Hold to retry');
    expect(voiceErrorMessage(err('king of spades king of spades'), true)).toBe('Ks said twice. Hold to retry');
    expect(voiceErrorMessage({ kind: 'duplicate', heard: '', card: parseHand('Ks')[0], inHand: true })).toBe('K♠ already in hand. Hold to retry');
    expect(voiceErrorMessage(err('ace king queen jack ten nine of spades'))).toBe('6 cards — max 5. Hold to retry');
    expect(VOICE_NO_MODEL).toBe('Voice: download model on phone');
  });
});

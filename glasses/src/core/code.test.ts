import { describe, expect, it } from 'vitest';
import { mulberry32, parseHand, type Card } from '../../../src/engine/cards.ts';
import {
  BLACK, GROUPS, RED, freeRanks, gesturesFor, groupOfRank, initialCode, isExhausted, lastEntered, stepCode, usedSuits,
  type CodeState, type Gesture,
} from './code.ts';
import * as Entry from './entry.ts';

const C = (s: string): Card => parseHand(s)[0];
const R = { A: 12, K: 11, Q: 10, J: 9, T: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 3: 1, 2: 0 } as const;
const H = 2, D = 1, S = 3, CL = 0;

/** Runs gestures from a state; returns the final state. */
function run(gestures: readonly Gesture[], code: CodeState = initialCode, entry: Entry.EntryState = Entry.emptyEntry) {
  let s = { code, entry };
  for (const g of gestures) s = stepCode(s.code, s.entry, g);
  return s;
}

const rankStep = (group: number, cursor: number): CodeState => ({ step: 'rank', group, cursor, rank: null, suit: null, note: null });
const suitStep = (rank: number, suit: number | null = null): CodeState => ({ step: 'suit', group: groupOfRank(rank), cursor: rank, rank, suit, note: null });

/** Invariants that must hold after every gesture. */
function assertValid(code: CodeState, entry: Entry.EntryState) {
  const hand = Entry.handOf(entry);
  expect(new Set(hand).size).toBe(hand.length);
  expect(hand.length).toBeLessThanOrEqual(5);
  expect(entry.order.length).toBe(hand.length);
  if (code.step === 'group') {
    expect(code.group).toBeNull();
    expect(code.cursor).toBeNull();
    expect(code.rank).toBeNull();
    expect(code.suit).toBeNull();
  } else if (code.step === 'rank') {
    expect(GROUPS[code.group!]).toContain(code.cursor);
    expect(isExhausted(entry, code.cursor!)).toBe(false);
    expect(code.rank).toBeNull();
  } else {
    expect(GROUPS[code.group!]).toContain(code.rank);
    expect(code.cursor).toBe(code.rank);
    expect(isExhausted(entry, code.rank!)).toBe(false);
    if (code.suit !== null) expect(usedSuits(entry, code.rank!).has(code.suit)).toBe(false);
  }
}

describe('GROUP', () => {
  it('tap / ↑ / ↓ pick A K Q J, 10 9 8 7, 6 5 4 3 2 with the cursor on the first rank', () => {
    expect(GROUPS).toEqual([[12, 11, 10, 9], [8, 7, 6, 5], [4, 3, 2, 1, 0]]);
    expect(stepCode(initialCode, Entry.emptyEntry, 'tap')).toEqual({ code: rankStep(0, R.A), entry: Entry.emptyEntry });
    expect(stepCode(initialCode, Entry.emptyEntry, 'up')).toEqual({ code: rankStep(1, R.T), entry: Entry.emptyEntry });
    expect(stepCode(initialCode, Entry.emptyEntry, 'down')).toEqual({ code: rankStep(2, R[6]), entry: Entry.emptyEntry });
  });

  it('double tap with no cards does nothing (same references)', () => {
    const r = stepCode(initialCode, Entry.emptyEntry, 'double');
    expect(r.code).toBe(initialCode);
    expect(r.entry).toBe(Entry.emptyEntry);
  });

  it('double tap = back: removes the last entered card and reopens it at SUIT (rank kept, suit cleared)', () => {
    const entry = Entry.entryFromHand(parseHand('Ks Qs 8h'));
    const r = stepCode(initialCode, entry, 'double');
    expect(r.code).toEqual(suitStep(R[8]));
    expect(Entry.handOf(r.entry)).toEqual(parseHand('Ks Qs'));
  });

  it('back reopens the most recently entered card, not the rightmost (armed slot)', () => {
    let entry = Entry.entryFromHand(parseHand('Ks Qs 8h'));
    entry = Entry.tapCard(Entry.tapSlot(entry, 0), C('2c')); // re-fill slot 0 last
    expect(lastEntered(entry)).toBe(C('2c'));
    const r = stepCode(initialCode, entry, 'double');
    expect(r.code).toEqual(suitStep(R[2]));
    expect(r.entry.slots).toEqual([null, C('Qs'), C('8h'), null, null]);
  });

  it('a joker as the last card: back does nothing', () => {
    const entry = Entry.tapCard(Entry.emptyEntry, 52);
    const r = stepCode(initialCode, entry, 'double');
    expect(r.entry).toBe(entry);
    expect(r.code).toBe(initialCode);
  });

  it('a group whose every rank is exhausted can not be entered; the note says so and clears on the next gesture', () => {
    // 16 cards can't fit 5 slots; a wide synthetic entry exercises the rule anyway.
    const all = GROUPS[0].flatMap((r) => [0, 1, 2, 3].map((s) => r * 4 + s));
    const entry: Entry.EntryState = { slots: [...all, null], order: all.map((_, i) => i), armed: null };
    const r = stepCode(initialCode, entry, 'tap');
    expect(r.code).toEqual({ ...initialCode, note: { kind: 'group-used', group: 0 } });
    expect(r.entry).toBe(entry);
    const again = stepCode(r.code, entry, 'tap');
    expect(again.code).toBe(r.code); // same note, nothing changed
    const next = stepCode(r.code, entry, 'up');
    expect(next.code).toEqual(rankStep(1, R.T));
  });

  it('the cursor starts on the first rank that is not exhausted', () => {
    const entry = Entry.entryFromHand(parseHand('Tc Td Th Ts'));
    expect(stepCode(initialCode, entry, 'up').code).toEqual(rankStep(1, R[9]));
    const aces = Entry.entryFromHand(parseHand('Ac Ad Ah As Kc'));
    // A complete hand is the result screen: tap starts a new hand, so no ace is exhausted any more.
    expect(stepCode(initialCode, aces, 'tap').code).toEqual(rankStep(0, R.A));
  });
});

describe('RANK', () => {
  it('↓ = next and ↑ = previous, wrapping within every group', () => {
    for (let g = 0; g < GROUPS.length; g++) {
      const ranks = GROUPS[g];
      let code = rankStep(g, ranks[0]);
      for (let k = 1; k <= ranks.length; k++) {
        code = stepCode(code, Entry.emptyEntry, 'down').code;
        expect(code.cursor).toBe(ranks[k % ranks.length]);
      }
      for (let k = 1; k <= ranks.length; k++) {
        code = stepCode(code, Entry.emptyEntry, 'up').code;
        expect(code.cursor).toBe(ranks[(ranks.length - k) % ranks.length]);
      }
      expect(code.step).toBe('rank');
      expect(code.group).toBe(g);
    }
  });

  it('exhausted ranks are skipped while scrolling, both ways', () => {
    const entry = Entry.entryFromHand(parseHand('9c 9d 9h 9s'));
    let code = stepCode(initialCode, entry, 'up').code; // 10
    code = stepCode(code, entry, 'down').code;
    expect(code.cursor).toBe(R[8]);
    code = stepCode(code, entry, 'up').code;
    expect(code.cursor).toBe(R.T);
    code = stepCode(code, entry, 'up').code; // wraps to 7
    expect(code.cursor).toBe(R[7]);
    expect(freeRanks(entry, 1)).toEqual([R.T, R[8], R[7]]);
  });

  it('with one free rank the cursor stays put (same reference)', () => {
    const others = [R.K, R.Q, R.J].flatMap((r) => [0, 1, 2, 3].map((s) => r * 4 + s));
    const entry: Entry.EntryState = { slots: [...others, null], order: others.map((_, i) => i), armed: null };
    const code = stepCode(initialCode, entry, 'tap').code;
    expect(code).toEqual(rankStep(0, R.A));
    expect(stepCode(code, entry, 'down').code).toBe(code);
    expect(stepCode(code, entry, 'up').code).toBe(code);
  });

  it('double tap = select → SUIT with nothing highlighted; tap = back to GROUP', () => {
    const code = rankStep(1, R[8]);
    expect(stepCode(code, Entry.emptyEntry, 'double').code).toEqual(suitStep(R[8]));
    expect(stepCode(code, Entry.emptyEntry, 'tap').code).toBe(initialCode);
  });
});

describe('SUIT', () => {
  const T = suitStep(R.T);
  const go = (gs: Gesture[], entry = Entry.emptyEntry, code = T) => run(gs, code, entry);

  it('starts with nothing highlighted; ↑ = red (♥ then toggles ♥ ↔ ◆), ↓ = black (♠ then toggles ♠ ↔ ♣)', () => {
    expect(go(['up']).code.suit).toBe(H);
    expect(go(['up', 'up']).code.suit).toBe(D);
    expect(go(['up', 'up', 'up']).code.suit).toBe(H);
    expect(go(['down']).code.suit).toBe(S);
    expect(go(['down', 'down']).code.suit).toBe(CL);
    expect(go(['down', 'down', 'down']).code.suit).toBe(S);
    expect(RED).toEqual([H, D]);
    expect(BLACK).toEqual([S, CL]);
  });

  it('a swipe of the other color jumps to that color\'s first suit', () => {
    expect(go(['up', 'up', 'down']).code.suit).toBe(S); // ◆ → ♠
    expect(go(['down', 'down', 'up']).code.suit).toBe(H); // ♣ → ♥
    expect(go(['up', 'down']).code.suit).toBe(S);
  });

  it('suits already in the hand for this rank are skipped', () => {
    const th = Entry.entryFromHand(parseHand('Th'));
    expect(go(['up'], th).code.suit).toBe(D);
    const r = go(['up'], th);
    expect(stepCode(r.code, th, 'up').code).toBe(r.code); // only ◆ left: stays, same reference
    const ts = Entry.entryFromHand(parseHand('Ts'));
    expect(go(['down'], ts).code.suit).toBe(CL);
    expect(go(['down', 'down'], ts).code.suit).toBe(CL);
    expect(go(['up', 'down'], ts).code.suit).toBe(CL); // ♥ → first free black
    const tc = Entry.entryFromHand(parseHand('Tc'));
    expect(go(['down', 'down'], tc).code.suit).toBe(S);
  });

  it('both suits of a color used: that swipe does nothing and the lens gets a note; the next gesture clears it', () => {
    const reds = Entry.entryFromHand(parseHand('Th Td'));
    const r = go(['down', 'up'], reds);
    expect(r.code).toEqual({ ...suitStep(R.T, S), note: { kind: 'color-used', rank: R.T, color: 'red' } });
    expect(stepCode(r.code, reds, 'up').code).toBe(r.code);
    expect(stepCode(r.code, reds, 'down').code).toEqual(suitStep(R.T, CL));
    const blacks = Entry.entryFromHand(parseHand('Ts Tc'));
    const b = go(['down'], blacks);
    expect(b.code).toEqual({ ...T, note: { kind: 'color-used', rank: R.T, color: 'black' } });
    expect(stepCode(b.code, blacks, 'double').code).toEqual(T); // nothing highlighted: only the note clears
  });

  it('double tap with nothing highlighted does nothing (same references)', () => {
    const r = stepCode(T, Entry.emptyEntry, 'double');
    expect(r.code).toBe(T);
    expect(r.entry).toBe(Entry.emptyEntry);
  });

  it('double tap = select adds the card through Entry.tapCard and goes back to GROUP', () => {
    const r = go(['up', 'double']);
    expect(Entry.handOf(r.entry)).toEqual([C('Th')]);
    expect(r.code).toBe(initialCode);
    // Into an armed slot, like a phone tap.
    const armed = Entry.tapSlot(Entry.entryFromHand(parseHand('Ks Qs Js')), 1);
    const a = go(['down', 'double'], armed);
    expect(a.entry.slots).toEqual([C('Ks'), C('Ts'), C('Js'), null, null]);
  });

  it('tap = back to RANK with the cursor on this rank', () => {
    expect(go(['up', 'tap']).code).toEqual(rankStep(1, R.T));
    expect(run(['tap'], suitStep(R[3])).code).toEqual(rankStep(2, R[3]));
  });
});

describe('back across cards', () => {
  it('from GROUP, repeated back walks through the hand last-to-first', () => {
    let s = run([...gesturesFor(C('Ks')), ...gesturesFor(C('Qh')), ...gesturesFor(C('3c'))]);
    expect(Entry.handOf(s.entry)).toEqual(parseHand('Ks Qh 3c'));
    s = stepCode(s.code, s.entry, 'double');
    expect(s.code).toEqual(suitStep(R[3]));
    expect(Entry.handOf(s.entry)).toEqual(parseHand('Ks Qh'));
    s = run(['tap', 'tap', 'double'], s.code, s.entry); // SUIT → RANK → GROUP → back to Q
    expect(s.code).toEqual(suitStep(R.Q));
    expect(Entry.handOf(s.entry)).toEqual(parseHand('Ks'));
    s = run(['up', 'double'], s.code, s.entry); // re-select Q♥
    expect(Entry.handOf(s.entry)).toEqual(parseHand('Ks Qh'));
    s = run(['double', 'tap', 'tap', 'double', 'tap', 'tap', 'double'], s.code, s.entry);
    expect(Entry.handOf(s.entry)).toEqual([]);
    expect(s.code).toEqual(initialCode); // nothing left to reopen
  });

  it('back from SUIT and RANK never touches the hand', () => {
    const entry = Entry.entryFromHand(parseHand('Ks Qs'));
    const s = run(['tap', 'down', 'double', 'up', 'tap', 'tap'], initialCode, entry);
    expect(s.entry).toBe(entry);
    expect(s.code).toBe(initialCode);
  });
});

describe('result screen (complete hand)', () => {
  const full = Entry.entryFromHand(parseHand('Ks Qs Js 7d 3c'));

  it('tap / ↑ / ↓ start a new hand, and the gesture is the GROUP choice', () => {
    for (const [g, group, first] of [['tap', 0, R.A], ['up', 1, R.T], ['down', 2, R[6]]] as const) {
      const r = stepCode(initialCode, full, g);
      expect(r.entry).toBe(Entry.emptyEntry);
      expect(r.code).toEqual(rankStep(group, first));
    }
  });

  it('whatever step the code was left in', () => {
    expect(stepCode(suitStep(R.K, S), full, 'down').code).toEqual(rankStep(2, R[6]));
    expect(stepCode(rankStep(1, R[8]), full, 'tap').entry).toBe(Entry.emptyEntry);
  });

  it('double tap = back reopens the 5th card at SUIT; a new suit completes the hand again', () => {
    const r = stepCode(initialCode, full, 'double');
    expect(r.code).toEqual(suitStep(R[3]));
    expect(Entry.handOf(r.entry)).toEqual(parseHand('Ks Qs Js 7d'));
    const fixed = run(['down', 'double'], r.code, r.entry); // 3♣ was a mistake: 3♠
    expect(Entry.handOf(fixed.entry)).toEqual(parseHand('Ks Qs Js 7d 3s'));
    expect(Entry.isComplete(fixed.entry)).toBe(true);
    expect(fixed.code).toBe(initialCode);
  });
});

describe('entering real hands', () => {
  it('CODE.md examples: 8♥ = ↑ ↓ ↓ dbl ↑ dbl, A♠ = tap dbl ↓ dbl', () => {
    expect(gesturesFor(C('8h'))).toEqual(['up', 'down', 'down', 'double', 'up', 'double']);
    expect(gesturesFor(C('As'))).toEqual(['tap', 'double', 'down', 'double']);
    expect(Entry.handOf(run(['up', 'down', 'down', 'double', 'up', 'double']).entry)).toEqual([C('8h')]);
    expect(Entry.handOf(run(['tap', 'double', 'down', 'double']).entry)).toEqual([C('As')]);
  });

  it('every card from an empty hand, by its gestures', () => {
    for (let card = 0; card < 52; card++) {
      const s = run(gesturesFor(card));
      expect(Entry.handOf(s.entry)).toEqual([card]);
      expect(s.code).toBe(initialCode);
    }
  });

  it('full hands, with gesture counts', () => {
    const counts: Record<string, number> = {};
    for (const h of ['Ks Qs Js 7d 3c', 'Ah Kh Qh Jh Th', '2c 2d 2h 2s 3c', '9c 9d 9h 9s 8c', '7c 6d 5h 4s 3c']) {
      let s = { code: initialCode, entry: Entry.emptyEntry };
      let n = 0;
      for (const card of parseHand(h)) {
        const gs = gesturesFor(card, s.entry);
        n += gs.length;
        s = run(gs, s.code, s.entry);
      }
      expect(Entry.handOf(s.entry)).toEqual(parseHand(h));
      counts[h] = n;
    }
    // Spot values (also in reports/v040.md).
    expect(counts['Ks Qs Js 7d 3c']).toBe(5 + 6 + 5 + 6 + 7); // J is one ↑ from A (wrap); 3 is two ↑ from 6
    expect(counts['Ah Kh Qh Jh Th']).toBe(4 + 5 + 6 + 5 + 4);
    // With 9♣ 9◆ 9♥ in hand, 9♠ is the only black left: one ↓.
    expect(gesturesFor(C('9s'), Entry.entryFromHand(parseHand('9c 9d 9h')))).toEqual(['up', 'down', 'double', 'down', 'double']);
    // With all four 9s in hand, 8 is one ↓ from 10.
    expect(gesturesFor(C('8c'), Entry.entryFromHand(parseHand('9c 9d 9h 9s')))).toEqual(['up', 'down', 'double', 'down', 'down', 'double']);
  });
});

describe('random gesture walks keep every invariant', () => {
  it('20 000 gestures', () => {
    const rng = mulberry32(7);
    const G: Gesture[] = ['tap', 'up', 'down', 'double'];
    let s = { code: initialCode, entry: Entry.emptyEntry };
    let added = 0;
    for (let i = 0; i < 20_000; i++) {
      const before = s;
      const frozenSlots = before.entry.slots.slice();
      s = stepCode(s.code, s.entry, G[Math.floor(rng() * 4)]);
      expect(before.entry.slots).toEqual(frozenSlots); // inputs never mutated
      if (Entry.handOf(s.entry).length > Entry.handOf(before.entry).length) added++;
      assertValid(s.code, s.entry);
    }
    expect(added).toBeGreaterThan(500);
  });
});

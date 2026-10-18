import { beforeAll, describe, expect, it } from 'vitest';
import { getAdvW, getTextWidth, measureTextWrap } from '@evenrealities/pretext';
import { deal, mulberry32, parseHand, type Card } from '../../../src/engine/cards.ts';
import { EV_EPSILON, analyzeHand, buildTables, type Tables } from '../../../src/engine/ev.ts';
import { GAMES, GAME_LIST, type GameId } from '../../../src/engine/games.ts';
import { glassesCard } from './cards.ts';
import { GROUPS, initialCode, stepCode, type CodeState, type Gesture } from './code.ts';
import { DRAFT_JOKER, emptyDraft, tapRank, tapSuit, type Draft } from './discreet.ts';
import * as Entry from './entry.ts';
import { DN, INNER_WIDTH, LISTENING_HEADER, MAX_BYTES, MAX_LINES, NEXT_LINE, SHORT_NAMES, UP, VOICE_ERROR_FALLBACK, formatEv, formatGlasses, maxCycleIndex, noteText, type GlassesView } from './format.ts';
import { rankHolds, type RankedHold } from './holds.ts';
import { VOICE_NO_MODEL, parseSpoken, voiceErrorMessage, type VoiceError } from './voice.ts';

const spokenError = (t: string): VoiceError => {
  const r = parseSpoken(t);
  if (r.ok) throw new Error(`expected an error for "${t}"`);
  return r.error;
};

/** Every voice state the glasses can show, with the longest messages we can produce. */
const VOICE_STATES: NonNullable<GlassesView['voice']>[] = [
  { phase: 'idle', message: null },
  { phase: 'listening', message: null },
  { phase: 'recognizing', message: null },
  { phase: 'error', message: null },
  { phase: 'error', message: VOICE_NO_MODEL },
  ...[
    'king queen',
    'queen queen queen queen queen queen queen queen queen queen queen queen queen queen queen queen',
    '',
    'diamonds',
    'queen of diamonds queen of diamonds',
    'ace king queen jack ten nine eight seven six five four three two of diamonds',
  ].flatMap((t) => [false, true].map((letters) => ({ phase: 'error' as const, message: voiceErrorMessage(spokenError(t), letters) }))),
  { phase: 'error', message: voiceErrorMessage({ kind: 'duplicate', heard: '', card: parseHand('Qd')[0], inHand: true }) },
];

/** The firmware constraints every page must meet (research/04-validation.md §5.4). */
function assertFits(text: string) {
  expect(text.endsWith('\n')).toBe(false);
  for (const line of text.split('\n')) {
    const w = getTextWidth(line);
    if (w > INNER_WIDTH) throw new Error(`line too wide (${w}px): ${line}`);
  }
  expect(measureTextWrap(text, INNER_WIDTH).lineCount).toBeLessThanOrEqual(MAX_LINES);
  expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(MAX_BYTES);
  for (const ch of text) {
    if (ch === '\n') continue;
    const cp = ch.codePointAt(0)!;
    if (!(getAdvW(cp) > 0)) throw new Error(`glyph missing from firmware font: U+${cp.toString(16)} in ${text}`);
  }
}

const view = (gameId: GameId, slots: (Card | null)[], holds: RankedHold[] | null, cycleIndex = 0, letterSuits = false): GlassesView => ({
  gameId,
  engineStatus: 'ready',
  slots,
  holds,
  cycleIndex,
  letterSuits,
  analyzing: false,
});

describe('short names', () => {
  it('every game has a short name that fits', () => {
    for (const g of GAME_LIST) {
      expect(SHORT_NAMES[g.id]).toBeTruthy();
      expect(getTextWidth(`${SHORT_NAMES[g.id]} · engine error`)).toBeLessThanOrEqual(INNER_WIDTH);
    }
    expect(Object.keys(SHORT_NAMES).sort()).toEqual(GAME_LIST.map((g) => g.id).sort());
  });
});

describe('lens glyphs', () => {
  it('↑ and ↓ exist in the firmware font (so no up/dn fallback)', () => {
    expect(getAdvW(0x2191)).toBeGreaterThan(0);
    expect(getAdvW(0x2193)).toBeGreaterThan(0);
    expect(UP).toBe('↑');
    expect(DN).toBe('↓');
    expect(NEXT_LINE).toBe('next: tap / ↑ / ↓   dbl: fix last card');
  });
});

describe('formatGlasses: code entry', () => {
  const id: GameId = 'gsr-job-9-6';
  const [K, Q] = parseHand('Ks Qs');
  const lines = (v: GlassesView) => {
    const t = formatGlasses(v);
    assertFits(t);
    return t.split('\n');
  };
  const codeView = (cards: string, code: CodeState, letterSuits = false): GlassesView => {
    const e = Entry.entryFromHand(cards ? parseHand(cards) : []);
    return { ...view(id, e.slots.slice(), null, 0, letterSuits), order: e.order, code };
  };

  it('GROUP with no cards: five blanks, status, three group lines, no back line', () => {
    const l = lines(view(id, [null, null, null, null, null], null));
    expect(l.slice(0, 3)).toEqual(['JoB 9/6 $1', '_ _ _ _ _', 'GROUP  card 1 of 5']);
    expect(l).toHaveLength(6);
    expect(l[3]).toMatch(/^tap +A K Q J$/);
    expect(l[4]).toMatch(/^↑ +10 9 8 7$/);
    expect(l[5]).toMatch(/^↓ +6 5 4 3 2$/);
  });

  it('GROUP with cards: the back line names the card it reopens', () => {
    const l = lines(codeView('Ks Qs', initialCode));
    expect(l[1]).toBe('K♠ Q♠ _ _ _');
    expect(l[2]).toBe('GROUP  card 3 of 5');
    expect(l[6]).toMatch(/^dbl +back: fix Q♠$/);
    expect(lines(codeView('Ks Qs', initialCode, true))[6]).toMatch(/fix Qs$/);
    const gap = formatGlasses({ ...view(id, [K, null, Q, null, null], null, 0, true) });
    expect(gap.split('\n')[1]).toBe('Ks _ Qs _ _');
  });

  it('GROUP leaves out exhausted ranks', () => {
    const l = lines(codeView('9c 9d 9h 9s', initialCode));
    expect(l[4]).toMatch(/^↑ +10 8 7$/);
  });

  it('RANK brackets the cursor and lists the gestures', () => {
    const code = stepCode(initialCode, Entry.emptyEntry, 'up').code;
    const l = lines(codeView('', code));
    expect(l[2]).toBe('RANK  card 1 of 5');
    expect(l[3].replace(/ +/g, ' ').trim()).toBe('[10] 9 8 7');
    expect(l[4]).toBe('↓ next  ↑ prev   dbl select   tap back');
    const next = stepCode(code, Entry.emptyEntry, 'down').code;
    expect(lines(codeView('', next))[3].replace(/ +/g, ' ').trim()).toBe('10 [9] 8 7');
  });

  it('SUIT shows the pending rank in its slot, the colors, the highlight and used suits', () => {
    const e = Entry.entryFromHand(parseHand('Ks Th'));
    let s = { code: initialCode, entry: e };
    for (const g of ['up', 'double'] as Gesture[]) s = stepCode(s.code, s.entry, g);
    let l = lines({ ...view(id, s.entry.slots.slice(), null), order: s.entry.order, code: s.code });
    expect(l[1]).toBe('K♠ T♥ T? _ _');
    expect(l[2]).toBe('SUIT for 10  card 3 of 5');
    expect(l[3].replace(/ +/g, ' ').trim()).toBe('↑ red - ◆');
    expect(l[4].replace(/ +/g, ' ').trim()).toBe('↓ black ♠ ♣');
    expect(l[5]).toBe('dbl select   tap back');
    s = stepCode(s.code, s.entry, 'up');
    l = lines({ ...view(id, s.entry.slots.slice(), null), order: s.entry.order, code: s.code });
    expect(l[3].replace(/ +/g, ' ').trim()).toBe('↑ red - [◆]');
    // Armed slot: the pending rank shows where the card will go.
    const armed = Entry.tapSlot(Entry.entryFromHand(parseHand('Ks Qs Js')), 0);
    const sa = stepCode(stepCode(stepCode(initialCode, armed, 'up').code, armed, 'double').code, armed, 'down');
    expect(lines({ ...view(id, armed.slots.slice(), null), order: armed.order, armed: armed.armed, code: sa.code })[1]).toBe('T? Q♠ J♠ _ _');
  });

  it('notes replace the status line; voice messages beat notes', () => {
    const reds = Entry.entryFromHand(parseHand('Th Td'));
    let s = { code: initialCode, entry: reds };
    for (const g of ['up', 'double', 'up'] as Gesture[]) s = stepCode(s.code, s.entry, g);
    expect(s.code.note).not.toBeNull();
    const v = { ...view(id, s.entry.slots.slice(), null), order: s.entry.order, code: s.code };
    expect(lines(v)[2]).toBe('T♥ T◆ both in hand');
    expect(lines({ ...v, letterSuits: true })[2]).toBe('Th Td both in hand');
    expect(lines({ ...v, voice: { phase: 'recognizing', message: null } })[2]).toBe('…');
    expect(noteText({ kind: 'group-used', group: 0 }, false)).toBe('all of A K Q J in hand');
  });

  it('complete without a result says analyzing (or cannot analyze) and shows the next line; header shows engine status', () => {
    const hand = parseHand('Ks Qs Js 7d 3c');
    const t = formatGlasses({ ...view(id, hand, null), engineStatus: 'loading', analyzing: true });
    expect(t).toBe(`JoB 9/6 $1 · loading\nK♠ Q♠ J♠ 7◆ 3♣\nanalyzing...\n${NEXT_LINE}`);
    const e = formatGlasses({ ...view(id, hand, null), engineStatus: 'error' });
    expect(e.split('\n')[0]).toBe('JoB 9/6 $1 · engine error');
    expect(e.split('\n')[2]).toBe('cannot analyze');
    assertFits(t);
    assertFits(e);
  });
});

describe('formatGlasses: voice feedback', () => {
  const id: GameId = 'gsr-job-9-6';
  const [K, Q] = parseHand('Ks Qs');
  const v = (voice: GlassesView['voice'], slots: (Card | null)[] = [K, Q, null, null, null]) => formatGlasses({ ...view(id, slots, null), voice });
  const rest = (t: string) => t.split('\n').slice(3);

  it('listening replaces only the header', () => {
    const base = v(undefined).split('\n');
    const t = v({ phase: 'listening', message: null });
    expect(t.split('\n')).toEqual([LISTENING_HEADER, ...base.slice(1)]);
    expect(LISTENING_HEADER).toBe('LISTENING… release when done');
    assertFits(t);
  });

  it('recognizing and errors take the status line; the gesture lines stay', () => {
    const base = v(undefined);
    expect(v({ phase: 'recognizing', message: null }).split('\n').slice(0, 3)).toEqual(['JoB 9/6 $1', 'K♠ Q♠ _ _ _', '…']);
    expect(rest(v({ phase: 'recognizing', message: null }))).toEqual(rest(base));
    expect(v({ phase: 'error', message: 'Heard "king queen" — no suit. Hold to retry' }, [null, null, null, null, null]).split('\n').slice(0, 3)).toEqual(
      ['JoB 9/6 $1', '_ _ _ _ _', 'Heard "king queen" — no suit. Hold to retry'],
    );
    expect(v({ phase: 'error', message: VOICE_NO_MODEL }).split('\n')[2]).toBe('Voice: download model on phone');
    expect(v({ phase: 'error', message: null }).split('\n')[2]).toBe(VOICE_ERROR_FALLBACK);
    expect(v({ phase: 'error', message: 'two\nlines' }).split('\n')).toHaveLength(base.split('\n').length);
    expect(v({ phase: 'idle', message: 'ignored' })).toBe(base);
    for (const s of VOICE_STATES) assertFits(v(s));
  });

  it('a long error message is clipped to one line', () => {
    const t = v({ phase: 'error', message: 'x'.repeat(400) });
    expect(t.split('\n')).toHaveLength(v(undefined).split('\n').length);
    expect(t.split('\n')[2].endsWith('...')).toBe(true);
    assertFits(t);
  });
});

describe('formatGlasses: results (engine values)', () => {
  const game = GAMES['gsr-job-9-6'];
  let tables: Tables;
  beforeAll(() => {
    tables = buildTables(game);
  }, 60_000);

  it('#1 brackets held cards and shows HOLD, pattern and EV to 4 decimals', () => {
    const hand = parseHand('Ks Qs Js 7d 3c');
    const ranked = rankHolds(analyzeHand(tables, hand), game);
    const best = ranked[0];
    const t = formatGlasses(view(game.id, hand, ranked));
    const lines = t.split('\n');
    expect(lines[0]).toBe('JoB 9/6 $1');
    const expected1 = hand.map((c, i) => (best.mask & (1 << i) ? `[${glassesCard(c)}]` : ` ${glassesCard(c)} `)).join(' ').trimEnd();
    expect(lines[1]).toBe(expected1);
    expect(lines[2]).toBe(`HOLD ${best.held.map((c) => glassesCard(c)).join(' ')}`);
    expect(lines[3]).toBe(`${best.pattern}  EV ${best.ev.toFixed(4)}`);
    expect(lines).toHaveLength(ranked.filter((r) => r.tie).length > 1 ? 6 : 5);
    expect(lines.at(-1)).toBe(NEXT_LINE);
    assertFits(t);
  });

  it('#n shows rank, EV and loss versus best', () => {
    const hand = parseHand('Ks Qs Js 7d 3c');
    const ranked = rankHolds(analyzeHand(tables, hand), game);
    const t = formatGlasses(view(game.id, hand, ranked, 2));
    const lines = t.split('\n');
    const h = ranked[2];
    expect(lines[2]).toBe(`#3 ${h.held.length ? `HOLD ${h.held.map((c) => glassesCard(c)).join(' ')}` : 'DRAW 5'}`);
    expect(lines[3]).toContain(`EV ${formatEv(h.ev)}  −${formatEv(h.loss)}`);
    assertFits(t);
  });

  it('DRAW 5 when nothing is held', () => {
    const hand = parseHand('Kc 8d 6h 4s 2c'); // classic discard-everything shape
    const ranked = rankHolds(analyzeHand(tables, hand), game);
    const i = ranked.findIndex((h) => h.mask === 0);
    const t = formatGlasses(view(game.id, hand, ranked, i));
    expect(t.split('\n')[2]).toBe(i === 0 ? 'DRAW 5' : `#${i + 1} DRAW 5`);
    expect(t.split('\n')[1]).not.toContain('[');
    assertFits(t);
  });

  it('cycle index is clamped', () => {
    const hand = parseHand('Ks Qs Js 7d 3c');
    const ranked = rankHolds(analyzeHand(tables, hand), game);
    expect(maxCycleIndex(ranked)).toBe(31);
    expect(formatGlasses(view(game.id, hand, ranked, 99))).toBe(formatGlasses(view(game.id, hand, ranked, 31)));
    expect(formatGlasses(view(game.id, hand, ranked, -3))).toBe(formatGlasses(view(game.id, hand, ranked, 0)));
  });

  it('ties: #1 lists the other correct holds; tied #n says tie instead of a loss', () => {
    const rng = mulberry32(1);
    let found: { hand: Card[]; ranked: RankedHold[] } | null = null;
    for (let i = 0; i < 50_000 && !found; i++) {
      const hand = deal(52, rng);
      const holds = analyzeHand(tables, hand);
      if (holds[0].ev - holds[1].ev <= EV_EPSILON) found = { hand, ranked: rankHolds(holds, game) };
    }
    expect(found).not.toBeNull();
    const { hand, ranked } = found!;
    const t = formatGlasses(view(game.id, hand, ranked));
    const tieLine = t.split('\n')[4];
    const other = ranked[1];
    expect(tieLine.startsWith('tie: also ')).toBe(true);
    expect(tieLine).toContain(other.held.length ? other.held.map((c) => glassesCard(c)).join(' ') : 'DRAW 5');
    assertFits(t);
    const t2 = formatGlasses(view(game.id, hand, ranked, 1));
    expect(t2.split('\n')[3].endsWith('  tie')).toBe(true);
    assertFits(t2);
  });
});

describe('formatGlasses: every code step fits the lens', () => {
  /** Every code state for a partial entry: GROUP (with and without notes), each RANK cursor, each SUIT highlight. */
  function codeStates(entry: Entry.EntryState): CodeState[] {
    const hand = Entry.handOf(entry);
    const out: CodeState[] = [initialCode, ...[0, 1, 2].map((group) => ({ ...initialCode, note: { kind: 'group-used' as const, group } }))];
    GROUPS.forEach((ranks, group) => {
      for (const r of ranks) {
        const used = new Set(hand.filter((c) => c >> 2 === r).map((c) => c & 3));
        if (used.size === 4) continue;
        out.push({ step: 'rank', group, cursor: r, rank: null, suit: null, note: null });
        for (const suit of [null, 0, 1, 2, 3]) {
          if (suit !== null && used.has(suit)) continue;
          out.push({ step: 'suit', group, cursor: r, rank: r, suit, note: null });
        }
        // A note replaces only the status line, so one highlight per note is enough.
        for (const color of ['red', 'black'] as const) out.push({ step: 'suit', group, cursor: r, rank: r, suit: null, note: { kind: 'color-used', rank: r, color } });
      }
    });
    return out;
  }

  /** assertFits with per-line and per-glyph memo (the same lines recur across ~10^5 pages); every 97th page also gets the full check. */
  const lineOk = new Map<string, boolean>();
  const glyphOk = new Map<string, boolean>();
  let seen = 0;
  function fitsFast(text: string) {
    if (seen++ % 97 === 0) return assertFits(text);
    const lines = text.split('\n');
    expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(MAX_BYTES);
    for (const line of lines) {
      let ok = lineOk.get(line);
      if (ok === undefined) {
        ok = getTextWidth(line) <= INNER_WIDTH && measureTextWrap(line, INNER_WIDTH).lineCount <= 1;
        for (const ch of line) {
          if (!glyphOk.has(ch)) glyphOk.set(ch, getAdvW(ch.codePointAt(0)!) > 0);
          if (!glyphOk.get(ch)) ok = false;
        }
        lineOk.set(line, ok);
      }
      if (!ok) throw new Error(`line too wide, wraps, or has a missing glyph: ${line}`);
    }
  }

  it('all games × partial hands × steps × letter suits × voice states × engine status', () => {
    const partials = ['', 'Ks', 'Th Td', 'Ks Qs Js', '9c 9d 9h 9s', 'Tc Td Th Js', '7h 7d 7c', '2c 3d 4h 5s'].map((h) => {
      const e = Entry.entryFromHand(h ? parseHand(h) : []);
      return e;
    });
    partials.push(Entry.tapSlot(Entry.entryFromHand(parseHand('Ks Qs Js 7d')), 1)); // armed gap
    let pages = 0;
    for (const game of GAME_LIST) {
      for (const entry of partials) {
        for (const code of codeStates(entry)) {
          for (const letterSuits of [false, true]) {
            const base: GlassesView = { ...view(game.id, entry.slots.slice(), null, 0, letterSuits), order: entry.order, armed: entry.armed, code };
            for (const engineStatus of ['ready', 'loading', 'error'] as const) {
              fitsFast(formatGlasses({ ...base, engineStatus }));
              pages++;
            }
            for (const voice of VOICE_STATES) {
              fitsFast(formatGlasses({ ...base, voice }));
              pages++;
            }
          }
        }
      }
    }
    expect(pages).toBeGreaterThan(50_000);
  }, 180_000);
});

describe('formatGlasses: every game, many hands, every cycle index fits the lens', () => {
  it('all GAME_LIST games', () => {
    let pages = 0;
    for (const game of GAME_LIST) {
      const tables = buildTables(game);
      const rng = mulberry32(42);
      const hands: Card[][] = [
        parseHand('Ks Qs Js 7d 3c'),
        parseHand('2c 2d 2h 2s Ah'),
        parseHand('Th Td Tc Ts 9h'),
        parseHand('2s 3s 4s 5s 6h'),
        parseHand('Ah Kh Qh Jh Th'),
      ];
      for (let i = 0; i < 40; i++) hands.push(deal(52, rng));
      // Add up to three tie hands for this game (tie lines are the longest growable lines).
      for (let i = 0, ties = 0; i < 5000 && ties < 3; i++) {
        const h = deal(52, rng);
        const holds = analyzeHand(tables, h);
        if (holds[0].ev - holds[1].ev <= EV_EPSILON) {
          hands.push(h);
          ties++;
        }
      }
      for (const hand of hands) {
        const ranked = rankHolds(analyzeHand(tables, hand), game);
        for (let idx = 0; idx < 32; idx++) {
          for (const letters of [false, true]) {
            assertFits(formatGlasses(view(game.id, hand, ranked, idx, letters)));
            pages++;
            if (idx < 2 || idx === 31) {
              for (const voice of VOICE_STATES) assertFits(formatGlasses({ ...view(game.id, hand, ranked, idx, letters), voice }));
            }
          }
        }
        assertFits(formatGlasses(view(game.id, [hand[0], hand[1], null, null, null], null)));
        for (const voice of VOICE_STATES) {
          assertFits(formatGlasses({ ...view(game.id, [hand[0], hand[1], null, null, null], null), voice }));
          assertFits(formatGlasses({ ...view(game.id, hand, null), engineStatus: 'loading', analyzing: true, voice }));
        }
      }
    }
    expect(pages).toBeGreaterThan(9 * 45 * 64 - 1);
  }, 180_000);

  it('a pathological tie line is truncated to fit', () => {
    const hand = parseHand('Ks Qs Js 7d 3c');
    const fake: RankedHold[] = Array.from({ length: 32 }, (_, m) => ({
      rank: m + 1,
      mask: 31 - m,
      held: hand.filter((_, i) => (31 - m) & (1 << i)),
      ev: 1,
      loss: 0,
      tie: true,
      pattern: '2 deuces + 4 to a Straight Flush (needs the 2 slot) and a very long tail',
    }));
    const t = formatGlasses(view('gsr-dwbp', hand, fake));
    assertFits(t);
    expect(t.split('\n')[4].endsWith('...')).toBe(true);
    expect(t.split('\n')[3]).toContain('EV 1.0000'); // the number survives label truncation
    const t2 = formatGlasses(view('gsr-dwbp', hand, fake.map((h) => ({ ...h, loss: 0.123456, tie: false })), 5));
    assertFits(t2);
    expect(t2.split('\n')[3]).toContain('EV 1.0000  −0.1235');
  });
});

describe('formatGlasses: discreet draft', () => {
  const view = (draft: Draft, letterSuits = false): GlassesView => ({
    gameId: 'gsr-job-9-6', engineStatus: 'ready', slots: [null, null, null, null, null], holds: null, cycleIndex: 0, letterSuits, analyzing: false, draft,
  });
  const ranks = (rs: number[]) => rs.reduce((d, r) => tapRank(d, r, true), emptyDraft);

  it('ranks show as "K?", then the pending card is bracketed', () => {
    expect(formatGlasses(view(ranks([11, 10]))).split('\n')).toEqual(['JoB 9/6 $1', 'K? Q? _ _ _', 'PHONE  rank 3 of 5']);
    const d = tapSuit(ranks([11, 10, 9, 5, 8]), 3);
    expect(formatGlasses(view(d)).split('\n').slice(1)).toEqual([' K♠  [Q?]  J?   7?   T?', 'PHONE  suit for Q  card 2 of 5']);
  });

  it('every draft fits the lens', () => {
    for (const letters of [false, true]) {
      let d = ranks([DRAFT_JOKER, 8, 8, 8, 8]);
      assertFits(formatGlasses(view(d, letters)));
      for (const s of [0, 1, 2, 3]) {
        d = tapSuit(d, s);
        assertFits(formatGlasses(view(d, letters)));
      }
    }
  });
});

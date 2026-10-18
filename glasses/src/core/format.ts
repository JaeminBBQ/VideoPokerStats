/**
 * Glasses page text. One text container, 576 × 288 px with 4 px padding, so lines must fit the 568 px inner
 * width, the page at most 10 lines (27 px each) and 900 UTF-8 bytes (research/04-validation.md §5.4).
 * Widths come from @evenrealities/pretext, which embeds the firmware font tables; lines that can grow are
 * clipped with pxTruncate so the firmware never wraps or scrolls the page.
 *
 * Layout (result, #1):          Cycling (#n, n ≥ 2):
 *   JoB 9/6 $1                    JoB 9/6 $1
 *   [K♠] [Q♠] [J♠]  7◆   3♣       [K♠] [Q♠]  J♠   7◆   3♣
 *   HOLD K♠ Q♠ J♠                 #2 HOLD K♠ Q♠
 *   3 to a Royal  EV 1.5328       2 to a Royal  EV 0.9876  −0.5452
 *   tie: also …   (only if tied)
 *   next: tap / ↑ / ↓   dbl: fix last card
 * (Cycling is kept for the store's hold actions, but since v0.4.0 no gesture maps to it, so #1 is what shows.)
 *
 * Code entry (CODE.md, v0.4.0) while the hand is incomplete. Line 3 is the status line; the rest says what each
 * gesture does at this step:
 *   GROUP                     RANK                                SUIT
 *   JoB 9/5 5¢                JoB 9/5 5¢                          JoB 9/5 5¢
 *   K♠ Q♠ _ _ _               K♠ Q♠ _ _ _                         K♠ Q♠ T? _ _
 *   GROUP  card 3 of 5        RANK  card 3 of 5                   SUIT for 10  card 3 of 5
 *   tap  A K Q J              [10]  9   8   7                     ↑ red      [♥]  ◆
 *   ↑    10 9 8 7             ↓ next  ↑ prev  dbl select  tap back ↓ black     ♠   ♣
 *   ↓    6 5 4 3 2                                                dbl select  tap back
 *   dbl  back: fix Q♠
 * Ranks with all four suits in the hand are left out; suits of this rank already in the hand show as "-".
 * A gesture that couldn't act (CodeState.note) replaces the status line until the next gesture.
 * If the firmware font ever lacks ↑ / ↓ (checked with getAdvW at load), they read "up" / "dn".
 *
 * Discreet entry (phone keypad, core/discreet.ts) replaces the code-entry lines while a draft is open. The
 * phone shows no cards, so the lens is the only place the draft reads back:
 *   RANKS                        SUITS
 *   JoB 9/5 5¢                   JoB 9/5 5¢
 *   K? Q? J? _ _                 K♠ [Q?] J?  7?  3?
 *   PHONE  rank 4 of 5           PHONE  suit for Q  card 2 of 5
 *
 * Voice (VOICE.md "Glasses feedback"): while listening the header is LISTENING_HEADER and the rest is unchanged.
 * Recognizing shows "…" and an error shows its message on the status line: it replaces the entry status
 * line, or is appended as the last line under a result.
 */
import { getAdvW, getTextWidth, pxTruncate } from '@evenrealities/pretext';
import type { GameId } from '../../../src/engine/games.ts';
import { GLASSES_SUITS, LETTER_SUITS, glassesCard, glassesRank, type Card } from './cards.ts';
import { BLACK, GROUPS, RED, freeRanks, initialCode, rankLabel, type CodeNote, type CodeState } from './code.ts';
import { DRAFT_JOKER, draftPhase, pendingIndex, type Draft } from './discreet.ts';
import * as Entry from './entry.ts';
import type { RankedHold } from './holds.ts';
import type { VoicePhase } from './voice.ts';

export const INNER_WIDTH = 568;
export const MAX_LINES = 10;
export const MAX_BYTES = 900;

/** Short header names for the glasses (the full GameDef names run up to 263 px). */
export const SHORT_NAMES: Record<GameId, string> = {
  'job-8-5': 'JoB 8/5',
  'bonus-6-5': 'Bonus 6/5',
  'lb-deuces-16-13': 'Deuces 16/13',
  'bpd-7-5': 'Bonus Deluxe 7/5',
  'gsr-job-9-5': 'JoB 9/5 5¢',
  'gsr-job-9-6': 'JoB 9/6 $1',
  'gsr-db-9-7-5': 'DB 9/7/5 $1',
  'gsr-dwbp': 'Deuces Bonus $1',
  'gsr-deuces-20-12-10': 'Deuces 20/12/10 5¢',
  'lb-job-9-5': 'JoB 9/5 5¢ prog',
  'lb-bonus-7-5': 'Bonus 7/5 5¢ prog',
  'lb-deuces-20-12-10': 'Deuces 20/12/10 5¢ prog',
  'lb-db-9-6-5': 'DB 9/6/5 5¢ prog',
  'dottys-bonus-6-5': "Dotty's Bonus 6/5 5¢",
};

export const shortName = (id: GameId): string => SHORT_NAMES[id] ?? id;

/** What the glasses show; the store builds this from its state. */
export interface GlassesView {
  gameId: GameId;
  engineStatus: 'loading' | 'ready' | 'error';
  /** Entry slots in dealt order (null = empty). */
  slots: readonly (Card | null)[];
  /** Ranked holds for the current complete hand, or null (no result yet). */
  holds: readonly RankedHold[] | null;
  /** 0-based index of the hold being viewed (0 = best). Clamped here too. */
  cycleIndex: number;
  letterSuits: boolean;
  analyzing: boolean;
  /** Voice entry feedback; omitted = idle. */
  voice?: { phase: VoicePhase; message: string | null };
  /** Ring code entry state; omitted = GROUP. */
  code?: CodeState;
  /** Fill order of `slots` (Entry.order), for "dbl back: fix X"; omitted = left to right. */
  order?: readonly number[];
  /** Slot the next card goes into (Entry.armed); omitted = first empty. */
  armed?: number | null;
  /** Discreet entry draft; omitted or empty = not drafting. */
  draft?: Draft;
}

const hasGlyph = (ch: string): boolean => getAdvW(ch.codePointAt(0)!) > 0;
/** Swipe glyphs on the lens; "up" / "dn" if the firmware font lacks the arrows. */
export const UP = hasGlyph('↑') ? '↑' : 'up';
export const DN = hasGlyph('↓') ? '↓' : 'dn';

/** The extra line under a result (and under a complete hand still analyzing). */
export const NEXT_LINE = `next: tap / ${UP} / ${DN}   dbl: fix last card`;

export const LISTENING_HEADER = 'LISTENING… release when done';
export const RECOGNIZING_STATUS = '…';
/** Fallback when an error phase carries no message. */
export const VOICE_ERROR_FALLBACK = 'Voice error. Hold to retry';

/** EV with 4 decimals so near-ties stay distinguishable. */
export const formatEv = (ev: number): string => ev.toFixed(4);

/** Highest viewable index for a ranking: swipes clamp at #1 and at min(32, holds). */
export const maxCycleIndex = (holds: readonly unknown[] | null): number => (holds ? Math.max(0, Math.min(31, holds.length - 1)) : 0);

const fit = (line: string): string => (getTextWidth(line) <= INNER_WIDTH ? line : pxTruncate(line, INNER_WIDTH));

const cardsText = (cards: readonly Card[], letters: boolean): string => cards.map((c) => glassesCard(c, letters)).join(' ');

/** "HOLD K♠ Q♠" or "DRAW 5". */
export const holdText = (held: readonly Card[], letters: boolean): string =>
  held.length === 0 ? 'DRAW 5' : `HOLD ${cardsText(held, letters)}`;

/** Line 1 of a result: held cards bracketed, the rest space-padded so the columns stay put (no trailing space). */
export function handLine(hand: readonly Card[], mask: number, letters: boolean): string {
  return hand.map((c, i) => (mask & (1 << i) ? `[${glassesCard(c, letters)}]` : ` ${glassesCard(c, letters)} `)).join(' ').trimEnd();
}

/** "pattern  EV x.xxxx[  suffix]", truncating only the pattern so the numbers always show. */
function evLine(pattern: string | null, ev: number, suffix: string): string {
  const tail = `EV ${formatEv(ev)}${suffix}`;
  if (!pattern) return tail;
  const room = INNER_WIDTH - getTextWidth(`  ${tail}`);
  const label = getTextWidth(pattern) <= room ? pattern : pxTruncate(pattern, room);
  return `${label}  ${tail}`;
}

function resultLines(hand: readonly Card[], holds: readonly RankedHold[], index: number, letters: boolean): string[] {
  const h = holds[index];
  const lines = [handLine(hand, h.mask, letters)];
  if (index === 0) {
    lines.push(holdText(h.held, letters));
    lines.push(evLine(h.pattern, h.ev, ''));
    const others = holds.filter((o, i) => i !== 0 && o.tie);
    if (others.length > 0) {
      lines.push(`tie: also ${others.map((o) => (o.held.length ? cardsText(o.held, letters) : 'DRAW 5')).join(' / ')}`);
    }
  } else {
    lines.push(`#${index + 1} ${holdText(h.held, letters)}`);
    lines.push(evLine(h.pattern, h.ev, h.tie ? '  tie' : `  −${formatEv(h.loss)}`));
  }
  return lines;
}

const padCache = new Map<string, string>();

/** Appends spaces until `label` is at least `px` wide, so gesture columns line up (memoized: few distinct labels). */
function padTo(label: string, px: number): string {
  const key = `${px}|${label}`;
  let out = padCache.get(key);
  if (out === undefined) {
    out = label;
    while (getTextWidth(out) < px) out += ' ';
    padCache.set(key, out);
  }
  return out;
}

const GESTURE_COL = Math.max(...['tap', 'dbl', UP, DN].map((g) => getTextWidth(`${g}  `)));

const suitGlyph = (suit: number, letters: boolean): string => (letters ? LETTER_SUITS : GLASSES_SUITS)[suit];

/** The note line for a gesture that couldn't act. */
export function noteText(note: CodeNote, letters: boolean): string {
  if (note.kind === 'group-used') return `all of ${GROUPS[note.group].map(rankLabel).join(' ')} in hand`;
  const suits = note.color === 'red' ? RED : BLACK;
  return `${suits.map((s) => glassesCard(note.rank * 4 + s, letters)).join(' ')} both in hand`;
}

/** Last card entered (the one "dbl back" reopens), from the fill order or, without one, the rightmost card. */
function lastCard(slots: readonly (Card | null)[], order: readonly number[] | undefined): Card | null {
  if (order && order.length > 0) return slots[order[order.length - 1]] ?? null;
  for (let i = slots.length - 1; i >= 0; i--) if (slots[i] !== null) return slots[i];
  return null;
}

/** Entry status line and gesture lines for the current code step. */
function codeLines(v: GlassesView, filled: number): { status: string; prompt: string[] } {
  const code = v.code ?? initialCode;
  const letters = v.letterSuits;
  const entry: Entry.EntryState = { slots: v.slots, order: v.order ?? [], armed: v.armed ?? null };
  const progress = `card ${Math.min(filled + 1, v.slots.length)} of ${v.slots.length}`;
  const note = code.note ? noteText(code.note, letters) : null;
  if (code.step === 'rank' && code.group !== null) {
    const ranks = freeRanks(entry, code.group).map((r) => (r === code.cursor ? `[${rankLabel(r)}]` : ` ${rankLabel(r)} `));
    return {
      status: note ?? `RANK  ${progress}`,
      prompt: [ranks.join('  ').trimEnd(), `${DN} next  ${UP} prev   dbl select   tap back`],
    };
  }
  if (code.step === 'suit' && code.rank !== null) {
    const rank = code.rank;
    const used = new Set(Entry.handOf(entry).filter((c) => c >> 2 === rank).map((c) => c & 3));
    const cell = (s: number) => (used.has(s) ? ' - ' : s === code.suit ? `[${suitGlyph(s, letters)}]` : ` ${suitGlyph(s, letters)} `);
    const col = Math.max(getTextWidth(`${UP} red  `), getTextWidth(`${DN} black  `));
    return {
      status: note ?? `SUIT for ${rankLabel(rank)}  ${progress}`,
      prompt: [
        padTo(`${UP} red`, col) + RED.map(cell).join('  ').trimEnd(),
        padTo(`${DN} black`, col) + BLACK.map(cell).join('  ').trimEnd(),
        'dbl select   tap back',
      ],
    };
  }
  const groupLine = (g: number, gesture: string) => {
    const free = freeRanks(entry, g);
    return padTo(gesture, GESTURE_COL) + (free.length ? free.map(rankLabel).join(' ') : '(all in hand)');
  };
  const prompt = [groupLine(0, 'tap'), groupLine(1, UP), groupLine(2, DN)];
  const last = lastCard(v.slots, v.order);
  if (last !== null) prompt.push(`${padTo('dbl', GESTURE_COL)}back: fix ${glassesCard(last, letters)}`);
  return { status: note ?? `GROUP  ${progress}`, prompt };
}

/** Hand line while entering: the pending rank shows as "T?" in its slot during SUIT. */
function entryHandLine(v: GlassesView): string {
  const code = v.code ?? initialCode;
  let pending = -1;
  if (code.step === 'suit' && code.rank !== null) {
    pending = v.armed !== undefined && v.armed !== null && v.slots[v.armed] === null ? v.armed : v.slots.indexOf(null);
  }
  return v.slots
    .map((c, i) => (i === pending && code.rank !== null ? `${glassesRank(code.rank)}?` : c === null ? '_' : glassesCard(c, v.letterSuits)))
    .join(' ');
}

/** Hand line and status line for an open discreet draft. */
function draftLines(d: Draft, letters: boolean): string[] {
  const pending = pendingIndex(d);
  const label = (rank: number, suit: number | null) =>
    rank === DRAFT_JOKER ? 'Jk' : suit === null ? `${glassesRank(rank)}?` : glassesCard(rank * 4 + suit, letters);
  const cells: string[] = [];
  for (let i = 0; i < Entry.SLOTS; i++) {
    const c = d.cards[i];
    cells.push(!c ? '_' : i === pending ? `[${label(c.rank, c.suit)}]` : pending >= 0 ? ` ${label(c.rank, c.suit)} ` : label(c.rank, c.suit));
  }
  const status =
    draftPhase(d) === 'ranks' ? `PHONE  rank ${d.cards.length + 1} of ${Entry.SLOTS}`
    : pending < 0 ? 'PHONE  analyzing...'
    : `PHONE  suit for ${rankLabel(d.cards[pending].rank)}  card ${pending + 1} of ${Entry.SLOTS}`;
  return [cells.join(' ').trimEnd(), status];
}

/** The full glasses page (lines joined by "\n", no trailing newline). */
export function formatGlasses(v: GlassesView): string {
  const name = shortName(v.gameId);
  const phase = v.voice?.phase ?? 'idle';
  const engineHeader = v.engineStatus === 'loading' ? `${name} · loading` : v.engineStatus === 'error' ? `${name} · engine error` : name;
  const filled = v.slots.filter((c): c is Card => c !== null);
  const complete = filled.length === v.slots.length && filled.length > 0;
  const header = phase === 'listening' ? LISTENING_HEADER : engineHeader;
  const voiceStatus =
    phase === 'recognizing' ? RECOGNIZING_STATUS
    : phase === 'error' ? (v.voice?.message?.replace(/\s+/g, ' ').trim() || VOICE_ERROR_FALLBACK)
    : null;
  let body: string[];
  if (complete && v.holds && v.holds.length > 0) {
    const index = Math.max(0, Math.min(maxCycleIndex(v.holds), Math.trunc(v.cycleIndex) || 0));
    body = resultLines(filled, v.holds, index, v.letterSuits);
    body.push(NEXT_LINE);
    if (voiceStatus !== null) body.push(voiceStatus);
  } else if (complete) {
    const line1 = v.slots.map((c) => (c === null ? '_' : glassesCard(c, v.letterSuits))).join(' ');
    body = [line1, voiceStatus ?? (v.engineStatus === 'error' ? 'cannot analyze' : 'analyzing...'), NEXT_LINE];
  } else if (v.draft && v.draft.cards.length > 0 && filled.length === 0) {
    const [hand, status] = draftLines(v.draft, v.letterSuits);
    body = [hand, voiceStatus ?? status];
  } else {
    const { status, prompt } = codeLines(v, filled.length);
    body = [entryHandLine(v), voiceStatus ?? status, ...prompt];
  }
  return [header, ...body].map(fit).join('\n');
}

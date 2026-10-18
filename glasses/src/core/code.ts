/**
 * Ring code entry (CODE.md, v0.4.0): a pure, immutable state machine that turns tap / ↑ / ↓ / double tap
 * into cards. It never edits slots itself: cards go in through Entry.tapCard and come out through Entry.undo,
 * so duplicate rules, slot arming and the new-hand-on-complete behavior are identical to phone taps.
 *
 *   GROUP   tap → A K Q J   ↑ → 10 9 8 7   ↓ → 6 5 4 3 2   (→ RANK, cursor on the group's first free rank)
 *           dbl → back: remove the last entered card and reopen it at SUIT (rank kept, suit cleared)
 *   RANK    ↓ next  ↑ previous (wrapping, exhausted ranks skipped)   dbl → SUIT   tap → GROUP
 *   SUIT    ↑ ♥ ⇄ ◆   ↓ ♠ ⇄ ♣ (used suits skipped; the other color jumps to its first free suit)
 *           dbl → add the card (nothing highlighted: no-op) → GROUP   tap → RANK on this rank
 *   RESULT  (entry complete, whatever the step) tap / ↑ / ↓ → new hand, and that gesture is the GROUP choice;
 *           dbl → back: reopen the 5th card at SUIT
 *
 * A gesture that can't act (exhausted group, both suits of a color used) leaves the step alone and sets
 * `note`, a one-line message the lens shows until the next gesture. Every result object is fresh only when
 * something changed: an unchanged code/entry is returned by reference.
 */
import type { Card } from './cards.ts';
import * as Entry from './entry.ts';

export type Gesture = 'tap' | 'up' | 'down' | 'double';
export type CodeStep = 'group' | 'rank' | 'suit';

/** Engine ranks per group, in scroll order (2 = deuce is rank 0, ace is rank 12). */
export const GROUPS: readonly (readonly number[])[] = [
  [12, 11, 10, 9], // tap: A K Q J
  [8, 7, 6, 5], // ↑: 10 9 8 7
  [4, 3, 2, 1, 0], // ↓: 6 5 4 3 2
];

/** GROUP gesture → group index. */
export const GROUP_OF_GESTURE: Readonly<Record<Exclude<Gesture, 'double'>, number>> = { tap: 0, up: 1, down: 2 };

/** Engine suits (c d h s = 0..3) per color, first suit first: ↑ red ♥ then ◆, ↓ black ♠ then ♣. */
export const RED: readonly number[] = [2, 1];
export const BLACK: readonly number[] = [3, 0];

export interface CodeState {
  readonly step: CodeStep;
  /** Group index (0..2) in RANK and SUIT; null in GROUP. */
  readonly group: number | null;
  /** RANK: the highlighted engine rank (null in GROUP). In SUIT it stays on the selected rank. */
  readonly cursor: number | null;
  /** SUIT: the selected engine rank; null otherwise. */
  readonly rank: number | null;
  /** SUIT: the highlighted engine suit, or null (nothing highlighted yet). */
  readonly suit: number | null;
  /** Why the last gesture couldn't act (the lens shows it); cleared by the next gesture. */
  readonly note: CodeNote | null;
}

/** A gesture that couldn't act: every rank of a group is in the hand, or both suits of a color for this rank. */
export type CodeNote = { readonly kind: 'group-used'; readonly group: number } | { readonly kind: 'color-used'; readonly rank: number; readonly color: 'red' | 'black' };

export const initialCode: CodeState = Object.freeze({ step: 'group', group: null, cursor: null, rank: null, suit: null, note: null });

export interface CodeResult {
  readonly code: CodeState;
  readonly entry: Entry.EntryState;
}

export const groupOfRank = (rank: number): number => GROUPS.findIndex((g) => g.includes(rank));

/** Suits of `rank` already in the hand. */
export function usedSuits(entry: Entry.EntryState, rank: number): Set<number> {
  const out = new Set<number>();
  for (const c of Entry.handOf(entry)) if (c >> 2 === rank && c < 52) out.add(c & 3);
  return out;
}

/** All four suits of this rank are in the hand. */
export const isExhausted = (entry: Entry.EntryState, rank: number): boolean => usedSuits(entry, rank).size === 4;

/** Ranks of a group that can still be entered, in scroll order. */
export const freeRanks = (entry: Entry.EntryState, group: number): number[] => GROUPS[group].filter((r) => !isExhausted(entry, r));

/** Group label for notes and the lens: "A K Q J", "10 9 8 7", "6 5 4 3 2". */
export const groupLabel = (group: number): string => GROUPS[group].map(rankLabel).join(' ');

/** Rank label for code prompts ("10", not "T"). */
export const rankLabel = (rank: number): string => ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][rank];

/** The card back from GROUP / RESULT reopens: the most recently entered one (Entry.undo's target). */
export function lastEntered(entry: Entry.EntryState): Card | null {
  if (entry.order.length === 0) return null;
  return entry.slots[entry.order[entry.order.length - 1]];
}

const result = (code: CodeState, entry: Entry.EntryState, prev: CodeResult): CodeResult =>
  code === prev.code && entry === prev.entry ? prev : { code, entry };

const sameNote = (a: CodeNote | null, b: CodeNote | null): boolean =>
  a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

const withNote = (code: CodeState, note: CodeNote | null): CodeState => (sameNote(code.note, note) ? code : { ...code, note });

/** GROUP choice: enter RANK on the group's first free rank, or stay in GROUP with a note if the group is exhausted. */
function chooseGroup(entry: Entry.EntryState, group: number): CodeState {
  const free = freeRanks(entry, group);
  if (free.length === 0) return { ...initialCode, note: { kind: 'group-used', group } };
  return { step: 'rank', group, cursor: free[0], rank: null, suit: null, note: null };
}

/** Back from GROUP / RESULT: remove the last entered card and reopen it at SUIT. null = nothing to reopen. */
function reopenLast(entry: Entry.EntryState): CodeResult | null {
  const last = lastEntered(entry);
  if (last === null || last >= 52) return null; // a joker can't be coded; back does nothing
  const rank = last >> 2;
  return { code: { step: 'suit', group: groupOfRank(rank), cursor: rank, rank, suit: null, note: null }, entry: Entry.undo(entry) };
}

/** Next/previous free rank in the group, wrapping; stays put when it's the only one. */
function scroll(entry: Entry.EntryState, group: number, cursor: number, dir: 1 | -1): number {
  const ranks = GROUPS[group];
  const i = ranks.indexOf(cursor);
  for (let k = 1; k <= ranks.length; k++) {
    const r = ranks[(i + dir * k + ranks.length * k) % ranks.length];
    if (!isExhausted(entry, r)) return r;
  }
  return cursor;
}

/** A color swipe in SUIT: first free suit of that color, or toggle within it. null = both used. */
function colorSuit(entry: Entry.EntryState, rank: number, current: number | null, color: readonly number[]): number | null {
  const used = usedSuits(entry, rank);
  const free = color.filter((s) => !used.has(s));
  if (free.length === 0) return null;
  if (current !== null && color.includes(current)) {
    const other = free.find((s) => s !== current);
    return other ?? current;
  }
  return free[0];
}

export function stepCode(code: CodeState, entry: Entry.EntryState, gesture: Gesture): CodeResult {
  const prev: CodeResult = { code, entry };
  const cleared = withNote(code, null);

  // RESULT screen: the entry is complete, whatever step the code was left in.
  if (Entry.isComplete(entry)) {
    if (gesture === 'double') {
      return reopenLast(entry) ?? result(cleared, entry, prev);
    }
    const fresh = Entry.clear(entry);
    return result(chooseGroup(fresh, GROUP_OF_GESTURE[gesture]), fresh, prev);
  }

  switch (code.step) {
    case 'group': {
      if (gesture === 'double') return reopenLast(entry) ?? result(cleared, entry, prev);
      const next = chooseGroup(entry, GROUP_OF_GESTURE[gesture]);
      return result(next.step === 'group' ? withNote(code, next.note) : next, entry, prev);
    }
    case 'rank': {
      const group = code.group ?? 0;
      const cursor = code.cursor ?? GROUPS[group][0];
      if (gesture === 'tap') return result(initialCode, entry, prev);
      if (gesture === 'double') {
        if (isExhausted(entry, cursor)) return result(cleared, entry, prev);
        return result({ step: 'suit', group, cursor, rank: cursor, suit: null, note: null }, entry, prev);
      }
      const next = scroll(entry, group, cursor, gesture === 'down' ? 1 : -1);
      return result(next === cursor && cleared === code ? code : { ...cleared, cursor: next }, entry, prev);
    }
    case 'suit': {
      const rank = code.rank ?? code.cursor ?? 0;
      const group = code.group ?? groupOfRank(rank);
      if (gesture === 'tap') return result({ step: 'rank', group, cursor: rank, rank: null, suit: null, note: null }, entry, prev);
      if (gesture === 'double') {
        if (code.suit === null) return result(cleared, entry, prev);
        const next = Entry.tapCard(entry, rank * 4 + code.suit);
        if (next === entry) return result(cleared, entry, prev); // already in the hand (can't happen via code)
        return result(initialCode, next, prev);
      }
      const color = gesture === 'up' ? RED : BLACK;
      const suit = colorSuit(entry, rank, code.suit, color);
      if (suit === null) return result(withNote(code, { kind: 'color-used', rank, color: gesture === 'up' ? 'red' : 'black' }), entry, prev);
      return result(suit === code.suit && cleared === code ? code : { ...cleared, suit }, entry, prev);
    }
  }
}

/** Gestures that enter `cards` into an empty-or-partial entry from GROUP (for tests and docs). */
export function gesturesFor(card: Card, entry: Entry.EntryState = Entry.emptyEntry): Gesture[] {
  const rank = card >> 2;
  const suit = card & 3;
  const group = groupOfRank(rank);
  const out: Gesture[] = [(['tap', 'up', 'down'] as const)[group]];
  const free = freeRanks(entry, group);
  const i = free.indexOf(rank);
  // Shortest way round the wrapping list.
  const fwd = i;
  const back = free.length - i;
  if (fwd <= back) for (let k = 0; k < fwd; k++) out.push('down');
  else for (let k = 0; k < back; k++) out.push('up');
  out.push('double');
  const used = usedSuits(entry, rank);
  const color = RED.includes(suit) ? RED : BLACK;
  const free2 = color.filter((s) => !used.has(s));
  const swipe: Gesture = color === RED ? 'up' : 'down';
  const presses = free2.indexOf(suit) + 1;
  for (let k = 0; k < presses; k++) out.push(swipe);
  out.push('double');
  return out;
}

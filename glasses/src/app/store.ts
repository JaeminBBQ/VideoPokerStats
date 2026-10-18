/**
 * App store: the single source of truth for the phone UI (Phase 2a) and the glasses bridge (Phase 2b).
 * Framework-free and SDK-free; the engine and storage are injected, so it runs in Node tests.
 *
 * API (see SPEC.md "Store contract"):
 *
 *   createStore(deps: StoreDeps): Store
 *   interface StoreDeps { engine: Pick<EngineClient, 'prepare' | 'analyze'>; storage: AppStorage; timers?: Timers }
 *
 *   interface Store {
 *     getState(): AppState;                        // stable reference until something changes
 *     subscribe(fn: () => void): () => void;       // useSyncExternalStore-compatible
 *     selectGame(id: GameId): void;                // persists, prepares tables, re-analyzes a complete hand
 *     tapCard(card: Card): void;                   // fills a slot; on a complete hand starts a new one
 *     tapSlot(slot: number): void;                 // clears that slot and arms it for the next card
 *     undo(): void;
 *     clear(): void;
 *     codeGesture(g: Gesture): void;               // ring code entry (CODE.md): tap | up | down | double
 *     nextHold(): void;                            // cycle #n → #n+1 (clamped at min(32, holds)); no input maps here since v0.4.0
 *     prevHold(): void;                            // cycle #n → #n−1 (clamped at #1); unmapped since v0.4.0
 *     resetHold(): void;                           // back to #1; unmapped since v0.4.0
 *     setLetterSuits(on: boolean): void;           // persisted
 *     setDiscreet(on: boolean): void;              // persisted; the phone shows the rank/suit keypad
 *     draftRank(rank: number): void;               // discreet entry (core/discreet.ts): ranks first …
 *     draftSuit(suit: number): void;               // … then suits; the last suit puts the hand in `entry`
 *     draftUndo(): void;                           // last suit/rank; on an empty draft reopens a complete hand
 *     hydrate(opts?: { onlyIfPristine?: boolean }): Promise<void>;
 *     enterCards(cards: Card[]): EnterResult;      // voice: 5 replace; fewer append (core/voice.ts applySpoken)
 *     enterSpoken(transcript: string): EnterResult; // parseSpoken + enterCards; errors go to voice.message
 *     setVoicePhase(phase: VoicePhase, message?: string | null): void;
 *     setModelStatus(status: ModelStatus): void;
 *   }
 *   type EnterResult = { ok: true } | { ok: false; error: VoiceError }
 *
 *   glassesText(state: AppState): string           // the glasses page (core/format.ts)
 *
 * Behavior:
 * - Analysis runs automatically when the 5th card goes in, and again after selectGame on a complete hand.
 *   A result is discarded if the hand or game changed while it was computing.
 * - `result` is non-null only for the current complete hand and game. A new result resets cycleIndex to 0.
 * - hydrate() restores game, last hand and letter suits from storage, then prepares the game's tables.
 *   It never overrides state the user already changed (any action before the read completes wins).
 *   With `onlyIfPristine`, it does nothing once the user has acted (for a second hydrate after the bridge
 *   connects, when localStorage was empty).
 * - enterCards/enterSpoken change the hand like taps (persist, analyze on 5 cards) and set voice.phase 'idle'.
 *   A rejection leaves the hand alone and sets voice.phase 'error' with a one-line message.
 * - voice 'error' (from setVoicePhase or a rejection) clears itself after VOICE_ERROR_MS, or on the next hand
 *   change, game change, code gesture or hold input (next/prev/reset), whichever comes first.
 * - Code entry (core/code.ts): `code` sits beside `entry`. codeGesture runs stepCode, and any entry change it makes
 *   goes through the same path as taps (persist, analyze on 5 cards). Any entry change that does NOT come from
 *   codeGesture (phone taps, undo/clear, voice, hydrate) resets `code` to GROUP.
 * - Discreet entry: `draft` holds ranks and suits until the hand is whole, then the cards go into `entry` through
 *   the same path as taps and the draft empties. Starting a draft clears the old hand (and its result). Any other
 *   entry change, and any game change, empties the draft.
 */
import type { Card } from '../../../src/engine/cards.ts';
import { GAMES, type GameId } from '../../../src/engine/games.ts';
import { initialCode, stepCode, type CodeState, type Gesture } from '../core/code.ts';
import * as Discreet from '../core/discreet.ts';
import * as Entry from '../core/entry.ts';
import { formatGlasses, maxCycleIndex } from '../core/format.ts';
import { rankHolds, type RankedHold } from '../core/holds.ts';
import { DEFAULT_GAME, loadPersisted, saveDiscreet, saveGame, saveHand, saveLetterSuits, type AppStorage } from '../core/storage.ts';
import { applySpoken, parseSpoken, voiceErrorMessage, type VoiceError, type VoicePhase } from '../core/voice.ts';
import type { EngineClient } from '../engine/protocol.ts';

export type { CodeState, Gesture, VoiceError, VoicePhase };

/** Offline speech model on the phone: not downloaded, downloading (progress 0..1, bytes so far), verifying, ready, or failed. */
export interface ModelStatus {
  readonly state: 'absent' | 'downloading' | 'verifying' | 'ready' | 'error';
  readonly progress?: number;
  readonly bytes?: number;
  /** Full download size when known (from the manifest), for the phone's "Download (≈ N MB)" label. */
  readonly totalBytes?: number;
  readonly error?: string;
}

export interface VoiceState {
  readonly phase: VoicePhase;
  /** The glasses error line while phase is 'error'; null otherwise. */
  readonly message: string | null;
  readonly model: ModelStatus;
}

export type EnterResult = { ok: true } | { ok: false; error: VoiceError };

/** setTimeout/clearTimeout, injectable so tests control the error auto-clear. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** How long a voice error line stays up. */
export const VOICE_ERROR_MS = 4000;

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

export type EngineStatus = 'loading' | 'ready' | 'error';

export interface AppState {
  readonly gameId: GameId;
  /** Tables for `gameId`: 'loading' while building, 'ready', or 'error' (see engineError). */
  readonly engineStatus: EngineStatus;
  readonly engineError: string | null;
  readonly entry: Entry.EntryState;
  /** Ring code entry step (CODE.md); back to GROUP on any entry change not made by codeGesture. */
  readonly code: CodeState;
  /** Ranked holds (best first) for the current complete hand, or null. */
  readonly result: readonly RankedHold[] | null;
  /** 0-based index of the hold shown on the glasses (0 = best). */
  readonly cycleIndex: number;
  readonly letterSuits: boolean;
  /** Phone shows the discreet rank/suit keypad instead of the card grid. */
  readonly discreet: boolean;
  /** Discreet entry in progress (empty when not drafting). */
  readonly draft: Discreet.Draft;
  /** True while an analysis for the current hand is in flight. */
  readonly analyzing: boolean;
  /** True once hydrate() has finished. */
  readonly hydrated: boolean;
  readonly voice: VoiceState;
}

export interface StoreDeps {
  engine: Pick<EngineClient, 'prepare' | 'analyze'>;
  storage: AppStorage;
  timers?: Timers;
}

export interface Store {
  getState(): AppState;
  subscribe(fn: () => void): () => void;
  selectGame(id: GameId): void;
  tapCard(card: Card): void;
  tapSlot(slot: number): void;
  undo(): void;
  clear(): void;
  codeGesture(g: Gesture): void;
  nextHold(): void;
  prevHold(): void;
  resetHold(): void;
  setLetterSuits(on: boolean): void;
  setDiscreet(on: boolean): void;
  draftRank(rank: number): void;
  draftSuit(suit: number): void;
  draftUndo(): void;
  hydrate(opts?: { onlyIfPristine?: boolean }): Promise<void>;
  enterCards(cards: Card[]): EnterResult;
  enterSpoken(transcript: string): EnterResult;
  setVoicePhase(phase: VoicePhase, message?: string | null): void;
  setModelStatus(status: ModelStatus): void;
}

export const initialState: AppState = {
  gameId: DEFAULT_GAME,
  engineStatus: 'loading',
  engineError: null,
  entry: Entry.emptyEntry,
  code: initialCode,
  result: null,
  cycleIndex: 0,
  letterSuits: false,
  discreet: false,
  draft: Discreet.emptyDraft,
  analyzing: false,
  hydrated: false,
  voice: { phase: 'idle', message: null, model: { state: 'absent' } },
};

const sameHand = (a: readonly Card[], b: readonly Card[]): boolean => a.length === b.length && a.every((c, i) => c === b[i]);

export function createStore(deps: StoreDeps): Store {
  const { engine, storage, timers = defaultTimers } = deps;
  let state: AppState = initialState;
  const listeners = new Set<() => void>();
  /** No user action yet (hydrate may still apply saved state). */
  let pristine = true;
  /** Bumped per analysis; a response with an older token is stale. */
  let analyzeSeq = 0;
  /** Game whose prepare() is in flight or done (null = none / needs retry). */
  let preparedFor: GameId | null = null;
  let prepareSeq = 0;
  /** Pending auto-clear of a voice error. */
  let errorTimer: unknown = null;

  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };

  const prepare = (gameId: GameId) => {
    if (preparedFor === gameId && state.engineStatus !== 'error') return;
    preparedFor = gameId;
    const token = ++prepareSeq;
    if (state.engineStatus !== 'loading' || state.engineError !== null) set({ engineStatus: 'loading', engineError: null });
    engine.prepare(gameId).then(
      () => {
        if (token === prepareSeq && state.gameId === gameId) set({ engineStatus: 'ready', engineError: null });
      },
      (err: unknown) => {
        if (token !== prepareSeq || state.gameId !== gameId) return;
        preparedFor = null;
        set({ engineStatus: 'error', engineError: String(err) });
      },
    );
  };

  const cancelErrorTimer = () => {
    if (errorTimer !== null) timers.clearTimeout(errorTimer);
    errorTimer = null;
  };

  /** Patch that clears a showing voice error (merged into the caller's set, so one notify). */
  const clearVoiceError = (): Partial<AppState> => {
    if (state.voice.phase !== 'error') return {};
    cancelErrorTimer();
    return { voice: { ...state.voice, phase: 'idle', message: null } };
  };

  const setVoice = (phase: VoicePhase, message: string | null) => {
    cancelErrorTimer();
    const msg = phase === 'error' ? message : null;
    if (phase !== state.voice.phase || msg !== state.voice.message) set({ voice: { ...state.voice, phase, message: msg } });
    if (phase === 'error') {
      errorTimer = timers.setTimeout(() => {
        errorTimer = null;
        if (state.voice.phase === 'error') set({ voice: { ...state.voice, phase: 'idle', message: null } });
      }, VOICE_ERROR_MS);
    }
  };

  /** Starts analysis of the current hand if complete; otherwise cancels any in-flight one. */
  const analyze = () => {
    const token = ++analyzeSeq;
    if (!Entry.isComplete(state.entry)) {
      if (state.analyzing || state.result !== null) set({ analyzing: false, result: null, cycleIndex: 0 });
      return;
    }
    const gameId = state.gameId;
    const hand = Entry.handOf(state.entry);
    set({ analyzing: true, result: null, cycleIndex: 0 });
    engine.analyze(gameId, hand).then(
      (holds) => {
        if (token !== analyzeSeq || state.gameId !== gameId || !sameHand(Entry.handOf(state.entry), hand)) return;
        set({ result: rankHolds(holds, GAMES[gameId]), cycleIndex: 0, analyzing: false, engineStatus: 'ready', engineError: null });
      },
      (err: unknown) => {
        if (token !== analyzeSeq) return;
        preparedFor = null;
        set({ analyzing: false, engineStatus: 'error', engineError: String(err) });
      },
    );
  };

  /**
   * Every hand change goes through here. `code` is the code state to keep (codeGesture); otherwise back to GROUP.
   * `draft` likewise: kept only by discreet entry, otherwise emptied.
   */
  const setEntry = (next: Entry.EntryState, code: CodeState = initialCode, draft: Discreet.Draft = Discreet.emptyDraft) => {
    pristine = false;
    if (next === state.entry) return;
    set({ entry: next, code, draft, ...clearVoiceError() });
    saveHand(storage, Entry.handOf(next));
    analyze();
  };

  const codeGesture = (g: Gesture) => {
    if (g !== 'tap' && g !== 'up' && g !== 'down' && g !== 'double') return;
    pristine = false;
    const r = stepCode(state.code, state.entry, g);
    if (r.entry !== state.entry) setEntry(r.entry, r.code);
    else {
      const patch: Partial<AppState> = { ...clearVoiceError(), ...(r.code !== state.code ? { code: r.code } : {}) };
      if (Object.keys(patch).length > 0) set(patch);
    }
  };

  /** Discreet entry: a whole draft becomes the hand; a new draft clears the old hand; otherwise only the draft changes. */
  const setDraft = (d: Discreet.Draft) => {
    pristine = false;
    if (d === state.draft) return;
    const hand = Discreet.draftHand(d);
    if (hand) setEntry(Entry.entryFromHand(hand));
    else if (state.entry.order.length > 0) setEntry(Entry.emptyEntry, initialCode, d);
    else set({ draft: d, ...clearVoiceError() });
  };

  const draftUndo = () => {
    if (state.draft.cards.length > 0) return setDraft(Discreet.undoDraft(state.draft));
    if (Entry.isComplete(state.entry)) return setDraft(Discreet.draftFromHand(Entry.handOf(state.entry)));
    setEntry(Entry.undo(state.entry));
  };

  /** Hold input: moves the cycle (clamped) and dismisses a voice error. */
  const setCycle = (i: number) => {
    const clamped = state.result ? Math.max(0, Math.min(maxCycleIndex(state.result), i)) : state.cycleIndex;
    const patch: Partial<AppState> = { ...clearVoiceError(), ...(clamped !== state.cycleIndex ? { cycleIndex: clamped } : {}) };
    if (Object.keys(patch).length > 0) set(patch);
  };

  const enterCards = (cards: Card[], heard = ''): EnterResult => {
    const deck = GAMES[state.gameId].deckSize;
    if (!Array.isArray(cards) || !cards.every((c) => Number.isInteger(c) && c >= 0 && c < deck)) {
      return reject({ kind: 'empty', heard });
    }
    const r = applySpoken(state.entry, cards, heard);
    if (!r.ok) return reject(r.error);
    setVoice('idle', null);
    const same = Entry.isComplete(state.entry) && Entry.isComplete(r.entry) && sameHand(Entry.handOf(state.entry), Entry.handOf(r.entry));
    setEntry(same ? state.entry : r.entry);
    return { ok: true };
  };

  const reject = (error: VoiceError): EnterResult => {
    setVoice('error', voiceErrorMessage(error, state.letterSuits));
    return { ok: false, error };
  };

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    selectGame(id) {
      if (!Object.prototype.hasOwnProperty.call(GAMES, id)) return;
      pristine = false;
      saveGame(storage, id);
      if (id !== state.gameId) {
        set({ gameId: id, draft: Discreet.emptyDraft, ...clearVoiceError() });
        prepare(id);
        analyze();
      } else {
        prepare(id); // retries after an error; no-op otherwise
      }
    },
    tapCard: (card) => {
      const deck = GAMES[state.gameId].deckSize;
      if (!Number.isInteger(card) || card < 0 || card >= deck) return;
      setEntry(Entry.tapCard(state.entry, card));
    },
    tapSlot: (slot) => setEntry(Entry.tapSlot(state.entry, slot)),
    undo: () => setEntry(Entry.undo(state.entry)),
    clear: () => setEntry(Entry.clear(state.entry)),
    codeGesture,
    nextHold: () => setCycle(state.cycleIndex + 1),
    prevHold: () => setCycle(state.cycleIndex - 1),
    resetHold: () => setCycle(0),
    setLetterSuits(on) {
      saveLetterSuits(storage, on);
      if (on !== state.letterSuits) set({ letterSuits: on });
    },
    setDiscreet(on) {
      saveDiscreet(storage, on);
      if (on !== state.discreet) set({ discreet: on, ...(on ? {} : { draft: Discreet.emptyDraft }) });
    },
    draftRank: (rank) => setDraft(Discreet.tapRank(state.draft, rank, GAMES[state.gameId].deckSize === 53)),
    draftSuit: (suit) => setDraft(Discreet.tapSuit(state.draft, suit)),
    draftUndo,
    async hydrate(opts = {}) {
      if (opts.onlyIfPristine && !pristine) return;
      const saved = await loadPersisted(storage);
      if (pristine) {
        const prev = state;
        const entry = Entry.entryFromHand(saved.lastHand);
        const unchanged = prev.gameId === saved.gameId && sameHand(Entry.handOf(prev.entry), Entry.handOf(entry));
        set({ gameId: saved.gameId, letterSuits: saved.letterSuits, discreet: saved.discreet, entry: unchanged ? prev.entry : entry, ...(unchanged ? {} : { code: initialCode }), hydrated: true });
        prepare(saved.gameId);
        if (!unchanged) analyze();
      } else {
        set({ hydrated: true });
        prepare(state.gameId);
      }
    },
    enterCards: (cards) => enterCards(cards),
    enterSpoken(transcript) {
      const r = parseSpoken(transcript);
      if (!r.ok) return reject(r.error);
      return enterCards(r.cards, transcript.trim().toLowerCase());
    },
    setVoicePhase: (phase, message = null) => setVoice(phase, message),
    setModelStatus(status) {
      set({ voice: { ...state.voice, model: { ...status } } });
    },
  };
}

/** The glasses page text for a state. */
export function glassesText(state: AppState): string {
  return formatGlasses({
    gameId: state.gameId,
    engineStatus: state.engineStatus,
    slots: state.entry.slots,
    order: state.entry.order,
    armed: state.entry.armed,
    code: state.code,
    holds: state.result,
    cycleIndex: state.cycleIndex,
    letterSuits: state.letterSuits,
    draft: state.draft,
    analyzing: state.analyzing,
    voice: state.voice,
  });
}

import { beforeAll, describe, expect, it } from 'vitest';
import { parseHand, type Card } from '../../../src/engine/cards.ts';
import { analyzeHand, buildTables, type HoldEv, type Tables } from '../../../src/engine/ev.ts';
import { GAMES, type GameId } from '../../../src/engine/games.ts';
import { createDirectEngine } from '../engine/direct.ts';
import type { EngineClient } from '../engine/protocol.ts';
import { gesturesFor, initialCode } from '../core/code.ts';
import * as Entry from '../core/entry.ts';
import { LISTENING_HEADER, NEXT_LINE, formatGlasses } from '../core/format.ts';
import { rankHolds } from '../core/holds.ts';
import { KEYS, createStorage, type LocalBackend } from '../core/storage.ts';
import { VOICE_NO_MODEL } from '../core/voice.ts';
import { VOICE_ERROR_MS, createStore, glassesText, initialState, type StoreDeps, type Timers } from './store.ts';

class FakeLocal implements LocalBackend {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

/** Engine whose calls stay pending until the test resolves them (answers computed by the real engine). */
class ManualEngine implements Pick<EngineClient, 'prepare' | 'analyze'> {
  calls: { type: 'prepare' | 'analyze'; gameId: GameId; hand?: Card[]; resolve: (v: HoldEv[]) => void; reject: (e: Error) => void }[] = [];
  prepare(gameId: GameId) {
    return new Promise<void>((resolve, reject) => this.calls.push({ type: 'prepare', gameId, resolve: () => resolve(), reject }));
  }
  analyze(gameId: GameId, hand: readonly Card[]) {
    return new Promise<HoldEv[]>((resolve, reject) => this.calls.push({ type: 'analyze', gameId, hand: hand.slice(), resolve, reject }));
  }
  analyses() {
    return this.calls.filter((c) => c.type === 'analyze');
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(pred: () => boolean, ms = 30_000) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await tick();
  }
}

const HAND = parseHand('Ks Qs Js 7d 3c');
const HAND2 = parseHand('Ah Ad 9c 5s 2h');
const job96: GameId = 'gsr-job-9-6';

const tablesCache = new Map<GameId, Tables>();
const tablesOf = (id: GameId) => {
  if (!tablesCache.has(id)) tablesCache.set(id, buildTables(GAMES[id]));
  return tablesCache.get(id)!;
};
const expected = (id: GameId, hand: Card[]) => rankHolds(analyzeHand(tablesOf(id), hand), GAMES[id]);

function setup(engine: StoreDeps['engine'] = createDirectEngine(), local = new FakeLocal()) {
  const storage = createStorage({ local });
  const store = createStore({ engine, storage });
  return { store, local, engine };
}

beforeAll(() => {
  tablesOf(job96);
  tablesOf('gsr-dwbp');
}, 60_000);

describe('store basics', () => {
  it('starts in the initial state; subscribe/unsubscribe; stable references', () => {
    const { store } = setup(new ManualEngine());
    expect(store.getState()).toBe(initialState);
    let n = 0;
    const off = store.subscribe(() => n++);
    store.tapCard(HAND[0]);
    expect(n).toBe(1);
    const s = store.getState();
    store.tapCard(HAND[0]); // duplicate: no change, no notify
    expect(store.getState()).toBe(s);
    expect(n).toBe(1);
    store.tapCard(99); // invalid card ignored
    store.tapCard(-1);
    expect(store.getState()).toBe(s);
    off();
    store.tapCard(HAND[1]);
    expect(n).toBe(1);
  });
});

describe('analysis', () => {
  it('auto-analyzes on the 5th card with engine-exact results', async () => {
    const { store } = setup();
    store.selectGame(job96);
    for (const c of HAND.slice(0, 4)) store.tapCard(c);
    expect(store.getState().analyzing).toBe(false);
    store.tapCard(HAND[4]);
    expect(store.getState().analyzing).toBe(true);
    await until(() => store.getState().result !== null);
    const s = store.getState();
    expect(s.analyzing).toBe(false);
    expect(s.engineStatus).toBe('ready');
    expect(s.result).toEqual(expected(job96, HAND));
    expect(s.cycleIndex).toBe(0);
    expect(glassesText(s)).toBe(
      formatGlasses({ gameId: job96, engineStatus: 'ready', slots: HAND, holds: s.result, cycleIndex: 0, letterSuits: false, analyzing: false }),
    );
  });

  it('cycles with clamping, resets, and a new result resets the index', async () => {
    const { store } = setup();
    store.selectGame(job96);
    store.nextHold(); // no result: ignored
    expect(store.getState().cycleIndex).toBe(0);
    for (const c of HAND) store.tapCard(c);
    await until(() => store.getState().result !== null);
    store.prevHold();
    expect(store.getState().cycleIndex).toBe(0);
    store.nextHold();
    store.nextHold();
    expect(store.getState().cycleIndex).toBe(2);
    expect(glassesText(store.getState()).split('\n')[2].startsWith('#3 ')).toBe(true);
    for (let i = 0; i < 40; i++) store.nextHold();
    expect(store.getState().cycleIndex).toBe(31);
    store.resetHold();
    expect(store.getState().cycleIndex).toBe(0);
    store.nextHold();
    // New hand: first tap starts it, which drops the result and the index.
    store.tapCard(HAND2[0]);
    expect(store.getState().result).toBeNull();
    expect(store.getState().cycleIndex).toBe(0);
    for (const c of HAND2.slice(1)) store.tapCard(c);
    await until(() => store.getState().result !== null);
    expect(store.getState().result).toEqual(expected(job96, HAND2));
    expect(store.getState().cycleIndex).toBe(0);
  });

  it('discards a result if the hand changed while computing', async () => {
    const engine = new ManualEngine();
    const { store } = setup(engine);
    store.selectGame(job96);
    for (const c of HAND) store.tapCard(c);
    const first = engine.analyses()[0];
    store.tapSlot(4); // hand incomplete now
    expect(store.getState().analyzing).toBe(false);
    first.resolve(analyzeHand(tablesOf(job96), HAND));
    await tick();
    expect(store.getState().result).toBeNull();
    // Refill with the same card: a fresh analysis; the old one is still ignored.
    store.tapCard(HAND[4]);
    const second = engine.analyses()[1];
    expect(second.hand).toEqual(HAND);
    second.resolve(analyzeHand(tablesOf(job96), HAND));
    await tick();
    expect(store.getState().result).toEqual(expected(job96, HAND));
  });

  it('a late answer for an older hand never overwrites a newer one', async () => {
    const engine = new ManualEngine();
    const { store } = setup(engine);
    store.selectGame(job96);
    for (const c of HAND) store.tapCard(c);
    for (const c of HAND2) store.tapCard(c);
    const [a, b] = engine.analyses();
    expect(b.hand).toEqual(HAND2);
    b.resolve(analyzeHand(tablesOf(job96), HAND2));
    await tick();
    a.resolve(analyzeHand(tablesOf(job96), HAND));
    await tick();
    expect(store.getState().result).toEqual(expected(job96, HAND2));
  });

  it('analysis errors surface as engine errors', async () => {
    const engine = new ManualEngine();
    const { store } = setup(engine);
    for (const c of HAND) store.tapCard(c);
    engine.analyses()[0].reject(new Error('boom'));
    await tick();
    const s = store.getState();
    expect(s.engineStatus).toBe('error');
    expect(s.engineError).toContain('boom');
    expect(s.analyzing).toBe(false);
    expect(glassesText(s)).toContain('cannot analyze');
  });
});

describe('selectGame', () => {
  it('prepares the game and re-analyzes a complete hand', async () => {
    const { store, local } = setup();
    store.selectGame(job96);
    expect(store.getState().engineStatus).toBe('loading');
    await until(() => store.getState().engineStatus === 'ready');
    for (const c of HAND) store.tapCard(c);
    await until(() => store.getState().result !== null);
    store.nextHold();
    store.selectGame('gsr-dwbp');
    expect(local.map.get(KEYS.game)).toBe('gsr-dwbp');
    let s = store.getState();
    expect(s.gameId).toBe('gsr-dwbp');
    expect(s.result).toBeNull();
    expect(s.cycleIndex).toBe(0);
    await until(() => store.getState().result !== null && store.getState().engineStatus === 'ready');
    s = store.getState();
    expect(s.result).toEqual(expected('gsr-dwbp', HAND));
    expect(glassesText(s).split('\n')[0]).toBe('Deuces Bonus $1');
  });

  it('ignores a late result and a late prepare for the previous game', async () => {
    const engine = new ManualEngine();
    const { store } = setup(engine);
    store.selectGame(job96);
    for (const c of HAND) store.tapCard(c);
    store.selectGame('gsr-dwbp');
    const [prepOld, , prepNew] = engine.calls;
    expect(prepOld.gameId).toBe(job96);
    expect(prepNew.type).toBe('prepare');
    expect(prepNew.gameId).toBe('gsr-dwbp');
    const [oldA, newA] = engine.analyses();
    expect(newA.gameId).toBe('gsr-dwbp');
    prepOld.resolve([]);
    oldA.resolve(analyzeHand(tablesOf(job96), HAND));
    await tick();
    expect(store.getState().engineStatus).toBe('loading');
    expect(store.getState().result).toBeNull();
    prepNew.resolve([]);
    newA.resolve(analyzeHand(tablesOf('gsr-dwbp'), HAND));
    await tick();
    expect(store.getState().engineStatus).toBe('ready');
    expect(store.getState().result).toEqual(expected('gsr-dwbp', HAND));
  });

  it('prepare error, then selecting the same game retries', async () => {
    const engine = new ManualEngine();
    const { store } = setup(engine);
    store.selectGame(job96);
    engine.calls[0].reject(new Error('oom'));
    await tick();
    expect(store.getState().engineStatus).toBe('error');
    expect(store.getState().engineError).toContain('oom');
    expect(glassesText(store.getState()).split('\n')[0]).toBe('JoB 9/6 $1 · engine error');
    store.selectGame(job96);
    expect(engine.calls).toHaveLength(2);
    expect(store.getState().engineStatus).toBe('loading');
    engine.calls[1].resolve([]);
    await tick();
    expect(store.getState().engineStatus).toBe('ready');
    store.selectGame(job96); // already ready: no new prepare
    expect(engine.calls).toHaveLength(2);
  });

  it('ignores unknown game ids', () => {
    const { store } = setup(new ManualEngine());
    store.selectGame('nope' as GameId);
    expect(store.getState()).toBe(initialState);
  });
});

describe('persistence and hydrate', () => {
  it('persists hand, game and letter suits', async () => {
    const { store, local } = setup(new ManualEngine());
    store.selectGame('gsr-dwbp');
    store.tapCard(HAND[0]);
    store.tapCard(HAND[1]);
    expect(local.map.get(KEYS.lastHand)).toBe(JSON.stringify(HAND.slice(0, 2)));
    store.undo();
    expect(local.map.get(KEYS.lastHand)).toBe(JSON.stringify(HAND.slice(0, 1)));
    store.clear();
    expect(local.map.get(KEYS.lastHand)).toBe('[]');
    store.setLetterSuits(true);
    expect(store.getState().letterSuits).toBe(true);
    expect(local.map.get(KEYS.letterSuits)).toBe('1');
    expect(local.map.get(KEYS.game)).toBe('gsr-dwbp');
  });

  it('hydrate restores game, hand and letter suits, prepares and analyzes', async () => {
    const local = new FakeLocal();
    local.map.set(KEYS.game, job96);
    local.map.set(KEYS.lastHand, JSON.stringify(HAND));
    local.map.set(KEYS.letterSuits, '1');
    const { store } = setup(createDirectEngine(), local);
    await store.hydrate();
    let s = store.getState();
    expect(s.hydrated).toBe(true);
    expect(s.gameId).toBe(job96);
    expect(s.letterSuits).toBe(true);
    expect(s.entry.slots).toEqual(HAND);
    await until(() => store.getState().result !== null);
    s = store.getState();
    expect(s.result).toEqual(expected(job96, HAND));
    expect(s.engineStatus).toBe('ready');
    expect(glassesText(s).split('\n')[1]).toContain('[Ks]');
  });

  it('hydrate with bad saved data falls back to defaults', async () => {
    const local = new FakeLocal();
    local.map.set(KEYS.game, 'retired-game');
    local.map.set(KEYS.lastHand, '[1,1,1]');
    const engine = new ManualEngine();
    const { store } = setup(engine, local);
    await store.hydrate();
    const s = store.getState();
    expect(s.gameId).toBe(initialState.gameId);
    expect(s.entry.slots).toEqual([null, null, null, null, null]);
    expect(engine.calls.map((c) => c.type)).toEqual(['prepare']);
  });

  it('hydrate never overrides a user action; onlyIfPristine skips after one', async () => {
    const local = new FakeLocal();
    local.map.set(KEYS.game, 'gsr-dwbp');
    local.map.set(KEYS.lastHand, JSON.stringify(HAND2));
    const engine = new ManualEngine();
    const { store } = setup(engine, local);
    const p = store.hydrate();
    store.tapCard(HAND[0]); // user acts while the read is in flight
    await p;
    const s = store.getState();
    expect(s.hydrated).toBe(true);
    expect(s.gameId).toBe(initialState.gameId);
    expect(s.entry.slots[0]).toBe(HAND[0]);
    expect(engine.calls.filter((c) => c.type === 'prepare').map((c) => c.gameId)).toEqual([initialState.gameId]);
    const before = store.getState();
    await store.hydrate({ onlyIfPristine: true });
    expect(store.getState()).toBe(before);
  });

  it('a second pristine hydrate picks up values that appeared (bridge attached later)', async () => {
    const local = new FakeLocal();
    const engine = new ManualEngine();
    const { store } = setup(engine, local);
    await store.hydrate();
    expect(store.getState().gameId).toBe(initialState.gameId);
    local.map.set(KEYS.game, 'gsr-dwbp');
    await store.hydrate({ onlyIfPristine: true });
    expect(store.getState().gameId).toBe('gsr-dwbp');
    expect(engine.calls.filter((c) => c.type === 'prepare').map((c) => c.gameId)).toEqual([initialState.gameId, 'gsr-dwbp']);
  });
});

/** Manual timers: `advance(ms)` fires due callbacks in order. */
function manualTimers() {
  let now = 0;
  let id = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout(fn, ms) {
      pending.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => void pending.delete(h as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [k, t] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at > now) break;
      pending.delete(k);
      t.fn();
    }
  };
  return { timers, advance, pending };
}

function voiceSetup(engine: StoreDeps['engine'] = createDirectEngine()) {
  const local = new FakeLocal();
  const t = manualTimers();
  const store = createStore({ engine, storage: createStorage({ local }), timers: t.timers });
  return { store, local, ...t };
}

describe('voice entry', () => {
  it('initial voice state', () => {
    expect(initialState.voice).toEqual({ phase: 'idle', message: null, model: { state: 'absent' } });
  });

  it('enterCards with 5 cards replaces the hand, persists it and analyzes like taps', async () => {
    const { store, local } = voiceSetup();
    store.selectGame(job96);
    store.tapCard(HAND2[0]);
    expect(store.enterCards(HAND)).toEqual({ ok: true });
    expect(store.getState().analyzing).toBe(true);
    expect(JSON.parse(local.map.get(KEYS.lastHand)!)).toEqual(HAND);
    await until(() => store.getState().result !== null);
    expect(store.getState().result).toEqual(expected(job96, HAND));
    // The same complete hand again: no re-analysis, result kept.
    const s = store.getState();
    store.nextHold();
    expect(store.enterCards(HAND)).toEqual({ ok: true });
    expect(store.getState().result).toBe(s.result);
    expect(store.getState().cycleIndex).toBe(1);
  });

  it('fewer than 5 append to a partial hand, or start fresh after a complete one', async () => {
    const { store } = voiceSetup();
    store.selectGame(job96);
    expect(store.enterCards(HAND.slice(0, 3)).ok).toBe(true);
    expect(store.getState().entry.slots).toEqual([...HAND.slice(0, 3), null, null]);
    expect(store.enterCards(HAND.slice(3)).ok).toBe(true);
    await until(() => store.getState().result !== null);
    expect(store.enterCards([HAND2[0]]).ok).toBe(true);
    expect(store.getState().entry.slots).toEqual([HAND2[0], null, null, null, null]);
    expect(store.getState().result).toBeNull();
  });

  it('rejections leave the hand alone and show an error line that clears after 4 s', () => {
    const { store, advance } = voiceSetup(new ManualEngine());
    store.enterCards(HAND.slice(0, 3));
    const entry = store.getState().entry;
    const r = store.enterCards([HAND[0]]);
    expect(r).toEqual({ ok: false, error: { kind: 'duplicate', heard: '', card: HAND[0], inHand: true } });
    expect(store.getState().entry).toBe(entry);
    expect(store.getState().voice.phase).toBe('error');
    expect(store.getState().voice.message).toBe('K♠ already in hand. Hold to retry');
    expect(glassesText(store.getState()).split('\n')[2]).toBe('K♠ already in hand. Hold to retry');
    expect(store.enterCards(HAND2.slice(0, 3))).toMatchObject({ ok: false, error: { kind: 'too-many', count: 6 } });
    advance(VOICE_ERROR_MS - 1);
    expect(store.getState().voice.phase).toBe('error');
    advance(1);
    expect(store.getState().voice).toEqual({ phase: 'idle', message: null, model: { state: 'absent' } });
    expect(store.enterCards([99]).ok).toBe(false); // invalid card
    expect(store.enterCards([]).ok).toBe(false);
  });

  it('enterSpoken parses, enters, and reports parse errors with the heard words', async () => {
    const { store } = voiceSetup();
    store.selectGame(job96);
    store.setLetterSuits(true);
    expect(store.enterSpoken('king queen')).toMatchObject({ ok: false, error: { kind: 'trailing-rank', words: ['king', 'queen'] } });
    expect(store.getState().voice.message).toBe('Heard "king queen" — no suit. Hold to retry');
    expect(store.enterSpoken('king queen jack of spades seven of diamonds three of clubs')).toEqual({ ok: true });
    expect(store.getState().voice.phase).toBe('idle');
    await until(() => store.getState().result !== null);
    expect(store.getState().result).toEqual(expected(job96, HAND));
    expect(store.enterSpoken('ace of spades ace of spades')).toMatchObject({ ok: false, error: { kind: 'duplicate' } });
    expect(store.getState().voice.message).toBe('As said twice. Hold to retry');
  });

  it('an error clears early on a hand change, a game change, or a hold input', async () => {
    const { store, pending } = voiceSetup(new ManualEngine());
    const raise = () => {
      store.setVoicePhase('error', VOICE_NO_MODEL);
      expect(store.getState().voice.phase).toBe('error');
    };
    raise();
    expect(glassesText(store.getState()).split('\n')[2]).toBe(VOICE_NO_MODEL);
    let n = 0;
    const off = store.subscribe(() => n++);
    store.tapCard(HAND[0]);
    expect(n).toBe(1); // one notify for entry + cleared error
    expect(store.getState().voice.phase).toBe('idle');
    expect(pending.size).toBe(0);
    off();
    raise();
    store.selectGame('gsr-dwbp');
    expect(store.getState().voice.phase).toBe('idle');
    raise();
    store.resetHold(); // no result, but a tap is still "the next input"
    expect(store.getState().voice.message).toBeNull();
    raise();
    store.setLetterSuits(true); // not a hand/cycle input: stays
    expect(store.getState().voice.phase).toBe('error');
  });

  it('setVoicePhase: listening/recognizing render, re-raising restarts the timer, idle cancels it', () => {
    const { store, advance, pending } = voiceSetup(new ManualEngine());
    store.setVoicePhase('listening');
    expect(glassesText(store.getState()).split('\n')[0]).toBe(LISTENING_HEADER);
    store.setVoicePhase('recognizing', 'ignored');
    expect(store.getState().voice).toMatchObject({ phase: 'recognizing', message: null });
    expect(glassesText(store.getState()).split('\n')[2]).toBe('…');
    store.setVoicePhase('error', 'one');
    advance(3000);
    store.setVoicePhase('error', 'two');
    advance(3000);
    expect(store.getState().voice.message).toBe('two');
    advance(1000);
    expect(store.getState().voice.phase).toBe('idle');
    store.setVoicePhase('error', 'three');
    store.setVoicePhase('idle');
    expect(pending.size).toBe(0);
    const s = store.getState();
    store.setVoicePhase('idle');
    expect(store.getState()).toBe(s); // no change, no new state
  });

  it('setModelStatus updates only the model', () => {
    const { store } = voiceSetup(new ManualEngine());
    store.setVoicePhase('listening');
    store.setModelStatus({ state: 'downloading', progress: 0.5, bytes: 1234 });
    expect(store.getState().voice).toEqual({ phase: 'listening', message: null, model: { state: 'downloading', progress: 0.5, bytes: 1234 } });
    store.setModelStatus({ state: 'error', error: 'sha256 mismatch' });
    expect(store.getState().voice.model).toEqual({ state: 'error', error: 'sha256 mismatch' });
  });
});

describe('code entry (CODE.md)', () => {
  /** Enters `cards` by ring gestures only. */
  const codeIn = (store: ReturnType<typeof setup>['store'], cards: readonly Card[]) => {
    for (const c of cards) for (const g of gesturesFor(c, store.getState().entry)) store.codeGesture(g);
  };

  it('initial code state is GROUP', () => {
    expect(initialState.code).toBe(initialCode);
  });

  it('gestures alone enter a hand that persists and analyzes exactly like taps', async () => {
    const { store, local } = setup();
    store.selectGame(job96);
    codeIn(store, HAND.slice(0, 4));
    expect(store.getState().entry.slots).toEqual([...HAND.slice(0, 4), null]);
    expect(JSON.parse(local.map.get(KEYS.lastHand)!)).toEqual(HAND.slice(0, 4));
    expect(store.getState().analyzing).toBe(false);
    codeIn(store, HAND.slice(4));
    expect(store.getState().analyzing).toBe(true);
    await until(() => store.getState().result !== null);
    expect(store.getState().result).toEqual(expected(job96, HAND));
    expect(store.getState().code).toBe(initialCode);
    expect(glassesText(store.getState()).split('\n').at(-1)).toBe(NEXT_LINE);
  });

  it('result screen: ↓ starts a new hand as the GROUP choice; dbl reopens the 5th card', async () => {
    const { store } = setup();
    store.selectGame(job96);
    codeIn(store, HAND);
    await until(() => store.getState().result !== null);
    store.codeGesture('double');
    expect(Entry.handOf(store.getState().entry)).toEqual(HAND.slice(0, 4));
    expect(store.getState().result).toBeNull();
    expect(store.getState().code).toMatchObject({ step: 'suit', rank: HAND[4] >> 2, suit: null });
    store.codeGesture('down'); // 3♣ → 3♠
    store.codeGesture('double');
    const fixed = [...HAND.slice(0, 4), parseHand('3s')[0]];
    expect(Entry.handOf(store.getState().entry)).toEqual(fixed);
    await until(() => store.getState().result !== null);
    expect(store.getState().result).toEqual(expected(job96, fixed));
    store.codeGesture('down');
    expect(store.getState().entry).toBe(Entry.emptyEntry);
    expect(store.getState().result).toBeNull();
    expect(store.getState().code).toMatchObject({ step: 'rank', group: 2, cursor: 4 });
  });

  it('a step change without a hand change notifies once and keeps the entry reference', () => {
    const { store } = setup(new ManualEngine());
    const entry = store.getState().entry;
    let n = 0;
    store.subscribe(() => n++);
    store.codeGesture('up');
    expect(n).toBe(1);
    expect(store.getState().entry).toBe(entry);
    store.codeGesture('double'); // back from GROUP with no cards: nothing
    expect(n).toBe(2); // that was RANK → SUIT
    const s = store.getState();
    store.codeGesture('double'); // SUIT with nothing highlighted: no-op
    expect(store.getState()).toBe(s);
    expect(n).toBe(2);
    store.codeGesture('bogus' as never);
    expect(store.getState()).toBe(s);
  });

  it('interleaving: any entry change not from code (tap, slot, undo, clear, voice, hydrate) resets code to GROUP', async () => {
    const { store } = setup(new ManualEngine());
    const toSuit = () => {
      store.codeGesture('tap');
      store.codeGesture('double'); // A, SUIT
      store.codeGesture('up'); // ♥
      expect(store.getState().code.step).toBe('suit');
    };
    toSuit();
    store.tapCard(HAND[0]);
    expect(store.getState().code).toBe(initialCode);
    toSuit();
    store.tapSlot(0);
    expect(store.getState().code).toBe(initialCode);
    toSuit();
    store.codeGesture('double'); // adds A♥ (into the armed slot 0)
    expect(store.getState().entry.slots[0]).toBe(parseHand('Ah')[0]);
    toSuit(); // A, ♥ is used now, so ↑ → ◆
    expect(store.getState().code.suit).toBe(1);
    store.undo();
    expect(store.getState().code).toBe(initialCode);
    toSuit();
    store.clear();
    expect(store.getState().code).toBe(initialCode);
    toSuit();
    expect(store.enterCards([HAND2[1]]).ok).toBe(true);
    expect(store.getState().code).toBe(initialCode);
    // A rejected voice entry changes nothing, so the code step stays.
    toSuit();
    const code = store.getState().code;
    expect(store.enterCards([HAND2[1]]).ok).toBe(false);
    expect(store.getState().code).toBe(code);
    // A code gesture clears the voice error.
    store.codeGesture('down');
    expect(store.getState().voice.phase).toBe('idle');
    expect(store.getState().code).toMatchObject({ step: 'suit', suit: 3 });
  });

  it('hydrate restoring a saved hand resets code', async () => {
    const local = new FakeLocal();
    local.map.set(KEYS.lastHand, JSON.stringify(HAND.slice(0, 2)));
    const storage = createStorage({ local });
    const store = createStore({ engine: new ManualEngine(), storage });
    const p = store.hydrate();
    await p;
    expect(store.getState().entry.slots).toEqual([...HAND.slice(0, 2), null, null, null]);
    expect(store.getState().code).toBe(initialCode);
  });
});

describe('discreet entry', () => {
  it('ranks then suits fill the hand and analyze; a new draft clears the old hand; undo reopens it', async () => {
    const { store, local } = setup(createDirectEngine());
    store.setDiscreet(true);
    expect(local.map.get(KEYS.discreet)).toBe('1');
    for (const r of [11, 10, 9, 5, 1]) store.draftRank(r);
    expect(store.getState().entry).toBe(Entry.emptyEntry);
    expect(glassesText(store.getState()).split('\n')[2]).toBe('PHONE  suit for K  card 1 of 5');
    for (const s of [3, 3, 3, 1, 0]) store.draftSuit(s);
    expect(Entry.handOf(store.getState().entry)).toEqual(HAND);
    expect(store.getState().draft.cards).toHaveLength(0);
    await until(() => store.getState().result !== null);

    store.draftUndo(); // reopen the 5th card's suit
    expect(store.getState().entry).toBe(Entry.emptyEntry);
    expect(store.getState().draft.cards.map((c) => c.suit)).toEqual([3, 3, 3, 1, null]);
    store.draftSuit(0);
    expect(Entry.handOf(store.getState().entry)).toEqual(HAND);

    store.draftRank(12); // next hand
    expect(store.getState().entry).toBe(Entry.emptyEntry);
    expect(store.getState().result).toBeNull();
    store.tapCard(HAND2[0]); // any other entry change drops the draft
    expect(store.getState().draft.cards).toHaveLength(0);

    store.setDiscreet(false);
    expect(store.getState().discreet).toBe(false);
  });
});

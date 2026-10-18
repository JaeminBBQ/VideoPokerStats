import { describe, expect, it } from 'vitest';
import { GAME_LIST } from '../../../src/engine/games.ts';
import {
  DEFAULT_GAME, KEYS, createStorage, loadPersisted, parseGameId, parseHand, parseLetterSuits, saveGame, saveHand, saveLetterSuits,
  type LocalBackend, type RemoteBackend,
} from './storage.ts';

class FakeLocal implements LocalBackend {
  map = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    if (this.fail) throw new Error('blocked');
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error('blocked');
    this.map.set(k, v);
  }
}

class FakeRemote implements RemoteBackend {
  map = new Map<string, string>();
  mode: 'ok' | 'reject' | 'hang' = 'ok';
  async get(k: string): Promise<string> {
    if (this.mode === 'reject') throw new Error('no host');
    if (this.mode === 'hang') return new Promise(() => {});
    return this.map.get(k) ?? '';
  }
  async set(k: string, v: string) {
    if (this.mode === 'reject') throw new Error('no host');
    if (this.mode === 'hang') return new Promise(() => {});
    this.map.set(k, v);
    return true;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createStorage', () => {
  it('writes to both backends', async () => {
    const local = new FakeLocal();
    const remote = new FakeRemote();
    const s = createStorage({ local, remote });
    s.write('k', 'v');
    await flush();
    expect(local.map.get('k')).toBe('v');
    expect(remote.map.get('k')).toBe('v');
  });

  it('prefers a non-empty local value, falls back to the bridge, "" = missing', async () => {
    const local = new FakeLocal();
    const remote = new FakeRemote();
    const s = createStorage({ local, remote });
    remote.map.set('a', 'bridge');
    local.map.set('a', 'local');
    expect(await s.read('a')).toBe('local');
    local.map.set('a', '');
    expect(await s.read('a')).toBe('bridge');
    expect(await s.read('missing')).toBeNull();
  });

  it('survives a throwing localStorage and a rejecting or hanging bridge', async () => {
    const local = new FakeLocal();
    local.fail = true;
    const remote = new FakeRemote();
    remote.map.set('a', 'bridge');
    const s = createStorage({ local, remote, timeoutMs: 20 });
    expect(await s.read('a')).toBe('bridge');
    expect(() => s.write('a', 'x')).not.toThrow();
    remote.mode = 'reject';
    expect(await s.read('a')).toBeNull();
    remote.mode = 'hang';
    const t0 = Date.now();
    expect(await s.read('a')).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(() => s.write('a', 'y')).not.toThrow();
  });

  it('works with no backends, and a remote attached later', async () => {
    const s = createStorage();
    s.write('a', 'b');
    expect(await s.read('a')).toBeNull();
    const remote = new FakeRemote();
    remote.map.set('a', 'late');
    s.setRemote(remote);
    expect(await s.read('a')).toBe('late');
  });
});

describe('validation', () => {
  it('parseGameId: unknown → first game', () => {
    expect(DEFAULT_GAME).toBe('gsr-job-9-5');
    expect(GAME_LIST.some((g) => g.id === DEFAULT_GAME)).toBe(true);
    for (const g of GAME_LIST) expect(parseGameId(g.id)).toBe(g.id);
    expect(parseGameId('nope')).toBe(DEFAULT_GAME);
    expect(parseGameId(null)).toBe(DEFAULT_GAME);
    expect(parseGameId('toString')).toBe(DEFAULT_GAME);
  });

  it('parseHand: bad input → empty', () => {
    expect(parseHand('[0,5,51]', 'job-8-5')).toEqual([0, 5, 51]);
    expect(parseHand('[]', 'job-8-5')).toEqual([]);
    expect(parseHand(null, 'job-8-5')).toEqual([]);
    expect(parseHand('not json', 'job-8-5')).toEqual([]);
    expect(parseHand('{"a":1}', 'job-8-5')).toEqual([]);
    expect(parseHand('[1,1]', 'job-8-5')).toEqual([]);
    expect(parseHand('[52]', 'job-8-5')).toEqual([]); // no joker in a 52-card game
    expect(parseHand('[1,2,3,4,5,6]', 'job-8-5')).toEqual([]);
    expect(parseHand('[1.5]', 'job-8-5')).toEqual([]);
    expect(parseHand('["1"]', 'job-8-5')).toEqual([]);
  });

  it('parseLetterSuits', () => {
    expect(parseLetterSuits('1')).toBe(true);
    expect(parseLetterSuits('0')).toBe(false);
    expect(parseLetterSuits('')).toBe(false);
    expect(parseLetterSuits(null)).toBe(false);
  });
});

describe('typed settings round trip', () => {
  it('saves and loads', async () => {
    const local = new FakeLocal();
    const s = createStorage({ local });
    expect(await loadPersisted(s)).toEqual({ gameId: DEFAULT_GAME, lastHand: [], letterSuits: false, discreet: false });
    saveGame(s, 'gsr-dwbp');
    saveHand(s, [3, 7, 11]);
    saveLetterSuits(s, true);
    expect(local.map.get(KEYS.game)).toBe('gsr-dwbp');
    expect(local.map.get(KEYS.lastHand)).toBe('[3,7,11]');
    expect(local.map.get(KEYS.letterSuits)).toBe('1');
    expect(await loadPersisted(s)).toEqual({ gameId: 'gsr-dwbp', lastHand: [3, 7, 11], letterSuits: true, discreet: false });
    saveLetterSuits(s, false);
    expect(local.map.get(KEYS.letterSuits)).toBe('0'); // non-empty, so the bridge never overrides "off"
    expect((await loadPersisted(s)).letterSuits).toBe(false);
  });

  it('a wiped localStorage restores from the bridge', async () => {
    const remote = new FakeRemote();
    saveGame(createStorage({ remote }), 'gsr-job-9-5');
    await flush();
    expect((await loadPersisted(createStorage({ local: new FakeLocal(), remote }))).gameId).toBe('gsr-job-9-5');
  });
});

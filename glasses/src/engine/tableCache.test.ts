import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeHand, buildTables, type Tables } from '../../../src/engine/ev.ts';
import { parseHand } from '../../../src/engine/cards.ts';
import { GAMES } from '../../../src/engine/games.ts';
import { cacheKey, loadTables, type TableStore } from './tableCache.ts';

function mapStore() {
  const m = new Map<string, Uint32Array>();
  const calls: string[] = [];
  const store: TableStore = {
    get: async (k) => (calls.push(`get:${k}`), m.get(k)),
    put: async (k, v) => void (calls.push(`put:${k}`), m.set(k, v)),
    prune: async (keep) => [...m.keys()].forEach((k) => keep(k) || m.delete(k)),
  };
  return { m, calls, store };
}

const game = GAMES['gsr-job-9-6'];
const hand = parseHand('Ks Qs Js 7d 3c');
let fresh: Tables;
beforeAll(() => {
  fresh = buildTables(game);
}, 30_000);

describe('table cache', { timeout: 30_000 }, () => {
  it('a cache hit returns tables that analyze identically to freshly built ones', async () => {
    const { m, store } = mapStore();
    m.set(cacheKey(game, 'h1'), fresh.sums);
    const t = await loadTables(game, store, 'h1');
    expect(t.sums).toBe(fresh.sums);
    expect(t.offsets).toEqual(fresh.offsets);
    expect(analyzeHand(t, hand)).toEqual(analyzeHand(fresh, hand));
  });

  it('a miss builds, stores under the engine hash, and prunes other hashes', async () => {
    const { m, calls, store } = mapStore();
    m.set('old:gsr-job-9-6', new Uint32Array(3));
    m.set('h2:job-8-5', new Uint32Array(3));
    const t = await loadTables(game, store, 'h2');
    expect(t.sums).toEqual(fresh.sums);
    expect(calls).toContain('put:h2:gsr-job-9-6');
    expect([...m.keys()].sort()).toEqual(['h2:gsr-job-9-6', 'h2:job-8-5']);
  });

  it('a wrong-length entry is ignored and rebuilt', async () => {
    const { m, store } = mapStore();
    m.set(cacheKey(game, 'h3'), new Uint32Array(10));
    const t = await loadTables(game, store, 'h3');
    expect(t.sums.length).toBe(fresh.sums.length);
    expect(m.get(cacheKey(game, 'h3'))!.length).toBe(fresh.sums.length);
  });

  it('a failing store still yields tables', async () => {
    const broken: TableStore = {
      get: () => Promise.reject(new Error('x')),
      put: () => Promise.reject(new Error('x')),
      prune: () => Promise.reject(new Error('x')),
    };
    const t = await loadTables(game, broken, 'h4');
    expect(analyzeHand(t, hand)).toEqual(analyzeHand(fresh, hand));
    expect(await loadTables(game, null, 'h4')).toBeTruthy();
  });
});

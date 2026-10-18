/// <reference types="node" />
import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ModelStatus } from '../app/store.ts';
import { createModelStore, parseManifest, partUrl, progressOf, type CachedMeta, type ModelCache } from './modelStore.ts';
import { sha256Hex, sha256Js } from './sha256.ts';

const hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const BASE = 'https://model.test';

function fixture(sizes = [3000, 1234]) {
  const all = new Uint8Array(randomBytes(sizes.reduce((a, b) => a + b, 0)));
  let off = 0;
  const parts = sizes.map((n, i) => {
    const bytes = all.subarray(off, off + n);
    off += n;
    return { path: `parts/abc/model.tar.gz.part00${i}`, bytes: n, sha256: hex(bytes), data: bytes };
  });
  const manifest = { version: 'v1', totalBytes: all.length, sha256: hex(all), parts: parts.map(({ data: _d, ...p }) => p) };
  return { all, parts, manifest };
}

/** A fetch fake serving the fixture; responses stream in 1000-byte chunks. */
function fakeFetch(files: Record<string, Uint8Array | string | number>, log: string[] = []) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    log.push(url);
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const f = files[url];
    if (f === undefined) return new Response('nope', { status: 404 });
    if (typeof f === 'number') throw new TypeError('Failed to fetch');
    if (typeof f === 'string') return new Response(f, { status: 200 });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < f.length; i += 1000) c.enqueue(f.slice(i, i + 1000));
        c.close();
      },
    });
    return new Response(stream, { status: 200 });
  };
}

function memCache(): ModelCache & { m: CachedMeta | null; d: ArrayBuffer | null; failPut?: boolean } {
  const c = {
    m: null as CachedMeta | null,
    d: null as ArrayBuffer | null,
    failPut: false,
    meta: async () => c.m,
    data: async () => c.d,
    put: async (meta: CachedMeta, data: ArrayBuffer) => {
      if (c.failPut) throw new Error('QuotaExceededError');
      c.m = meta;
      c.d = data;
    },
    clear: async () => {
      c.m = null;
      c.d = null;
    },
  };
  return c;
}

function setup(over: Partial<Record<string, Uint8Array | string | number>> = {}, sizes?: number[]) {
  const fx = fixture(sizes);
  const files: Record<string, Uint8Array | string | number> = { [`${BASE}/manifest.json`]: JSON.stringify(fx.manifest) };
  for (const p of fx.parts) files[`${BASE}/${p.path}`] = p.data;
  Object.assign(files, over);
  const statuses: ModelStatus[] = [];
  const cache = memCache();
  const log: string[] = [];
  const ms = createModelStore({ baseUrl: BASE, fetch: fakeFetch(files, log), cache, onStatus: (s) => statuses.push(s) });
  return { fx, files, statuses, cache, ms, log };
}

describe('parseManifest', () => {
  const good = fixture().manifest;
  it('accepts the real manifest shape', () => expect(parseManifest(good)).toEqual(good));
  it.each([
    ['null', null],
    ['no version', { ...good, version: '' }],
    ['bad total', { ...good, totalBytes: -1 }],
    ['bad sha', { ...good, sha256: 'xyz' }],
    ['no parts', { ...good, parts: [] }],
    ['sizes', { ...good, totalBytes: good.totalBytes + 1 }],
    ['abs path', { ...good, parts: [{ ...good.parts[0]!, path: 'https://evil.test/x' }, good.parts[1]] }],
    ['dotdot', { ...good, parts: [{ ...good.parts[0]!, path: '../x' }, good.parts[1]] }],
  ])('rejects %s', (_n, m) => expect(() => parseManifest(m)).toThrow(/Bad manifest/));
});

describe('helpers', () => {
  it('progressOf floors to whole percent and clamps', () => {
    expect(progressOf(0, 100)).toBe(0);
    expect(progressOf(999, 1000)).toBe(0.99);
    expect(progressOf(2000, 1000)).toBe(1);
    expect(progressOf(5, 0)).toBe(0);
  });
  it('partUrl joins relative paths', () => {
    expect(partUrl('https://h.test', 'manifest.json')).toBe('https://h.test/manifest.json');
    expect(partUrl('http://localhost:8788/', 'parts/a/b')).toBe('http://localhost:8788/parts/a/b');
  });
  it('JS sha256 matches node for edge lengths', async () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 70001]) {
      const b = new Uint8Array(randomBytes(n));
      expect(Buffer.from(sha256Js(b)).toString('hex')).toBe(hex(b));
      expect(await sha256Hex(b)).toBe(hex(b)); // crypto.subtle (Node 24)
      expect(await sha256Hex(b, null)).toBe(hex(b));
    }
  });
});

describe('createModelStore', () => {
  it('init: empty cache → absent, no network', async () => {
    const { ms, statuses, log } = setup();
    expect((await ms.init()).state).toBe('absent');
    expect(statuses.at(-1)?.state).toBe('absent');
    expect(log).toEqual([]);
  });

  it('init: cached → ready with bytes, no network', async () => {
    const { ms, cache, log } = setup();
    cache.m = { version: 'old', sha256: 'x'.repeat(64), bytes: 123 };
    expect(await ms.init()).toEqual({ state: 'ready', bytes: 123, totalBytes: 123 });
    expect(log).toEqual([]);
  });

  it('download: progress → verifying → ready; cache holds the exact bytes', async () => {
    const { ms, statuses, cache, fx } = setup();
    expect(await ms.download()).toBe(true);
    const states = statuses.map((s) => s.state);
    expect(states[0]).toBe('downloading');
    expect(states.slice(-2)).toEqual(['verifying', 'ready']);
    const progress = statuses.filter((s) => s.state === 'downloading').map((s) => s.progress!);
    expect(progress).toEqual([...progress].sort((a, b) => a - b)); // monotonic
    expect(progress.at(-1)).toBe(1);
    expect(new Set(progress).size).toBe(progress.length); // only on whole-percent changes
    expect(statuses.at(-1)).toEqual({ state: 'ready', bytes: fx.all.length, totalBytes: fx.all.length });
    expect(cache.m).toEqual({ version: 'v1', sha256: fx.manifest.sha256, bytes: fx.all.length });
    expect(Buffer.from(cache.d!).equals(Buffer.from(fx.all))).toBe(true);
    const blob = await ms.blob();
    expect(blob?.size).toBe(fx.all.length);
  });

  it('concurrent download() calls share one run', async () => {
    const { ms, log } = setup();
    const [a, b] = await Promise.all([ms.download(), ms.download()]);
    expect([a, b]).toEqual([true, true]);
    expect(log.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
  });

  it('part checksum mismatch → error, nothing cached; retry works', async () => {
    const { ms, statuses, cache, fx, files } = setup();
    const p0 = fx.parts[0]!;
    const corrupt = p0.data.slice();
    corrupt[10]! ^= 1;
    files[`${BASE}/${p0.path}`] = corrupt;
    expect(await ms.download()).toBe(false);
    expect(statuses.at(-1)).toMatchObject({ state: 'error', error: expect.stringMatching(/Checksum/), totalBytes: fx.all.length });
    expect(cache.m).toBeNull();
    files[`${BASE}/${p0.path}`] = p0.data;
    expect(await ms.download()).toBe(true);
  });

  it('whole-file checksum mismatch → error after verifying', async () => {
    const { ms, statuses, files, fx } = setup();
    files[`${BASE}/manifest.json`] = JSON.stringify({ ...fx.manifest, sha256: '0'.repeat(64) });
    expect(await ms.download()).toBe(false);
    expect(statuses.map((s) => s.state).slice(-2)).toEqual(['verifying', 'error']);
  });

  it('short part, 404, network error, bad JSON, storage full → readable errors', async () => {
    const cases: [Partial<Record<string, Uint8Array | string | number>>, RegExp][] = [
      [{ [`${BASE}/manifest.json`]: undefined as unknown as string }, /returned 404/],
      [{ [`${BASE}/manifest.json`]: 0 }, /Network error/],
      [{ [`${BASE}/manifest.json`]: '{not json' }, /not JSON/],
    ];
    for (const [over, re] of cases) {
      const { ms, statuses } = setup(over);
      expect(await ms.download()).toBe(false);
      expect(statuses.at(-1)?.error).toMatch(re);
    }
    const s = setup();
    s.files[`${BASE}/${s.fx.parts[1]!.path}`] = s.fx.parts[1]!.data.slice(0, 100);
    expect(await s.ms.download()).toBe(false);
    expect(s.statuses.at(-1)?.error).toMatch(/cut short/);

    const q = setup();
    q.cache.failPut = true;
    expect(await q.ms.download()).toBe(false);
    expect(q.statuses.at(-1)?.error).toMatch(/storage/);
  });

  it('remove() during download aborts it: status absent, nothing cached', async () => {
    const { ms, statuses, cache } = setup({}, [200_000]);
    const p = ms.download();
    await ms.remove();
    expect(await p).toBe(false);
    expect(statuses.at(-1)?.state).toBe('absent');
    expect(cache.m).toBeNull();
  });

  it('remove() after ready clears the cache', async () => {
    const { ms, cache, statuses } = setup();
    await ms.download();
    await ms.remove();
    expect(cache.m).toBeNull();
    expect(statuses.at(-1)).toMatchObject({ state: 'absent' });
    expect(await ms.blob()).toBeNull();
  });
});

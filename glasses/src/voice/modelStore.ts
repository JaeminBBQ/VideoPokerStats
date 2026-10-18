/**
 * Offline speech model: download once, verify, cache in IndexedDB (VOICE.md "Model", "Phone").
 *
 * - `init()` reads only the cached record's metadata → status 'ready' (with bytes) or 'absent'. No network.
 * - `download()` (user action only; no auto-download): GET `${base}/manifest.json` (no-store), then each part with
 *   streamed progress into one buffer, sha256 per part, then 'verifying' (sha256 of the whole), then store
 *   `{ meta, data }` in our own DB `vp-voice` (separate from the engine table cache). A newer manifest version
 *   only matters here: a re-download replaces the cached model.
 * - `remove()` aborts any download and clears the cache.
 * Status goes to `onStatus` (store.setModelStatus). Everything except `createIdbModelCache` is pure/injectable.
 */
import type { ModelStatus } from '../app/store.ts';
import { sha256Hex } from './sha256.ts';

export interface ManifestPart {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface Manifest {
  readonly version: string;
  readonly totalBytes: number;
  readonly sha256: string;
  readonly parts: readonly ManifestPart[];
}

export interface CachedMeta {
  readonly version: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** Storage for the verified archive. `meta()` must be cheap (it runs at startup). */
export interface ModelCache {
  meta(): Promise<CachedMeta | null>;
  data(): Promise<ArrayBuffer | null>;
  put(meta: CachedMeta, data: ArrayBuffer): Promise<void>;
  clear(): Promise<void>;
}

export interface ModelStoreDeps {
  baseUrl: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  cache: ModelCache;
  onStatus: (s: ModelStatus) => void;
  /** null → pure-JS sha256 (e.g. insecure context). Default: globalThis.crypto.subtle. */
  subtle?: SubtleCrypto | null;
}

export interface ModelStore {
  init(): Promise<ModelStatus>;
  /** Resolves true when the model is cached and verified. Concurrent calls share one download. */
  download(): Promise<boolean>;
  remove(): Promise<void>;
  /** The cached archive as a Blob (for vosk-browser's blob: URL), or null. */
  blob(): Promise<Blob | null>;
  readonly status: ModelStatus;
}

const HEX64 = /^[0-9a-f]{64}$/;
/** Sanity cap: the trimmed model is ~27 MB. */
const MAX_TOTAL = 200 * 1024 * 1024;

export class ModelError extends Error {}

/** Validates a parsed manifest.json; throws ModelError with a short reason. */
export function parseManifest(json: unknown): Manifest {
  const bad = (why: string): never => {
    throw new ModelError(`Bad manifest: ${why}`);
  };
  if (!json || typeof json !== 'object') bad('not an object');
  const m = json as Record<string, unknown>;
  if (typeof m.version !== 'string' || !m.version) bad('version');
  const totalBytes = m.totalBytes;
  if (typeof totalBytes !== 'number' || !Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > MAX_TOTAL) bad('totalBytes');
  if (typeof m.sha256 !== 'string' || !HEX64.test(m.sha256)) bad('sha256');
  if (!Array.isArray(m.parts) || m.parts.length === 0) bad('parts');
  const parts = (m.parts as unknown[]).map((p, i): ManifestPart => {
    const q = (p ?? {}) as Record<string, unknown>;
    if (typeof q.path !== 'string' || !q.path || q.path.startsWith('/') || q.path.includes('..') || /^[a-z]+:/i.test(q.path)) bad(`part ${i} path`);
    if (typeof q.bytes !== 'number' || !Number.isSafeInteger(q.bytes) || q.bytes <= 0) bad(`part ${i} bytes`);
    if (typeof q.sha256 !== 'string' || !HEX64.test(q.sha256)) bad(`part ${i} sha256`);
    return { path: q.path as string, bytes: q.bytes as number, sha256: q.sha256 as string };
  });
  if (parts.reduce((s, p) => s + p.bytes, 0) !== totalBytes) bad('part sizes do not add up');
  return { version: m.version as string, totalBytes: totalBytes as number, sha256: m.sha256 as string, parts };
}

/** Progress 0..1, clamped; floor to whole percent so the UI updates ≤ 100 times. */
export function progressOf(received: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.floor((received / total) * 100))) / 100;
}

export function partUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.replace(/\/*$/, '/')).toString();
}

export function createModelStore(deps: ModelStoreDeps): ModelStore {
  const { baseUrl, cache, onStatus } = deps;
  const subtle = deps.subtle === undefined ? globalThis.crypto?.subtle : deps.subtle;
  let status: ModelStatus = { state: 'absent' };
  let knownTotal: number | undefined;
  let inflight: Promise<boolean> | null = null;
  let abort: AbortController | null = null;
  /** Bumped by remove(); a download from an older generation never writes status or cache. */
  let gen = 0;

  const emit = (s: ModelStatus) => {
    status = s;
    onStatus(s);
  };
  const withTotal = (s: ModelStatus): ModelStatus => (knownTotal !== undefined ? { ...s, totalBytes: knownTotal } : s);

  const fetchOk = async (url: string, init: RequestInit): Promise<Response> => {
    let res: Response;
    try {
      res = await deps.fetch(url, init);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      throw new ModelError('Network error — check your connection');
    }
    if (!res.ok) throw new ModelError(`Model host returned ${res.status}`);
    return res;
  };

  /** Streams a response into dest[offset .. offset+expected). */
  const readInto = async (res: Response, dest: Uint8Array, offset: number, expected: number, onBytes: (n: number) => void) => {
    let got = 0;
    const put = (chunk: Uint8Array) => {
      if (got + chunk.length > expected) throw new ModelError('Model part is larger than the manifest says');
      dest.set(chunk, offset + got);
      got += chunk.length;
      onBytes(chunk.length);
    };
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) put(value);
      }
    } else {
      put(new Uint8Array(await res.arrayBuffer()));
    }
    if (got !== expected) throw new ModelError('Model download was cut short');
  };

  const run = async (myGen: number): Promise<boolean> => {
    const live = () => myGen === gen;
    const ctl = new AbortController();
    abort = ctl;
    try {
      emit(withTotal({ state: 'downloading', progress: 0, bytes: 0 }));
      const mres = await fetchOk(partUrl(baseUrl, 'manifest.json'), { cache: 'no-store', signal: ctl.signal });
      let json: unknown;
      try {
        json = await mres.json();
      } catch {
        throw new ModelError('Bad manifest: not JSON');
      }
      const manifest = parseManifest(json);
      knownTotal = manifest.totalBytes;
      const buf = new Uint8Array(manifest.totalBytes);
      let received = 0;
      let lastPct = 0; // 0% was emitted above
      const tick = (n: number) => {
        received += n;
        const p = progressOf(received, manifest.totalBytes);
        if (p !== lastPct && live()) {
          lastPct = p;
          emit(withTotal({ state: 'downloading', progress: p, bytes: received }));
        }
      };
      let offset = 0;
      for (const part of manifest.parts) {
        const res = await fetchOk(partUrl(baseUrl, part.path), { signal: ctl.signal });
        await readInto(res, buf, offset, part.bytes, tick);
        if (!live()) return false;
        if ((await sha256Hex(buf.subarray(offset, offset + part.bytes), subtle)) !== part.sha256) {
          throw new ModelError('Checksum mismatch — try again');
        }
        offset += part.bytes;
      }
      if (!live()) return false;
      emit(withTotal({ state: 'verifying' }));
      if ((await sha256Hex(buf, subtle)) !== manifest.sha256) throw new ModelError('Checksum mismatch — try again');
      if (!live()) return false;
      try {
        await cache.put({ version: manifest.version, sha256: manifest.sha256, bytes: manifest.totalBytes }, buf.buffer);
      } catch {
        throw new ModelError('Could not save the model (phone storage full?)');
      }
      if (!live()) {
        await cache.clear().catch(() => {});
        return false;
      }
      emit({ state: 'ready', bytes: manifest.totalBytes, totalBytes: manifest.totalBytes });
      return true;
    } catch (err) {
      if (!live()) return false;
      const msg = err instanceof ModelError ? err.message : `Download failed: ${String((err as Error)?.message ?? err)}`;
      emit(withTotal({ state: 'error', error: msg }));
      return false;
    } finally {
      if (abort === ctl) abort = null;
    }
  };

  return {
    async init() {
      try {
        const meta = await cache.meta();
        if (meta) {
          knownTotal = meta.bytes;
          emit({ state: 'ready', bytes: meta.bytes, totalBytes: meta.bytes });
        } else emit(withTotal({ state: 'absent' }));
      } catch {
        emit(withTotal({ state: 'absent' }));
      }
      return status;
    },
    download() {
      if (inflight) return inflight;
      const myGen = gen;
      const p = run(myGen).finally(() => {
        if (inflight === p) inflight = null;
      });
      inflight = p;
      return p;
    },
    async remove() {
      gen++;
      abort?.abort();
      abort = null;
      inflight = null;
      try {
        await cache.clear();
      } catch {
        // nothing cached, or storage unavailable: either way there is no model
      }
      emit(withTotal({ state: 'absent' }));
    },
    async blob() {
      const data = await cache.data();
      return data ? new Blob([data], { type: 'application/gzip' }) : null;
    },
    get status() {
      return status;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// IndexedDB cache (browser only). DB `vp-voice`, store `model`, keys `meta` and `data` written in one transaction.

const DB_NAME = 'vp-voice';
const STORE = 'model';

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

export function createIdbModelCache(idb: IDBFactory = indexedDB): ModelCache {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!dbp) {
      const r = idb.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      dbp = req(r).catch((e: unknown) => {
        dbp = null;
        throw e;
      });
    }
    return dbp;
  };
  const get = async <T>(key: string): Promise<T | null> => {
    const db = await open();
    const v = await req(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
    return (v ?? null) as T | null;
  };
  return {
    async meta() {
      const m = await get<CachedMeta>('meta');
      return m && typeof m.version === 'string' && typeof m.bytes === 'number' ? m : null;
    },
    async data() {
      const d = await get<ArrayBuffer>('data');
      return d instanceof ArrayBuffer ? d : null;
    },
    async put(meta, data) {
      const db = await open();
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      s.put(data, 'data');
      s.put(meta, 'meta');
      await done(tx);
    },
    async clear() {
      const db = await open();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await done(tx);
    },
  };
}

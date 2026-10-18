/**
 * Persistent cache of built engine tables (one game ≈ 11.6 MB). Building takes ~1 s in Node but ~5 s in
 * a desktop browser and longer on a phone, and Android may kill the WebView between hands, so the worker
 * keeps every built game's `sums` on disk. Entries are keyed on the game and the engine-source hash; an
 * entry whose length doesn't match the game's subset layout is ignored. A cache failure only costs a rebuild.
 */
import { BINOM, buildTables, type Tables } from '../../../src/engine/ev.ts';
import type { GameDef } from '../../../src/engine/games.ts';

/** Minimal async key/value store (IndexedDB in the worker, a Map in tests). */
export interface TableStore {
  get(key: string): Promise<Uint32Array | undefined>;
  put(key: string, sums: Uint32Array): Promise<void>;
  /** Removes every entry whose key isn't `keep` for the same game or belongs to an old engine hash. */
  prune(keep: (key: string) => boolean): Promise<void>;
}

export const cacheKey = (game: GameDef, engineHash: string): string => `${engineHash}:${game.id}`;

function offsetsFor(n: number): number[] {
  const offsets: number[] = [];
  let total = 0;
  for (let k = 0; k <= 5; k++) {
    offsets.push(total);
    total += BINOM[n][k];
  }
  offsets.push(total); // sentinel: expected sums length (removed below)
  return offsets;
}

/** Tables for `game`: from the cache when a valid entry exists, else built and stored. */
export async function loadTables(game: GameDef, store: TableStore | null, engineHash: string): Promise<Tables> {
  const key = cacheKey(game, engineHash);
  if (store) {
    try {
      const sums = await store.get(key);
      const offsets = offsetsFor(game.deckSize);
      const expected = offsets.pop();
      if (sums instanceof Uint32Array && sums.length === expected) return { game, deckSize: game.deckSize, offsets, sums };
    } catch {
      // unreadable cache: rebuild
    }
  }
  const tables = buildTables(game);
  if (store) {
    try {
      await store.put(key, tables.sums);
      await store.prune((k) => k.startsWith(`${engineHash}:`));
    } catch {
      // full or unavailable storage: tables still work for this session
    }
  }
  return tables;
}

/** IndexedDB-backed TableStore, or null when IndexedDB is unavailable. */
export function indexedDbStore(name = 'vp-tables'): TableStore | null {
  if (typeof indexedDB === 'undefined') return null;
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sums');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const d = await db;
    return new Promise((resolve, reject) => {
      const t = d.transaction('sums', mode);
      const r = run(t.objectStore('sums'));
      t.oncomplete = () => resolve(r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    get: (key) => tx('readonly', (s) => s.get(key) as IDBRequest<Uint32Array | undefined>),
    put: async (key, sums) => void (await tx('readwrite', (s) => void s.put(sums, key))),
    prune: async (keep) => {
      const keys = (await tx('readonly', (s) => s.getAllKeys())) ?? [];
      const stale = keys.filter((k) => typeof k !== 'string' || !keep(k));
      if (stale.length) await tx('readwrite', (s) => void stale.forEach((k) => s.delete(k)));
    },
  };
}

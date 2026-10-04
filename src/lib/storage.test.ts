import { describe, expect, it } from 'vitest';
import { createStorage, DEFAULT_SETTINGS, STORAGE_KEYS, type StorageLike } from './storage.ts';
import type { HandRecord, Totals } from './stats.ts';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  setRaw(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const history: HandRecord[] = [
  { ts: 1700000000000, gameId: 'nsud', hand: [0, 4, 8, 12, 16], heldMask: 1, bestMask: 1, evHeld: 1.2, evBest: 1.2, mode: 'deal' },
];

const totals: Totals = { nsud: { hands: 3, mistakes: 1, evLost: 0.25 } };

describe('createStorage', () => {
  it('round-trips history, totals, and settings', () => {
    const store = new MemoryStorage();
    const s = createStorage(store);
    s.saveHistory(history);
    s.saveTotals(totals);
    s.saveSettings({ gameId: 'db-10-7', denomination: 1 });
    expect(s.loadHistory()).toEqual(history);
    expect(s.loadTotals()).toEqual(totals);
    expect(s.loadSettings()).toEqual({ gameId: 'db-10-7', denomination: 1 });
  });

  it('returns defaults for missing keys', () => {
    const s = createStorage(new MemoryStorage());
    expect(s.loadHistory()).toEqual([]);
    expect(s.loadTotals()).toEqual({});
    expect(s.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for corrupt JSON', () => {
    const store = new MemoryStorage();
    store.setRaw(STORAGE_KEYS.history, 'not json at all');
    store.setRaw(STORAGE_KEYS.totals, '{"v":1,"data":');
    const s = createStorage(store);
    expect(s.loadHistory()).toEqual([]);
    expect(s.loadTotals()).toEqual({});
  });

  it('returns defaults for a wrong version or wrong shape', () => {
    const store = new MemoryStorage();
    store.setRaw(STORAGE_KEYS.settings, JSON.stringify({ v: 2, data: { gameId: 'nsud', denomination: 0.25 } }));
    store.setRaw(STORAGE_KEYS.history, JSON.stringify({ v: 1, data: 'not an array' }));
    const s = createStorage(store);
    expect(s.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(s.loadHistory()).toEqual([]);
  });

  it('never throws when the store itself fails', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
    };
    const s = createStorage(broken);
    expect(s.loadHistory()).toEqual([]);
    expect(s.loadTotals()).toEqual({});
    expect(s.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => s.saveHistory(history)).not.toThrow();
  });
});

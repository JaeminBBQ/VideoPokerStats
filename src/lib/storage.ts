import type { GameId } from '../engine/index.ts';
import type { HandRecord, Totals } from './stats.ts';

export const STORAGE_KEYS = {
  history: 'vp.v1.history',
  totals: 'vp.v1.totals',
  settings: 'vp.v1.settings',
} as const;

const VERSION = 1;

/** The subset of `localStorage` the trainer needs; injectable so tests use an in-memory fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Settings {
  gameId: GameId;
  /** Dollars per coin (the bet is always 5 coins). */
  denomination: number;
}

export const DEFAULT_SETTINGS: Settings = { gameId: 'nsud', denomination: 0.25 };

/** Denominations offered in the settings selector. */
export const DENOMINATIONS = [0.05, 0.25, 1] as const;

export const DENOM_LABELS: Record<number, string> = { 0.05: '5¢', 0.25: '25¢', 1: '$1' };

export interface TrainerStorage {
  loadHistory(): HandRecord[];
  saveHistory(history: HandRecord[]): void;
  loadTotals(): Totals;
  saveTotals(totals: Totals): void;
  loadSettings(): Settings;
  saveSettings(settings: Settings): void;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Versioned JSON persistence. Corrupt, missing, or wrong-version data loads as defaults and never throws. */
export function createStorage(store: StorageLike): TrainerStorage {
  const load = <T>(key: string, isGood: (x: unknown) => boolean, fallback: T): T => {
    try {
      const raw = store.getItem(key);
      if (raw === null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.v !== VERSION || !isGood(parsed.data)) return fallback;
      return parsed.data as T;
    } catch {
      return fallback;
    }
  };
  const save = (key: string, data: unknown): void => {
    try {
      store.setItem(key, JSON.stringify({ v: VERSION, data }));
    } catch {
      // Quota or a blocked store: stats persistence is best-effort.
    }
  };
  return {
    loadHistory: () => load(STORAGE_KEYS.history, Array.isArray, [] as HandRecord[]),
    saveHistory: (history) => save(STORAGE_KEYS.history, history),
    loadTotals: () => load(STORAGE_KEYS.totals, isRecord, {} as Totals),
    saveTotals: (totals) => save(STORAGE_KEYS.totals, totals),
    loadSettings: () => load(STORAGE_KEYS.settings, isRecord, { ...DEFAULT_SETTINGS }),
    saveSettings: (settings) => save(STORAGE_KEYS.settings, settings),
  };
}

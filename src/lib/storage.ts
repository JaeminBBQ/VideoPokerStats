import type { GameId } from '../engine/index.ts';
import type { DrillState } from './drill.ts';
import type { HandRecord, Totals } from './stats.ts';

export const STORAGE_KEYS = {
  history: 'vp.v1.history',
  totals: 'vp.v1.totals',
  drill: 'vp.v1.drill',
  settings: 'vp.v1.settings',
} as const;

const VERSION = 1;

/** The subset of `localStorage` the trainer needs; injectable so tests use an in-memory fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type Mode = 'deal' | 'drill';

export interface Settings {
  gameId: GameId;
  /** Dollars per coin (the bet is always 5 coins). */
  denomination: number;
  /** Last mode per game; missing games default to deal. */
  mode: Partial<Record<GameId, Mode>>;
}

export const DEFAULT_SETTINGS: Settings = { gameId: 'nsud', denomination: 0.25, mode: {} };

/** Denominations offered in the settings selector. */
export const DENOMINATIONS = [0.05, 0.25, 1] as const;

export const DENOM_LABELS: Record<number, string> = { 0.05: '5¢', 0.25: '25¢', 1: '$1' };

export interface TrainerStorage {
  loadHistory(): HandRecord[];
  saveHistory(history: HandRecord[]): void;
  loadTotals(): Totals;
  saveTotals(totals: Totals): void;
  loadDrill(): DrillState;
  saveDrill(drill: DrillState): void;
  loadSettings(): Settings;
  saveSettings(settings: Settings): void;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const isDrillEntry = (x: unknown): x is { streak: number; cleared: boolean } =>
  isRecord(x) && typeof x.streak === 'number' && typeof x.cleared === 'boolean';

/** Drill state is one level of game → key → entry; anything else loads as empty. */
const isDrillState = (x: unknown): x is DrillState =>
  isRecord(x) && Object.values(x).every((g) => isRecord(g) && Object.values(g).every(isDrillEntry));

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
    loadDrill: () => load(STORAGE_KEYS.drill, isDrillState, {} as DrillState),
    saveDrill: (drill) => save(STORAGE_KEYS.drill, drill),
    loadSettings: () => load(STORAGE_KEYS.settings, isRecord, { ...DEFAULT_SETTINGS }),
    saveSettings: (settings) => save(STORAGE_KEYS.settings, settings),
  };
}

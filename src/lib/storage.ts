import type { GameId } from '../engine/index.ts';
import type { Session } from './bankroll.ts';
import type { DrillState } from './drill.ts';
import type { Lifetime, SessionLogEntry } from './session.ts';
import type { HandRecord, Totals } from './stats.ts';

export const STORAGE_KEYS = {
  history: 'vp.v1.history',
  totals: 'vp.v1.totals',
  drill: 'vp.v1.drill',
  settings: 'vp.v1.settings',
  session: 'vp.v1.session',
  lifetime: 'vp.v1.lifetime',
  sessionLog: 'vp.v1.sessionLog',
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
  /** Preferred dollars per coin; each game plays the closest denomination it's offered at (D16). */
  denomination: number;
  /** Last mode per game; missing games default to deal. */
  mode: Partial<Record<GameId, Mode>>;
}

export const DEFAULT_SETTINGS: Settings = { gameId: 'job-8-5', denomination: 0.05, mode: {} };

/** Every denomination a setting may hold; which ones a game runs at is `GameDef.offers` (D16). */
export const DENOMINATIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5] as const;

export const DENOM_LABELS: Record<number, string> = {
  0.01: '1¢',
  0.05: '5¢',
  0.1: '10¢',
  0.25: '25¢',
  0.5: '50¢',
  1: '$1',
  2: '$2',
  5: '$5',
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const isNonNegInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** An active bankroll session: money in integer cents, timestamps in epoch ms. */
const isSession = (x: unknown): x is Session =>
  isRecord(x) &&
  typeof x.startedAt === 'number' &&
  Number.isFinite(x.startedAt) &&
  x.startedAt > 0 &&
  typeof x.startCents === 'number' &&
  Number.isInteger(x.startCents) &&
  x.startCents > 0 &&
  isNonNegInt(x.balanceCents) &&
  isNonNegInt(x.hands) &&
  isNonNegInt(x.coinInCents) &&
  isNonNegInt(x.wonCents) &&
  typeof x.theoReturnCents === 'number' &&
  Number.isFinite(x.theoReturnCents) &&
  x.theoReturnCents >= 0;

const isLifetime = (x: unknown): x is Lifetime => isRecord(x) && isNonNegInt(x.coinInCents);

const isLogEntry = (x: unknown): x is SessionLogEntry =>
  isRecord(x) &&
  typeof x.endedAt === 'number' &&
  Number.isFinite(x.endedAt) &&
  x.endedAt > 0 &&
  typeof x.startedAt === 'number' &&
  Number.isFinite(x.startedAt) &&
  x.startedAt > 0 &&
  isNonNegInt(x.startCents) &&
  x.startCents > 0 &&
  isNonNegInt(x.endCents) &&
  isNonNegInt(x.hands) &&
  isNonNegInt(x.coinInCents) &&
  isNonNegInt(x.wonCents) &&
  isNonNegInt(x.points) &&
  typeof x.denomination === 'number' &&
  Number.isFinite(x.denomination) &&
  x.denomination > 0 &&
  (x.denominations === undefined ||
    (Array.isArray(x.denominations) && x.denominations.every((d) => typeof d === 'number' && Number.isFinite(d) && d > 0))) &&
  Array.isArray(x.gameIds) &&
  x.gameIds.every((g) => typeof g === 'string');

const isSessionLog = (x: unknown): x is SessionLogEntry[] => Array.isArray(x) && x.every(isLogEntry);

const isDrillEntry = (x: unknown): x is { streak: number; cleared: boolean } =>
  isRecord(x) && typeof x.streak === 'number' && typeof x.cleared === 'boolean';

/** Drill state is one level of game → key → entry; anything else loads as empty. */
const isDrillState = (x: unknown): x is DrillState =>
  isRecord(x) && Object.values(x).every((g) => isRecord(g) && Object.values(g).every(isDrillEntry));

export interface TrainerStorage {
  loadHistory(): HandRecord[];
  saveHistory(history: HandRecord[]): void;
  loadTotals(): Totals;
  saveTotals(totals: Totals): void;
  loadDrill(): DrillState;
  saveDrill(drill: DrillState): void;
  loadSettings(): Settings;
  saveSettings(settings: Settings): void;
  loadSession(): Session | null;
  saveSession(session: Session | null): void;
  loadLifetime(): Lifetime;
  saveLifetime(lifetime: Lifetime): void;
  loadSessionLog(): SessionLogEntry[];
  saveSessionLog(log: SessionLogEntry[]): void;
}

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
    loadSession: () => load<Session | null>(STORAGE_KEYS.session, (x) => x === null || isSession(x), null),
    saveSession: (session) => save(STORAGE_KEYS.session, session),
    loadLifetime: () => load(STORAGE_KEYS.lifetime, isLifetime, { coinInCents: 0 }),
    saveLifetime: (lifetime) => save(STORAGE_KEYS.lifetime, lifetime),
    loadSessionLog: () => load(STORAGE_KEYS.sessionLog, isSessionLog, [] as SessionLogEntry[]),
    saveSessionLog: (log) => save(STORAGE_KEYS.sessionLog, log),
  };
}

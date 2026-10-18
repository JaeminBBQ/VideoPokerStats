/**
 * Dual-write persistence (research/04-validation.md §5.6). Writes go to the browser's localStorage and,
 * when a host exists, to the Even bridge store; reads prefer a non-empty localStorage value, then the bridge.
 * Both backends are injected so this module stays pure and testable (the bridge adapter lives in
 * src/bridge/storage.ts, Phase 2b).
 */
import { GAMES, type GameId } from '../../../src/engine/games.ts';
import { isValidCard, type Card } from './cards.ts';

export const KEYS = { game: 'vp.game', lastHand: 'vp.lastHand', letterSuits: 'vp.letterSuits', discreet: 'vp.discreet' } as const;

/** Synchronous key/value store; `window.localStorage` fits as is. */
export interface LocalBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Async key/value store; matches the bridge (`getLocalStorage` resolves '' for a missing key). */
export interface RemoteBackend {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<unknown>;
}

export interface AppStorage {
  /** The stored value, or null when neither backend has one. Never rejects. */
  read(key: string): Promise<string | null>;
  /** Writes to both backends; failures are swallowed (best effort). */
  write(key: string, value: string): void;
  /** Attach or replace the remote backend (the bridge resolves after the page starts). */
  setRemote(remote: RemoteBackend | null): void;
}

export interface StorageOptions {
  local?: LocalBackend | null;
  remote?: RemoteBackend | null;
  /** Bridge calls give up after this long (default 2000 ms). */
  timeoutMs?: number;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function createStorage(opts: StorageOptions = {}): AppStorage {
  const local = opts.local ?? null;
  let remote = opts.remote ?? null;
  const timeoutMs = opts.timeoutMs ?? 2000;
  return {
    async read(key) {
      let v: string | null = null;
      try {
        v = local?.getItem(key) ?? null;
      } catch {
        v = null;
      }
      if (v) return v;
      if (!remote) return null;
      let r: string | null = null;
      try {
        r = await withTimeout(remote.get(key), timeoutMs, '');
      } catch {
        r = null;
      }
      return typeof r === 'string' && r !== '' ? r : null;
    },
    write(key, value) {
      try {
        local?.setItem(key, value);
      } catch {
        // Private mode or quota: the bridge copy still applies.
      }
      if (remote) {
        try {
          void withTimeout(remote.set(key, value), timeoutMs, false);
        } catch {
          // A synchronous throw from the bridge is ignored too.
        }
      }
    },
    setRemote(r) {
      remote = r;
    },
  };
}

/** `window.localStorage` if it exists and is usable, else null. */
export function browserLocalStorage(): LocalBackend | null {
  try {
    const ls = (globalThis as { localStorage?: LocalBackend }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- typed settings

export interface Persisted {
  gameId: GameId;
  lastHand: Card[];
  letterSuits: boolean;
  discreet: boolean;
}

/** Jacks or Better 9/5 at GSR: the owner's 5¢ game. */
export const DEFAULT_GAME: GameId = 'gsr-job-9-5';

/** A known GameId, else the first game. */
export const parseGameId = (raw: string | null): GameId =>
  raw !== null && Object.prototype.hasOwnProperty.call(GAMES, raw) ? (raw as GameId) : DEFAULT_GAME;

/** A JSON array of 0–5 distinct valid card ints for the game's deck, else []. */
export function parseHand(raw: string | null, gameId: GameId): Card[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    const deck = GAMES[gameId].deckSize;
    if (!Array.isArray(v) || v.length > 5 || !v.every((c) => isValidCard(c, deck))) return [];
    return new Set(v).size === v.length ? (v as Card[]) : [];
  } catch {
    return [];
  }
}

export const parseLetterSuits = (raw: string | null): boolean => raw === '1';
export const parseDiscreet = (raw: string | null): boolean => raw === '1';

/** Loads and validates everything the app persists. */
export async function loadPersisted(s: AppStorage): Promise<Persisted> {
  const [g, h, l, d] = await Promise.all([s.read(KEYS.game), s.read(KEYS.lastHand), s.read(KEYS.letterSuits), s.read(KEYS.discreet)]);
  const gameId = parseGameId(g);
  return { gameId, lastHand: parseHand(h, gameId), letterSuits: parseLetterSuits(l), discreet: parseDiscreet(d) };
}

export const saveGame = (s: AppStorage, id: GameId): void => s.write(KEYS.game, id);
export const saveHand = (s: AppStorage, hand: readonly Card[]): void => s.write(KEYS.lastHand, JSON.stringify(hand));
/** "1" = on, "0" = off (non-empty, so an "off" in localStorage is never skipped in favor of the bridge). */
export const saveLetterSuits = (s: AppStorage, on: boolean): void => s.write(KEYS.letterSuits, on ? '1' : '0');
/** Same "1" / "0" encoding as letter suits. */
export const saveDiscreet = (s: AppStorage, on: boolean): void => s.write(KEYS.discreet, on ? '1' : '0');

import type { GameId } from '../engine/index.ts';
import { tierPoints, type Session } from './bankroll.ts';

/** How many ended sessions the log keeps. */
export const SESSION_LOG_CAP = 20;

/** Lifetime coin-in across all ended sessions; tier points for it = `tierPoints(coinInCents)`. */
export interface Lifetime {
  coinInCents: number;
}

export const EMPTY_LIFETIME: Lifetime = { coinInCents: 0 };

/** One ended session in the log, newest first. */
export interface SessionLogEntry {
  endedAt: number;
  startedAt: number;
  startCents: number;
  endCents: number;
  hands: number;
  coinInCents: number;
  wonCents: number;
  /** Whole tier points the session earned (partial dollars don't count yet). */
  points: number;
  denomination: number;
  gameIds: GameId[];
}

/**
 * Pure update for ending a session: its coin-in joins the lifetime total, and a summary of
 * the session is prepended to the log (capped at `SESSION_LOG_CAP`).
 */
export function closeSession(
  session: Session,
  denomination: number,
  gameIds: readonly GameId[],
  lifetime: Lifetime,
  log: readonly SessionLogEntry[],
  now: number,
): { lifetime: Lifetime; log: SessionLogEntry[] } {
  const entry: SessionLogEntry = {
    endedAt: now,
    startedAt: session.startedAt,
    startCents: session.startCents,
    endCents: session.balanceCents,
    hands: session.hands,
    coinInCents: session.coinInCents,
    wonCents: session.wonCents,
    points: tierPoints(session.coinInCents),
    denomination,
    gameIds: [...gameIds],
  };
  const next = [entry, ...log];
  if (next.length > SESSION_LOG_CAP) next.length = SESSION_LOG_CAP;
  return { lifetime: { coinInCents: lifetime.coinInCents + session.coinInCents }, log: next };
}

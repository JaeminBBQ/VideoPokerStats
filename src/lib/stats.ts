import { EV_EPSILON, type Card, type GameId } from '../engine/index.ts';

export const HISTORY_CAP = 5000;

/** One graded hand, exactly the shape documented in docs/ARCHITECTURE.md. */
export interface HandRecord {
  ts: number;
  gameId: GameId;
  hand: Card[];
  heldMask: number;
  bestMask: number;
  evHeld: number;
  evBest: number;
  mode: 'deal' | 'drill';
}

export interface TotalsEntry {
  hands: number;
  mistakes: number;
  evLost: number;
}

export type Totals = Partial<Record<GameId, TotalsEntry>>;

export interface TrainerState {
  history: HandRecord[];
  totals: Totals;
}

export const emptyTotalsEntry = (): TotalsEntry => ({ hands: 0, mistakes: 0, evLost: 0 });

/** Pure update: appends the record and updates totals for its game. History is capped by dropping the oldest. */
export function recordHand(state: TrainerState, record: HandRecord): TrainerState {
  const history = [...state.history, record];
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
  const lost = record.evBest - record.evHeld;
  const prev = state.totals[record.gameId] ?? emptyTotalsEntry();
  return {
    history,
    totals: {
      ...state.totals,
      [record.gameId]: {
        hands: prev.hands + 1,
        mistakes: prev.mistakes + (lost > EV_EPSILON ? 1 : 0),
        evLost: prev.evLost + (lost > EV_EPSILON ? lost : 0),
      },
    },
  };
}

/** Error rate as a percentage (0–100). 0 when no hands have been recorded. */
export function errorRate(totals: TotalsEntry): number {
  return totals.hands === 0 ? 0 : (totals.mistakes / totals.hands) * 100;
}

/** Drops one game's history records and totals entry. */
export function resetGame(state: TrainerState, gameId: GameId): TrainerState {
  const totals: Totals = { ...state.totals };
  delete totals[gameId];
  return { history: state.history.filter((r) => r.gameId !== gameId), totals };
}

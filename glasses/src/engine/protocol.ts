/** Engine interface and the messages between the engine client and the glasses engine worker. */
import type { Card } from '../../../src/engine/cards.ts';
import type { HoldEv } from '../../../src/engine/ev.ts';
import type { GameId } from '../../../src/engine/games.ts';

export type EngineRequest =
  | { id: number; type: 'prepare'; gameId: GameId }
  | { id: number; type: 'analyze'; gameId: GameId; hand: Card[] };

export type EngineResponse =
  | { id: number; ok: true; holds: HoldEv[] }
  | { id: number; ok: false; error: string };

/** What the store needs from an engine. The app uses the worker client; tests use the direct engine. */
export interface EngineClient {
  /** Builds the game's tables (about a second); resolves when ready. */
  prepare(gameId: GameId): Promise<void>;
  /** All 32 holds for a 5-card hand, best first (root engine `analyzeHand`). */
  analyze(gameId: GameId, hand: readonly Card[]): Promise<HoldEv[]>;
  /** Releases resources (terminates the worker); pending calls reject. */
  dispose(): void;
}

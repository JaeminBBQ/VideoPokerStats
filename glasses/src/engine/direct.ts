/**
 * In-thread engine (no worker): same contract as the worker client. Used by tests in Node, and usable as a
 * fallback if a worker can't start. Blocks the calling thread for ~1 s per game switch.
 */
import { analyzeHand, buildTables, type Tables } from '../../../src/engine/ev.ts';
import { GAMES, type GameId } from '../../../src/engine/games.ts';
import type { EngineClient } from './protocol.ts';

export function createDirectEngine(): EngineClient {
  let current: { gameId: GameId; tables: Tables } | null = null;
  const tablesFor = (gameId: GameId): Tables => {
    if (current?.gameId !== gameId) {
      if (!GAMES[gameId]) throw new Error(`unknown game: ${gameId}`);
      current = null;
      current = { gameId, tables: buildTables(GAMES[gameId]) };
    }
    return current.tables;
  };
  return {
    prepare: async (gameId) => {
      tablesFor(gameId);
    },
    analyze: async (gameId, hand) => analyzeHand(tablesFor(gameId), hand),
    dispose: () => {
      current = null;
    },
  };
}

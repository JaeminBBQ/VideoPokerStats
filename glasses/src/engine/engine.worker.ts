/// <reference lib="webworker" />
/**
 * Glasses engine worker: prepare (build tables) and analyze only. Holds at most one game's tables
 * (~11.6 MB, ~1 s to build) and evicts them on a game switch, to cap phone WebView memory
 * (research/04-validation.md U5, F12). Built tables persist in IndexedDB (tableCache.ts), so only the first
 * use of a game pays the build. All EVs come from the root engine's exact enumeration.
 */
import { analyzeHand, type Tables } from '../../../src/engine/ev.ts';
import { GAMES, type GameId } from '../../../src/engine/games.ts';
import type { EngineRequest, EngineResponse } from './protocol.ts';
import { indexedDbStore, loadTables } from './tableCache.ts';

let current: { gameId: GameId; tables: Promise<Tables> } | null = null;
const store = indexedDbStore();

function tablesFor(gameId: GameId): Promise<Tables> {
  if (current?.gameId !== gameId) {
    const game = GAMES[gameId];
    if (!game) return Promise.reject(new Error(`unknown game: ${gameId}`));
    current = null; // drop the old tables before loading the new ones
    const tables = loadTables(game, store, __ENGINE_HASH__);
    current = { gameId, tables };
    tables.catch(() => {
      if (current?.tables === tables) current = null; // let a later request retry
    });
  }
  return current.tables;
}

// Requests are answered in arrival order: each waits for the previous one, so a slow load never lets a
// later request for the same game race ahead or build the tables twice.
let chain: Promise<unknown> = Promise.resolve();

self.onmessage = (e: MessageEvent<EngineRequest>) => {
  const req = e.data;
  chain = chain.then(async () => {
    let res: EngineResponse;
    try {
      const t = await tablesFor(req.gameId);
      res = { id: req.id, ok: true, holds: req.type === 'analyze' ? analyzeHand(t, req.hand) : [] };
    } catch (err) {
      res = { id: req.id, ok: false, error: String(err) };
    }
    (self as unknown as Worker).postMessage(res);
  });
};

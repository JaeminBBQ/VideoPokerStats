/// <reference lib="webworker" />
/** Engine worker: builds tables once per game (~1s, ~12MB each) and answers hold-EV queries. */
import { analyzeHand, buildTables, type Tables } from './ev.ts';
import { GAMES } from './games.ts';
import { findSimilarHand } from './drill.ts';
import type { EngineRequest, EngineResponse } from './client.ts';

const tables = new Map<string, Tables>();

function tablesFor(gameId: keyof typeof GAMES): Tables {
  let t = tables.get(gameId);
  if (!t) {
    t = buildTables(GAMES[gameId]);
    tables.set(gameId, t);
  }
  return t;
}

self.onmessage = (e: MessageEvent<EngineRequest>) => {
  const req = e.data;
  let res: EngineResponse;
  try {
    const t = tablesFor(req.gameId);
    if (req.type === 'prepare') res = { id: req.id, ok: true, holds: [] };
    else if (req.type === 'analyze') res = { id: req.id, ok: true, holds: analyzeHand(t, req.hand) };
    else res = { id: req.id, ok: true, holds: [], similar: findSimilarHand(t, req.signature) };
  } catch (err) {
    res = { id: req.id, ok: false, error: String(err) };
  }
  (self as unknown as Worker).postMessage(res);
};

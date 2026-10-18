/**
 * Promise API over the glasses engine worker. The worker is inlined into the bundle (`?worker&inline`), so
 * it loads from a Blob/data URL regardless of the origin the packaged .ehpk is served from (validation F3, U4).
 */
import type { HoldEv } from '../../../src/engine/ev.ts';
import EngineWorker from './engine.worker.ts?worker&inline';
import type { EngineClient, EngineRequest, EngineResponse } from './protocol.ts';

export type { EngineClient };

type Pending = { resolve: (holds: HoldEv[]) => void; reject: (e: Error) => void };
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export function createWorkerEngine(): EngineClient {
  const worker = new EngineWorker();
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (e: MessageEvent<EngineResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return; // stale or unknown id: ignore
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.holds);
    else p.reject(new Error(e.data.error));
  };
  const failAll = (msg: string) => {
    for (const p of pending.values()) p.reject(new Error(msg));
    pending.clear();
  };
  worker.onerror = (e) => failAll(`engine worker error: ${e.message}`);

  const send = (req: WithoutId<EngineRequest>): Promise<HoldEv[]> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id });
    });
  };

  return {
    prepare: async (gameId) => {
      await send({ type: 'prepare', gameId });
    },
    analyze: (gameId, hand) => send({ type: 'analyze', gameId, hand: hand.slice() }),
    dispose: () => {
      worker.terminate();
      failAll('engine disposed');
    },
  };
}

/** Promise API over the engine worker. The UI should only talk to the engine through this. */
import type { Card } from './cards.ts';
import type { HoldEv } from './ev.ts';
import type { GameId } from './games.ts';

export type EngineRequest =
  | { id: number; type: 'prepare'; gameId: GameId }
  | { id: number; type: 'analyze'; gameId: GameId; hand: Card[] };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export type EngineResponse = { id: number; ok: true; holds: HoldEv[] } | { id: number; ok: false; error: string };

export class EngineClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { resolve: (h: HoldEv[]) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.holds);
      else p.reject(new Error(e.data.error));
    };
  }

  private send(req: WithoutId<EngineRequest>): Promise<HoldEv[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  /** Builds the game's tables in the background (about a second the first time). */
  async prepare(gameId: GameId): Promise<void> {
    await this.send({ type: 'prepare', gameId });
  }

  /** All 32 holds for `hand`, best first. Masks refer to positions in `hand` as passed. */
  analyze(gameId: GameId, hand: Card[]): Promise<HoldEv[]> {
    return this.send({ type: 'analyze', gameId, hand });
  }

  terminate(): void {
    this.worker.terminate();
  }
}

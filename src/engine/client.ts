/** Promise API over the engine worker. The UI should only talk to the engine through this. */
import type { Card } from './cards.ts';
import type { HoldEv } from './ev.ts';
import type { MistakeSignature, SimilarMatch } from './drill.ts';
import type { GameId } from './games.ts';

export type EngineRequest =
  | { id: number; type: 'prepare'; gameId: GameId }
  | { id: number; type: 'analyze'; gameId: GameId; hand: Card[] }
  | { id: number; type: 'similar'; gameId: GameId; signature: MistakeSignature };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export type EngineResponse =
  | { id: number; ok: true; holds: HoldEv[]; similar?: { hand: Card[]; match: SimilarMatch } }
  | { id: number; ok: false; error: string };

export class EngineClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: EngineResponse & { ok: true }) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data);
      else p.reject(new Error(e.data.error));
    };
  }

  private send(req: WithoutId<EngineRequest>): Promise<EngineResponse & { ok: true }> {
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
  async analyze(gameId: GameId, hand: Card[]): Promise<HoldEv[]> {
    return (await this.send({ type: 'analyze', gameId, hand })).holds;
  }

  /**
   * A fresh random hand posing the same decision as a past mistake (deuces games). `match` says how
   * close it got: 'exact', 'best-line' (same correct line), or 'section' (same number of deuces).
   * Usually milliseconds; rare confusions can take up to a few hundred.
   */
  async similar(gameId: GameId, signature: MistakeSignature): Promise<{ hand: Card[]; match: SimilarMatch }> {
    return (await this.send({ type: 'similar', gameId, signature })).similar!;
  }

  terminate(): void {
    this.worker.terminate();
  }
}

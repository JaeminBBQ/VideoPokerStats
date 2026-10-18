/**
 * Serialized, debounced write queue for the glasses page (pure; no SDK). research/04-validation.md §5.5.
 *
 * - Every bridge call (`run`, and the sends behind `push`) goes through ONE promise chain, so no two
 *   page writes are ever in flight together.
 * - `push(text)` is debounced: the first push starts a `debounceMs` window; later pushes only replace the
 *   pending text. The content is read when the chained step actually runs, so the latest text always wins
 *   and a burst collapses into one write.
 * - A text equal to the last successfully sent one is skipped unless `force` is set. A failed send forgets
 *   the last text, so the next push always goes out.
 */

export interface UpdateQueueOptions {
  /** Writes the text to the page (textContainerUpgrade); resolves true on success. */
  send: (text: string) => Promise<boolean>;
  debounceMs?: number;
  onError?: (err: unknown) => void;
}

export interface UpdateQueue {
  /** Schedules `text` (debounced, latest wins). `force` re-sends even if unchanged. */
  push(text: string, opts?: { force?: boolean }): void;
  /** Runs `op` on the chain after everything queued before it. Errors go to onError and resolve undefined. */
  run<T>(op: () => Promise<T>): Promise<T | undefined>;
  /** Records what the page now shows (after create/rebuild), or null if unknown. */
  markSent(text: string | null): void;
  /** Drops a scheduled-but-unsent push (the chain itself is untouched). */
  cancelPending(): void;
  /** Resolves once everything chained so far has settled (does not wait for a pending debounce timer). */
  idle(): Promise<void>;
  /** Stops everything; later pushes/runs are no-ops. */
  dispose(): void;
  readonly lastSent: string | null;
}

export const DEFAULT_DEBOUNCE_MS = 100;

export function createUpdateQueue(opts: UpdateQueueOptions): UpdateQueue {
  const { send, debounceMs = DEFAULT_DEBOUNCE_MS, onError = () => {} } = opts;
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  let pendingForce = false;
  let lastSent: string | null = null;
  let disposed = false;

  const enqueue = <T>(op: () => Promise<T>): Promise<T | undefined> => {
    const result = chain.then(async () => {
      if (disposed) return undefined;
      try {
        return await op();
      } catch (err) {
        onError(err);
        return undefined;
      }
    });
    chain = result.then(() => undefined);
    return result;
  };

  const flushStep = async (): Promise<void> => {
    const text = pending;
    const force = pendingForce;
    pending = null;
    pendingForce = false;
    if (text === null || (!force && text === lastSent)) return;
    let ok = false;
    try {
      ok = await send(text);
    } catch (err) {
      onError(err);
    }
    lastSent = ok ? text : null;
  };

  return {
    push(text, o = {}) {
      if (disposed) return;
      pending = text;
      pendingForce = pendingForce || o.force === true;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        void enqueue(flushStep);
      }, debounceMs);
    },
    run: enqueue,
    markSent(text) {
      lastSent = text;
    },
    cancelPending() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
      pendingForce = false;
    },
    idle: () => chain,
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    },
    get lastSent() {
      return lastSent;
    },
  };
}

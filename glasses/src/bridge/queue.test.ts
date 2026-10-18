import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateQueue } from './queue.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A send that records calls and resolves only when released, to observe serialization. */
function manualSend() {
  const calls: string[] = [];
  const releases: ((ok: boolean) => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const send = (t: string) =>
    new Promise<boolean>((resolve) => {
      calls.push(t);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      releases.push((ok) => {
        inFlight--;
        resolve(ok);
      });
    });
  return { send, calls, release: (ok = true) => releases.shift()!(ok), get maxInFlight() { return maxInFlight; } };
}

describe('createUpdateQueue', () => {
  it('debounces a burst into one send of the latest text', async () => {
    const send = vi.fn(async () => true);
    const q = createUpdateQueue({ send, debounceMs: 100 });
    q.push('a');
    q.push('b');
    await vi.advanceTimersByTimeAsync(50);
    q.push('c');
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(send.mock.calls).toEqual([['c']]);
    expect(q.lastSent).toBe('c');
  });

  it('skips unchanged text unless forced; a revert to the sent text cancels a pending change', async () => {
    const send = vi.fn(async () => true);
    const q = createUpdateQueue({ send });
    q.markSent('x');
    q.push('x');
    await vi.advanceTimersByTimeAsync(100);
    expect(send).not.toHaveBeenCalled();
    q.push('y');
    q.push('x');
    await vi.advanceTimersByTimeAsync(100);
    expect(send).not.toHaveBeenCalled();
    q.push('x', { force: true });
    await vi.advanceTimersByTimeAsync(100);
    expect(send.mock.calls).toEqual([['x']]);
  });

  it('serializes: never two writes in flight; content is read when the step runs (latest wins)', async () => {
    const m = manualSend();
    const q = createUpdateQueue({ send: m.send });
    q.push('1');
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls).toEqual(['1']);
    q.push('2');
    await vi.advanceTimersByTimeAsync(100); // step 2 chained behind the in-flight write
    q.push('3');
    await vi.advanceTimersByTimeAsync(100); // step 3 chained too
    q.push('4'); // before anything runs
    expect(m.calls).toEqual(['1']);
    m.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.calls).toEqual(['1', '4']); // 2 and 3 never sent
    m.release();
    await vi.advanceTimersByTimeAsync(200);
    expect(m.calls).toEqual(['1', '4']);
    expect(m.maxInFlight).toBe(1);
  });

  it('run() ops share the chain with sends', async () => {
    const order: string[] = [];
    const m = manualSend();
    const q = createUpdateQueue({ send: m.send });
    q.push('a');
    await vi.advanceTimersByTimeAsync(100);
    const r = q.run(async () => {
      order.push('op');
      return 7;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([]);
    m.release();
    await expect(r).resolves.toBe(7);
    expect(order).toEqual(['op']);
  });

  it('a failed or throwing send forgets lastSent so the same text is retried; errors go to onError', async () => {
    const onError = vi.fn();
    let n = 0;
    const send = vi.fn(async () => {
      n++;
      if (n === 1) return false;
      if (n === 2) throw new Error('boom');
      return true;
    });
    const q = createUpdateQueue({ send, onError });
    for (let i = 0; i < 3; i++) {
      q.push('t');
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(send).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(q.lastSent).toBe('t');
    const r = q.run(async () => {
      throw new Error('op');
    });
    await expect(r).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('cancelPending drops a scheduled push; dispose stops everything', async () => {
    const send = vi.fn(async () => true);
    const q = createUpdateQueue({ send });
    q.push('a');
    q.cancelPending();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).not.toHaveBeenCalled();
    q.push('b');
    q.dispose();
    q.push('c');
    const r = q.run(async () => 1);
    await vi.advanceTimersByTimeAsync(200);
    expect(send).not.toHaveBeenCalled();
    await expect(r).resolves.toBeUndefined();
  });
});

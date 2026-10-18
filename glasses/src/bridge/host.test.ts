import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasHost, withTimeout } from './host.ts';

afterEach(() => vi.useRealTimers());

describe('hasHost', () => {
  it('needs flutter_inappwebview.callHandler to be a function', () => {
    expect(hasHost({})).toBe(false);
    expect(hasHost(null)).toBe(false);
    expect(hasHost({ flutter_inappwebview: {} })).toBe(false);
    expect(hasHost({ flutter_inappwebview: { callHandler: 1 } })).toBe(false);
    expect(hasHost({ flutter_inappwebview: { callHandler: () => {} } })).toBe(true);
  });
  it('defaults to globalThis (no host in Node)', () => {
    expect(hasHost()).toBe(false);
  });
  it('a throwing getter is no host', () => {
    const w = {
      get flutter_inappwebview(): never {
        throw new Error('blocked');
      },
    };
    expect(hasHost(w)).toBe(false);
  });
});

describe('withTimeout', () => {
  it('resolves with the value', async () => {
    await expect(withTimeout(Promise.resolve(5), 100, null)).resolves.toBe(5);
  });
  it('rejection → fallback', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 100, 'fb')).resolves.toBe('fb');
  });
  it('a never-settling promise → fallback after ms (bridge wait never hangs)', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<number>(() => {}), 1500, null);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBeNull();
  });
});

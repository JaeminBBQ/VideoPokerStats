import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from '../core/storage.ts';
import { createBridgeBackend, type BridgeKV } from './storage.ts';

afterEach(() => vi.useRealTimers());

function fakeBridge(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  const bridge = {
    getLocalStorage: vi.fn(async (k: string) => data.get(k) ?? ''),
    setLocalStorage: vi.fn(async (k: string, v: string) => {
      data.set(k, v);
      return true;
    }),
  };
  return { bridge: bridge as BridgeKV & typeof bridge, data };
}

describe('createBridgeBackend', () => {
  it('get/set round-trip; missing key = ""', async () => {
    const { bridge, data } = fakeBridge({ a: '1' });
    const b = createBridgeBackend(bridge);
    expect(await b.get('a')).toBe('1');
    expect(await b.get('nope')).toBe('');
    expect(await b.set('c', 'x')).toBe(true);
    expect(data.get('c')).toBe('x');
  });

  it('rejections, sync throws and non-strings map to ""/false', async () => {
    const b = createBridgeBackend({
      getLocalStorage: () => {
        throw new Error('sync');
      },
      setLocalStorage: () => Promise.reject(new Error('async')),
    });
    expect(await b.get('k')).toBe('');
    expect(await b.set('k', 'v')).toBe(false);
    const n = createBridgeBackend({
      getLocalStorage: async () => null as unknown as string,
      setLocalStorage: async () => true,
    });
    expect(await n.get('k')).toBe('');
  });

  it('times out after 2 s', async () => {
    vi.useFakeTimers();
    const b = createBridgeBackend({ getLocalStorage: () => new Promise(() => {}), setLocalStorage: () => new Promise(() => {}) });
    const g = b.get('k');
    const s = b.set('k', 'v');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(g).resolves.toBe('');
    await expect(s).resolves.toBe(false);
  });

  it('plugs into core/storage: bridge value is read when localStorage is empty, writes go to both', async () => {
    const { bridge, data } = fakeBridge({ 'vp.game': 'saved' });
    const local = new Map<string, string>();
    const storage = createStorage({ local: { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => void local.set(k, v) } });
    expect(await storage.read('vp.game')).toBeNull();
    storage.setRemote(createBridgeBackend(bridge));
    expect(await storage.read('vp.game')).toBe('saved');
    storage.write('vp.lastHand', '[1,2]');
    await Promise.resolve();
    expect(local.get('vp.lastHand')).toBe('[1,2]');
    expect(data.get('vp.lastHand')).toBe('[1,2]');
  });
});

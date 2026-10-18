/**
 * Bridge storage backend for core/storage.ts (`AppStorage.setRemote`). SDK types only (`import type`), so it
 * stays testable in Node. `getLocalStorage` resolves '' for a missing key; failures and timeouts map to ''.
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { RemoteBackend } from '../core/storage.ts';
import { withTimeout } from './host.ts';

export type BridgeKV = Pick<EvenAppBridge, 'getLocalStorage' | 'setLocalStorage'>;

export const BRIDGE_STORAGE_TIMEOUT_MS = 2000;

export function createBridgeBackend(bridge: BridgeKV, timeoutMs = BRIDGE_STORAGE_TIMEOUT_MS): RemoteBackend {
  const attempt = <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return Promise.resolve(fn());
    } catch (err) {
      return Promise.reject(err);
    }
  };
  return {
    async get(key) {
      const v = await withTimeout(
        attempt(() => bridge.getLocalStorage(key)),
        timeoutMs,
        '',
      );
      return typeof v === 'string' ? v : '';
    },
    async set(key, value) {
      return withTimeout(
        attempt(() => bridge.setLocalStorage(key, value)),
        timeoutMs,
        false,
      );
    },
  };
}

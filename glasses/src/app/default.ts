/**
 * Default app wiring for the browser: the inlined engine worker plus localStorage. No SDK import here;
 * the bridge (Phase 2b) attaches its storage backend later with `storage.setRemote(...)`.
 *
 * Boot order (Phase 2a main.tsx / Phase 2b bridge):
 *   const app = createAppStore();
 *   void app.store.hydrate();                       // localStorage first; renders immediately
 *   // when the bridge is ready (and only with a host):
 *   app.storage.setRemote(bridgeBackend);
 *   void app.store.hydrate({ onlyIfPristine: true }); // picks up bridge values if localStorage was wiped
 */
import { createWorkerEngine } from '../engine/client.ts';
import type { EngineClient } from '../engine/protocol.ts';
import { browserLocalStorage, createStorage, type AppStorage } from '../core/storage.ts';
import { createStore, type Store } from './store.ts';

export interface AppWiring {
  store: Store;
  storage: AppStorage;
  /** Dispose on SYSTEM_EXIT to terminate the worker. */
  engine: EngineClient;
}

export function createAppStore(): AppWiring {
  const engine = createWorkerEngine();
  const storage = createStorage({ local: browserLocalStorage() });
  return { store: createStore({ engine, storage }), storage, engine };
}

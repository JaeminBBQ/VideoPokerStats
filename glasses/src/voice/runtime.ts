/**
 * Browser wiring for voice: model store (IndexedDB) + vosk recognizer + push-to-talk controller, all reporting into
 * the app store. No SDK import: glasses.ts attaches the mic (`attachMic`) and routes audioEvent payloads to
 * `controller.feed`. Created once in main.tsx.
 *
 *   init()     cached model → 'ready' (no network), then warm the recognizer after WARM_DELAY_MS.
 *   download() user action only (no auto-download); warms the recognizer once verified and cached.
 *   retry()    after an error: cached model → just reload it; otherwise download again.
 *   remove()   drops the recognizer, our cache, and vosk-browser's own `/vosk` IDB copy.
 */
import type { Store } from '../app/store.ts';
import { MODEL_BASE_URL } from './config.ts';
import { createVoiceController, type FinishReason, type MicPort, type VoiceController } from './controller.ts';
import { createIdbModelCache, createModelStore, type ModelStore } from './modelStore.ts';
import { createRecognizer, deleteIdb, voskModelLoader, type Recognizer } from './recognizer.ts';

/** Startup warm-up waits this long so it doesn't compete with the engine's first table build. */
export const WARM_DELAY_MS = 2000;

export interface VoiceRuntime {
  readonly controller: VoiceController;
  readonly recognizer: Recognizer;
  readonly models: ModelStore;
  init(): Promise<void>;
  download(): Promise<void>;
  retry(): Promise<void>;
  remove(): Promise<void>;
  /** Loads the speech model now (resolves when loaded; rejects on failure, which is also shown as status). */
  warm(): Promise<void>;
  attachMic(mic: MicPort | null): void;
  /** For the dev test hook and logs. */
  readonly stats: { loadMs: number | null; lastTranscript: string | null; lastReason: FinishReason | null };
}

const log = (msg: string, ...data: unknown[]) => {
  if (import.meta.env.DEV) console.debug(`[voice] ${msg}`, ...data);
};

export function createVoiceRuntime(store: Store, baseUrl: string = MODEL_BASE_URL): VoiceRuntime {
  let mic: MicPort | null = null;
  const stats: VoiceRuntime['stats'] = { loadMs: null, lastTranscript: null, lastReason: null };

  const models = createModelStore({
    baseUrl,
    fetch: (url, init) => fetch(url, init),
    cache: createIdbModelCache(),
    onStatus: (s) => store.setModelStatus(s),
  });

  const recognizer = createRecognizer({
    loadModel: voskModelLoader(() => models.blob()),
    onLoaded: (ms) => {
      stats.loadMs = Math.round(ms);
      log(`model loaded in ${stats.loadMs} ms`);
    },
    onLoadError: (msg) => {
      console.warn('[voice] model load failed:', msg);
      const m = store.getState().voice.model;
      if (m.state !== 'ready') return; // removed or re-downloading meanwhile: nothing to report
      store.setModelStatus({ state: 'error', error: msg, totalBytes: m.totalBytes ?? m.bytes });
    },
    log,
  });

  const controller = createVoiceController({
    store,
    recognizer,
    mic: () => mic,
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as number) },
    log,
    onTranscript: (t, reason) => {
      stats.lastTranscript = t;
      stats.lastReason = reason;
    },
  });

  const warm = () => recognizer.warm();
  /** Background preload; skipped if the model was removed (or failed) in the meantime. */
  const warmQuietly = () => {
    if (store.getState().voice.model.state === 'ready') void warm().catch(() => {});
  };
  const download = async () => {
    if (await models.download()) warmQuietly();
  };

  return {
    controller,
    recognizer,
    models,
    stats,
    warm,
    attachMic(m) {
      mic = m;
    },
    async init() {
      const s = await models.init();
      if (s.state === 'ready') setTimeout(warmQuietly, WARM_DELAY_MS);
    },
    download,
    async retry() {
      const s = await models.init(); // cached → 'ready' again without network
      if (s.state === 'ready') warmQuietly();
      else await download();
    },
    async remove() {
      controller.cancel();
      recognizer.dispose();
      await models.remove();
      await deleteIdb('/vosk');
    },
  };
}

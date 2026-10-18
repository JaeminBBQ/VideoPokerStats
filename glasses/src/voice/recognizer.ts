/**
 * vosk-browser wrapper (VOICE.md "Engine", "Implementation notes"). vosk-browser is self-contained: its worker is
 * an inlined base64 Blob worker with the Kaldi wasm embedded, so the only fetch is the model archive, which we
 * hand over as a `blob:` URL of the verified, IndexedDB-cached Blob.
 *
 * - The model loads lazily, once (`warm()`); vosk-browser's own IDBFS cache (`/vosk`) is deleted first, because
 *   the blob URL differs every session and each load would otherwise leave another ~47 MB copy behind.
 * - Each utterance gets a grammar-restricted KaldiRecognizer(16000, JSON.stringify(VOICE_WORDS)); one spare is
 *   pre-created after load so a long press doesn't wait on grammar compilation.
 * - A session may start before the model has loaded: audio is queued and flushed once it has.
 * - Final transcript: the worker answers every audio chunk with exactly one event (result | partialresult |
 *   error), and retrieveFinalResult with one result. So the final result is event #(chunks + 1); every 'result'
 *   text (Vosk endpoints mid-utterance on pauses) is concatenated in order.
 *
 * Inspired by EvenChess src/voice/recognizer.ts (MIT, © 2026 Dustin Harmon); no code copied verbatim.
 */
import { VOICE_WORDS } from '../core/voice.ts';
import { SAMPLE_RATE } from './config.ts';

export interface RecSession {
  feed(samples: Float32Array): void;
  /** Ends the utterance; resolves with the full transcript (may be ''). */
  finish(): Promise<string>;
  /** Drops the utterance; finish() after cancel rejects. */
  cancel(): void;
}

export interface Recognizer {
  /** Loads the model if not already loaded/loading. Rejects on failure (also reported via onLoadError). */
  warm(): Promise<void>;
  session(): RecSession;
  /** Terminates the worker and forgets the model (e.g. after Remove). */
  dispose(): void;
  readonly loaded: boolean;
}

/** The subset of vosk-browser's API we use (fakeable in tests). */
export interface KaldiLike {
  on(event: 'result' | 'partialresult' | 'error', listener: (message: unknown) => void): void;
  acceptWaveformFloat(buffer: Float32Array, sampleRate: number): void;
  retrieveFinalResult(): void;
  remove(): void;
}
export interface ModelLike {
  readonly KaldiRecognizer: new (sampleRate: number, grammar?: string) => KaldiLike;
  terminate(): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export interface RecognizerDeps {
  /** Loads a model (browser: blob → blob URL → vosk-browser). */
  loadModel: () => Promise<ModelLike>;
  onLoadError?: (msg: string) => void;
  onLoaded?: (ms: number) => void;
  timers?: Timers;
  now?: () => number;
  log?: (msg: string, ...data: unknown[]) => void;
}

/** After retrieveFinalResult, give up on the worker after this long. */
export const FINAL_TIMEOUT_MS = 6000;
/** Cap on audio queued while the model is still loading (~12 s). */
const MAX_QUEUED_SAMPLES = SAMPLE_RATE * 12;

const GRAMMAR = JSON.stringify(VOICE_WORDS);

const resultText = (m: unknown): string => {
  const r = (m as { result?: { text?: unknown } } | null)?.result;
  return typeof r?.text === 'string' ? r.text.trim() : '';
};
const errorText = (m: unknown): string => {
  const e = (m as { error?: unknown } | null)?.error;
  return typeof e === 'string' ? e : 'recognizer error';
};

export function createRecognizer(deps: RecognizerDeps): Recognizer {
  const timers = deps.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as number) };
  const now = deps.now ?? (() => performance.now());
  const log = deps.log ?? (() => {});
  let modelP: Promise<ModelLike> | null = null;
  let model: ModelLike | null = null;
  let spare: KaldiLike | null = null;
  let disposed = false;

  const newKaldi = (m: ModelLike): KaldiLike => new m.KaldiRecognizer(SAMPLE_RATE, GRAMMAR);
  const takeKaldi = (m: ModelLike): KaldiLike => {
    const k = spare ?? newKaldi(m);
    spare = null;
    return k;
  };
  const refillSpare = () => {
    if (model && !spare && !disposed) {
      try {
        spare = newKaldi(model);
      } catch (err) {
        log('spare recognizer failed', err);
      }
    }
  };

  const ensureModel = (): Promise<ModelLike> => {
    if (!modelP) {
      const t0 = now();
      disposed = false;
      const p = deps.loadModel().then(
        (m) => {
          if (modelP !== p) {
            m.terminate();
            throw new Error('recognizer disposed');
          }
          model = m;
          deps.onLoaded?.(now() - t0);
          refillSpare();
          return m;
        },
        (err: unknown) => {
          if (modelP === p) {
            modelP = null; // a later warm() retries
            deps.onLoadError?.(err instanceof Error && err.message ? err.message : 'Speech model failed to load');
          }
          throw err;
        },
      );
      modelP = p;
    }
    return modelP;
  };

  return {
    get loaded() {
      return model !== null;
    },
    warm: () => ensureModel().then(() => {}),
    dispose() {
      disposed = true;
      try {
        spare?.remove();
      } catch {
        /* worker gone */
      }
      spare = null;
      try {
        model?.terminate();
      } catch {
        /* worker gone */
      }
      model = null;
      modelP = null;
    },
    session(): RecSession {
      let kaldi: KaldiLike | null = null;
      let queued: Float32Array[] = [];
      let queuedSamples = 0;
      let chunks = 0;
      let events = 0;
      let finalAt = -1; // event number of the final result, once requested
      const texts: string[] = [];
      let error: string | null = null;
      let cancelled = false;
      let settle: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
      let timer: unknown = null;

      const end = (fn: () => void) => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
        const k = kaldi;
        kaldi = null;
        try {
          k?.remove();
        } catch {
          /* worker gone */
        }
        refillSpare();
        fn();
      };
      const fail = (msg: string) => {
        error ??= msg;
        if (settle) {
          const s = settle;
          settle = null;
          end(() => s.reject(new Error(msg)));
        }
      };
      const onEvent = (kind: 'result' | 'partialresult' | 'error') => (m: unknown) => {
        if (cancelled) return;
        events++;
        if (kind === 'result') {
          const t = resultText(m);
          if (t) texts.push(t);
        } else if (kind === 'error') {
          log('recognizer error', m);
          return fail(errorText(m));
        }
        if (finalAt > 0 && events >= finalAt && settle) {
          const s = settle;
          settle = null;
          end(() => s.resolve(texts.join(' ').replace(/\s+/g, ' ').trim()));
        }
      };
      const send = (samples: Float32Array) => {
        if (!kaldi) return;
        try {
          kaldi.acceptWaveformFloat(samples, SAMPLE_RATE);
          chunks++;
        } catch (err) {
          fail(`acceptWaveform failed: ${String(err)}`);
        }
      };
      const attach = (m: ModelLike) => {
        if (cancelled || kaldi) return;
        try {
          kaldi = takeKaldi(m);
        } catch (err) {
          return fail(`Could not create recognizer: ${String(err)}`);
        }
        kaldi.on('result', onEvent('result'));
        kaldi.on('partialresult', onEvent('partialresult'));
        kaldi.on('error', onEvent('error'));
        for (const q of queued) send(q);
        queued = [];
        queuedSamples = 0;
      };

      const ready = ensureModel().then(attach, (err: unknown) => fail(err instanceof Error ? err.message : 'Speech model failed to load'));

      return {
        feed(samples) {
          if (cancelled || finalAt > 0 || error || samples.length === 0) return;
          if (kaldi) return send(samples);
          if (queuedSamples + samples.length > MAX_QUEUED_SAMPLES) return;
          queued.push(samples.slice());
          queuedSamples += samples.length;
        },
        finish() {
          if (cancelled) return Promise.reject(new Error('cancelled'));
          return new Promise<string>((resolve, reject) => {
            settle = { resolve, reject };
            void ready.then(() => {
              if (!settle) return; // already failed
              if (error || !kaldi) return fail(error ?? 'recognizer unavailable');
              finalAt = chunks + 1;
              timer = timers.setTimeout(() => fail('Recognizer timed out'), FINAL_TIMEOUT_MS);
              try {
                kaldi.retrieveFinalResult();
              } catch (err) {
                fail(`retrieveFinalResult failed: ${String(err)}`);
              }
            });
          });
        },
        cancel() {
          if (cancelled) return;
          cancelled = true;
          queued = [];
          const s = settle;
          settle = null;
          end(() => s?.reject(new Error('cancelled')));
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Browser model loader.

/** Deletes an IndexedDB database; resolves even if blocked/failed (bounded wait). */
export function deleteIdb(name: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    try {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = finish;
      r.onerror = finish;
      r.onblocked = finish;
    } catch {
      finish();
    }
    setTimeout(finish, timeoutMs);
  });
}

/** How long a model load may take before we call it failed (first load extracts ~49 MB in wasm). */
export const LOAD_TIMEOUT_MS = 180_000;

/** blob → blob: URL → vosk-browser Model. The vosk chunk (~5.8 MB) is imported only here. */
export function voskModelLoader(getBlob: () => Promise<Blob | null>): () => Promise<ModelLike> {
  return async () => {
    const blob = await getBlob();
    if (!blob) throw new Error('Speech model not downloaded');
    await deleteIdb('/vosk');
    const { Model } = await import('vosk-browser');
    const url = URL.createObjectURL(blob);
    try {
      const model = new Model(url, -1);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Speech model load timed out')), LOAD_TIMEOUT_MS);
        model.on('load', (m) => {
          clearTimeout(t);
          if ((m as { result?: boolean }).result) resolve();
          else reject(new Error('Speech model failed to load'));
        });
        model.on('error', (m) => {
          clearTimeout(t);
          reject(new Error(`Speech model failed to load: ${errorText(m)}`));
        });
      }).catch((err: unknown) => {
        model.terminate();
        throw err;
      });
      // vosk-browser's terminate() only messages the worker; also end the thread so Remove frees its memory.
      const worker = (model as unknown as { worker?: Worker }).worker;
      const Kaldi = model.KaldiRecognizer as unknown as ModelLike['KaldiRecognizer'];
      return {
        KaldiRecognizer: Kaldi,
        terminate() {
          model.terminate();
          setTimeout(() => worker?.terminate(), 500);
        },
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  };
}

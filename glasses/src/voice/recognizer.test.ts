import { describe, expect, it, vi } from 'vitest';
import { VOICE_WORDS } from '../core/voice.ts';
import { createRecognizer, FINAL_TIMEOUT_MS, type KaldiLike, type ModelLike } from './recognizer.ts';

type Listener = (m: unknown) => void;

/** Fake worker: each chunk → one async event; a chunk whose first sample is 1 ends an utterance ("result"). */
function fakeModel(script: { words: string[]; finalText?: string; silentFinal?: boolean; errorOnChunk?: number }) {
  const created: { rate: number; grammar?: string; removed: boolean; chunks: number }[] = [];
  let terminated = false;
  class K implements KaldiLike {
    private ls: Record<string, Listener[]> = {};
    private rec = { rate: 0, grammar: undefined as string | undefined, removed: false, chunks: 0 };
    private seg = 0;
    constructor(rate: number, grammar?: string) {
      this.rec.rate = rate;
      this.rec.grammar = grammar;
      created.push(this.rec);
    }
    on(ev: string, fn: Listener) {
      (this.ls[ev] ??= []).push(fn);
    }
    private emit(ev: string, m: unknown) {
      queueMicrotask(() => {
        if (!this.rec.removed) for (const f of this.ls[ev] ?? []) f(m);
      });
    }
    acceptWaveformFloat(buf: Float32Array) {
      this.rec.chunks++;
      if (script.errorOnChunk === this.rec.chunks) return this.emit('error', { error: 'boom' });
      if (buf[0] === 1) this.emit('result', { result: { text: script.words[this.seg++] ?? '' } });
      else this.emit('partialresult', { result: { partial: '…' } });
    }
    retrieveFinalResult() {
      if (!script.silentFinal) this.emit('result', { result: { text: script.finalText ?? '' } });
    }
    remove() {
      this.rec.removed = true;
    }
  }
  const model: ModelLike = { KaldiRecognizer: K, terminate: () => void (terminated = true) };
  return { model, created, isTerminated: () => terminated };
}

const chunk = (first = 0) => Float32Array.from([first, 0, 0, 0]);

describe('createRecognizer', () => {
  it('uses 16 kHz + the VOICE_WORDS grammar; concatenates mid-stream and final results', async () => {
    const fm = fakeModel({ words: ['king queen jack of spades'], finalText: 'seven of diamonds three of clubs' });
    const loaded = vi.fn();
    const r = createRecognizer({ loadModel: async () => fm.model, onLoaded: loaded });
    await r.warm();
    expect(r.loaded).toBe(true);
    expect(loaded).toHaveBeenCalledOnce();
    const s = r.session();
    s.feed(chunk());
    s.feed(chunk(1)); // Vosk endpoint mid-utterance
    s.feed(chunk());
    await expect(s.finish()).resolves.toBe('king queen jack of spades seven of diamonds three of clubs');
    expect(fm.created[0]).toMatchObject({ rate: 16000, grammar: JSON.stringify(VOICE_WORDS), removed: true, chunks: 3 });
  });

  it('pre-creates a spare recognizer after load and after each session', async () => {
    const fm = fakeModel({ words: [], finalText: 'ace of hearts' });
    const r = createRecognizer({ loadModel: async () => fm.model });
    await r.warm();
    expect(fm.created).toHaveLength(1);
    const s = r.session();
    await Promise.resolve();
    expect(fm.created).toHaveLength(1); // the spare was used
    await expect(s.finish()).resolves.toBe('ace of hearts');
    expect(fm.created).toHaveLength(2); // refilled
  });

  it('queues audio fed before the model loads, then flushes it in order', async () => {
    const fm = fakeModel({ words: ['two of clubs'], finalText: '' });
    let release!: (m: ModelLike) => void;
    const r = createRecognizer({ loadModel: () => new Promise<ModelLike>((res) => (release = res)) });
    const s = r.session();
    s.feed(chunk());
    s.feed(chunk(1));
    const fin = s.finish();
    release(fm.model);
    await expect(fin).resolves.toBe('two of clubs');
    expect(fm.created[0]!.chunks).toBe(2);
  });

  it('a worker error rejects finish', async () => {
    const fm = fakeModel({ words: [], errorOnChunk: 1 });
    const r = createRecognizer({ loadModel: async () => fm.model });
    await r.warm();
    const s = r.session();
    s.feed(chunk());
    await expect(s.finish()).rejects.toThrow('boom');
  });

  it('times out when the final result never comes', async () => {
    vi.useFakeTimers();
    try {
      const fm = fakeModel({ words: [], silentFinal: true });
      const r = createRecognizer({ loadModel: async () => fm.model });
      await r.warm();
      const s = r.session();
      const fin = s.finish();
      const check = expect(fin).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(FINAL_TIMEOUT_MS + 1);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel drops the session; finish after cancel rejects', async () => {
    const fm = fakeModel({ words: ['x'], finalText: 'y' });
    const r = createRecognizer({ loadModel: async () => fm.model });
    await r.warm();
    const s = r.session();
    s.feed(chunk());
    await Promise.resolve();
    s.cancel();
    await expect(s.finish()).rejects.toThrow('cancelled');
    expect(fm.created[0]!.removed).toBe(true);
  });

  it('load failure → onLoadError, session finish rejects, a later warm retries', async () => {
    const onLoadError = vi.fn();
    const fm = fakeModel({ words: [], finalText: 'ok' });
    let fail = true;
    const r = createRecognizer({
      loadModel: async () => {
        if (fail) throw new Error('Speech model failed to load');
        return fm.model;
      },
      onLoadError,
    });
    const s = r.session();
    await expect(s.finish()).rejects.toThrow(/failed to load/);
    expect(onLoadError).toHaveBeenCalledWith('Speech model failed to load');
    fail = false;
    await r.warm();
    expect(r.loaded).toBe(true);
  });

  it('dispose terminates the model', async () => {
    const fm = fakeModel({ words: [] });
    const r = createRecognizer({ loadModel: async () => fm.model });
    await r.warm();
    r.dispose();
    expect(fm.isTerminated()).toBe(true);
    expect(r.loaded).toBe(false);
  });
});

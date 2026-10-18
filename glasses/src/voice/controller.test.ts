/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { createStore, type Timers } from '../app/store.ts';
import { handOf } from '../core/entry.ts';
import { createStorage, type LocalBackend } from '../core/storage.ts';
import { VOICE_NO_MODEL } from '../core/voice.ts';
import { glassesCard } from '../core/cards.ts';
import { createVoiceController, MAX_LISTEN_MS, MIC_FAILED, PREROLL_MS, VOICE_FAILED, type MicPort } from './controller.ts';
import type { RecSession } from './recognizer.ts';

class ManualTimers implements Timers {
  t = 0;
  q: { at: number; fn: () => void; id: number }[] = [];
  id = 0;
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.id;
    this.q.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown) {
    this.q = this.q.filter((x) => x.id !== h);
  }
  advance(ms: number) {
    this.t += ms;
    for (;;) {
      const due = this.q.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.q = this.q.filter((x) => x !== due);
      due.fn();
    }
  }
}

const local = (): LocalBackend => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

class FakeSession implements RecSession {
  fed: Float32Array[] = [];
  cancelled = false;
  finishing = false;
  resolve!: (t: string) => void;
  reject!: (e: Error) => void;
  feed(s: Float32Array) {
    this.fed.push(s);
  }
  finish() {
    this.finishing = true;
    return new Promise<string>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
  cancel() {
    this.cancelled = true;
    this.reject?.(new Error('cancelled'));
  }
}

class FakeMic implements MicPort {
  calls: boolean[] = [];
  openResult: Promise<boolean> = Promise.resolve(true);
  open() {
    this.calls.push(true);
    return this.openResult;
  }
  close() {
    this.calls.push(false);
  }
  get on() {
    return this.calls.at(-1) === true;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup({ ready = true, mic = new FakeMic() as FakeMic | null } = {}) {
  const timers = new ManualTimers();
  const pending = () => new Promise<never>(() => {});
  const store = createStore({ engine: { prepare: pending, analyze: pending }, storage: createStorage({ local: local() }), timers });
  if (ready) store.setModelStatus({ state: 'ready', bytes: 1 });
  const sessions: FakeSession[] = [];
  const transcripts: string[] = [];
  const vc = createVoiceController({
    store,
    recognizer: { session: () => (sessions.push(new FakeSession()), sessions.at(-1)!) },
    mic: () => mic,
    timers,
    onTranscript: (t, why) => transcripts.push(`${why}:${t}`),
  });
  const phase = () => store.getState().voice.phase;
  const hand = () => handOf(store.getState().entry).map((c) => glassesCard(c, true));
  return { store, vc, timers, sessions, mic, phase, hand, transcripts };
}

/** s16le PCM bytes of n samples at amplitude a. */
const pcm = (n: number, a: number) => {
  const b = new Uint8Array(n * 2);
  const v = new DataView(b.buffer);
  for (let i = 0; i < n; i++) v.setInt16(i * 2, Math.round(a * 32767) * (i % 2 ? 1 : -1), true);
  return b;
};

describe('voice controller', () => {
  it('no model → no-model error line, mic never opened', () => {
    const t = setup({ ready: false });
    t.vc.start();
    expect(t.phase()).toBe('error');
    expect(t.store.getState().voice.message).toBe(VOICE_NO_MODEL);
    expect(t.mic!.calls).toEqual([]);
    expect(t.sessions).toHaveLength(0);
    t.vc.stop(); // release after a no-model press is harmless
    expect(t.mic!.calls).toEqual([]);
  });

  it('start → listening, mic on, 350 ms pre-roll; release → recognizing, mic off → hand entered → idle', async () => {
    const t = setup();
    t.vc.start();
    expect(t.phase()).toBe('listening');
    expect(t.mic!.on).toBe(true);
    const s = t.sessions[0]!;
    expect(s.fed[0]!.length).toBe((16000 * PREROLL_MS) / 1000);
    expect(s.fed[0]!.every((x) => x === 0)).toBe(true);
    t.vc.feed(pcm(1600, 0.2)); // Uint8Array
    t.vc.feed(Array.from(pcm(1600, 0.2))); // number[]
    t.vc.feed(Buffer.from(pcm(1600, 0.2)).toString('base64')); // base64
    expect(s.fed).toHaveLength(4);
    expect(s.fed[1]).toEqual(s.fed[2]);
    expect(s.fed[1]).toEqual(s.fed[3]);
    t.vc.stop();
    expect(t.mic!.on).toBe(false);
    expect(t.phase()).toBe('recognizing');
    t.vc.feed(pcm(1600, 0.2)); // late audio is dropped
    expect(s.fed).toHaveLength(4);
    s.resolve('king queen jack of spades seven of diamonds three of clubs');
    await flush();
    expect(t.phase()).toBe('idle');
    expect(t.hand()).toEqual(['Ks', 'Qs', 'Js', '7d', '3c']);
    expect(t.transcripts).toEqual(['release:king queen jack of spades seven of diamonds three of clubs']);
    expect(t.vc.active).toBe(false);
  });

  it('a parse error surfaces through the store (error line), mic already off', async () => {
    const t = setup();
    t.vc.start();
    t.vc.stop();
    t.sessions[0]!.resolve('king queen');
    await flush();
    expect(t.phase()).toBe('error');
    expect(t.store.getState().voice.message).toMatch(/no suit/);
    expect(t.mic!.on).toBe(false);
  });

  it('8 s without a release finishes', () => {
    const t = setup();
    t.vc.start();
    t.timers.advance(MAX_LISTEN_MS - 1);
    expect(t.phase()).toBe('listening');
    t.timers.advance(1);
    expect(t.phase()).toBe('recognizing');
    expect(t.mic!.on).toBe(false);
    t.vc.stop(); // the later release is a no-op
    expect(t.mic!.calls).toEqual([true, false]);
  });

  it('~900 ms of quiet audio after speech finishes; quiet before speech does not', async () => {
    const t = setup();
    t.vc.start();
    for (let i = 0; i < 20; i++) t.vc.feed(pcm(1600, 0)); // 2 s of silence, no speech yet
    expect(t.phase()).toBe('listening');
    t.vc.feed(pcm(1600, 0.2));
    for (let i = 0; i < 8; i++) t.vc.feed(pcm(1600, 0.001)); // 800 ms
    expect(t.phase()).toBe('listening');
    t.vc.feed(pcm(1600, 0.2)); // speech again resets the silence count
    for (let i = 0; i < 8; i++) t.vc.feed(pcm(1600, 0));
    expect(t.phase()).toBe('listening');
    t.vc.feed(pcm(1600, 0)); // 900 ms
    expect(t.phase()).toBe('recognizing');
    t.sessions[0]!.resolve('ace of hearts');
    await flush();
    expect(t.transcripts).toEqual(['silence:ace of hearts']);
  });

  it('cancel while listening → mic off, audio dropped, idle; transcript never applied', async () => {
    const t = setup();
    t.vc.start();
    t.vc.cancel();
    expect(t.mic!.on).toBe(false);
    expect(t.sessions[0]!.cancelled).toBe(true);
    expect(t.phase()).toBe('idle');
    t.vc.cancel(); // idempotent
    t.vc.stop();
    expect(t.mic!.calls).toEqual([true, false]);
    t.timers.advance(MAX_LISTEN_MS * 2);
    expect(t.phase()).toBe('idle');
  });

  it('cancel while recognizing drops the result', async () => {
    const t = setup();
    t.vc.start();
    t.vc.stop();
    t.vc.cancel();
    expect(t.phase()).toBe('idle');
    await flush();
    expect(t.hand()).toEqual([]);
  });

  it('recognizer failure → generic error line', async () => {
    const t = setup();
    t.vc.start();
    t.vc.stop();
    t.sessions[0]!.reject(new Error('worker died'));
    await flush();
    expect(t.store.getState().voice.message).toBe(VOICE_FAILED);
  });

  it('mic open failure → error line, session dropped, mic closed', async () => {
    const t = setup();
    t.mic!.openResult = Promise.resolve(false);
    t.vc.start();
    await flush();
    expect(t.store.getState().voice.message).toBe(MIC_FAILED);
    expect(t.sessions[0]!.cancelled).toBe(true);
    expect(t.mic!.on).toBe(false);
    expect(t.vc.active).toBe(false);
  });

  it('a mic open that resolves after release is closed again', async () => {
    const t = setup();
    let ok!: (v: boolean) => void;
    t.mic!.openResult = new Promise((r) => (ok = r));
    t.vc.start();
    t.vc.cancel();
    expect(t.mic!.calls).toEqual([true, false]);
    ok(true);
    await flush();
    expect(t.mic!.calls).toEqual([true, false, false]);
  });

  it('a second long press while active is ignored', () => {
    const t = setup();
    t.vc.start();
    t.vc.start();
    expect(t.sessions).toHaveLength(1);
    expect(t.mic!.calls).toEqual([true]);
  });

  it('no mic (plain browser): session still runs on fed samples', async () => {
    const t = setup({ mic: null });
    t.vc.start();
    expect(t.phase()).toBe('listening');
    t.vc.feedSamples(new Float32Array(1600).fill(0.2));
    t.vc.stop();
    t.sessions[0]!.resolve('two of clubs');
    await flush();
    expect(t.hand()).toEqual(['2c']);
  });
});

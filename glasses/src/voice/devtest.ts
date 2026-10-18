/**
 * ?voicetest=1 only: `window.__vpVoiceTest(wavUrl)` runs a 16 kHz s16le mono WAV through the real pipeline
 * (controller.feed with JSON-bridge-style number[] payloads → vosk worker → transcript → store.enterSpoken),
 * with no glasses and no mic. Resolves with what happened, for headless smoke tests.
 */
import { glassesText, type Store } from '../app/store.ts';
import type { VoiceRuntime } from './runtime.ts';
import { wavPcmBytes } from './wav.ts';

export interface VoiceTestResult {
  transcript: string | null;
  reason: string | null;
  phase: string;
  message: string | null;
  glasses: string;
  loadMs: number | null;
  recognizeMs: number;
}

/** 100 ms of 16 kHz s16le per simulated audioEvent. */
const CHUNK_BYTES = 3200;

export function installVoiceTest(store: Store, voice: VoiceRuntime): void {
  const w = window as unknown as Record<string, unknown>;
  w.__vpVoice = voice;
  w.__vpVoiceTest = async (wavUrl: string, opts: { realtime?: boolean } = {}): Promise<VoiceTestResult> => {
    if (store.getState().voice.model.state !== 'ready') throw new Error(`model not ready: ${JSON.stringify(store.getState().voice.model)}`);
    await voice.warm();
    const pcm = wavPcmBytes(await (await fetch(wavUrl)).arrayBuffer());
    const vc = voice.controller;
    voice.stats.lastTranscript = null;
    voice.stats.lastReason = null;
    vc.start();
    for (let o = 0; o < pcm.length && vc.active && store.getState().voice.phase === 'listening'; o += CHUNK_BYTES) {
      vc.feed(Array.from(pcm.subarray(o, o + CHUNK_BYTES))); // number[] like a JSON-bridged Uint8List
      if (opts.realtime) await new Promise((r) => setTimeout(r, 100));
    }
    const t0 = performance.now();
    vc.stop();
    while (vc.active) await new Promise((r) => setTimeout(r, 20));
    const s = store.getState();
    return {
      transcript: voice.stats.lastTranscript,
      reason: voice.stats.lastReason,
      phase: s.voice.phase,
      message: s.voice.message,
      glasses: glassesText(s),
      loadMs: voice.stats.loadMs,
      recognizeMs: Math.round(performance.now() - t0),
    };
  };
}

/**
 * Push-to-talk controller: implements lifecycle.ts's VoiceControl (VOICE.md "Trigger", "Robustness").
 * Pure: the mic port, recognizer, store and timers are injected; no SDK import.
 *
 *   start()  long press → model not ready: phase 'error' VOICE_NO_MODEL, mic stays off. Otherwise phase
 *            'listening', open the glasses mic, feed PREROLL_MS of silence (the first word is lost without it),
 *            then stream PCM from feed(). A start while a session is active is ignored.
 *   finish   on stop() (release), MAX_LISTEN_MS without a release, or SILENCE_END_MS of quiet audio after speech:
 *            mic off → phase 'recognizing' → transcript → store.enterSpoken (it sets idle or the error line).
 *   cancel() mic off, audio dropped, phase back to idle.
 * The mic is closed on every exit path; if a mic-open result arrives after the session ended, it's closed again.
 */
import { VOICE_NO_MODEL } from '../core/voice.ts';
import type { VoiceControl } from '../bridge/lifecycle.ts';
import type { Store } from '../app/store.ts';
import { SAMPLE_RATE } from './config.ts';
import { meanAbsAmplitude, payloadToFloat32 } from './pcm.ts';
import type { RecSession, Recognizer, Timers } from './recognizer.ts';

export const PREROLL_MS = 350;
export const MAX_LISTEN_MS = 8000;
export const SILENCE_END_MS = 900;
/** Mean |sample| at or above this counts as speech (EvenChess's value; re-tune on the glasses mic). */
export const SPEECH_AMPLITUDE = 0.012;
export const MIC_FAILED = 'Mic unavailable. Hold to retry';
export const VOICE_FAILED = 'Voice error. Hold to retry';

export interface MicPort {
  /** audioControl(true, Glasses); resolves false on failure/timeout. */
  open(): Promise<boolean>;
  /** audioControl(false). Must not throw. */
  close(): Promise<unknown> | void;
}

export type FinishReason = 'release' | 'timeout' | 'silence';

export interface VoiceControllerDeps {
  store: Pick<Store, 'getState' | 'setVoicePhase' | 'enterSpoken'>;
  recognizer: Pick<Recognizer, 'session'>;
  /** The mic, once the glasses bridge is up (null in a plain browser). */
  mic: () => MicPort | null;
  timers: Timers;
  log?: (msg: string, ...data: unknown[]) => void;
  /** Observer for every finished utterance (dev test hook, logging). */
  onTranscript?: (transcript: string, reason: FinishReason) => void;
}

export interface VoiceController extends VoiceControl {
  /** One audioEvent.audioPcm payload (Uint8Array | number[] | base64). Ignored unless listening. */
  feed(payload: unknown): void;
  /** Feed already-decoded samples (dev test path). */
  feedSamples(samples: Float32Array): void;
  /** True from start() until the transcript has been applied (or the session cancelled). */
  readonly active: boolean;
}

interface Session {
  rec: RecSession;
  finishing: boolean;
  heardSpeech: boolean;
  silentSamples: number;
  maxTimer: unknown;
}

export function createVoiceController(deps: VoiceControllerDeps): VoiceController {
  const { store, recognizer, timers, log = () => {} } = deps;
  let current: Session | null = null;
  let micOn = false;

  const closeMic = () => {
    if (!micOn) return;
    micOn = false;
    try {
      void Promise.resolve(deps.mic()?.close()).catch((err: unknown) => log('mic close failed', err));
    } catch (err) {
      log('mic close threw', err);
    }
  };

  const endSession = (s: Session) => {
    if (s.maxTimer !== null) timers.clearTimeout(s.maxTimer);
    s.maxTimer = null;
    if (current === s) current = null;
  };

  const finish = (s: Session, reason: FinishReason) => {
    if (current !== s || s.finishing) return;
    s.finishing = true;
    if (s.maxTimer !== null) timers.clearTimeout(s.maxTimer);
    s.maxTimer = null;
    closeMic();
    store.setVoicePhase('recognizing');
    s.rec.finish().then(
      (transcript) => {
        if (current !== s) return;
        endSession(s);
        log(`heard "${transcript}" (${reason})`);
        deps.onTranscript?.(transcript, reason);
        store.enterSpoken(transcript);
      },
      (err: unknown) => {
        if (current !== s) return;
        endSession(s);
        log('recognition failed', err);
        store.setVoicePhase('error', VOICE_FAILED);
      },
    );
  };

  const feedSamples = (samples: Float32Array) => {
    const s = current;
    if (!s || s.finishing || samples.length === 0) return;
    s.rec.feed(samples);
    if (meanAbsAmplitude(samples) >= SPEECH_AMPLITUDE) {
      s.heardSpeech = true;
      s.silentSamples = 0;
    } else if (s.heardSpeech) {
      s.silentSamples += samples.length;
      if ((s.silentSamples * 1000) / SAMPLE_RATE >= SILENCE_END_MS) finish(s, 'silence');
    }
  };

  return {
    get active() {
      return current !== null;
    },
    start() {
      if (current) return;
      if (store.getState().voice.model.state !== 'ready') {
        store.setVoicePhase('error', VOICE_NO_MODEL);
        return;
      }
      const mic = deps.mic();
      let rec: RecSession;
      try {
        rec = recognizer.session();
      } catch (err) {
        log('session failed', err);
        store.setVoicePhase('error', VOICE_FAILED);
        return;
      }
      const s: Session = { rec, finishing: false, heardSpeech: false, silentSamples: 0, maxTimer: null };
      current = s;
      store.setVoicePhase('listening');
      rec.feed(new Float32Array((SAMPLE_RATE * PREROLL_MS) / 1000));
      s.maxTimer = timers.setTimeout(() => finish(s, 'timeout'), MAX_LISTEN_MS);
      if (!mic) return; // dev path (no glasses): audio comes from feedSamples
      micOn = true;
      mic.open().then(
        (ok) => onMicOpened(s, ok),
        (err: unknown) => {
          log('mic open failed', err);
          onMicOpened(s, false);
        },
      );
    },
    stop() {
      if (current) finish(current, 'release');
    },
    cancel() {
      const s = current;
      closeMic();
      if (!s) return;
      endSession(s);
      s.rec.cancel();
      const phase = store.getState().voice.phase;
      if (phase === 'listening' || phase === 'recognizing') store.setVoicePhase('idle');
    },
    feed(payload) {
      if (!current || current.finishing) return;
      feedSamples(payloadToFloat32(payload));
    },
    feedSamples,
  };

  function onMicOpened(s: Session, ok: boolean) {
    if (current !== s || s.finishing) {
      // The session ended while the open was in flight: make sure the mic is off.
      if (ok && !micOn) {
        micOn = true;
        closeMic();
      }
      return;
    }
    if (ok) return;
    closeMic();
    endSession(s);
    s.rec.cancel();
    store.setVoicePhase('error', MIC_FAILED);
  }
}

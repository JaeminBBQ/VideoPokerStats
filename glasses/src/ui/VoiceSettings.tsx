import { useState } from 'react';
import type { AppState, Store } from '../app/store.ts';
import { APPROX_MODEL_BYTES } from '../voice/config.ts';

/** What the Voice section needs from the voice runtime (src/voice/runtime.ts). */
export interface VoiceActions {
  download(): Promise<void>;
  retry(): Promise<void>;
  remove(): Promise<void>;
}

/** Binary MB, so the 28,303,591-byte model reads "27 MB" as in VOICE.md. */
const mb = (bytes: number) => {
  const v = bytes / 1_048_576;
  return `${v.toFixed(v >= 10 ? 0 : 1)} MB`;
};

/** VOICE.md "Phone": model status, Download / progress / Retry / Remove, and a one-line how-to. */
export function VoiceSettings({ state, voice, store, testMode }: { state: AppState; voice: VoiceActions; store: Store; testMode: boolean }) {
  const m = state.voice.model;
  const size = mb(m.totalBytes ?? APPROX_MODEL_BYTES);
  const pct = Math.round((m.progress ?? 0) * 100);
  let status: string;
  let tone = '';
  switch (m.state) {
    case 'absent':
      status = 'Speech model not downloaded';
      break;
    case 'downloading':
      status = `Downloading… ${pct}%`;
      break;
    case 'verifying':
      status = 'Verifying…';
      break;
    case 'ready':
      status = `Ready · ${mb(m.bytes ?? m.totalBytes ?? APPROX_MODEL_BYTES)} on phone`;
      tone = 'voice-ok';
      break;
    case 'error':
      status = m.error ?? 'Something went wrong';
      tone = 'voice-bad';
      break;
  }
  const busy = m.state === 'downloading' || m.state === 'verifying';
  return (
    <div className="voice">
      <div className="voice-row">
        <span className={`voice-status ${tone}`} role="status">
          {status}
        </span>
        <span className="voice-btns">
          {m.state === 'absent' && (
            <button type="button" className="vbtn vbtn-primary" onClick={() => void voice.download()}>
              Download (≈ {size})
            </button>
          )}
          {m.state === 'error' && (
            <button type="button" className="vbtn vbtn-primary" onClick={() => void voice.retry()}>
              Retry
            </button>
          )}
          {(m.state === 'ready' || m.state === 'error' || m.state === 'downloading') && (
            <button type="button" className="vbtn" onClick={() => void voice.remove()}>
              {m.state === 'downloading' ? 'Cancel' : 'Remove'}
            </button>
          )}
        </span>
      </div>
      {busy && (
        <div className="voice-bar" aria-hidden="true">
          <div style={{ width: `${m.state === 'verifying' ? 100 : pct}%` }} />
        </div>
      )}
      <p className="hint voice-howto">
        Hold the ring, say e.g. “king queen jack of spades, seven of diamonds, three of clubs”, release.
        {m.state === 'absent' && ' Downloads once over Wi-Fi or data, then works offline.'}
      </p>
      {testMode && <VoiceTestBox store={store} state={state} />}
    </div>
  );
}

/** ?voicetest=1 only: type a transcript and run it through store.enterSpoken (no glasses or mic needed). */
function VoiceTestBox({ store, state }: { store: Store; state: AppState }) {
  const [text, setText] = useState('');
  const send = () => {
    const r = store.enterSpoken(text);
    if (r.ok) setText('');
  };
  return (
    <form
      className="voice-test"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        aria-label="Voice test transcript"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="king queen jack of spades …"
        autoCapitalize="off"
        autoCorrect="off"
      />
      <button type="submit" className="vbtn">
        Say
      </button>
      <output className="hint">
        voice: {state.voice.phase}
        {state.voice.message ? ` · ${state.voice.message}` : ''}
      </output>
    </form>
  );
}

import type { AppState, Store } from '../app/store.ts';
import { VoiceSettings, type VoiceActions } from './VoiceSettings.tsx';

export function Settings({ store, state, voice, voiceTest = false }: { store: Store; state: AppState; voice?: VoiceActions; voiceTest?: boolean }) {
  return (
    <section className="settings">
      <h2 className="section-title">Settings</h2>
      <label className="toggle">
        <input type="checkbox" checked={state.letterSuits} onChange={(e) => store.setLetterSuits(e.target.checked)} />
        <span>
          Letter suits on glasses <span className="hint">(Ks instead of K♠, if symbols render wrong)</span>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={state.discreet} onChange={(e) => store.setDiscreet(e.target.checked)} />
        <span>
          Discreet mode <span className="hint">(plain rank + suit keypad: ranks first, then suits; cards show only on glasses)</span>
        </span>
      </label>
      {voice && (
        <>
          <h2 className="section-title">Voice</h2>
          <VoiceSettings state={state} voice={voice} store={store} testMode={voiceTest} />
        </>
      )}
    </section>
  );
}

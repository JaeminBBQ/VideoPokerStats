import type { Store } from '../app/store.ts';
import { CardGrid } from './CardGrid.tsx';
import { DiscreetPad } from './DiscreetPad.tsx';
import { GamePicker } from './GamePicker.tsx';
import { Settings } from './Settings.tsx';
import { useAppState } from './useStore.ts';
import type { VoiceActions } from './VoiceSettings.tsx';

/** Phone = input only: game, card grid, Undo/Clear (or the discreet keypad). The hand and the hold show on the glasses. */
export function App({ store, voice, voiceTest = false }: { store: Store; voice?: VoiceActions; voiceTest?: boolean }) {
  const state = useAppState(store);
  if (state.discreet) return <DiscreetPad store={store} state={state} />;
  return (
    <main className="app">
      <GamePicker store={store} state={state} />
      <CardGrid store={store} state={state} />
      <Settings store={store} state={state} voice={voice} voiceTest={voiceTest} />
    </main>
  );
}

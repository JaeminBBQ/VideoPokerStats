/** Phone entry: mounts the React UI, hydrates saved state, then lazily starts the glasses bridge (no-op without a host). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createAppStore } from './app/default.ts'
import { App } from './ui/App.tsx'
import { createVoiceRuntime } from './voice/runtime.ts'
import './ui/app.css'

const app = createAppStore()
const { store } = app
const voice = createVoiceRuntime(store)
// ?voicetest=1: a transcript box on the phone and window.__vpVoiceTest(wavUrl), for testing without glasses.
const voiceTest = new URLSearchParams(location.search).get('voicetest') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} voice={voice} voiceTest={voiceTest} />
  </StrictMode>,
)

void store.hydrate()
// Voice is additive: a cached model shows 'ready' without network; any failure leaves tap entry untouched.
voice.init().catch((e: unknown) => console.warn('voice init failed', e))
if (voiceTest) void import('./voice/devtest.ts').then((m) => m.installVoiceTest(store, voice))

// The SDK loads only through this dynamic import, so a plain browser never pays for it.
import('./bridge/glasses.ts')
  .then((m) => m.startGlasses(store, { storage: app.storage, engine: app.engine, voice }))
  .catch((e: unknown) => console.warn('glasses bridge unavailable', e))

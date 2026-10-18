/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Fingerprint of the engine sources that determine table contents; the worker's IndexedDB table cache
// is keyed on it, so cached tables are dropped whenever the engine or a paytable changes.
const engineHash = createHash('sha256')
for (const f of ['ev.ts', 'games.ts', 'cards.ts']) engineHash.update(readFileSync(new URL(`../src/engine/${f}`, import.meta.url)))

// The engine lives in ../src/engine; the dev server must be allowed to serve the repo root,
// or the worker request 403s (research/04-validation.md F2).
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the packaged .ehpk works whatever path the Even app serves it from.
  base: './',
  define: { __ENGINE_HASH__: JSON.stringify(engineHash.digest('hex').slice(0, 16)) },
  server: { host: true, port: 5173, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  // vosk-browser (Kaldi wasm + inline worker) is one ~5.8 MB lazy chunk by design (VOICE.md).
  build: { target: 'esnext', chunkSizeWarningLimit: 6000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})

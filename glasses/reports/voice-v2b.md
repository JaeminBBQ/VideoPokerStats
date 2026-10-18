# Voice V2b report: voice runtime + wiring (2026-10-16)

Scope: `glasses/src/**`, `app.json`, `package.json` (dep + version). Nothing in `model-host/**` or outside
`glasses/`. Nothing committed or deployed.

## TL;DR
- The full pipeline works in headless Chrome 155 against a local copy of the model host:
  Download → per-part and whole sha256 → IndexedDB → vosk model load → glasses-mic-style PCM → transcript → hand → best hold.
  All three TTS clips gave the exact transcript and the right hand or error line.
- `vosk-browser@0.0.8` (exact) bundles with Vite 8 as one lazy 5.8 MB chunk (2.38 MB gzip). Its worker is a base64
  **Blob worker** with the wasm embedded as a `data:` URI, so dist has no external file and the only fetch is the model.
- `.ehpk` is **2,338,864 bytes** (2.2 MiB), well under the ~10 MB cap.
- `MODEL_BASE_URL` is still the placeholder `https://vp-voice-model.REPLACE.workers.dev`. **Note:** `app.json` must hold the
  *origin* form, which URL lowercases, so the whitelist reads `https://vp-voice-model.replace.workers.dev`.
  `config.test.ts` enforces `whitelist == [new URL(PROD_MODEL_BASE_URL).origin]`. When you fill in the real URL, update both.

## Files
New, in `src/voice/`:
| File | What |
|---|---|
| `config.ts` | `PROD_MODEL_BASE_URL` (placeholder + TODO), `MODEL_BASE_URL` (dev-only `VITE_MODEL_BASE_URL` override via `resolveBaseUrl`), `APPROX_MODEL_BYTES`, `SAMPLE_RATE` |
| `modelStore.ts` | `parseManifest`, `progressOf`, `partUrl`, `createModelStore` (pure/injectable), `createIdbModelCache` (DB `vp-voice`, store `model`, keys `meta` and `data`) |
| `sha256.ts` | `sha256Hex` uses crypto.subtle, with a pure-JS fallback (see unknowns) |
| `recognizer.ts` | `createRecognizer` (sessions, spare recognizer, final-result counting), `voskModelLoader` (blob → blob: URL → `vosk-browser` Model), `deleteIdb` |
| `pcm.ts` | payload (Uint8Array, number[], ArrayBuffer, base64) → Int16 LE → Float32; `meanAbsAmplitude`. Adapted from EvenChess, MIT notice kept |
| `wav.ts` | minimal WAV reader for the dev hook |
| `controller.ts` | `createVoiceController`: implements lifecycle's `VoiceControl`, plus `feed(payload)` and `feedSamples` |
| `runtime.ts` | browser wiring: model store, recognizer and controller → `store.setModelStatus` / phases; init/download/retry/remove/warm/attachMic |
| `devtest.ts` | `?voicetest=1` only: `window.__vpVoiceTest(wavUrl, {realtime?})` and `window.__vpVoice` |
| tests | `config`, `pcm` (+ wav), `modelStore` (+ sha256), `recognizer`, `controller` |

New UI: `src/ui/VoiceSettings.tsx`.

Changed:
- `src/app/store.ts`: `ModelStatus.totalBytes?`, for the Download label.
- `src/bridge/lifecycle.ts`: a FOREGROUND_EXIT outside the exit dialog now calls `voice.cancel()`. Added a test.
- `src/bridge/glasses.ts`:
  - `wiring.voice` provides the mic port: `audioControl(true, AudioInputSource.Glasses)` / `audioControl(false)`, with a 4 s timeout that counts as false.
  - `audioEvent.audioPcm` goes to `controller.feed`.
  - Voice is passed to the controller, and the mic is detached on teardown.
- `src/main.tsx`: creates the runtime, runs `voice.init()`, sets the `?voicetest` flag, and passes `voice` to `startGlasses`.
- `src/ui/App.tsx`, `Settings.tsx`, `app.css`: the Voice section.
- `app.json`: version 0.3.0, permissions `g2-microphone` and `network` (whitelist = model origin).
- `package.json`: version 0.3.0, `"vosk-browser": "0.0.8"`.

## Design notes
- **Model store**
  - `init()` reads only the small `meta` record. Cached → `ready {bytes}`, with no network; otherwise `absent`.
  - `download()` is user-only:
    1. Fetches `manifest.json` (`no-store`) and validates it: hex sha256s, relative paths with no `..` or scheme, part sizes that sum to the total, and a 200 MB cap.
    2. Streams each part with `getReader()` into one preallocated buffer. Progress is emitted only on whole-percent changes.
    3. Checks each part's sha256, then sets `verifying` and checks the whole archive's sha256.
    4. Stores `meta` and `data` (an ArrayBuffer, not a Blob, to avoid WebKit Blob-in-IDB quirks) in one transaction.
  - Concurrent calls share one run. `remove()` aborts the fetch (AbortController plus a generation guard) and clears the cache.
  - Errors are short user strings, e.g. "Checksum mismatch — try again" or "Model host returned 404".
- **Recognizer**
  - Before each load it deletes the `/vosk` IndexedDB database. It then calls `new Model(blobUrl)`, waits for `load` or `error`, times out at 180 s, and revokes the URL.
  - vosk-browser's `terminate()` only posts a message, so we also `worker.terminate()` the thread on Remove.
  - It pre-creates one spare `KaldiRecognizer(16000, JSON.stringify(VOICE_WORDS))` after load and after each utterance.
  - A session that starts before the model has loaded queues up to 12 s of audio.
  - **Final transcript:** the worker answers every audio chunk with exactly one event, and `retrieveFinalResult` with one
    `result`. So the final result is event #(chunks+1). Every `result` text (Vosk endpoints mid-utterance on pauses) is
    concatenated in order. Any worker error, or 6 s with no final result, rejects.
- **Controller**
  - `start()` checks `voice.model.state === 'ready'`. If not, it sets `setVoicePhase('error', VOICE_NO_MODEL)` and the mic stays off.
  - Otherwise it sets `listening`, opens the mic, feeds 350 ms of zeros, and arms an 8 s timer.
  - It finishes on any of: release, the 8 s timeout, or 900 ms of *audio-time* silence after speech (mean |x| ≥ 0.012 counts as speech).
  - On finish: mic off → `recognizing` → `store.enterSpoken(transcript)` (it sets idle or the error line). A recognizer failure gives "Voice error. Hold to retry".
  - A mic open failure gives "Mic unavailable. Hold to retry".
  - `cancel()`: mic off, audio dropped, phase back to idle.
  - If a mic-open result arrives after the session ended, the mic is closed again.
  - Mic-off paths: finish, cancel, exit (double tap), FOREGROUND_EXIT, SYSTEM/ABNORMAL_EXIT, and pagehide/dispose (the last three via lifecycle teardown).
- **Warm-up**
  - At startup with a cached model, the model loads 2 s after boot, so it doesn't compete with the engine's first table build.
  - After a download it loads at once.
  - A delayed warm is skipped if the model was removed in the meantime. A load failure → `setModelStatus({state:'error'})`.
  - Retry with a cached model only reloads it, with no re-download.
- **Phone UI**
  - Voice section under Settings:
    - status line
    - `Download (≈ 27 MB)`: the manifest size once known, else 27 MB. MB here is MiB, to match VOICE.md.
    - progress % and a bar
    - Cancel while downloading
    - Retry and Remove on error; Remove when ready
    - one-line how-to
  - `?voicetest=1` adds a transcript box and the phase/message readout.
  - Checked at 360 px: `scrollWidth == clientWidth == 360`.

## Acceptance (inside glasses/)
```
$ npm run typecheck
> vp-hold-helper@0.3.0 typecheck
> tsc --noEmit                                  (clean)
$ npm test
 Test Files  19 passed (19)
      Tests  194 passed (194)                   (141 before; +53: voice 52, lifecycle 1)
$ npm run build
dist/assets/index-EJM5I5zK.js      395.53 kB │ gzip:   117.32 kB
dist/assets/vosk-Bir_mP0N.js     5,785.93 kB │ gzip: 2,384.43 kB
✓ built in 215ms        (plus Vite's ">500 kB chunk" warning for the vosk chunk; harmless, lazy-loaded)
$ npm run pack
Stamped vpholdhelper.ehpk (2338864 bytes)
min_app_version 2.2.10  (SDK 0.0.16, --sdk-ver)
```
The production dist contains the placeholder URL, not `localhost:8788`. The dev override only applies in dev builds.

## Browser smoke test (headless Chrome 155, CDP, no deployed host)
Setup:
- A local CORS static server on 127.0.0.1:8788 served `model-host/public` plus the scratchpad audio.
- `VITE_MODEL_BASE_URL=http://localhost:8788 npx vite`.
- The page ran at `?voicetest=1` with a 360×800 mobile viewport.
- WAVs came from `say` + `afconvert -f WAVE -d LEI16@16000 -c 1`.
- Clips were fed through `controller.feed` as **number[]** payloads in 100 ms chunks, the JSON-bridged form.

Results:
| Step | Result |
|---|---|
| Initial | "Speech model not downloaded", button "Download (≈ 27 MB)" |
| Click Download → ready | 248 ms on localhost (985 ms on a cold first run). States went downloading (66–74% label seen mid-way) → verifying → ready `{bytes: 28303591}`. Label "Ready · 27 MB on phone" |
| Model load | **745 ms** (first, auto-warm after download); **615 ms** after a page reload, loading from our IDB |
| hand1 "king queen jack of spades, seven of diamonds, three of clubs" (Samantha) | transcript exact. Glasses: `[K♠] [Q♠] [J♠]  7◆   3♣` / `HOLD K♠ Q♠ J♠` / `3 to a Royal  EV 1.4931`. 657 ms from release to result (all audio burst-fed) |
| part "king queen" | phase error, `Heard "king queen" — no suit. Hold to retry` |
| hand2 "ace of hearts, ten of clubs, eight of diamonds, four of spades, two of hearts" (Daniel) | exact. Glasses `[A♥]  T♣   8◆   4♠   2♥` / `HOLD A♥` |
| hand1 + 2 s trailing silence, real-time pacing, no release | finished by **silence** (reason `silence`), exact transcript, 4.9 s wall |
| `?voicetest` text box "ace king queen jack ten of hearts" | applied, phase idle |
| Reload | "Ready · 27 MB on phone" with **no** network request; recognition works again |
| IDB after load | `/vosk`, `vp-tables`, `vp-voice`: one vosk copy, since it is deleted before each load |
| Remove | back to "Speech model not downloaded" / Download. `/vosk` deleted |
| Long press with no model | glasses phase error, `Voice: download model on phone`, mic never opened |

Screenshots and the transcript are in `/private/tmp/claude-501/-Users-jaemin-Projects-VideoPoker/bafee554-c7bf-45ce-aac8-2f2bbd25ab51/scratchpad/v2b/`
(`ui-absent.png`, `ui-downloading.png`, `ui-ready.png`, `smoke.txt`). The harness is in `tools/serve.mjs` and `tools/drive.mjs` there. All servers
(vite, the static server, headless Chrome) were killed afterwards, and no listener is left on 5173, 8788 or 9333.

## Open device unknowns (measure on iPhone + G2)
1. **WKWebView fetching a main-thread `blob:` URL from vosk-browser's blob worker.** It works in Chrome and is untested on iOS.
   The fallback would be to transfer the ArrayBuffer to the worker, which needs a vosk-browser patch.
2. **Secure context.** `crypto.subtle` is missing on plain http, e.g. the phone loading the dev server over the LAN. The
   pure-JS sha256 fallback covers it, and it is tested against Node for edge lengths. It also matters for the packaged
   app if its origin isn't secure.
3. **Memory and time on iPhone.** Expect roughly 27 MB download buffer + ~49 MB extracted in the wasm FS + the engine tables.
   Load time is 0.6–0.75 s on a Mac, and likely several seconds on the phone. That is why warm-up runs 2 s after boot.
4. **`audioControl(true, Glasses)` result semantics and latency.** We treat no answer within 4 s as failure. Also unknown:
   whether audio events can arrive before the promise resolves (they are accepted either way).
5. **Glasses-mic levels.** `SPEECH_AMPLITUDE = 0.012` is EvenChess's value. If the casino's noise floor is above it, the
   silence auto-finish never fires, and the release or the 8 s cap still ends the utterance. Tune it on device. It is one constant
   in `controller.ts`.
6. **`audioPcm` payload form on the real host** (Uint8Array, number[] or base64). All three are handled and tested.
7. **LONG_PRESS (9) / release (10) delivery on the R1 ring vs the temple**, and whether a release can be lost. The 8 s cap covers a lost release.
8. **Whitelist casing.** The CLI or Even app may compare the whitelist literally. We use the lowercase origin.

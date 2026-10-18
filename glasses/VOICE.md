# Voice entry: v0.3.0 spec (binding)

The owner holds the R1 ring (or a temple) and says the hand, e.g. *"king queen jack of spades, seven of
diamonds, three of clubs"*, then releases. The glasses show the hand and the best hold, the same as tap entry.

## Decisions (owner, 2026-10-16)
- **Phone:** iPhone, so the Even app runs on WKWebView.
- **Engine:** offline **Vosk** via `vosk-browser`, the same approach as EvenChess (MIT, © 2026 Dustin Harmon). Recognition is
  restricted to a grammar of card words. Reading EvenChess as a reference is fine; if you copy code, keep its MIT
  notice in that file.
- **Model:** the model is too big to bundle. The whole small English model is a 41 MB zip and the package cap is about 10 MB,
  so the app **downloads it once** from a host the owner deploys, verifies it, caches it in IndexedDB, and works
  offline after that.
- **Trigger:** long-press on the ring or temple to start (`LONG_PRESS_EVENT = 9`) and release to finish
  (`LONG_PRESS_RELEASE_EVENT = 10`). Use the **glasses mic**: `audioControl(true, AudioInputSource.Glasses)`, PCM 16 kHz
  s16le mono, which arrives on `onEvenHubEvent` as `audioEvent.audioPcm`. Tap, swipes and double tap keep their current jobs.

## Model host (`glasses/model-host/`)
- `npm run model:build` (Node script, no new heavy deps):
  1. Downloads `https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip`.
  2. Trims it by dropping `graph/Gr.fst` (24 MB), after writing its word table to `graph/words.txt`. Vosk needs
     that file to load; verified in reports/voice-v1.md.
  3. Repackages it as a gzipped tar with a top folder `model/`, which is what vosk-browser expects.
  4. Splits it into parts under 24 MiB, because Cloudflare static assets cap files at 25 MiB.
  5. Writes `manifest.json`: `{ version, totalBytes, sha256, parts: [{ path, bytes, sha256 }] }`.
  The output goes to `model-host/public/` (gitignored). The model is never committed.
- `model-host/wrangler.jsonc`: a static-assets-only Worker named `vp-voice-model`, plus `public/_headers` with
  `Access-Control-Allow-Origin: *` and a long immutable cache for the parts. The owner runs `npx wrangler login` once,
  then `npm run model:deploy`.
- The app reads the model origin from one constant, `MODEL_BASE_URL` in `src/voice/config.ts`. `app.json` gets a `network`
  permission whose `whitelist` is that origin. Both are placeholders until the owner deploys and reports the URL.

## Grammar and parsing (pure, `src/core/voice.ts`)
- Vosk grammar word list:
  - ranks: `ace two three four five six seven eight nine ten jack queen king deuce`
  - suits: `spade spades heart hearts diamond diamonds club clubs`
  - filler: `of`
  - and `[unk]`
- Parse the transcript tokens left to right:
  - A rank word goes onto a pending list.
  - A suit word assigns that suit to **every pending rank**, in order, then clears the list.
    So `king queen jack of spades` gives K♠ Q♠ J♠.
  - `of` and `[unk]` are ignored.
- Errors, as values not throws:
  - `trailing-rank` (rank words with no suit at the end)
  - `suit-without-rank`
  - `duplicate` (with the card)
  - `too-many` (more than 5)
  - `empty`
- Applying the result to the store, via a new action `enterCards(cards)`:
  - 5 cards replace the hand.
  - Fewer than 5 append to the current partial hand, or start a fresh hand if the current one is complete or empty.
    This is rejected if the combined hand would exceed 5 or contain a duplicate.

## Glasses feedback
- **While listening:** the header line shows `LISTENING… release when done`, and the rest of the page is unchanged.
- **While recognizing:** `…` on the status line.
- **On success:** the normal page, with the hand and the hold.
- **On error:** a one-line message such as `Heard "king queen" — no suit. Hold to retry`, kept for about 4 s or until the next input.
  Clip it with pretext like every other line.
- **No model yet:** `Voice: download model on phone`.
- The existing format tests apply to all of these: 568 px, 10 lines, 900 bytes, every glyph present in the lens font.

## Phone
- A "Voice" section under Settings with the model status:
  - not downloaded: show a **Download (≈ N MB)** button
  - downloading: a progress percentage
  - verifying
  - ready (with the size)
  - error: show a **Retry** button
- It also has a **Remove** button.
- No auto-download, because of mobile data.

## Robustness
- Treat each of these as "finish":
  - no release event within 8 s
  - about 900 ms of silence after speech
  - the release event itself
- The mic is always turned off on finish, cancel, error, `SYSTEM_EXIT`, `ABNORMAL_EXIT` and `pagehide`.
- A long press while the exit dialog is pending is ignored.
- A long press while voice isn't ready shows the "no model" message and never opens the mic.
- Voice is additive: if anything fails, tap entry is unaffected.

## Implementation notes (from reports/voice-v1.md)
- Feed the recognizer about 350 ms of silence before the first mic chunk. Without it the first word is lost, and the correct-hand
  rate falls from 96% to 66%.
- vosk-browser caches extracted models in IndexedDB database `/vosk`, keyed by URL. Delete that database before
  `createModel(blobUrl)`, or every session leaks about 47 MB.
- Known confusions: "eight" can be heard as "ace", and "ten" can be swallowed. The lens always shows the parsed hand, so the owner can spot it.

## Version
`0.3.0` in `app.json` and `package.json`.

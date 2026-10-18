# Voice V1: model host + trimmed-model accuracy (2026-10-16)

Scope: `glasses/model-host/**` plus the `model:build` and `model:deploy` scripts in `glasses/package.json`. Nothing was
deployed and nothing was committed.

## TL;DR
- **VOICE.md step 2 is wrong as written.** If you only drop `graph/Gr.fst`, the model **fails to load**
  (`Could not read symbol table from file graph/words.txt`). `Gr.fst` carries the word symbol table. The build now extracts it to
  `graph/words.txt` (152,217 entries, 2.2 MB) before dropping `Gr.fst`. With that change, grammar recognition loads and works.
- Trimmed archive: **28,303,591 bytes (27.0 MiB)**, split into **2 parts** (20.00 MiB + 6.99 MiB).
- On natural TTS voices with a short lead-in silence, the right hand is recovered **96.3–96.7%** of the time
  (99.2% token accuracy). That is statistically the same as the untrimmed model.
- **Lead-in silence matters a lot.** With 0 ms of lead-in the hand rate drops to 66%, because the first word is lost.
  The app should feed about 300–400 ms of zero samples into the recognizer before the first mic chunk.

## vosk-browser 0.0.8 archive layout (read from source)
I read `dist/vosk.js` (the worker is embedded as base64) and the repo's `src/utils.cc`.
- `createModel(url)` → worker `load(url)` → `downloadAndExtract(url, "/vosk/" + url.replace(/\W/g, "_"))`. That does one `fetch`
  of **one URL** into MEMFS and extracts it with libarchive (`ArchiveHelper::Extract`, `strip_first_component = true`).
- **Compression:** `archive_read_support_filter_gzip` only, plus `support_format_all`.
  - gzip works, and an uncompressed tar would too.
  - xz, bzip2 and zstd are compiled to "external program", so they fail in the browser.
- **Top folder:** the first path component is stripped at the **first `/`**, so the folder name doesn't matter. `model/` is fine.
  - Entries must **not** start with `./`: `./model/am/...` would extract to `model/am/...` and break the layout.
  - There must be a single top folder.
  - Our tar has 19 ustar entries, all `model` or `model/...`, verified in the build.
- **Files Vosk looks for** under the extracted dir:
  - `am/final.mdl`, `conf/mfcc.conf` and `conf/model.conf`
  - `ivector/*`
  - `graph/HCLG.fst`, or else `graph/HCLr.fst` + `graph/Gr.fst`
  - words from the FST output symbols, else `graph/words.txt`

  The wasm contains the `/graph/words.txt` fallback string, so the same fix applies in the browser.
- **Caching (important for the app):** vosk-browser mounts IDBFS at `/vosk`, which is an IndexedDB database named `"/vosk"`. It caches
  the extracted model under a key derived from the **model URL**, with an `extracted.ok` marker. Our model comes in parts, so the
  app will reassemble a Blob and pass a `blob:` URL, which is different every session. That means vosk-browser re-extracts
  each session and **leaves another ~47 MB copy in IDB each time**. Recommendation for the app agent:
  - Keep the verified `.tar.gz` Blob in the app's own IndexedDB store.
  - Call `indexedDB.deleteDatabase("/vosk")` before each `createModel(blobUrl)`, or after load, once synced.

  Fetching a main-thread `blob:` URL from vosk-browser's blob-URL worker is untested on WKWebView. Check it on the phone.

## Sizes
| Artifact | Bytes |
|---|---|
| Source zip `vosk-model-small-en-us-0.15.zip` | 41,205,931 (39.30 MiB), sha256 `30f26242…942498` (pinned) |
| Unzipped full model | 70,898,967 (Gr.fst 24,013,795; HCLr.fst 22,416,994; final.mdl 15,962,575; final.ie 8,288,887) |
| Trimmed folder (−Gr.fst −README +words.txt) | ≈ 49.2 MB (48,032 KiB on disk) |
| **Trimmed `model.tar.gz`** | **28,303,591 (26.99 MiB)**, sha256 `154c460e…b2fd7` |
| part000 | 20,971,520 (20.00 MiB) |
| part001 | 7,332,071 (6.99 MiB) |

Notes:
- `words.txt` costs about 0.8 MiB compressed. Without it the archive would be 26.2 MiB but unusable.
- The build is reproducible: two builds and a fresh download all gave the same sha256.
- Parts live at `parts/<sha16>/…`, so the immutable cache is safe across rebuilds.
- `manifest.json` has `version: "small-en-us-0.15-trim.2"`.
- For the phone UI, the download size is "≈ 27 MB".

The Gr.fst symbol table has `<s>` and `</s>` sharing key 152216, and key 152215 is unused. `words.txt` reproduces this
faithfully, and Vosk loads it the same way as the embedded table.

## Accuracy (`model-host/accuracy/run.py`, vosk 0.3.44 Python, trimmed folder without Gr.fst)
Setup:
- **Utterances:** 41 in `accuracy/utterances.txt`:
  - 7 full hands in rank-of-suit form
  - 10 grouped (e.g. "ace king queen jack ten of spades", "king queen jack of spades seven of diamonds three of clubs")
  - 4 mixing singular and plural suits
  - 6 partial hands
  - 7 tens/mixed
  - 1 all-hearts hand
  - 4 noise/irrelevant
- **Voices:** 7 `say` voices: Samantha, Daniel (GB), Karen (AU), Moira (IE), Rishi (IN), Reed (US) and Fred. Fred is a 1980s
  robotic voice, kept as a stress test.
- **Audio and grammar:** clips are converted with `afconvert -d LEI16@16000 -c 1` and fed in 250 ms chunks. The grammar is the
  VOICE.md word list plus `[unk]`.
- **Metrics:**
  - *exact*: the transcript matches what was said, ignoring `[unk]`.
  - *norm*: an exact match after treating spade/spades and two/deuce as the same.
  - *hand*: the VOICE.md parser gives exactly the said cards. For noise lines, a pass means no cards get entered.
  - *token acc*: computed on normalized tokens, card lines only.

**Default run: 400 ms lead-in silence, 300 ms trail (287 clips)**
| Voice | exact | norm | hand | token acc |
|---|---|---|---|---|
| Samantha | 33/41 | 40/41 | **41/41** | 100.0% |
| Daniel | 34/41 | 40/41 | **41/41** | 100.0% |
| Karen | 38/41 | 41/41 | **41/41** | 100.0% |
| Moira | 35/41 | 38/41 | 38/41 | 99.2% |
| Rishi | 25/41 | 37/41 | 38/41 | 98.5% |
| Reed (US) | 25/41 | 31/41 | 38/41 | 97.7% |
| Fred (robotic) | 6/41 | 6/41 | 21/41 | 70.9% |
| **All 7** | 196/287 (68.3%) | 233/287 (81.2%) | **258/287 (89.9%)** | 95.2% |
| **6 natural voices** | 190/246 (77.2%) | 227/246 (92.3%) | **237/246 (96.3%)** | **99.2%** |

"exact" is low mostly because of harmless differences: spade vs spades and a dropped "of". The parser ignores both.

**Lead-in silence sweep** (hand rate, 6 natural voices / all 7):
| Lead-in | Hand rate, 6 natural | Hand rate, all 7 | Token acc, 6 natural |
|---|---|---|---|
| 0 ms | 66.3% | 61.7% | 95.6% |
| 150 ms | 96.7% | 92.0% | 99.3% |
| 400 ms | 96.3% | 89.9% | 99.2% |

At 0 ms, the first word is regularly lost or becomes `[unk]`. For example, "king of spades" is heard as "of spades" and gives
a `suit-without-rank` error.

**Trimmed vs full model** (same clips, 400 ms): the full model with Gr.fst gets hand 264/287 (all 7) and 240/246 (natural).
The trimmed model gets 258/287 and 237/246.
- Almost all of the gap is Fred (21 vs 24).
- Within one process, Vosk re-decodes 12 of the 287 clips differently on a second pass with the same model. Results are stable
  across fresh processes, where repeat runs gave identical totals.
- So a few-clip gap is within noise. The grammar recognizer never touches Gr.fst (vosk-api `recognizer.cc`
  `UpdateGrammarFst` composes `HCLr` with a G built from the grammar).

**Failures on natural voices (400 ms), 9 of 246:**
- **eight → ace (Moira, 3×):** the "eight" cards come out as aces, for example 8♦ → A♦. This gives a *valid but wrong* hand,
  which is the most dangerous failure. The lens must show the parsed hand clearly so the owner can catch it.
- **ten → `[unk]` (Rishi, 2×) and four → `[unk]` (Rishi, 1×):** the suit is orphaned and the result is a `suit-without-rank` error,
  which is safe.
- **"ten" swallowed after another rank (Reed, 3×):** "nine ten of spades" → "nine of spades", "ten jack queen" → "jack queen". This
  gives a valid hand that is missing one card, so the owner sees 4 cards where 5 were said.

**Noise:** all 4 phrases × 6 natural voices entered no cards. "thanks have a good night" is heard as `[unk] nine`, which gives
`trailing-rank`, so an error is shown.

**Free-form recognizer** (no grammar, for the record):
- Trimmed model: `KaldiRecognizer(model, 16000)` → `Can't create decoding graph` / "Failed to create a recognizer". This is expected
  without Gr.fst.
- Full model: it works, and decodes the Samantha royal-flush clip perfectly.

**Caveat:** this is clean TTS audio. Real glasses-mic audio in a casino will be worse. Treat these numbers as an upper bound
and re-measure on device.

## Timing (MacBook, Python vosk 0.3.44, native)
| Measurement | Result |
|---|---|
| Trimmed model load | 0.14–0.15 s |
| Full model load | 0.21 s |
| Recognition, 287 clips | 6.9 s for 1,076 s of audio, a real-time factor of **0.0064** |
| Per clip, including creating a grammar recognizer | ~24 ms |
| Build (`npm run model:build`) | ~5 s with a cached zip; ~10 s including the 39 MiB download |

Expect the iPhone WKWebView wasm build to be one to two orders of magnitude slower, plus the first-time extract and IDB sync of
about 49 MB. Measure it on the device.

## Files
- `model-host/scripts/build-model.mjs`: the build (Node 24, stdlib only, plus `unzip`, `tar` and `gzip`).
- `model-host/wrangler.jsonc`: `vp-voice-model`, assets `./public`, `compatibility_date` 2026-10-01, no `main`.
  It was **not** validated with wrangler: the auto-mode classifier blocked `wrangler deploy --dry-run`. The owner's first deploy validates it.
- `model-host/.gitignore`: `public/`, `.cache/`, `.wrangler/`.
- `model-host/README.md`: owner steps.
- `model-host/accuracy/run.py` and `utterances.txt`: the rerunnable harness. Generated audio stays in the scratchpad.
- `package.json`: added `model:build` and `model:deploy` only.

## Owner deploy steps
1. Build: `cd glasses && npm run model:build`
2. Log in to Cloudflare, once: `npx wrangler login`
3. Deploy: `npm run model:deploy`
4. Check: `curl -sI https://vp-voice-model.<sub>.workers.dev/manifest.json` should return 200 with `access-control-allow-origin: *`.
5. Report the `https://vp-voice-model.<sub>.workers.dev` URL. It goes into `MODEL_BASE_URL` and the `app.json` network whitelist.

## Asks for the app agent
- Pre-roll about 300–400 ms of zero PCM into the recognizer.
- Clear the `/vosk` IndexedDB database around `createModel(blobUrl)`.
- Show the parsed hand prominently. The eight/ace confusion and the swallowed "ten" produce valid-looking wrong hands.
- Correct VOICE.md step 2 to "extract words.txt from Gr.fst, then drop Gr.fst".

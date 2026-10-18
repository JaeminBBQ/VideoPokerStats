# Voice model host

This folder serves the trimmed Vosk English model that the glasses app downloads once for voice entry
(`glasses/VOICE.md`). It's a static-assets-only Cloudflare Worker named `vp-voice-model`. The model itself is never committed:
`public/` and `.cache/` are gitignored.

## Owner steps (run from `glasses/`)

1. Build the model:

   ```sh
   npm run model:build
   ```

   This downloads `vosk-model-small-en-us-0.15.zip` (39 MiB) from alphacephei.com into `model-host/.cache/` and checks its
   pinned sha256. It then writes `model-host/public/`:
   - `manifest.json`
   - `_headers`
   - `parts/<sha16>/model.tar.gz.part000`, `part001` (about 27 MiB in total)

   The build is reproducible: the same zip always gives the same sha256.
2. Log in to Cloudflare. You only do this once per machine; it opens a browser:

   ```sh
   npx wrangler login
   ```

3. Deploy:

   ```sh
   npm run model:deploy
   ```

   This runs `npx -y wrangler@4 deploy --config model-host/wrangler.jsonc`.
4. Check it from the URL that wrangler prints, `https://vp-voice-model.<your-subdomain>.workers.dev`:

   ```sh
   curl -sI https://vp-voice-model.<sub>.workers.dev/manifest.json   # expect 200 and access-control-allow-origin: *
   curl -s  https://vp-voice-model.<sub>.workers.dev/manifest.json
   ```

5. Report that URL to Claude. It becomes `MODEL_BASE_URL` in `src/voice/config.ts` and the `network` whitelist entry in `app.json`.

To redeploy after a recipe change, rerun steps 1 and 3. New parts get new content-addressed paths, so caches never serve
stale bytes.

## What the build does
- **Adds `graph/words.txt`.** It extracts the word symbol table from `graph/Gr.fst`'s header. Vosk reads word symbols
  from HCLG/Gr and falls back to `graph/words.txt` (vosk-api `model.cc`; vosk-browser's wasm has the same fallback).
  Without `words.txt`, a model with no `Gr.fst` **fails to load**.
- **Drops `graph/Gr.fst` (24 MB) and `README`.** Grammar recognizers build their own G from the word list and only need `HCLr.fst`.
  A free-form recognizer (no grammar) can't be created on the trimmed model. That's expected.
- **Packs a ustar tar of `model/...`.** It uses no `./` prefix, no macOS metadata, uid/gid 0 and fixed mtimes, then compresses it with `gzip -n -9`.
- **Splits the archive into 20 MiB parts.** Cloudflare caps static assets at 25 MiB per file.
- **Writes `manifest.json`** as `{ version, totalBytes, sha256, parts: [{ path, bytes, sha256 }] }`.
  `sha256` is the hash of the whole reassembled `.tar.gz`.
- **Writes `_headers`.**
  - All paths: `Access-Control-Allow-Origin: *`.
  - Parts: `Cache-Control: immutable` for one year.
  - `manifest.json`: `max-age=60`.

Environment overrides:
- `VOSK_ZIP=/path/to.zip` uses a local copy of the zip (it is still hash-checked).
- `VOSK_CACHE_DIR=/path` changes the cache and work directory.

## Accuracy harness
`accuracy/run.py` tests the trimmed model and grammar against macOS `say` voices. Setup and usage are in its docstring.
The results are in `glasses/reports/voice-v1.md`.

## License
The model is "US English model for mobile Vosk applications", © 2020 Alpha Cephei Inc., Apache-2.0
(https://alphacephei.com/vosk/models).

/**
 * Voice model host (VOICE.md "Model host"). One constant; `app.json`'s `network` whitelist must list exactly
 * `new URL(MODEL_BASE_URL).origin` (config.test.ts enforces it).
 * Deployed by the owner with `npm run model:deploy` (model-host/README.md).
 */
export const PROD_MODEL_BASE_URL = 'https://vp-voice-model.contact-jaemin.workers.dev';

/**
 * The base URL the app actually uses. In dev builds only, `VITE_MODEL_BASE_URL` (e.g. a local static server for
 * a smoke test) takes precedence; production always uses the constant.
 */
export const MODEL_BASE_URL: string = resolveBaseUrl(import.meta.env?.DEV === true, import.meta.env?.VITE_MODEL_BASE_URL);

export function resolveBaseUrl(dev: boolean, override: unknown): string {
  const base = dev && typeof override === 'string' && override.trim() ? override.trim() : PROD_MODEL_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** Shown before the manifest is fetched (reports/voice-v1.md: 28,303,591 bytes). */
export const APPROX_MODEL_BYTES = 28_303_591;

/** Vosk sample rate: the glasses mic delivers 16 kHz s16le mono. */
export const SAMPLE_RATE = 16000;

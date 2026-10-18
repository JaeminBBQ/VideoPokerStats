# Voice V2a report: pure voice core + contract (2026-10-16)

Scope: SDK-free, DOM-free voice core. No UI, main.tsx, glasses.ts, package.json, app.json or model-host changes.
Files: new `src/core/voice.ts` (+ `voice.test.ts`); changed `src/core/format.ts`, `src/core/input.ts`,
`src/app/store.ts`, `src/bridge/lifecycle.ts` (+ their tests), and `src/bridge/events.ts` (two lines: SDK names
for the new EVT keys; `SDK_EVENT_NAMES` is typed over `keyof EVT`, so it would not compile otherwise).

## src/core/voice.ts
```ts
export const RANK_WORDS: Readonly<Record<string, number>>;   // word → engine rank (deuce = two = 0)
export const SUIT_WORDS: Readonly<Record<string, number>>;   // singular/plural → engine suit (c d h s)
export const VOICE_WORDS: readonly string[];                 // exact VOICE.md grammar incl. 'of', '[unk]' → Vosk grammar
export type VoicePhase = 'idle' | 'listening' | 'recognizing' | 'error';
export const MAX_CARDS = 5;
export type VoiceError =                                     // heard = transcript grammar words, lowercase, no [unk]
  | { kind: 'empty'; heard: string }
  | { kind: 'trailing-rank'; heard: string; words: string[] }
  | { kind: 'suit-without-rank'; heard: string; suit: string }
  | { kind: 'duplicate'; heard: string; card: Card; inHand: boolean }
  | { kind: 'too-many'; heard: string; count: number };
export type ParseResult = { ok: true; cards: Card[] } | { ok: false; error: VoiceError };
export type ApplyResult = { ok: true; entry: EntryState } | { ok: false; error: VoiceError };
export function tokenize(transcript: string): string[];
export function parseSpoken(transcript: string): ParseResult;
export function applySpoken(entry: EntryState, cards: readonly Card[], heard?: string): ApplyResult;
export const VOICE_NO_MODEL = 'Voice: download model on phone';
export function voiceErrorMessage(e: VoiceError, letterSuits?: boolean): string;
//   'Heard "king queen" — no suit. Hold to retry' | 'Heard nothing. Hold to retry' | 'Heard "spades" with no card. …'
//   'K♠ said twice. …' | 'K♠ already in hand. …' | '6 cards — max 5. Hold to retry'
```
Off-grammar words are ignored like `of`/`[unk]` (lookups are own-property only, so "constructor" is not a word).
applySpoken: 5 → `entryFromHand`; <5 → onto the partial hand via `Entry.tapCard` (armed slot, then gaps), or a
fresh hand when the current one is empty/complete; rejects >5 combined (`too-many`) or a card already held
(`duplicate`, `inHand: true`).

## src/app/store.ts (backward compatible; doc comment updated)
```ts
export interface ModelStatus { state: 'absent'|'downloading'|'verifying'|'ready'|'error'; progress?: number /*0..1*/; bytes?: number; error?: string }
export interface VoiceState { phase: VoicePhase; message: string | null; model: ModelStatus }
export type EnterResult = { ok: true } | { ok: false; error: VoiceError };
export interface Timers { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }
export const VOICE_ERROR_MS = 4000;
AppState.voice: VoiceState                    // initial { phase: 'idle', message: null, model: { state: 'absent' } }
StoreDeps.timers?: Timers                     // default globalThis timers
Store.enterCards(cards: Card[]): EnterResult
Store.enterSpoken(transcript: string): EnterResult   // parseSpoken + enterCards; message formatted with letterSuits
Store.setVoicePhase(phase: VoicePhase, message?: string | null): void   // message kept only for 'error'
Store.setModelStatus(status: ModelStatus): void
export type { VoiceError, VoicePhase }        // re-exported
```
- enterCards/enterSpoken success: voice → idle, hand set like taps (persisted, analysis on 5 cards). Saying the
  same complete hand again is a no-op (keeps result and cycle). Invalid card numbers → `empty` error.
- Rejection: hand untouched, `voice.phase = 'error'` with the one-line message, returned error.
- An error auto-clears after 4 s, or on the next hand change, game change, or hold input (next/prev/reset even
  when the cycle doesn't move: "until the next input"); merged into the same notify. setLetterSuits/model updates
  don't clear it. Re-raising restarts the 4 s; any non-error phase cancels the timer.
- No-model: the voice agent calls `store.setVoicePhase('error', VOICE_NO_MODEL)` (auto-clears like any error).
- `glassesText` passes `voice` through to format.

## src/core/format.ts
`GlassesView.voice?: { phase: VoicePhase; message: string | null }` (omitted = idle);
`LISTENING_HEADER = 'LISTENING… release when done'`, `RECOGNIZING_STATUS = '…'`, `VOICE_ERROR_FALLBACK`.
Listening replaces only the header. Recognizing/error replace the idle/partial status line, or are appended as the
last line under a result. Messages are whitespace-collapsed to one line and clipped with pxTruncate.
`…` (U+2026), `—`, `"` are all in the lens font (getAdvW > 0). The exhaustive test now also runs 18 voice states
(incl. longest messages, both suit styles) on every game × hand for cycle #1, #2, #32, partial and loading pages.

## src/core/input.ts
```ts
EVT.LONG_PRESS = 9; EVT.LONG_RELEASE = 10
type InputAction = … | 'talkStart' | 'talkEnd'
```
mapInput priority: double, swipe, talkEnd, talkStart, tap, lifecycle (long press beats the CLICK an empty
envelope reads as). Gate: talkEnd after talkStart is always accepted (any speed), and vice versa; only a repeat
of the same talk action within 300 ms is dropped. Talk doesn't affect tap/swipe throttles.

## src/bridge/lifecycle.ts
```ts
export interface VoiceControl { start(): void; stop(): void; cancel(): void }   // must be idempotent
ControllerDeps.voice?: VoiceControl
```
talkStart → `dialogUp()` (stale-dialog recovery applies) then `voice.start()`; ignored while the dialog is up.
talkEnd → `voice.stop()` always (even during exitPending). exit (double tap) → `voice.cancel()` before shutDown;
teardown (SYSTEM/ABNORMAL_EXIT, dispose/pagehide) → `voice.cancel()` (exceptions logged, teardown continues).
Without `voice`, long press/release return null. FOREGROUND_EXIT (backgrounded) does not cancel; the voice
module's 8 s timeout covers it, or add it there if hardware shows the mic staying open.

## For the next agent (glasses.ts / voice module)
- Feed `audioEvent.audioPcm` to the recognizer; give `createGlassesController` a `voice` whose start() checks
  `store.getState().voice.model.state === 'ready'` (else `setVoicePhase('error', VOICE_NO_MODEL)`, mic stays off),
  sets 'listening', opens the mic; stop() → 'recognizing', closes the mic, then `store.enterSpoken(transcript)`.
- Use `VOICE_WORDS` (JSON-stringified) as the Vosk grammar.

## Acceptance (inside glasses/)
```
$ npm run typecheck
> tsc --noEmit                      (clean)
$ npm test
 Test Files  14 passed (14)
      Tests  141 passed (141)
$ npm run build
dist/assets/index-DrEYNiTM.js    378.56 kB │ gzip: 110.47 kB
✓ built in 123ms
```

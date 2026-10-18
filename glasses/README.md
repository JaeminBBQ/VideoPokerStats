# VP Hold Helper (Even Realities G2)

Enter the 5 dealt cards with ring/temple gestures (or tap them on the phone, or say them); the G2 lenses
show the best hold. A separate project from the VideoPoker trainer at the repo root. It imports the verified engine from `../src/engine/` read-only.
See `CONTEXT.md`, `SPEC.md`, `DECISIONS.md` and `research/`.

## Usage (v0.4.0, CODE.md)

The lens always shows what each gesture does. Per card:

1. **Group:** tap = A K Q J, ↑ = 10 9 8 7, ↓ = 6 5 4 3 2. (Double tap = back: reopen the last card.)
2. **Rank:** ↓ next, ↑ previous (wraps), double tap = select, tap = back.
3. **Suit:** ↑ = red (♥, again for ◆), ↓ = black (♠, again for ♣), double tap = add the card, tap = back.

After the 5th card the best hold shows. Then tap / ↑ / ↓ starts the next hand (and picks its first group);
double tap reopens the 5th card to fix it. Examples: A♠ = tap, dbl, ↓, dbl; 8♥ = ↑, ↓, ↓, dbl, ↑, dbl.
Long press = voice (hold, say the hand, release). Exit with the system's tap-then-hold gesture; the app no
longer uses double tap for exit. Phone taps and voice still work and share the same hand.

## Commands (run inside `glasses/`)

```sh
npm install
npm run dev         # Vite dev server on :5173 (host: true, so the phone can reach it)
npm test            # Vitest (pure logic + engine-backed tests, ~15 s: builds tables for every game)
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + vite build → dist/
```

### Simulator

```sh
npm run dev                     # shell 1
npm run sim                     # shell 2: evenhub-simulator http://localhost:5173
# scripted smoke tests: npx evenhub-simulator --automation-port 9898 http://localhost:5173
```

The simulator can't emit R1 ring events (it hardcodes the glasses as the source); test the ring on hardware.

### Sideload to the real G2 (QR)

```sh
npm run dev
npx -y @evenrealities/evenhub-cli@0.1.14 qr --url "http://$(ipconfig getifaddr en0):5173"
```

Scan the QR with the Even app on the phone (same Wi-Fi network).

### Package (.ehpk)

```sh
npm run pack        # build, then evenhub-cli pack app.json dist -o vpholdhelper.ehpk --sdk-ver 0.0.16
```

The CLI is run through `npx` on purpose: it declares a TypeScript 5 peer dependency that conflicts with TS 6.

## Layout

- `src/core/`: pure, unit-tested logic (cards, hand entry, hold ranking, glasses text, input mapping, storage).
- `src/engine/`: the glasses-local engine worker (inlined with `?worker&inline`) and its promise client.
- `src/app/store.ts`: app state and actions; `src/app/default.ts` wires the worker and localStorage.
- `src/bridge/` (Phase 2b): the only runtime importer of `@evenrealities/even_hub_sdk`.
- `src/ui/` (Phase 2a): the React phone UI.

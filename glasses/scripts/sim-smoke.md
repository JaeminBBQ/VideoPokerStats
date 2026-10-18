# Simulator smoke test

The Even Hub simulator (`@evenrealities/evenhub-simulator` 0.9.5, a devDependency) runs the app in a desktop
WebView with a fake Even App host, so `startGlasses` detects a host, creates the page and receives input.
It can't simulate the R1 ring (it hardcodes `eventSource = 1`, the right temple) and has no system
tap-then-hold exit, so exit (SYSTEM_EXIT) still needs the real glasses.

## By hand
```bash
cd glasses
npm run dev          # Vite on http://localhost:5173
npm run sim          # second shell: evenhub-simulator http://localhost:5173 (opens a window)
```
Enter a hand on the phone UI in the simulator window, or with code-entry gestures in the glasses pane (v0.4.0,
CODE.md: e.g. K♠ = click, down, double_click, down, double_click); the glasses pane shows the best hold.
Double tap is a code gesture (back / fix last card); the app no longer exits on it.

## Scripted (automation API)
```bash
npx evenhub-simulator http://localhost:5173 --automation-port 9898
curl -s http://127.0.0.1:9898/api/ping                                   # pong
curl -s -X POST http://127.0.0.1:9898/api/input \
     -H 'content-type: application/json' -d '{"action":"down"}'         # up | down | click | double_click | long_press …
curl -s http://127.0.0.1:9898/api/screenshot/glasses -o glasses.png      # 576×288 lens framebuffer
curl -s http://127.0.0.1:9898/api/screenshot/webview -o phone.png        # the phone WebView
curl -s http://127.0.0.1:9898/api/console                                # captured console (JSON; ?since_id=N)
```
`bash scripts/sim-smoke.sh [outdir]` does all of this: it starts Vite on 5175 and the simulator on 9898, enters
K♠ Q♠ J♠ 7◆ 3♣ by gestures alone with a screenshot after each card (and at a few steps inside the first), then
fixes the last card and starts a new hand, saves the console, then kills both. Bridge debug lines appear in the
console as `[glasses] input {...}` with raw timing (`t`, `dt` ms) (dev builds only).

What the simulator delivers (observed 2026-10-16): swipes arrive on `textEvent` (`eventType` 1/2), a tap arrives as
`sysEvent` with no `eventType` (= CLICK), and a double tap arrives as `sysEvent.eventType = 3`.

Note: the automation API can't tap the phone UI, so the script on the real `index.html` only shows the idle page
unless a hand was already saved in the simulator's localStorage.

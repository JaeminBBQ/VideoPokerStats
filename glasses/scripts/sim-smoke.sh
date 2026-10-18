#!/usr/bin/env bash
# Scripted simulator smoke test (see scripts/sim-smoke.md). Run from glasses/: bash scripts/sim-smoke.sh [outdir]
# Starts Vite on 5175 and the simulator with the automation API on 9898, takes glasses screenshots around a
# few inputs, dumps the webview console, then kills both.
set -u
OUT="${1:-${TMPDIR:-/tmp}/vp-sim-smoke}"
VITE_PORT="${VITE_PORT:-5175}"
AUTO="${AUTO_PORT:-9898}"
API="http://127.0.0.1:$AUTO/api"
mkdir -p "$OUT"
npx vite --port "$VITE_PORT" --strictPort >"$OUT/vite.log" 2>&1 &
VITE_PID=$!
npx evenhub-simulator "http://localhost:$VITE_PORT" --automation-port "$AUTO" >"$OUT/sim.log" 2>&1 &
SIM_PID=$!
cleanup() { kill "$SIM_PID" "$VITE_PID" 2>/dev/null; pkill -P "$SIM_PID" 2>/dev/null; pkill -P "$VITE_PID" 2>/dev/null; pkill -f "evenhub-simulator .*--automation-port $AUTO" 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 60); do curl -sf "$API/ping" >/dev/null && break; sleep 0.5; done
sleep "${BOOT_WAIT:-6}"   # page load + bridge + createStartUpPageContainer
shot() { curl -sf "$API/screenshot/glasses" -o "$OUT/$1.png" && echo "shot $1"; }
input() { curl -sf -X POST "$API/input" -H 'content-type: application/json' -d "{\"action\":\"$1\"}" && echo " input $1"; sleep 0.6; }

shot 00-boot
# Code entry (CODE.md): K♠ Q♠ J♠ 7◆ 3♣ by gestures alone. A complete saved hand makes the first gesture a
# new-hand GROUP choice, which is also what K♠ needs (click = A K Q J), so this works from any saved state
# except a saved partial hand; start from a cleared hand if the first shot shows cards.
input click;        shot 01-K-group
input down;         shot 02-K-rank
input double_click; shot 03-K-suit
input down;         shot 04-K-spade
input double_click; shot 05-Ks
for g in click down down double_click down double_click; do input $g; done; shot 06-Qs
for g in click up double_click down double_click; do input $g; done; shot 07-Js
for g in up up double_click up up double_click; do input $g; done; shot 08-7d
for g in down up up double_click down down double_click; do input $g; done
sleep 1.5; shot 09-3c-result
input double_click; shot 10-fix-last
input down;         shot 11-fix-3s
input double_click; sleep 1.5; shot 12-fixed-result
input down;         shot 13-new-hand-group-6
curl -sf "$API/screenshot/webview" -o "$OUT/webview.png" && echo "shot webview"
curl -sf "$API/console" >"$OUT/console.json" && echo "console saved"

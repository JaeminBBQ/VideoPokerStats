#!/usr/bin/env python3
"""Accuracy harness for the trimmed Vosk model + card grammar (glasses/VOICE.md).

Generates speech with macOS `say`, converts it to 16 kHz mono s16le WAV with `afconvert`
(the same format as the glasses mic), pads it with silence, and runs it through vosk's
KaldiRecognizer with the VOICE.md grammar, fed in 250 ms chunks like streamed mic PCM.

Setup (once):
    python3 -m venv $SCRATCH/venv && $SCRATCH/venv/bin/pip install vosk
    npm run model:build            # leaves the trimmed model at model-host/.cache/work/model

Run (from glasses/):
    $SCRATCH/venv/bin/python -I model-host/accuracy/run.py \
        --model model-host/.cache/work/model --audio-dir $SCRATCH/voice-audio

Options:
    --voices "Samantha,Daniel,..."   say voices (default below)
    --lead-ms 400 --trail-ms 300     silence padding (a real press-then-speak has lead-in silence)
    --no-grammar                     also try the free-form recognizer (needs Gr.fst; reports the failure)
    --model-full DIR                 untrimmed model folder: compare its hand accuracy with the trimmed one
    --json-out FILE                  write all results as JSON

Metrics (per clip):
    exact   transcript == said, ignoring [unk]
    norm    exact after normalizing singular/plural suits and two/deuce (what the parser actually cares about)
    hand    parse(heard) gives exactly the cards of parse(said); for noise lines, no cards are entered
    token accuracy = 1 - edit_distance/len(said) over normalized tokens, card lines only
"""
import argparse
import array
import json
import os
import subprocess
import sys
import time
import wave

RANKS = {"two": 2, "deuce": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
         "nine": 9, "ten": 10, "jack": 11, "queen": 12, "king": 13, "ace": 14}
SUITS = {"spade": "s", "spades": "s", "heart": "h", "hearts": "h", "diamond": "d", "diamonds": "d",
         "club": "c", "clubs": "c"}
GRAMMAR = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen",
           "king", "deuce", "spade", "spades", "heart", "hearts", "diamond", "diamonds", "club", "clubs",
           "of", "[unk]"]
DEFAULT_VOICES = ["Samantha", "Daniel", "Karen", "Moira", "Rishi", "Reed (English (US))", "Fred"]
HERE = os.path.dirname(os.path.abspath(__file__))


def parse(tokens):
    """Mirror of the VOICE.md parser: ranks pend until a suit word assigns them. Returns (cards, error)."""
    pending, cards = [], []
    for t in tokens:
        if t in RANKS:
            pending.append(RANKS[t])
        elif t in SUITS:
            if not pending:
                return cards, "suit-without-rank"
            for r in pending:
                c = (r, SUITS[t])
                if c in cards:
                    return cards, "duplicate"
                cards.append(c)
            pending = []
    if pending:
        return cards, "trailing-rank"
    if len(cards) > 5:
        return cards, "too-many"
    if not cards:
        return cards, "empty"
    return cards, None


def norm(tokens):
    out = []
    for t in tokens:
        if t == "[unk]":
            continue
        if t in SUITS:
            t = {"s": "spades", "h": "hearts", "d": "diamonds", "c": "clubs"}[SUITS[t]]
        elif t == "deuce":
            t = "two"
        out.append(t)
    return out


def edit_distance(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[len(b)]


def load_utterances():
    out = []
    with open(os.path.join(HERE, "utterances.txt")) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            noise = line.startswith("noise:")
            text = line[6:].strip() if noise else line
            if not noise:
                cards, err = parse(text.split())
                if err:
                    raise SystemExit(f"utterance does not parse ({err}): {text}")
            out.append((text, noise))
    return out


def synth(text, voice, path):
    if os.path.exists(path):
        return
    aiff = path + ".aiff"
    subprocess.run(["say", "-v", voice, "-o", aiff, text], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, path], check=True)
    os.remove(aiff)


def read_pcm(wav_path, lead_ms, trail_ms):
    with wave.open(wav_path, "rb") as wf:
        assert wf.getframerate() == 16000 and wf.getnchannels() == 1 and wf.getsampwidth() == 2
        data = wf.readframes(wf.getnframes())
    pad = lambda ms: array.array("h", [0] * (16 * ms)).tobytes()  # noqa: E731
    data = pad(lead_ms) + data + pad(trail_ms)
    return data, len(data) / 32000


def recognize(model, pcm, grammar):
    from vosk import KaldiRecognizer
    t0 = time.perf_counter()
    rec = KaldiRecognizer(model, 16000, json.dumps(grammar)) if grammar else KaldiRecognizer(model, 16000)
    texts = []
    for i in range(0, len(pcm), 8000):  # 250 ms chunks
        if rec.AcceptWaveform(pcm[i:i + 8000]):
            texts.append(json.loads(rec.Result())["text"])
    texts.append(json.loads(rec.FinalResult())["text"])
    return " ".join(t for t in texts if t).split(), time.perf_counter() - t0


def score(model, clips, voices, label):
    res = {"per_voice": {}, "failures": []}
    keys = ("n", "exact", "norm", "hand", "tok_err", "tok_n")
    tot = dict.fromkeys(keys, 0)
    tot["rec_s"] = tot["audio_s"] = 0.0
    print(f"--- {label}")
    for voice in voices:
        pv = dict.fromkeys(keys, 0)
        for v, text, noise, pcm, dur in clips:
            if v != voice:
                continue
            got, rec_s = recognize(model, pcm, GRAMMAR)
            want = [] if noise else text.split()
            got_cmp = [t for t in got if t != "[unk]"]
            want_cards, _ = parse(want)
            got_cards, got_err = parse(got_cmp)
            hand_ok = (got_err is not None) if noise else (got_err is None and got_cards == want_cards)
            row = {"n": 1, "exact": got_cmp == want, "norm": norm(got) == norm(want), "hand": hand_ok,
                   "tok_err": 0 if noise else edit_distance(norm(want), norm(got)),
                   "tok_n": 0 if noise else len(norm(want))}
            for d in (pv, tot):
                for k in keys:
                    d[k] += row[k]
            tot["rec_s"] += rec_s
            tot["audio_s"] += dur
            if not hand_ok:
                res["failures"].append({"voice": voice, "said": text, "heard": " ".join(got), "parse_error": got_err})
        res["per_voice"][voice] = pv
        print(f"{voice:22s} exact {pv['exact']:2d}/{pv['n']}  norm {pv['norm']:2d}/{pv['n']}  "
              f"hand {pv['hand']:2d}/{pv['n']}  token acc {100 * (1 - pv['tok_err'] / pv['tok_n']):.1f}%")
    res["total"] = tot

    def line(name, d):
        n = d["n"]
        print(f"{name:22s} exact {d['exact']}/{n} ({100 * d['exact'] / n:.1f}%)  norm {d['norm']}/{n} "
              f"({100 * d['norm'] / n:.1f}%)  hand {d['hand']}/{n} ({100 * d['hand'] / n:.1f}%)  "
              f"token acc {100 * (1 - d['tok_err'] / d['tok_n']):.1f}%")
    line("TOTAL", tot)
    natural = dict.fromkeys(keys, 0)
    for v, d in res["per_voice"].items():
        if v != "Fred":
            for k in keys:
                natural[k] += d[k]
    if natural["n"] != tot["n"]:
        line("TOTAL excl. Fred", natural)
        res["total_excl_fred"] = natural
    print(f"recognition: {tot['rec_s']:.1f}s for {tot['audio_s']:.1f}s audio (RTF {tot['rec_s'] / tot['audio_s']:.4f}, "
          f"mean {1000 * tot['rec_s'] / tot['n']:.0f} ms/clip incl. recognizer creation)")
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--audio-dir", required=True)
    ap.add_argument("--voices", default=",".join(DEFAULT_VOICES))
    ap.add_argument("--lead-ms", type=int, default=400)
    ap.add_argument("--trail-ms", type=int, default=300)
    ap.add_argument("--no-grammar", action="store_true")
    ap.add_argument("--model-full")
    ap.add_argument("--show-failures", action="store_true")
    ap.add_argument("--json-out")
    args = ap.parse_args()

    from vosk import Model, SetLogLevel
    SetLogLevel(-1)
    voices = [v for v in args.voices.split(",") if v]
    utts = load_utterances()
    os.makedirs(args.audio_dir, exist_ok=True)

    clips = []
    for vi, voice in enumerate(voices):
        for text, noise in utts:
            slug = "".join(c if c.isalnum() else "_" for c in voice + "-" + text)[:120]
            path = os.path.join(args.audio_dir, slug + ".wav")
            synth(text, voice, path)
            pcm, dur = read_pcm(path, args.lead_ms, args.trail_ms)
            clips.append((voice, text, noise, pcm, dur))
    print(f"{len(utts)} utterances x {len(voices)} voices = {len(clips)} clips "
          f"(lead {args.lead_ms} ms, trail {args.trail_ms} ms silence)")

    t0 = time.perf_counter()
    model = Model(args.model)
    load_s = time.perf_counter() - t0
    print(f"trimmed model load: {load_s:.2f}s ({args.model})")
    results = {"load_s": load_s, "lead_ms": args.lead_ms, "voices": voices}
    results["trimmed"] = score(model, clips, voices, "trimmed model (no Gr.fst)")
    if args.show_failures:
        for f in results["trimmed"]["failures"]:
            print(f"  [{f['voice']}] said {f['said']!r}\n      heard {f['heard']!r} ({f['parse_error']})")

    # Vosk is not bit-for-bit deterministic across runs; measure that so trimmed-vs-full diffs can be judged.
    flips = sum(recognize(model, c[3], GRAMMAR)[0] != recognize(model, c[3], GRAMMAR)[0] for c in clips)
    print(f"run-to-run transcript differences on the same model: {flips}/{len(clips)}")
    results["self_flips"] = flips

    if args.no_grammar:
        try:
            got, _ = recognize(model, clips[0][3], None)
            results["no_grammar"] = "ok: " + " ".join(got)
        except Exception as e:  # noqa: BLE001
            results["no_grammar"] = f"failed: {e}"
        print(f"free-form recognizer (no grammar) on the trimmed model: {results['no_grammar']}")

    if args.model_full:
        t0 = time.perf_counter()
        full = Model(args.model_full)
        results["full_load_s"] = time.perf_counter() - t0
        print(f"full model load: {results['full_load_s']:.2f}s")
        results["full"] = score(full, clips, voices, "full model (with Gr.fst)")
        try:
            got, _ = recognize(full, clips[0][3], None)
            print(f"free-form recognizer on the full model: {' '.join(got)!r}")
        except Exception as e:  # noqa: BLE001
            print(f"free-form recognizer on the full model failed: {e}")

    if args.json_out:
        for r in ("trimmed", "full"):
            if r in results:
                results[r]["total"] = {k: v for k, v in results[r]["total"].items()}
        with open(args.json_out, "w") as f:
            json.dump(results, f, indent=2)


if __name__ == "__main__":
    sys.exit(main())

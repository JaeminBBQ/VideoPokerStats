#!/usr/bin/env node
// Build the trimmed Vosk model for the glasses voice entry (glasses/VOICE.md "Model host").
//
//   npm run model:build
//
// 1. Downloads vosk-model-small-en-us-0.15.zip (cached in model-host/.cache/), checks its pinned sha256.
// 2. Unzips, renames the top folder to `model/`, extracts Gr.fst's word symbol table to graph/words.txt
//    (Vosk needs it and falls back to that file), then drops graph/Gr.fst (24 MB) and README.
// 3. Packs a ustar tar with `model/...` entries (no "./" prefix, no macOS metadata), gzips it (-n -9).
//    vosk-browser 0.0.8 extracts with libarchive (gzip filter only) and strips the first path component.
// 4. Splits it into parts under 24 MiB (Cloudflare static assets cap files at 25 MiB).
// 5. Writes public/manifest.json and public/_headers.
//
// Node 24, stdlib only; uses the system `unzip`, `tar` and `gzip` CLIs.
// Env:
//   VOSK_ZIP=/path/to/vosk-model-small-en-us-0.15.zip  use this zip instead of downloading (still hash-checked)
//   VOSK_CACHE_DIR=/path                               cache dir (default model-host/.cache)

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync, writeSync, utimesSync, openSync, readSync, closeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
const MODEL_ZIP_SHA256 = "30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498";
const MODEL_ZIP_BYTES = 41205931;
const SRC_DIR_NAME = "vosk-model-small-en-us-0.15";
const DROP = ["graph/Gr.fst", "README"];
const BUILD_VERSION = "small-en-us-0.15-trim.2"; // bump if the trimming/packing recipe changes
const PART_BYTES = 20 * 1024 * 1024; // 20 MiB, safely under the 24 MiB budget
const MAX_PART = 24 * 1024 * 1024;

const HOST_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = process.env.VOSK_CACHE_DIR || join(HOST_DIR, ".cache");
const PUBLIC_DIR = join(HOST_DIR, "public");
const WORK_DIR = join(CACHE_DIR, "work");

const log = (m) => console.log(`[model:build] ${m}`);
const mib = (n) => `${(n / 1048576).toFixed(2)} MiB`;

async function sha256File(path) {
  const h = createHash("sha256");
  await pipeline(createReadStream(path), h);
  return h.digest("hex");
}

async function download(url, dest) {
  log(`downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  const tmp = `${dest}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  renameSync(tmp, dest);
}

async function getZip() {
  mkdirSync(CACHE_DIR, { recursive: true });
  let zip = process.env.VOSK_ZIP;
  if (zip) {
    log(`using VOSK_ZIP=${zip}`);
  } else {
    zip = join(CACHE_DIR, `${SRC_DIR_NAME}.zip`);
    if (existsSync(zip) && statSync(zip).size === MODEL_ZIP_BYTES) log(`using cached ${zip}`);
    else await download(MODEL_URL, zip);
  }
  const got = await sha256File(zip);
  if (got !== MODEL_ZIP_SHA256) {
    throw new Error(`zip sha256 mismatch: got ${got}, want ${MODEL_ZIP_SHA256}. Delete the cache and retry.`);
  }
  log(`zip ok: ${mib(statSync(zip).size)} sha256 ${got.slice(0, 16)}…`);
  return zip;
}

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(dir, e.name);
    out.push({ rel: relative(base, p), dir: e.isDirectory() });
    if (e.isDirectory()) walk(p, base, out);
  }
  return out;
}

function sha256Range(fd, start, len) {
  const h = createHash("sha256");
  const buf = Buffer.allocUnsafe(1 << 20);
  let off = 0;
  while (off < len) {
    const n = readSync(fd, buf, 0, Math.min(buf.length, len - off), start + off);
    if (n <= 0) throw new Error("short read");
    h.update(buf.subarray(0, n));
    off += n;
  }
  return h.digest("hex");
}

function copyRange(fd, start, len, dest) {
  const out = openSync(dest, "w");
  const buf = Buffer.allocUnsafe(1 << 20);
  let off = 0;
  while (off < len) {
    const n = readSync(fd, buf, 0, Math.min(buf.length, len - off), start + off);
    if (n <= 0) throw new Error("short read");
    let w = 0;
    while (w < n) w += writeSync(out, buf, w, n - w);
    off += n;
  }
  closeSync(out);
}

// Read the output symbol table from an OpenFst binary header (FstHeader, then optional isymbols/osymbols).
function extractOutputSymbols(path) {
  const fd = openSync(path, "r");
  let pos = 0;
  const read = (n) => {
    const b = Buffer.alloc(n);
    if (readSync(fd, b, 0, n, pos) !== n) throw new Error(`${path}: truncated header`);
    pos += n;
    return b;
  };
  const i32 = () => read(4).readInt32LE(0);
  const i64 = () => Number(read(8).readBigInt64LE(0));
  const str = () => read(i32()).toString("utf8");
  const symbolTable = () => {
    if (i32() !== 2125658996) throw new Error(`${path}: bad symbol table magic`);
    str(); // name
    i64(); // available key
    const n = i64();
    const out = [];
    for (let i = 0; i < n; i++) {
      const sym = str();
      out.push([sym, i64()]);
    }
    return out;
  };
  try {
    if (i32() !== 2125659606) throw new Error(`${path}: not an OpenFst binary`);
    str(); str(); // fst type, arc type
    i32(); // version
    const flags = i32();
    read(8 * 4); // properties, start, numstates, numarcs
    if (flags & 1) symbolTable(); // input symbols
    if (!(flags & 2)) throw new Error(`${path}: no output symbols`);
    const syms = symbolTable().sort((a, b) => a[1] - b[1]);
    if (syms.length < 1000 || syms[0][0] !== "<eps>") throw new Error(`${path}: unexpected symbol table`);
    return syms;
  } finally {
    closeSync(fd);
  }
}

const HEADERS = `# Generated by model-host/scripts/build-model.mjs. Do not edit.
/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  Access-Control-Expose-Headers: Content-Length, ETag
  X-Content-Type-Options: nosniff

/manifest.json
  Cache-Control: public, max-age=60, must-revalidate

/parts/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: application/octet-stream
`;

async function main() {
  const zip = await getZip();

  // Unzip into a clean work dir and rename the top folder to `model/`.
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });
  execFileSync("unzip", ["-q", zip, "-d", WORK_DIR], { stdio: "inherit" });
  const modelDir = join(WORK_DIR, "model");
  renameSync(join(WORK_DIR, SRC_DIR_NAME), modelDir);
  // Gr.fst carries the word symbol table. Vosk reads words from HCLG/Gr output symbols, else from
  // graph/words.txt (model.cc ReadDataFiles), so write words.txt before dropping Gr.fst.
  const words = extractOutputSymbols(join(modelDir, "graph/Gr.fst"));
  writeFileSync(join(modelDir, "graph/words.txt"), words.map(([sym, key]) => `${sym} ${key}`).join("\n") + "\n");
  log(`wrote graph/words.txt (${words.length} words) from Gr.fst output symbols`);
  for (const f of DROP) {
    const p = join(modelDir, f);
    if (!existsSync(p)) throw new Error(`expected ${f} in the zip`);
    rmSync(p);
    log(`dropped ${f}`);
  }
  for (const req of ["am/final.mdl", "graph/HCLr.fst", "graph/words.txt", "graph/phones/word_boundary.int", "conf/model.conf", "conf/mfcc.conf", "ivector/final.ie"]) {
    if (!existsSync(join(modelDir, req))) throw new Error(`missing ${req}`);
  }

  // Deterministic entry list: `model/`, then sorted dirs and files, all as `model/...` (no "./").
  const entries = ["model", ...walk(modelDir).map((e) => `model/${e.rel}`)];
  // Fixed mtimes so the same zip always yields the same bytes (and the same content-addressed part paths).
  const FIXED_MTIME = new Date("2020-12-08T15:39:00Z");
  for (const e of entries) utimesSync(join(WORK_DIR, e), FIXED_MTIME, FIXED_MTIME);
  const listFile = join(WORK_DIR, "entries.txt");
  writeFileSync(listFile, entries.join("\n") + "\n");
  const tarPath = join(WORK_DIR, "model.tar");
  execFileSync("tar", [
    "--format", "ustar", "--no-recursion", "--no-mac-metadata", "--no-xattrs", "--no-acls", "--no-fflags",
    "--uid", "0", "--gid", "0", "--uname", "", "--gname", "",
    "-cf", tarPath, "-C", WORK_DIR, "-T", listFile,
  ], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } });
  execFileSync("gzip", ["-n", "-9", "-f", tarPath], { stdio: "inherit" });
  const tgz = `${tarPath}.gz`;
  const listed = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" }).trim().split("\n");
  if (listed.some((p) => !p.startsWith("model/") && p !== "model")) throw new Error(`bad tar entry layout: ${listed.join(", ")}`);
  if (listed.some((p) => p.includes("Gr.fst") || p.includes("README") || p.includes("._"))) throw new Error("unexpected tar entries");

  const totalBytes = statSync(tgz).size;
  const sha256 = await sha256File(tgz);
  log(`model.tar.gz: ${mib(totalBytes)} (${totalBytes} bytes), ${listed.length} entries, sha256 ${sha256.slice(0, 16)}…`);

  // Fresh public/ with content-addressed parts (safe to cache forever).
  rmSync(PUBLIC_DIR, { recursive: true, force: true });
  const partsRel = `parts/${sha256.slice(0, 16)}`;
  mkdirSync(join(PUBLIC_DIR, partsRel), { recursive: true });
  const fd = openSync(tgz, "r");
  const parts = [];
  try {
    for (let off = 0, i = 0; off < totalBytes; off += PART_BYTES, i++) {
      const len = Math.min(PART_BYTES, totalBytes - off);
      if (len >= MAX_PART) throw new Error("part too large");
      const path = `${partsRel}/model.tar.gz.part${String(i).padStart(3, "0")}`;
      copyRange(fd, off, len, join(PUBLIC_DIR, path));
      parts.push({ path, bytes: len, sha256: sha256Range(fd, off, len) });
    }
  } finally {
    closeSync(fd);
  }
  if (parts.reduce((s, p) => s + p.bytes, 0) !== totalBytes) throw new Error("parts don't add up");

  const manifest = { version: BUILD_VERSION, totalBytes, sha256, parts };
  writeFileSync(join(PUBLIC_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(PUBLIC_DIR, "_headers"), HEADERS);
  // Keep the unpacked trimmed model for the accuracy harness (model-host/accuracy/).
  log(`trimmed model folder: ${modelDir}`);
  for (const p of parts) log(`part ${p.path}: ${mib(p.bytes)}`);
  log(`wrote ${join(PUBLIC_DIR, "manifest.json")} and _headers`);
  rmSync(listFile);
}

main().catch((e) => {
  console.error(`[model:build] FAILED: ${e.message}`);
  process.exit(1);
});

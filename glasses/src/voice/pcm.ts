/**
 * Glasses mic payload → recognizer samples (pure).
 *
 * The SDK types `audioEvent.audioPcm` as Uint8Array, but after the host's JSON bridge it may arrive as a number[]
 * of bytes or a base64 string (SDK index.d.ts). All forms are 16 kHz s16le mono.
 *
 * Adapted from EvenChess src/voice/pcm.ts — MIT License, © 2026 Dustin Harmon.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
 * copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */

export type AudioPayload = Uint8Array | ArrayBuffer | readonly number[] | string;

const EMPTY = new Uint8Array(0);

function base64ToBytes(b64: string): Uint8Array {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return EMPTY;
  }
}

/** Any payload form → raw bytes (unknown shapes → empty). */
export function payloadToBytes(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  if (typeof payload === 'string') return base64ToBytes(payload);
  if (Array.isArray(payload)) return Uint8Array.from(payload as unknown[], (n) => Number(n) & 0xff);
  return EMPTY;
}

/** Little-endian signed 16-bit samples (a trailing odd byte is dropped). */
export function bytesToInt16(bytes: Uint8Array): Int16Array {
  const n = bytes.byteLength >> 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Int16 → Float32 in [-1, 1) (÷ 32768, the inverse of vosk-browser's × 0x8000). */
export function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i]! / 0x8000;
  return out;
}

export function payloadToFloat32(payload: unknown): Float32Array {
  return int16ToFloat32(bytesToInt16(payloadToBytes(payload)));
}

/** Mean absolute amplitude, 0..1 (naive speech/silence detection). */
export function meanAbsAmplitude(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += Math.abs(samples[i]!);
  return sum / samples.length;
}

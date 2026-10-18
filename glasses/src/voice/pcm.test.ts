/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { bytesToInt16, int16ToFloat32, meanAbsAmplitude, payloadToBytes, payloadToFloat32 } from './pcm.ts';
import { wavPcmBytes } from './wav.ts';

// Samples 0, 1, -1, 32767, -32768 as s16le.
const BYTES = [0x00, 0x00, 0x01, 0x00, 0xff, 0xff, 0xff, 0x7f, 0x00, 0x80];
const EXPECT = [0, 1 / 32768, -1 / 32768, 32767 / 32768, -1];

describe('pcm', () => {
  it('Uint8Array, number[], ArrayBuffer and base64 all decode the same', () => {
    const u8 = Uint8Array.from(BYTES);
    const b64 = Buffer.from(u8).toString('base64');
    for (const p of [u8, BYTES, u8.buffer, b64]) {
      expect(Array.from(payloadToFloat32(p))).toEqual(EXPECT.map((x) => Math.fround(x)));
    }
  });
  it('honours byteOffset of a view and drops a trailing odd byte', () => {
    const big = Uint8Array.from([9, ...BYTES, 7]);
    const view = big.subarray(1);
    expect(Array.from(bytesToInt16(view))).toEqual([0, 1, -1, 32767, -32768]);
  });
  it('junk payloads → empty', () => {
    for (const p of [null, undefined, 42, {}, '!!!not base64!!!']) expect(payloadToBytes(p).length).toBe(0);
  });
  it('number[] bytes are masked to 0..255', () => {
    expect(Array.from(payloadToBytes([256, -1, 3]))).toEqual([0, 255, 3]);
  });
  it('amplitude', () => {
    expect(meanAbsAmplitude(new Float32Array(0))).toBe(0);
    expect(meanAbsAmplitude(int16ToFloat32(Int16Array.from([16384, -16384])))).toBeCloseTo(0.5);
  });
});

describe('wavPcmBytes', () => {
  const wav = (rate = 16000, data = [1, 2, 3, 4]) => {
    const b = Buffer.alloc(44 + data.length);
    b.write('RIFF', 0); b.writeUInt32LE(36 + data.length, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(data.length, 40); Buffer.from(data).copy(b, 44);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  };
  it('returns the data chunk', () => expect(Array.from(wavPcmBytes(wav()))).toEqual([1, 2, 3, 4]));
  it('rejects other formats', () => {
    expect(() => wavPcmBytes(wav(44100))).toThrow(/16 kHz/);
    expect(() => wavPcmBytes(new ArrayBuffer(4))).toThrow(/WAV/);
  });
});

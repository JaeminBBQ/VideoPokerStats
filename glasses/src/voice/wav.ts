/** Minimal WAV reader for the dev voice test (?voicetest=1): returns the s16le mono 16 kHz data chunk. */
export function wavPcmBytes(buf: ArrayBuffer): Uint8Array {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let fmtOk = false;
  for (let o = 12; o + 8 <= buf.byteLength; ) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      const format = v.getUint16(o + 8, true);
      const channels = v.getUint16(o + 10, true);
      const rate = v.getUint32(o + 12, true);
      const bits = v.getUint16(o + 22, true);
      if (format !== 1 || channels !== 1 || rate !== 16000 || bits !== 16) {
        throw new Error(`need PCM s16 mono 16 kHz, got format ${format}, ${channels} ch, ${rate} Hz, ${bits} bit`);
      }
      fmtOk = true;
    } else if (id === 'data') {
      if (!fmtOk) throw new Error('WAV data before fmt');
      return new Uint8Array(buf, o + 8, Math.min(size, buf.byteLength - o - 8));
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV has no data chunk');
}

/**
 * Minimal PNG chunk reader/writer, used to carry an editable scene inside an
 * exported PNG. Only the chunk framing is handled; pixel data is untouched.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  let c = crc;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return c >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

const typeBytes = (type: string): Uint8Array =>
  Uint8Array.from(type, (c) => c.charCodeAt(0) & 0xff);

const typeAt = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + 4));

interface ChunkRef {
  readonly type: string;
  /** Offset of the length field. */
  readonly start: number;
  readonly dataStart: number;
  readonly dataEnd: number;
}

/** Walks the chunks; stops at the first malformed one. */
function* chunks(bytes: Uint8Array): Generator<ChunkRef> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const dataStart = at + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return;
    yield { type: typeAt(bytes, at + 4), start: at, dataStart, dataEnd };
    at = dataEnd + 4;
  }
}

/** Data of the first chunk of `type` with a valid CRC, or null. */
export function readChunk(bytes: Uint8Array, type: string): Uint8Array | null {
  if (!isPng(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const c of chunks(bytes)) {
    if (c.type !== type) continue;
    const crc = crc32(bytes.subarray(c.dataStart, c.dataEnd), crc32(typeBytes(type))) ^ 0xffffffff;
    if (view.getUint32(c.dataEnd) !== crc >>> 0) return null;
    return bytes.slice(c.dataStart, c.dataEnd);
  }
  return null;
}

/**
 * Returns a copy of the PNG with a chunk inserted before IEND, replacing any
 * existing chunks of the same type. Null when the input is not a PNG.
 */
export function writeChunk(
  bytes: Uint8Array,
  type: string,
  data: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  if (!isPng(bytes) || type.length !== 4) return null;
  let iend = -1;
  const keep: [number, number][] = [[0, 8]];
  for (const c of chunks(bytes)) {
    if (c.type === 'IEND') {
      iend = c.start;
      break;
    }
    if (c.type !== type) keep.push([c.start, c.dataEnd + 4]);
  }
  if (iend < 0) return null;
  const tb = typeBytes(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(tb, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, (crc32(data, crc32(tb)) ^ 0xffffffff) >>> 0);

  const tail = bytes.subarray(iend);
  const size = keep.reduce((n, [a, b]) => n + b - a, 0) + chunk.length + tail.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const [a, b] of keep) {
    out.set(bytes.subarray(a, b), at);
    at += b - a;
  }
  out.set(chunk, at);
  out.set(tail, at + chunk.length);
  return out;
}

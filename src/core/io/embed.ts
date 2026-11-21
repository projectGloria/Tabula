import { base64ToBytes, bytesToBase64 } from './image-files';
import { readChunk, writeChunk } from './png-chunk';
import {
  parseDocument,
  serializeDocument,
  type ParseResult,
  type TabulaDocument,
} from './document';

/** Private, ancillary, safe-to-copy PNG chunk holding the scene. */
export const SCENE_CHUNK = 'tbLa';
/** Payload layout version (first byte of the chunk / SVG payload). */
const PAYLOAD_VERSION = 1;
/** Largest decompressed scene accepted from an image. */
const MAX_INFLATED = 200_000_000;

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: TransformStream<Uint8Array, Uint8Array>,
): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  const reader = out.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_INFLATED) {
      await reader.cancel();
      throw new Error('payload too large');
    }
    parts.push(value);
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  return joined;
}

/** Version byte + deflated UTF-8 JSON of the document. */
export async function encodeScenePayload(doc: TabulaDocument): Promise<Uint8Array<ArrayBuffer>> {
  const json = new TextEncoder().encode(serializeDocument(doc));
  const packed = await pipe(
    json,
    new CompressionStream('deflate') as TransformStream<Uint8Array, Uint8Array>,
  );
  const out = new Uint8Array(packed.length + 1);
  out[0] = PAYLOAD_VERSION;
  out.set(packed, 1);
  return out;
}

export type EmbedResult = ParseResult | { readonly ok: false; readonly error: 'no-scene' };

export async function decodeScenePayload(payload: Uint8Array): Promise<EmbedResult> {
  if (payload[0] !== PAYLOAD_VERSION) return { ok: false, error: 'no-scene' };
  let json: Uint8Array;
  try {
    json = await pipe(
      payload.slice(1),
      new DecompressionStream('deflate') as TransformStream<Uint8Array, Uint8Array>,
    );
  } catch {
    return { ok: false, error: 'no-scene' };
  }
  return parseDocument(new TextDecoder().decode(json));
}

/** PNG bytes with the scene embedded; null when the input is not a PNG. */
export async function embedSceneInPng(
  png: Uint8Array,
  doc: TabulaDocument,
): Promise<Uint8Array<ArrayBuffer> | null> {
  return writeChunk(png, SCENE_CHUNK, await encodeScenePayload(doc));
}

export async function extractSceneFromPng(png: Uint8Array): Promise<EmbedResult> {
  const payload = readChunk(png, SCENE_CHUNK);
  return payload ? decodeScenePayload(payload) : { ok: false, error: 'no-scene' };
}

/** Element name of the SVG metadata payload (in the Tabula namespace). */
const SVG_TAG = 'tabula:scene';
export const SVG_NAMESPACE = 'https://tabula.invalid/scene';

/** `<metadata>` block carrying the scene as base64. */
export async function svgSceneMetadata(doc: TabulaDocument): Promise<string> {
  const b64 = bytesToBase64(await encodeScenePayload(doc));
  return `<metadata><${SVG_TAG} xmlns:tabula="${SVG_NAMESPACE}">${b64}</${SVG_TAG}></metadata>`;
}

const SVG_PAYLOAD = /<tabula:scene[^>]*>([A-Za-z0-9+/=\s]+)<\/tabula:scene>/;

export async function extractSceneFromSvg(svg: string): Promise<EmbedResult> {
  const m = SVG_PAYLOAD.exec(svg);
  if (!m?.[1]) return { ok: false, error: 'no-scene' };
  try {
    return await decodeScenePayload(base64ToBytes(m[1].replace(/\s+/g, '')));
  } catch {
    return { ok: false, error: 'no-scene' };
  }
}

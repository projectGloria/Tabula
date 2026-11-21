/**
 * Image bytes referenced by `ImageElement.fileId`. Ids are the SHA-256 of the
 * bytes in lowercase hex, so identical images are stored once.
 */

import type { SceneElement } from '../model/types';

/** Raster formats the app inserts and stores. SVG is excluded on purpose. */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

/** Largest image file accepted for insertion, in bytes. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const FILE_ID = /^[0-9a-f]{64}$/;

export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && FILE_ID.test(value);
}

export function isImageMime(value: string): value is ImageMime {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type};base64,${bytesToBase64(bytes)}`;
}

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]*)$/;

/** Decodes a base64 data URL; null when malformed. */
export function dataURLToBlob(url: string): Blob | null {
  const m = DATA_URL.exec(url);
  if (!m?.[1] || m[2] === undefined) return null;
  try {
    return new Blob([base64ToBytes(m[2])], { type: m[1] });
  } catch {
    return null;
  }
}

/** Largest side, in world units, of a newly inserted image. */
export const MAX_INSERT_SIDE = 800;

/** Initial size of an inserted image: natural size, scaled down to fit. */
export function insertSize(
  naturalWidth: number,
  naturalHeight: number,
  maxSide = MAX_INSERT_SIDE,
): { width: number; height: number } {
  const w = Math.max(1, naturalWidth);
  const h = Math.max(1, naturalHeight);
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** File ids referenced by image elements. */
export function fileIdsOf(elements: Iterable<SceneElement>): Set<string> {
  const out = new Set<string>();
  for (const el of elements) if (el.type === 'image') out.add(el.fileId);
  return out;
}

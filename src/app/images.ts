import type { DocumentFile } from '../core/io/document';
import {
  blobToDataURL,
  dataURLToBlob,
  isImageMime,
  MAX_IMAGE_BYTES,
  sha256Hex,
} from '../core/io/image-files';
import type { DrawingStore } from '../core/persist/store';
import type { ImageSource } from '../core/render/draw-element';

/** Stored files unreferenced for this long are deleted at startup. */
const GC_GRACE_MS = 24 * 60 * 60 * 1000;

type Entry =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly bitmap: ImageBitmap }
  | { readonly state: 'missing' };

export interface AddedImage {
  readonly fileId: string;
  readonly width: number;
  readonly height: number;
}

export type AddImageError = 'unsupported' | 'too-large' | 'decode';

/**
 * Image bytes for the canvas: content-addressed blobs in the drawing store,
 * decoded lazily into bitmaps that the renderer reads synchronously.
 */
export class ImageLibrary implements ImageSource {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly store: DrawingStore) {}

  /** Bitmap for a file id; starts loading it on first request. */
  get(fileId: string): ImageBitmap | null {
    const entry = this.entries.get(fileId);
    if (entry) return entry.state === 'ready' ? entry.bitmap : null;
    this.entries.set(fileId, { state: 'loading' });
    const loading = this.load(fileId).finally(() => this.pending.delete(fileId));
    this.pending.set(fileId, loading);
    return null;
  }

  /** Resolves once the file has loaded (or failed to). */
  async ready(fileId: string): Promise<void> {
    this.get(fileId);
    await this.pending.get(fileId);
  }

  /** Called whenever a bitmap finishes loading. */
  onLoad(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async load(fileId: string): Promise<void> {
    let entry: Entry = { state: 'missing' };
    try {
      const file = await this.store.getFile(fileId);
      if (file) entry = { state: 'ready', bitmap: await createImageBitmap(file.blob) };
    } catch {
      // Corrupt or undecodable bytes stay a placeholder.
    }
    this.entries.set(fileId, entry);
    for (const l of [...this.listeners]) l();
  }

  /** Stores an image file (once per content) and decodes it. */
  async add(blob: Blob): Promise<AddedImage | AddImageError> {
    if (!isImageMime(blob.type)) return 'unsupported';
    if (blob.size > MAX_IMAGE_BYTES) return 'too-large';
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return 'decode';
    }
    const fileId = await sha256Hex(await blob.arrayBuffer());
    if (!(await this.store.getFile(fileId))) {
      await this.store.putFile({ id: fileId, mimeType: blob.type, blob, created: Date.now() });
    }
    this.entries.set(fileId, { state: 'ready', bitmap });
    return { fileId, width: bitmap.width, height: bitmap.height };
  }

  /** Data URLs for embedding in a `.tabula` file; missing ids are skipped. */
  async exportFiles(ids: Iterable<string>): Promise<Record<string, DocumentFile>> {
    const out: Record<string, DocumentFile> = {};
    for (const id of new Set(ids)) {
      const file = await this.store.getFile(id);
      if (file) out[id] = { mimeType: file.mimeType, dataURL: await blobToDataURL(file.blob) };
    }
    return out;
  }

  /**
   * Stores files embedded in an opened document. Entries whose bytes do not
   * hash to their id are dropped, so a file cannot overwrite another image.
   */
  async importFiles(files: Readonly<Record<string, DocumentFile>>): Promise<void> {
    for (const [id, f] of Object.entries(files)) {
      if (await this.store.getFile(id)) continue;
      const blob = dataURLToBlob(f.dataURL);
      if (!blob || !isImageMime(blob.type)) continue;
      if ((await sha256Hex(await blob.arrayBuffer())) !== id) continue;
      await this.store.putFile({ id, mimeType: blob.type, blob, created: Date.now() });
      if (this.entries.get(id)?.state === 'missing') this.entries.delete(id);
    }
  }

  /** Deletes stored files no drawing uses, sparing recent ones (other tabs). */
  async collectGarbage(referenced: ReadonlySet<string>, now = Date.now()): Promise<number> {
    const drop: string[] = [];
    for (const id of await this.store.listFileIds()) {
      if (referenced.has(id)) continue;
      const file = await this.store.getFile(id);
      if (file && now - file.created > GC_GRACE_MS) drop.push(id);
    }
    if (drop.length > 0) await this.store.deleteFiles(drop);
    return drop.length;
  }
}

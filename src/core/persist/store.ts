import type { Camera } from '../camera/camera';
import type { TabulaDocument } from '../io/document';

/** Listing entry for the drawings manager (no document body). */
export interface DrawingMeta {
  readonly id: string;
  readonly name: string;
  /** Epoch ms. */
  readonly created: number;
  readonly updated: number;
  /** Small PNG preview; null until first generated. */
  readonly thumbnail: Blob | null;
}

export interface DrawingRecord {
  readonly meta: DrawingMeta;
  readonly doc: TabulaDocument;
  /** View position restored when the drawing is reopened. */
  readonly camera: Camera | null;
}

/** Image bytes stored once per SHA-256 hash. */
export interface StoredFile {
  readonly id: string;
  readonly mimeType: string;
  readonly blob: Blob;
  readonly created: number;
}

/** Thrown (or rejected) when the browser refuses to store more data. */
export class QuotaError extends Error {
  constructor(cause?: unknown) {
    super('Storage quota exceeded', { cause });
    this.name = 'QuotaError';
  }
}

/** Local persistence for drawings, image blobs and small settings. */
export interface DrawingStore {
  listDrawings(): Promise<DrawingMeta[]>;
  getDrawing(id: string): Promise<DrawingRecord | undefined>;
  putDrawing(record: DrawingRecord): Promise<void>;
  /** Updates only metadata (rename, thumbnail). No-op for unknown ids. */
  putMeta(meta: DrawingMeta): Promise<void>;
  deleteDrawing(id: string): Promise<void>;
  getFile(id: string): Promise<StoredFile | undefined>;
  putFile(file: StoredFile): Promise<void>;
  listFileIds(): Promise<string[]>;
  deleteFiles(ids: readonly string[]): Promise<void>;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<void>;
}

/** In-memory store for tests and for browsers without IndexedDB. */
export class MemoryStore implements DrawingStore {
  private drawings = new Map<string, DrawingRecord>();
  private files = new Map<string, StoredFile>();
  private settings = new Map<string, unknown>();
  /** Test hook: makes the next writes fail with a QuotaError. */
  failWrites = false;

  listDrawings(): Promise<DrawingMeta[]> {
    return Promise.resolve([...this.drawings.values()].map((r) => r.meta));
  }
  getDrawing(id: string): Promise<DrawingRecord | undefined> {
    return Promise.resolve(this.drawings.get(id));
  }
  putDrawing(record: DrawingRecord): Promise<void> {
    if (this.failWrites) return Promise.reject(new QuotaError());
    this.drawings.set(record.meta.id, record);
    return Promise.resolve();
  }
  putMeta(meta: DrawingMeta): Promise<void> {
    const r = this.drawings.get(meta.id);
    if (r) this.drawings.set(meta.id, { ...r, meta });
    return Promise.resolve();
  }
  deleteDrawing(id: string): Promise<void> {
    this.drawings.delete(id);
    return Promise.resolve();
  }
  getFile(id: string): Promise<StoredFile | undefined> {
    return Promise.resolve(this.files.get(id));
  }
  putFile(file: StoredFile): Promise<void> {
    if (this.failWrites) return Promise.reject(new QuotaError());
    this.files.set(file.id, file);
    return Promise.resolve();
  }
  listFileIds(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()]);
  }
  deleteFiles(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.files.delete(id);
    return Promise.resolve();
  }
  getSetting(key: string): Promise<unknown> {
    return Promise.resolve(this.settings.get(key));
  }
  setSetting(key: string, value: unknown): Promise<void> {
    this.settings.set(key, value);
    return Promise.resolve();
  }
}

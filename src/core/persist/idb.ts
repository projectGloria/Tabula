import type { Camera } from '../camera/camera';
import { parseDocumentValue } from '../io/document';
import {
  QuotaError,
  type DrawingMeta,
  type DrawingRecord,
  type DrawingStore,
  type StoredFile,
} from './store';

const DB_NAME = 'tabula';
const DB_VERSION = 1;
const META = 'drawings';
const DOCS = 'docs';
const FILES = 'files';
const SETTINGS = 'settings';

type StoreName = typeof META | typeof DOCS | typeof FILES | typeof SETTINGS;

interface DocRow {
  readonly doc: unknown;
  readonly camera: Camera | null;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => {
      resolve(r.result);
    };
    r.onerror = () => {
      reject(wrapError(r.error));
    };
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(wrapError(tx.error));
    };
    tx.onabort = () => {
      reject(wrapError(tx.error));
    };
  });
}

function wrapError(e: DOMException | null): Error {
  if (e?.name === 'QuotaExceededError') return new QuotaError(e);
  return e ?? new Error('IndexedDB request failed');
}

function isMeta(v: unknown): v is DrawingMeta {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m.id === 'string' && typeof m.name === 'string' && typeof m.updated === 'number';
}

/** IndexedDB-backed store: metadata, documents, image blobs and settings. */
export class IdbStore implements DrawingStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<IdbStore> {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    const db = await req(r);
    // Another tab upgrading the schema: step aside instead of blocking it.
    db.onversionchange = () => {
      db.close();
    };
    return new IdbStore(db);
  }

  private tx(names: StoreName | StoreName[], mode: IDBTransactionMode): IDBTransaction {
    return this.db.transaction(names, mode);
  }

  async listDrawings(): Promise<DrawingMeta[]> {
    const all: unknown[] = await req(this.tx(META, 'readonly').objectStore(META).getAll());
    return all.filter(isMeta);
  }

  async getDrawing(id: string): Promise<DrawingRecord | undefined> {
    const tx = this.tx([META, DOCS], 'readonly');
    const [meta, row] = await Promise.all([
      req(tx.objectStore(META).get(id)) as Promise<unknown>,
      req(tx.objectStore(DOCS).get(id)) as Promise<DocRow | undefined>,
    ]);
    if (!isMeta(meta) || !row) return undefined;
    const parsed = parseDocumentValue(row.doc);
    if (!parsed.ok) return undefined;
    return { meta, doc: parsed.doc, camera: row.camera };
  }

  async putDrawing(record: DrawingRecord): Promise<void> {
    const tx = this.tx([META, DOCS], 'readwrite');
    tx.objectStore(META).put(record.meta);
    const row: DocRow = { doc: record.doc, camera: record.camera };
    tx.objectStore(DOCS).put(row, record.meta.id);
    await done(tx);
  }

  async putMeta(meta: DrawingMeta): Promise<void> {
    const tx = this.tx(META, 'readwrite');
    const store = tx.objectStore(META);
    const existing: unknown = await req(store.get(meta.id));
    if (isMeta(existing)) store.put(meta);
    await done(tx);
  }

  async deleteDrawing(id: string): Promise<void> {
    const tx = this.tx([META, DOCS], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(DOCS).delete(id);
    await done(tx);
  }

  async getFile(id: string): Promise<StoredFile | undefined> {
    const f: unknown = await req(this.tx(FILES, 'readonly').objectStore(FILES).get(id));
    if (typeof f !== 'object' || f === null) return undefined;
    const r = f as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.mimeType !== 'string' || !(r.blob instanceof Blob)) {
      return undefined;
    }
    return { id: r.id, mimeType: r.mimeType, blob: r.blob, created: Number(r.created) || 0 };
  }

  async putFile(file: StoredFile): Promise<void> {
    const tx = this.tx(FILES, 'readwrite');
    tx.objectStore(FILES).put(file);
    await done(tx);
  }

  async listFileIds(): Promise<string[]> {
    const keys = await req(this.tx(FILES, 'readonly').objectStore(FILES).getAllKeys());
    return keys.filter((k): k is string => typeof k === 'string');
  }

  async deleteFiles(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.tx(FILES, 'readwrite');
    const store = tx.objectStore(FILES);
    for (const id of ids) store.delete(id);
    await done(tx);
  }

  async getSetting(key: string): Promise<unknown> {
    return req(this.tx(SETTINGS, 'readonly').objectStore(SETTINGS).get(key));
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    const tx = this.tx(SETTINGS, 'readwrite');
    tx.objectStore(SETTINGS).put(value, key);
    await done(tx);
  }
}

import { setSelection } from '../actions/actions';
import { EMPTY_SCENE, insertElements } from '../model/scene';
import type { SceneElement } from '../model/types';
import { EMPTY_OVERLAY, EMPTY_SELECTION, type AppState, type GridStyle } from '../store/app-state';
import { isFileId, isImageMime } from './image-files';
import { sanitizeElements } from './validate';

/** `type` marker of every `.tabula` file. */
export const DOCUMENT_TYPE = 'tabula';
/** Current schema version; bump it and add a migration when the format changes. */
export const DOCUMENT_VERSION = 1;
export const FILE_EXTENSION = '.tabula';
export const FILE_MIME = 'application/vnd.tabula+json';

/** Documents larger than this are refused before parsing. */
const MAX_DOCUMENT_CHARS = 200_000_000;

/** Drawing-level settings saved with the elements. */
export interface DocumentSettings {
  readonly background: string;
  readonly gridVisible: boolean;
  readonly gridSnap: boolean;
  readonly gridSize: number;
  readonly gridStyle: GridStyle;
  readonly objectSnap: boolean;
}

/** An embedded binary file (images), keyed by its SHA-256 id. */
export interface DocumentFile {
  readonly mimeType: string;
  /** `data:` URL of the file contents. */
  readonly dataURL: string;
}

export interface TabulaDocument {
  readonly type: typeof DOCUMENT_TYPE;
  readonly version: number;
  readonly elements: readonly SceneElement[];
  readonly settings: DocumentSettings;
  readonly files: Readonly<Record<string, DocumentFile>>;
}

type Raw = Record<string, unknown>;
/** Upgrades a raw document from version `n` to `n + 1`. */
export type Migration = (doc: Raw) => Raw;

/**
 * `MIGRATIONS[n]` upgrades version n to n + 1. Empty while version 1 is the
 * only format; every future schema change adds exactly one entry.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type ParseError = 'not-json' | 'not-tabula' | 'too-new' | 'too-large' | 'bad-version';

export type ParseResult =
  | { readonly ok: true; readonly doc: TabulaDocument }
  | { readonly ok: false; readonly error: ParseError };

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Runs migrations from the document's version up to `target`. */
export function migrate(
  raw: Raw,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = DOCUMENT_VERSION,
): { ok: true; doc: Raw } | { ok: false; error: ParseError } {
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'bad-version' };
  }
  if (version > target) return { ok: false, error: 'too-new' };
  let doc = raw;
  for (let v = version; v < target; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, error: 'bad-version' };
    doc = { ...step(doc), version: v + 1 };
  }
  return { ok: true, doc };
}

export const DEFAULT_SETTINGS: DocumentSettings = {
  background: '#fbfaf6',
  gridVisible: false,
  gridSnap: true,
  gridSize: 20,
  gridStyle: 'dots',
  objectSnap: false,
};

const HEX = /^#[0-9a-f]{6}$/i;

function sanitizeSettings(raw: unknown): DocumentSettings {
  const r = isRecord(raw) ? raw : {};
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const size = r.gridSize;
  return {
    background:
      typeof r.background === 'string' && HEX.test(r.background)
        ? r.background
        : DEFAULT_SETTINGS.background,
    gridVisible: bool(r.gridVisible, DEFAULT_SETTINGS.gridVisible),
    gridSnap: bool(r.gridSnap, DEFAULT_SETTINGS.gridSnap),
    gridSize:
      typeof size === 'number' && Number.isFinite(size)
        ? Math.max(2, Math.min(200, Math.round(size)))
        : DEFAULT_SETTINGS.gridSize,
    gridStyle: r.gridStyle === 'lines' ? 'lines' : 'dots',
    objectSnap: bool(r.objectSnap, DEFAULT_SETTINGS.objectSnap),
  };
}

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=]*$/;

function sanitizeFiles(raw: unknown): Record<string, DocumentFile> {
  const out: Record<string, DocumentFile> = {};
  if (!isRecord(raw)) return out;
  for (const [id, f] of Object.entries(raw)) {
    if (!isFileId(id) || !isRecord(f) || typeof f.dataURL !== 'string') continue;
    const m = DATA_URL.exec(f.dataURL);
    if (!m?.[1] || !isImageMime(m[1])) continue;
    out[id] = { mimeType: m[1], dataURL: f.dataURL };
  }
  return out;
}

/** Validates an already-parsed value as a document, migrating old versions. */
export function parseDocumentValue(data: unknown): ParseResult {
  if (!isRecord(data) || data.type !== DOCUMENT_TYPE) return { ok: false, error: 'not-tabula' };
  const migrated = migrate(data);
  if (!migrated.ok) return migrated;
  const d = migrated.doc;
  return {
    ok: true,
    doc: {
      type: DOCUMENT_TYPE,
      version: DOCUMENT_VERSION,
      elements: sanitizeElements(d.elements),
      settings: sanitizeSettings(d.settings),
      files: sanitizeFiles(d.files),
    },
  };
}

export function parseDocument(text: string): ParseResult {
  if (text.length > MAX_DOCUMENT_CHARS) return { ok: false, error: 'too-large' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  return parseDocumentValue(data);
}

/** Snapshot of the drawing in `state` (revisions reset; selection and camera omitted). */
export function documentFromState(
  state: AppState,
  files: Readonly<Record<string, DocumentFile>> = {},
): TabulaDocument {
  const elements: SceneElement[] = [];
  for (const id of state.scene.order) {
    const el = state.scene.entities[id];
    if (el) elements.push({ ...el, revision: 0 });
  }
  return {
    type: DOCUMENT_TYPE,
    version: DOCUMENT_VERSION,
    elements,
    settings: {
      background: state.background,
      gridVisible: state.gridVisible,
      gridSnap: state.gridSnap,
      gridSize: state.gridSize,
      gridStyle: state.gridStyle,
      objectSnap: state.objectSnap,
    },
    files,
  };
}

export function serializeDocument(doc: TabulaDocument): string {
  return JSON.stringify(doc);
}

/** Replaces the drawing in `state` with `doc`, clearing selection and transient UI. */
export function applyDocument(state: AppState, doc: TabulaDocument): AppState {
  const scene = insertElements(EMPTY_SCENE, doc.elements);
  return setSelection(
    {
      ...state,
      ...doc.settings,
      scene,
      selection: EMPTY_SELECTION,
      focusGroup: null,
      overlay: EMPTY_OVERLAY,
      editingText: null,
      linearEdit: null,
    },
    [],
  );
}

/** Settings and elements equal (used to skip redundant autosaves). */
export function sameDrawing(a: AppState, b: AppState): boolean {
  return (
    a.scene === b.scene &&
    a.background === b.background &&
    a.gridVisible === b.gridVisible &&
    a.gridSnap === b.gridSnap &&
    a.gridSize === b.gridSize &&
    a.gridStyle === b.gridStyle &&
    a.objectSnap === b.objectSnap
  );
}

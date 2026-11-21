import {
  documentFromState,
  FILE_EXTENSION,
  FILE_MIME,
  parseDocument,
  serializeDocument,
  type ParseError,
  type TabulaDocument,
} from '../core/io/document';
import { extractSceneFromPng, extractSceneFromSvg, type EmbedResult } from '../core/io/embed';
import { fileIdsOf } from '../core/io/image-files';
import { IdbStore } from '../core/persist/idb';
import { broadcastTabChannel, DrawingSession } from '../core/persist/session';
import { MemoryStore, type DrawingStore } from '../core/persist/store';
import { canvasToBlob, rasterize } from '../core/render/paint-scene';
import type { AppState } from '../core/store/app-state';
import type { Editor } from '../core/store/editor';
import { t } from '../i18n/t';
import { pickFile, safeFileName, saveFile, stripExtension, type FileTypeSpec } from './files';
import { ImageLibrary } from './images';
import type { UiBus } from './ui-bus';

const THUMB_SIDE = 320;

export const TABULA_FILE_TYPE: FileTypeSpec = {
  get description() {
    return t('file.typeTabula');
  },
  mime: FILE_MIME,
  extensions: [FILE_EXTENSION],
};

async function openStore(): Promise<DrawingStore> {
  if (typeof indexedDB === 'undefined') return new MemoryStore();
  try {
    // A blocked upgrade (old tab holding the database) must not hang startup.
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('IndexedDB open timed out'));
      }, 4000);
    });
    return await Promise.race([IdbStore.open(), timeout]);
  } catch {
    // Private modes may refuse IndexedDB; keep working in memory.
    return new MemoryStore();
  }
}

async function thumbnail(state: AppState, images: ImageLibrary): Promise<Blob | null> {
  if (state.scene.order.length === 0) return null;
  const canvas = rasterize(state.scene, state.scene.order, {
    scale: 1,
    padding: 16,
    background: state.background,
    labelBackdrop: state.background,
    maxSide: THUMB_SIDE,
    images,
  });
  return canvas ? canvasToBlob(canvas) : null;
}

const PARSE_MESSAGES: Record<ParseError, () => string> = {
  'not-json': () => t('file.error.notJson'),
  'not-tabula': () => t('file.error.notTabula'),
  'too-new': () => t('file.error.tooNew'),
  'too-large': () => t('file.error.tooLarge'),
  'bad-version': () => t('file.error.notJson'),
};

export function isTabulaFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(FILE_EXTENSION) || file.type === FILE_MIME;
}

/** Autosave session plus disk open/save, wired to the editor and toasts. */
export class Persistence {
  /** Disk file the active drawing was opened from or last saved to. */
  private handle: FileSystemFileHandle | null = null;
  private handleFor: string | null = null;

  private constructor(
    readonly session: DrawingSession,
    readonly store: DrawingStore,
    readonly images: ImageLibrary,
    private readonly editor: Editor,
    private readonly ui: UiBus,
  ) {}

  static async create(editor: Editor, ui: UiBus): Promise<Persistence> {
    const store = await openStore();
    const images = new ImageLibrary(store);
    const session = new DrawingSession(editor, {
      store,
      channel: broadcastTabChannel(),
      newId: () => crypto.randomUUID(),
      defaultName: () => t('drawing.untitled'),
      thumbnail: (state) => thumbnail(state, images),
    });
    const p = new Persistence(session, store, images, editor, ui);
    await session.start();
    // Drop image files no stored drawing uses any more (deleted drawings).
    void session
      .referencedFiles(fileIdsOf(Object.values(editor.getState().scene.entities)))
      .then((refs) => images.collectGarbage(refs))
      .catch(() => undefined);
    // Flush when the tab is hidden or closed; IndexedDB writes usually finish.
    const flush = (): void => {
      void session.flush();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    return p;
  }

  /** File handle only counts for the drawing it was opened with. */
  private currentHandle(): FileSystemFileHandle | null {
    return this.handleFor === this.session.getInfo().id ? this.handle : null;
  }

  async newDrawing(): Promise<void> {
    await this.session.create();
  }

  /** Picks a `.tabula` file and opens it as a new drawing. */
  async open(): Promise<void> {
    let picked;
    try {
      picked = await pickFile([TABULA_FILE_TYPE]);
    } catch {
      this.ui.notify(t('file.error.read'), 'error');
      return;
    }
    if (!picked) return;
    if (await this.importFile(picked.file)) {
      this.handle = picked.handle;
      this.handleFor = this.session.getInfo().id;
    }
  }

  /** Opens a dropped or picked `.tabula` file as a new drawing. */
  async importFile(file: File): Promise<boolean> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.ui.notify(t('file.error.read'), 'error');
      return false;
    }
    return this.openParsed(parseDocument(text), file.name);
  }

  /**
   * Opens a PNG or SVG exported with an embedded scene as a new drawing.
   * False (silently) when the file carries no scene, so callers can insert it
   * as a plain image instead.
   */
  async importSceneImage(file: File): Promise<boolean> {
    let result: EmbedResult;
    try {
      if (file.type === 'image/png') {
        result = await extractSceneFromPng(new Uint8Array(await file.arrayBuffer()));
      } else if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        result = await extractSceneFromSvg(await file.text());
      } else {
        return false;
      }
    } catch {
      return false;
    }
    if (!result.ok && result.error === 'no-scene') return false;
    return this.openParsed(result, file.name);
  }

  private async openParsed(
    parsed: Exclude<EmbedResult, { error: 'no-scene' }>,
    fileName: string,
  ): Promise<boolean> {
    if (!parsed.ok) {
      this.ui.notify(PARSE_MESSAGES[parsed.error](), 'error');
      return false;
    }
    const name = stripExtension(fileName) || t('drawing.untitled');
    await this.images.importFiles(parsed.doc.files);
    await this.openDocument({ ...parsed.doc, files: {} }, name);
    return true;
  }

  async openDocument(doc: TabulaDocument, name: string): Promise<void> {
    await this.session.create(doc, name);
    this.handle = null;
    this.handleFor = null;
    this.ui.notify(t('file.opened', { name }));
  }

  /** Ctrl+S: writes back to the opened file, else asks where. */
  async save(saveAs = false): Promise<void> {
    const info = this.session.getInfo();
    const state = this.editor.getState();
    const files = await this.images.exportFiles(fileIdsOf(Object.values(state.scene.entities)));
    const doc = documentFromState(state, files);
    const blob = new Blob([serializeDocument(doc)], { type: FILE_MIME });
    const name = `${safeFileName(info.name)}${FILE_EXTENSION}`;
    try {
      const result = await saveFile(blob, name, saveAs ? null : this.currentHandle(), [
        TABULA_FILE_TYPE,
      ]);
      if (result.kind === 'cancelled') return;
      if (result.handle) {
        this.handle = result.handle;
        this.handleFor = info.id;
        const stem = stripExtension(result.handle.name);
        if (stem && stem !== info.name && info.id !== null) {
          await this.session.rename(info.id, stem);
        }
      }
      this.ui.notify(t('file.savedTo', { name: result.handle?.name ?? name }));
    } catch {
      this.ui.notify(t('file.error.write'), 'error');
    }
  }
}

import {
  documentFromState,
  FILE_EXTENSION,
  FILE_MIME,
  parseDocument,
  serializeDocument,
  type ParseError,
  type TabulaDocument,
} from '../core/io/document';
import { IdbStore } from '../core/persist/idb';
import { broadcastTabChannel, DrawingSession } from '../core/persist/session';
import { MemoryStore, type DrawingStore } from '../core/persist/store';
import { canvasToBlob, rasterize } from '../core/render/paint-scene';
import type { AppState } from '../core/store/app-state';
import type { Editor } from '../core/store/editor';
import { t } from '../i18n/t';
import { pickFile, safeFileName, saveFile, stripExtension, type FileTypeSpec } from './files';
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

async function thumbnail(state: AppState): Promise<Blob | null> {
  if (state.scene.order.length === 0) return null;
  const canvas = rasterize(state.scene, state.scene.order, {
    scale: 1,
    padding: 16,
    background: state.background,
    labelBackdrop: state.background,
    maxSide: THUMB_SIDE,
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
    private readonly editor: Editor,
    private readonly ui: UiBus,
  ) {}

  static async create(editor: Editor, ui: UiBus): Promise<Persistence> {
    const store = await openStore();
    const session = new DrawingSession(editor, {
      store,
      channel: broadcastTabChannel(),
      newId: () => crypto.randomUUID(),
      defaultName: () => t('drawing.untitled'),
      thumbnail,
    });
    const p = new Persistence(session, store, editor, ui);
    await session.start();
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
    const parsed = parseDocument(text);
    if (!parsed.ok) {
      this.ui.notify(PARSE_MESSAGES[parsed.error](), 'error');
      return false;
    }
    const name = stripExtension(file.name) || t('drawing.untitled');
    await this.openDocument(parsed.doc, name);
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
    const doc = documentFromState(this.editor.getState());
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

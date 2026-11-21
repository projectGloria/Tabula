import { deleteSelection } from '../core/actions/edit-actions';
import { insertImages, type ImagePlacement } from '../core/actions/image-actions';
import { pasteTextAt } from '../core/actions/text-actions';
import { COMMANDS, executeCommand, type CommandId } from '../core/actions/commands';
import { screenToWorld } from '../core/camera/camera';
import type { Point } from '../core/geometry/vec';
import {
  copyableElements,
  parseClipboard,
  pasteElements,
  serializeClipboard,
} from '../core/io/clipboard';
import { insertSize } from '../core/io/image-files';
import { DEFAULT_BINDINGS } from '../core/keymap/bindings';
import { Keymap } from '../core/keymap/keymap';
import { Editor } from '../core/store/editor';
import { createTools, type ToolContext, type ToolRegistry } from '../core/tools';
import { t } from '../i18n/t';
import { pickFile, type FileTypeSpec } from './files';
import type { AddImageError } from './images';
import { Persistence } from './persistence';
import { UiBus } from './ui-bus';

/** Everything the UI needs, wired once at startup. */
export interface AppServices {
  readonly editor: Editor;
  readonly tools: ToolRegistry;
  readonly toolContext: ToolContext;
  readonly keymap: Keymap;
  readonly isMac: boolean;
  readonly ui: UiBus;
  readonly persistence: Persistence;
  runCommand(id: CommandId): void;
  /** Serialized selection for the clipboard; null when nothing is selected. */
  copySelection(): string | null;
  /** Copies, then deletes the selection. */
  cutSelection(): string | null;
  /** Pastes Tabula clipboard data, or plain text as a text element; false when empty. */
  pasteText(text: string, inPlace: boolean): boolean;
  /** Inserts image files at the pointer (or view center); false when none were images. */
  insertImageFiles(files: readonly File[], at?: Point | null): boolean;
}

const IMAGE_FILE_TYPE: FileTypeSpec = {
  get description() {
    return t('file.typeImage');
  },
  mime: 'image/*',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
};

const IMAGE_ERRORS: Record<AddImageError, () => string> = {
  unsupported: () => t('image.error.unsupported'),
  'too-large': () => t('image.error.tooLarge'),
  decode: () => t('image.error.decode'),
};

export function detectMac(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** App effects: commands that touch files or dialogs rather than state. */
type Effects = Partial<Record<CommandId, () => void>>;

export async function createApp(options: { dev: boolean; isMac: boolean }): Promise<AppServices> {
  const editor = new Editor();
  const tools = createTools();
  const ui = new UiBus();
  const toolContext: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (world) => editor.hitTest(world),
    queryBox: (box) => editor.index.queryBox(box),
    begin: editor.begin,
    end: editor.end,
  };
  const bindings = DEFAULT_BINDINGS.filter(
    (b) => options.dev || COMMANDS[b.command].devOnly !== true,
  );
  const keymap = new Keymap(bindings, options.isMac);

  // Abort any in-flight gesture of the previous tool when the tool changes.
  let activeTool = editor.getState().activeTool;
  editor.subscribe(() => {
    const next = editor.getState().activeTool;
    if (next === activeTool) return;
    tools[activeTool].cancel(toolContext);
    activeTool = next;
  });

  const copySelection = (): string | null => {
    const els = copyableElements(editor.getState());
    return els.length === 0 ? null : serializeClipboard(els);
  };

  /** Paste target: the pointer when it is over the canvas, else the view center. */
  const pasteTarget = (): Point => {
    if (ui.pointerWorld) return ui.pointerWorld;
    const s = editor.getState();
    return screenToWorld(s.camera, { x: s.viewport.width / 2, y: s.viewport.height / 2 });
  };

  const persistence = await Persistence.create(editor, ui);

  const insertImageFiles = (files: readonly File[], at: Point | null = null): boolean => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return false;
    const center = at ?? pasteTarget();
    void (async () => {
      const placed: ImagePlacement[] = [];
      for (const file of images) {
        try {
          const added = await persistence.images.add(file);
          if (typeof added === 'string') {
            ui.notify(IMAGE_ERRORS[added](), 'error');
            continue;
          }
          placed.push({ fileId: added.fileId, ...insertSize(added.width, added.height) });
        } catch {
          ui.notify(t('image.error.store'), 'error');
        }
      }
      if (placed.length > 0) editor.update((s) => insertImages(s, placed, center));
    })();
    return true;
  };

  const effects: Effects = {
    'file.new': () => void persistence.newDrawing(),
    'file.open': () => void persistence.open(),
    'file.save': () => void persistence.save(),
    'file.saveAs': () => void persistence.save(true),
    'file.drawings': () => {
      ui.dialog.set('drawings');
    },
    'file.export': () => {
      ui.dialog.set('export');
    },
    'insert.image': () => {
      void pickFile([IMAGE_FILE_TYPE]).then(
        (picked) => {
          if (picked) insertImageFiles([picked.file]);
        },
        () => {
          ui.notify(t('file.error.read'), 'error');
        },
      );
    },
  };

  return {
    editor,
    tools,
    toolContext,
    keymap,
    isMac: options.isMac,
    ui,
    persistence,
    runCommand(id) {
      const cmd = COMMANDS[id];
      if (cmd.devOnly === true && !options.dev) return;
      const effect = effects[id];
      if (effect) {
        if (!cmd.enabled || cmd.enabled(editor.getState())) effect();
        return;
      }
      executeCommand(editor, cmd);
    },
    copySelection,
    cutSelection() {
      const text = copySelection();
      if (text !== null) editor.update(deleteSelection);
      return text;
    },
    pasteText(text, inPlace) {
      const elements = parseClipboard(text);
      if (!elements) {
        if (text.trim() === '') return false;
        const at = pasteTarget();
        editor.update((s) => pasteTextAt(s, at, text));
        return true;
      }
      const at = inPlace ? null : pasteTarget();
      editor.update((s) => pasteElements(s, elements, at));
      return true;
    },
    insertImageFiles,
  };
}

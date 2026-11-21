import { deleteSelection } from '../core/actions/edit-actions';
import { COMMANDS, executeCommand, type CommandId } from '../core/actions/commands';
import { screenToWorld } from '../core/camera/camera';
import type { Point } from '../core/geometry/vec';
import {
  copyableElements,
  parseClipboard,
  pasteElements,
  serializeClipboard,
} from '../core/io/clipboard';
import { DEFAULT_BINDINGS } from '../core/keymap/bindings';
import { Keymap } from '../core/keymap/keymap';
import { Editor } from '../core/store/editor';
import { createTools, type ToolContext, type ToolRegistry } from '../core/tools';

type Listener<T> = (value: T) => void;

/** Tiny UI-only channel between the canvas and floating UI (menus). */
export class UiBus {
  /** Last pointer position over the canvas in world units; null when it left. */
  pointerWorld: Point | null = null;
  private menuListeners = new Set<Listener<Point>>();

  /** Asks the context menu to open at a viewport-relative screen point. */
  openContextMenu(screen: Point): void {
    for (const l of this.menuListeners) l(screen);
  }

  onContextMenu(listener: Listener<Point>): () => void {
    this.menuListeners.add(listener);
    return () => {
      this.menuListeners.delete(listener);
    };
  }
}

/** Everything the UI needs, wired once at startup. */
export interface AppServices {
  readonly editor: Editor;
  readonly tools: ToolRegistry;
  readonly toolContext: ToolContext;
  readonly keymap: Keymap;
  readonly isMac: boolean;
  readonly ui: UiBus;
  runCommand(id: CommandId): void;
  /** Serialized selection for the clipboard; null when nothing is selected. */
  copySelection(): string | null;
  /** Copies, then deletes the selection. */
  cutSelection(): string | null;
  /** Pastes Tabula clipboard text; returns false when it was not ours. */
  pasteText(text: string, inPlace: boolean): boolean;
}

export function detectMac(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function createApp(options: { dev: boolean; isMac: boolean }): AppServices {
  const editor = new Editor();
  const tools = createTools();
  const ui = new UiBus();
  const toolContext: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (world) => editor.hitTest(world),
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

  return {
    editor,
    tools,
    toolContext,
    keymap,
    isMac: options.isMac,
    ui,
    runCommand(id) {
      const cmd = COMMANDS[id];
      if (cmd.devOnly === true && !options.dev) return;
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
      if (!elements) return false;
      const at = inPlace ? null : pasteTarget();
      editor.update((s) => pasteElements(s, elements, at));
      return true;
    },
  };
}

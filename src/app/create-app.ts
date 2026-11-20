import { COMMANDS, type CommandId } from '../core/actions/commands';
import { DEFAULT_BINDINGS } from '../core/keymap/bindings';
import { Keymap } from '../core/keymap/keymap';
import { Editor } from '../core/store/editor';
import { createTools, type ToolContext, type ToolRegistry } from '../core/tools';

/** Everything the UI needs, wired once at startup. */
export interface AppServices {
  readonly editor: Editor;
  readonly tools: ToolRegistry;
  readonly toolContext: ToolContext;
  readonly keymap: Keymap;
  readonly isMac: boolean;
  runCommand(id: CommandId): void;
}

export function detectMac(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function createApp(options: { dev: boolean; isMac: boolean }): AppServices {
  const editor = new Editor();
  const tools = createTools();
  const toolContext: ToolContext = {
    getState: editor.getState,
    update: editor.update,
    hitTest: (world) => editor.hitTest(world),
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

  return {
    editor,
    tools,
    toolContext,
    keymap,
    isMac: options.isMac,
    runCommand(id) {
      const cmd = COMMANDS[id];
      if (cmd.devOnly === true && !options.dev) return;
      editor.update((s) => cmd.run(s));
    },
  };
}

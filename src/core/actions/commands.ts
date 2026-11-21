import type { I18nKey } from '../../i18n/en';
import { selectedIds, type AppState, type ToolId } from '../store/app-state';
import type { Editor } from '../store/editor';
import { clearSelection, setTool, toggleDebug } from './actions';
import {
  alignSelection,
  deleteSelection,
  deselect,
  distributeSelection,
  duplicateSelection,
  flipSelection,
  groupSelection,
  moveInZ,
  nudgeSelection,
  selectAll,
  toggleLockSelection,
  ungroupSelection,
  unlockAll,
  type Alignment,
  type ZMove,
} from './edit-actions';

/**
 * Argument-free commands: the single registry the keymap, menus, command
 * palette and shortcut dialog draw from.
 */
export interface Command {
  readonly id: CommandId;
  readonly labelKey: I18nKey;
  /** Only available in development builds. */
  readonly devOnly?: boolean;
  /** History coalescing key (repeated nudges merge into one undo step). */
  readonly historyKey?: string;
  /** Fires again on key auto-repeat. */
  readonly repeat?: boolean;
  /** Whether the command can run now (menus grey it out otherwise). */
  readonly enabled?: (state: AppState) => boolean;
  /** A pure state transition… */
  readonly run?: (state: AppState) => AppState;
  /** …or an editor-level effect (undo/redo). */
  readonly perform?: (editor: Editor) => void;
}

export type CommandId =
  | 'tool.select'
  | 'tool.rectangle'
  | 'tool.diamond'
  | 'tool.ellipse'
  | 'tool.line'
  | 'tool.arrow'
  | 'tool.freedraw'
  | 'selection.clear'
  | 'selection.all'
  | 'history.undo'
  | 'history.redo'
  | 'edit.delete'
  | 'edit.duplicate'
  | 'edit.group'
  | 'edit.ungroup'
  | 'edit.lock'
  | 'edit.unlockAll'
  | 'edit.flipH'
  | 'edit.flipV'
  | 'z.back'
  | 'z.backward'
  | 'z.forward'
  | 'z.front'
  | 'align.left'
  | 'align.centerX'
  | 'align.right'
  | 'align.top'
  | 'align.centerY'
  | 'align.bottom'
  | 'distribute.x'
  | 'distribute.y'
  | 'nudge.left'
  | 'nudge.right'
  | 'nudge.up'
  | 'nudge.down'
  | 'nudge.leftFar'
  | 'nudge.rightFar'
  | 'nudge.upFar'
  | 'nudge.downFar'
  | 'debug.toggle';

/** Runs a command against an editor (shared by keymap, menus and palette). */
export function executeCommand(editor: Editor, cmd: Command): void {
  if (cmd.enabled && !cmd.enabled(editor.getState())) return;
  if (cmd.perform) {
    cmd.perform(editor);
    return;
  }
  const run = cmd.run;
  if (!run) return;
  editor.update((s) => run(s), cmd.historyKey === undefined ? {} : { history: cmd.historyKey });
}

/** Shift+arrow nudge distance in world units. */
export const NUDGE_FAR = 10;

function hasSelection(s: AppState): boolean {
  return selectedIds(s).length > 0;
}

function multi(min: number) {
  return (s: AppState): boolean => selectedIds(s).length >= min;
}

/** Drawing tools clear the selection when activated. */
function drawTool(id: CommandId, labelKey: I18nKey, tool: ToolId): Command {
  return { id, labelKey, run: (s) => setTool(clearSelection(s), tool) };
}

function zMove(id: CommandId, labelKey: I18nKey, move: ZMove): Command {
  return { id, labelKey, enabled: hasSelection, run: (s) => moveInZ(s, move) };
}

function align(id: CommandId, labelKey: I18nKey, a: Alignment): Command {
  return { id, labelKey, enabled: multi(2), run: (s) => alignSelection(s, a) };
}

function nudge(id: CommandId, dx: number, dy: number): Command {
  return {
    id,
    labelKey: 'command.nudge',
    historyKey: 'nudge',
    repeat: true,
    enabled: hasSelection,
    run: (s) => nudgeSelection(s, dx, dy),
  };
}

export const COMMANDS: Readonly<Record<CommandId, Command>> = {
  'tool.select': {
    id: 'tool.select',
    labelKey: 'command.toolSelect',
    run: (s) => setTool(s, 'select'),
  },
  'tool.rectangle': drawTool('tool.rectangle', 'command.toolRectangle', 'rectangle'),
  'tool.diamond': drawTool('tool.diamond', 'command.toolDiamond', 'diamond'),
  'tool.ellipse': drawTool('tool.ellipse', 'command.toolEllipse', 'ellipse'),
  'tool.line': drawTool('tool.line', 'command.toolLine', 'line'),
  'tool.arrow': drawTool('tool.arrow', 'command.toolArrow', 'arrow'),
  'tool.freedraw': drawTool('tool.freedraw', 'command.toolFreedraw', 'freedraw'),
  'selection.clear': { id: 'selection.clear', labelKey: 'command.deselect', run: deselect },
  'selection.all': { id: 'selection.all', labelKey: 'command.selectAll', run: selectAll },
  'history.undo': {
    id: 'history.undo',
    labelKey: 'command.undo',
    repeat: true,
    perform: (e) => {
      e.undo();
    },
  },
  'history.redo': {
    id: 'history.redo',
    labelKey: 'command.redo',
    repeat: true,
    perform: (e) => {
      e.redo();
    },
  },
  'edit.delete': {
    id: 'edit.delete',
    labelKey: 'command.delete',
    enabled: hasSelection,
    run: deleteSelection,
  },
  'edit.duplicate': {
    id: 'edit.duplicate',
    labelKey: 'command.duplicate',
    enabled: hasSelection,
    run: duplicateSelection,
  },
  'edit.group': {
    id: 'edit.group',
    labelKey: 'command.group',
    enabled: multi(2),
    run: groupSelection,
  },
  'edit.ungroup': {
    id: 'edit.ungroup',
    labelKey: 'command.ungroup',
    enabled: (s) => selectedIds(s).some((id) => (s.scene.entities[id]?.groupIds.length ?? 0) > 0),
    run: ungroupSelection,
  },
  'edit.lock': {
    id: 'edit.lock',
    labelKey: 'command.lock',
    enabled: hasSelection,
    run: toggleLockSelection,
  },
  'edit.unlockAll': {
    id: 'edit.unlockAll',
    labelKey: 'command.unlockAll',
    enabled: (s) => s.scene.order.some((id) => s.scene.entities[id]?.locked === true),
    run: unlockAll,
  },
  'edit.flipH': {
    id: 'edit.flipH',
    labelKey: 'command.flipH',
    enabled: hasSelection,
    run: (s) => flipSelection(s, 'horizontal'),
  },
  'edit.flipV': {
    id: 'edit.flipV',
    labelKey: 'command.flipV',
    enabled: hasSelection,
    run: (s) => flipSelection(s, 'vertical'),
  },
  'z.back': zMove('z.back', 'command.sendToBack', 'back'),
  'z.backward': zMove('z.backward', 'command.sendBackward', 'backward'),
  'z.forward': zMove('z.forward', 'command.bringForward', 'forward'),
  'z.front': zMove('z.front', 'command.bringToFront', 'front'),
  'align.left': align('align.left', 'command.alignLeft', 'left'),
  'align.centerX': align('align.centerX', 'command.alignCenterX', 'centerX'),
  'align.right': align('align.right', 'command.alignRight', 'right'),
  'align.top': align('align.top', 'command.alignTop', 'top'),
  'align.centerY': align('align.centerY', 'command.alignCenterY', 'centerY'),
  'align.bottom': align('align.bottom', 'command.alignBottom', 'bottom'),
  'distribute.x': {
    id: 'distribute.x',
    labelKey: 'command.distributeX',
    enabled: multi(3),
    run: (s) => distributeSelection(s, 'x'),
  },
  'distribute.y': {
    id: 'distribute.y',
    labelKey: 'command.distributeY',
    enabled: multi(3),
    run: (s) => distributeSelection(s, 'y'),
  },
  'nudge.left': nudge('nudge.left', -1, 0),
  'nudge.right': nudge('nudge.right', 1, 0),
  'nudge.up': nudge('nudge.up', 0, -1),
  'nudge.down': nudge('nudge.down', 0, 1),
  'nudge.leftFar': nudge('nudge.leftFar', -NUDGE_FAR, 0),
  'nudge.rightFar': nudge('nudge.rightFar', NUDGE_FAR, 0),
  'nudge.upFar': nudge('nudge.upFar', 0, -NUDGE_FAR),
  'nudge.downFar': nudge('nudge.downFar', 0, NUDGE_FAR),
  'debug.toggle': {
    id: 'debug.toggle',
    labelKey: 'command.toggleDebug',
    devOnly: true,
    run: toggleDebug,
  },
};

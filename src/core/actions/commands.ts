import type { I18nKey } from '../../i18n/en';
import type { AppState, ToolId } from '../store/app-state';
import { clearSelection, setTool, toggleDebug } from './actions';

/**
 * Argument-free commands: the single registry the keymap, command palette and
 * shortcut dialog draw from.
 */
export interface Command {
  readonly id: CommandId;
  readonly labelKey: I18nKey;
  /** Only available in development builds. */
  readonly devOnly?: boolean;
  run(state: AppState): AppState;
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
  | 'debug.toggle';

/** Drawing tools clear the selection when activated. */
function drawTool(tool: ToolId) {
  return (s: AppState): AppState => setTool(clearSelection(s), tool);
}

export const COMMANDS: Readonly<Record<CommandId, Command>> = {
  'tool.select': {
    id: 'tool.select',
    labelKey: 'command.toolSelect',
    run: (s) => setTool(s, 'select'),
  },
  'tool.rectangle': {
    id: 'tool.rectangle',
    labelKey: 'command.toolRectangle',
    run: drawTool('rectangle'),
  },
  'tool.diamond': {
    id: 'tool.diamond',
    labelKey: 'command.toolDiamond',
    run: drawTool('diamond'),
  },
  'tool.ellipse': {
    id: 'tool.ellipse',
    labelKey: 'command.toolEllipse',
    run: drawTool('ellipse'),
  },
  'tool.line': {
    id: 'tool.line',
    labelKey: 'command.toolLine',
    run: drawTool('line'),
  },
  'tool.arrow': {
    id: 'tool.arrow',
    labelKey: 'command.toolArrow',
    run: drawTool('arrow'),
  },
  'tool.freedraw': {
    id: 'tool.freedraw',
    labelKey: 'command.toolFreedraw',
    run: drawTool('freedraw'),
  },
  'selection.clear': {
    id: 'selection.clear',
    labelKey: 'command.deselect',
    run: clearSelection,
  },
  'debug.toggle': {
    id: 'debug.toggle',
    labelKey: 'command.toggleDebug',
    devOnly: true,
    run: toggleDebug,
  },
};

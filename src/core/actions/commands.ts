import type { I18nKey } from '../../i18n/en';
import type { AppState } from '../store/app-state';
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

export type CommandId = 'tool.select' | 'tool.rectangle' | 'selection.clear' | 'debug.toggle';

export const COMMANDS: Readonly<Record<CommandId, Command>> = {
  'tool.select': {
    id: 'tool.select',
    labelKey: 'command.toolSelect',
    run: (s) => setTool(s, 'select'),
  },
  'tool.rectangle': {
    id: 'tool.rectangle',
    labelKey: 'command.toolRectangle',
    run: (s) => setTool(clearSelection(s), 'rectangle'),
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

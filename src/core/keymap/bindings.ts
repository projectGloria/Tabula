import type { KeyBinding } from './keymap';

/** Single source of truth for default shortcuts. */
export const DEFAULT_BINDINGS: readonly KeyBinding[] = [
  { combo: 'V', command: 'tool.select' },
  { combo: 'R', command: 'tool.rectangle' },
  { combo: 'Escape', command: 'selection.clear' },
  { combo: 'Mod+Shift+D', command: 'debug.toggle' },
];

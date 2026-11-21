import type { KeyBinding } from './keymap';

/** Single source of truth for default shortcuts. */
export const DEFAULT_BINDINGS: readonly KeyBinding[] = [
  { combo: 'V', command: 'tool.select' },
  { combo: 'R', command: 'tool.rectangle' },
  { combo: 'D', command: 'tool.diamond' },
  { combo: 'O', command: 'tool.ellipse' },
  { combo: 'L', command: 'tool.line' },
  { combo: 'A', command: 'tool.arrow' },
  { combo: 'P', command: 'tool.freedraw' },
  { combo: 'Escape', command: 'selection.clear' },
  { combo: 'Mod+Shift+D', command: 'debug.toggle' },
];

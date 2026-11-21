/** English string table — the source of truth for all i18n keys. */
export const en = {
  'app.title': 'Tabula',
  'toolbar.label': 'Tools',
  'tool.select': 'Select',
  'tool.rectangle': 'Rectangle',
  'tool.diamond': 'Diamond',
  'tool.ellipse': 'Ellipse',
  'tool.line': 'Line',
  'tool.arrow': 'Arrow',
  'tool.freedraw': 'Pencil',
  'command.toolSelect': 'Select tool',
  'command.toolRectangle': 'Rectangle tool',
  'command.toolDiamond': 'Diamond tool',
  'command.toolEllipse': 'Ellipse tool',
  'command.toolLine': 'Line tool',
  'command.toolArrow': 'Arrow tool',
  'command.toolFreedraw': 'Pencil tool',
  'command.toggleDebug': 'Toggle debug overlay',
  'command.deselect': 'Deselect all',
  'canvas.label': 'Drawing canvas',
  'shortcut.withKey': '{label} — {key}',
  'debug.fps': 'FPS {value}',
  'debug.elements': 'Elements {visible} / {total}',
  'debug.zoom': 'Zoom {value}%',
  'debug.cells': 'Grid cells {value}',
} as const satisfies Record<string, string>;

export type I18nKey = keyof typeof en;

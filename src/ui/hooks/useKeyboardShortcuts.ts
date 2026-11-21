import { useEffect } from 'react';
import { COMMANDS } from '../../core/actions/commands';
import { isEditableTarget } from '../../core/keymap/keymap';
import { useApp } from '../app-context';

/** Global keydown → central keymap. Never fires while typing in editable fields. */
export function useKeyboardShortcuts(): void {
  const app = useApp();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target instanceof HTMLElement ? e.target : null)) return;
      // Dialogs own the keyboard while open.
      if (app.ui.dialog.get() !== null) return;
      if (e.code === 'Escape') {
        const state = app.editor.getState();
        app.tools[state.activeTool].cancel(app.toolContext);
      }
      if (e.code === 'Enter' && !e.repeat) {
        const tool = app.tools[app.editor.getState().activeTool];
        if (tool.finish) {
          e.preventDefault();
          tool.finish(app.toolContext);
          return;
        }
      }
      const command = app.keymap.match(e);
      if (command === undefined) return;
      e.preventDefault();
      if (e.repeat && COMMANDS[command].repeat !== true) return;
      app.runCommand(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [app]);
}

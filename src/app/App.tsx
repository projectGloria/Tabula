import { AppContext } from '../ui/app-context';
import { Canvas } from '../ui/Canvas';
import { ContextMenu } from '../ui/ContextMenu';
import { useSyncExternalStore } from 'react';
import { DrawingsDialog } from '../ui/DrawingsDialog';
import { ExportDialog } from '../ui/ExportDialog';
import { MainMenu } from '../ui/MainMenu';
import { Notices } from '../ui/Notices';
import { useApp } from '../ui/app-context';
import { useClipboard } from '../ui/hooks/useClipboard';
import { useFileDrop } from '../ui/hooks/useFileDrop';
import { useKeyboardShortcuts } from '../ui/hooks/useKeyboardShortcuts';
import { StylePanel } from '../ui/StylePanel';
import { TextEditor } from '../ui/TextEditor';
import { Toolbar } from '../ui/Toolbar';
import { CommandPalette } from '../ui/CommandPalette';
import { ShortcutsDialog } from '../ui/ShortcutsDialog';
import { ModeExit, ViewControls } from '../ui/ViewControls';
import { useEditorState } from '../ui/hooks/useEditorState';
import type { AppServices } from './create-app';

function Shell() {
  useKeyboardShortcuts();
  useClipboard();
  useFileDrop();
  const app = useApp();
  const dialog = useSyncExternalStore(app.ui.dialog.subscribe, app.ui.dialog.get);
  const zen = useEditorState((s) => s.zenMode);
  const view = useEditorState((s) => s.viewMode);
  // Zen hides the panels; view mode hides every editing control.
  const chrome = !zen && !view;
  return (
    <main className={view ? 'app view-mode' : zen ? 'app zen-mode' : 'app'}>
      <Canvas />
      <TextEditor />
      {chrome && <Toolbar />}
      {chrome && <StylePanel />}
      <ContextMenu />
      {!zen && <MainMenu />}
      {!zen && <ViewControls />}
      <ModeExit />
      <Notices />
      {dialog === 'drawings' && <DrawingsDialog />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'palette' && <CommandPalette />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
    </main>
  );
}

export function App({ services }: { services: AppServices }) {
  return (
    <AppContext.Provider value={services}>
      <Shell />
    </AppContext.Provider>
  );
}

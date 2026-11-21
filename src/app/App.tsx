import { AppContext } from '../ui/app-context';
import { Canvas } from '../ui/Canvas';
import { ContextMenu } from '../ui/ContextMenu';
import { useSyncExternalStore } from 'react';
import { DrawingsDialog } from '../ui/DrawingsDialog';
import { MainMenu } from '../ui/MainMenu';
import { Notices } from '../ui/Notices';
import { useApp } from '../ui/app-context';
import { useClipboard } from '../ui/hooks/useClipboard';
import { useFileDrop } from '../ui/hooks/useFileDrop';
import { useKeyboardShortcuts } from '../ui/hooks/useKeyboardShortcuts';
import { StylePanel } from '../ui/StylePanel';
import { TextEditor } from '../ui/TextEditor';
import { Toolbar } from '../ui/Toolbar';
import type { AppServices } from './create-app';

function Shell() {
  useKeyboardShortcuts();
  useClipboard();
  useFileDrop();
  const app = useApp();
  const dialog = useSyncExternalStore(app.ui.dialog.subscribe, app.ui.dialog.get);
  return (
    <main className="app">
      <Canvas />
      <TextEditor />
      <Toolbar />
      <StylePanel />
      <ContextMenu />
      <MainMenu />
      <Notices />
      {dialog === 'drawings' && <DrawingsDialog />}
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

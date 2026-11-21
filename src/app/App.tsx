import { AppContext } from '../ui/app-context';
import { Canvas } from '../ui/Canvas';
import { ContextMenu } from '../ui/ContextMenu';
import { useClipboard } from '../ui/hooks/useClipboard';
import { useKeyboardShortcuts } from '../ui/hooks/useKeyboardShortcuts';
import { StylePanel } from '../ui/StylePanel';
import { TextEditor } from '../ui/TextEditor';
import { Toolbar } from '../ui/Toolbar';
import type { AppServices } from './create-app';

function Shell() {
  useKeyboardShortcuts();
  useClipboard();
  return (
    <main className="app">
      <Canvas />
      <TextEditor />
      <Toolbar />
      <StylePanel />
      <ContextMenu />
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

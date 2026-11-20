import { AppContext } from '../ui/app-context';
import { Canvas } from '../ui/Canvas';
import { useKeyboardShortcuts } from '../ui/hooks/useKeyboardShortcuts';
import { Toolbar } from '../ui/Toolbar';
import type { AppServices } from './create-app';

function Shell() {
  useKeyboardShortcuts();
  return (
    <main className="app">
      <Canvas />
      <Toolbar />
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

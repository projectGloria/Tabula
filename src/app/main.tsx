import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/fonts.css';
import '../ui/styles.css';
import { installTextMeasurement } from './text-setup';
import { App } from './App';
import { createApp, detectMac } from './create-app';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing');

// Services are created once, outside React, so StrictMode double-mounts are harmless.
// The saved drawing is restored before the first render.
void createApp({ dev: import.meta.env.DEV, isMac: detectMac() }).then((services) => {
  installTextMeasurement(services.editor);
  createRoot(rootEl).render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
});

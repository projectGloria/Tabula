import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import { App } from './App';
import { createApp, detectMac } from './create-app';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing');

// Services are created once, outside React, so StrictMode double-mounts are harmless.
const services = createApp({ dev: import.meta.env.DEV, isMac: detectMac() });

createRoot(rootEl).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);

import { t } from '../i18n/t';
import type { UiBus } from './ui-bus';

/**
 * Registers the build-time service worker (production only). When a newer
 * version is waiting, a toast offers to reload into it.
 */
export function registerServiceWorker(ui: UiBus): void {
  if (!('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  // Only reload when the user asked for the update, not on first install.
  let reloadOnChange = false;
  container.addEventListener('controllerchange', () => {
    if (reloadOnChange) window.location.reload();
  });

  const offer = (worker: ServiceWorker): void => {
    ui.notify(t('update.available'), 'info', {
      label: t('update.reload'),
      run: () => {
        reloadOnChange = true;
        worker.postMessage('skipWaiting');
      },
    });
  };

  const register = (): void => {
    container
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        if (reg.waiting && container.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            // A controller already exists, so this is an update, not the first install.
            if (next.state === 'installed' && container.controller) offer(next);
          });
        });
      })
      .catch(() => {
        // Offline support is optional; the app still works without it.
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

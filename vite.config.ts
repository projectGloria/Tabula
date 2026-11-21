import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Files in public/ that the offline cache must hold besides the bundle. */
const PUBLIC_FILES = [
  'manifest.webmanifest',
  'Tabula.ico',
  'icon-96.png',
  'icon-128.png',
  'icon-256.png',
];

/** FNV-1a; only used to give each build's cache a distinct name. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function workerSource(version: string, assets: readonly string[]): string {
  return `// Generated at build time. Cache-first offline support for Tabula.
const CACHE = ${JSON.stringify(`tabula-${version}`)};
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('tabula-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const navigate = request.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(navigate ? ASSETS[0] : request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && !navigate) void cache.put(request, response.clone());
      return response;
    }),
  );
});
`;
}

/** Emits sw.js listing every built file, so the app works fully offline. */
function serviceWorker(): Plugin {
  let base = '/';
  return {
    name: 'tabula-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        .sort();
      const assets = [base, ...[...built, ...PUBLIC_FILES].map((f) => base + f)];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: workerSource(hash(built.join('\n')), assets),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

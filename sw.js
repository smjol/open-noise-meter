// Service worker: network first, cache as offline fallback.
// Bump CACHE when the file list changes.

const CACHE = 'onm-v1';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/audio-engine.js',
  'js/calibration.js',
  'js/i18n.js',
  'js/session.js',
  'js/storage.js',
  'js/dsp/bands.js',
  'js/dsp/levels.js',
  'js/dsp/weighting.js',
  'js/ui/canvas.js',
  'js/ui/history-chart.js',
  'js/ui/meter.js',
  'js/ui/spectrogram.js',
  'js/ui/spectrum.js',
  'js/worklet/level-processor.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});

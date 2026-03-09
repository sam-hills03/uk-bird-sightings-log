const CACHE_NAME = 'bird-log-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './uk_birds.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  './icon-192.png', // Add this
  './icon-512.png'  // Add this
];

// Install the service worker and cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Serve files from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

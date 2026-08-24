// CHRISTOS Service Worker
const CACHE_NAME = 'christos-cache-v2.6.1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((k) => {
                    if (k !== CACHE_NAME) return caches.delete(k);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Network first, cache fallback for static assets
    if (e.request.url.includes('/api/stream.php') || e.request.url.includes('/api/movies.php?action=stream')) {
        return; // Don't cache live media streams
    }
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});

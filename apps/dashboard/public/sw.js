// Install as an app (14 Oct 2026). Chrome offers its one-tap "Install app" sheet only to a site
// with a service worker that handles fetch. This one caches NOTHING and only passes requests
// through, so a new panel deploy is never hidden behind an old copy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Pass-through: the browser fetches as if there were no service worker.
});

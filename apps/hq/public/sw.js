// MettleUp HQ service worker. Its only job is to make HQ installable and to show a plain page when
// the phone has no internet. It NEVER stores an API answer or any page of HQ: everything goes
// straight to the network. The only things kept are the three public offline files below.
const CACHE = 'hq-offline-v2';
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/offline.css', '/icons/icon-192-v2.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only a page being opened can fall back to the offline page. Everything else (the API, scripts,
  // styles, pictures) is left alone, so the browser asks the network as if there were no worker.
  if (req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())));
});

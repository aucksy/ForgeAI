// The panel's service worker.
//  - 14 Oct 2026: Chrome offers its one-tap "Install app" sheet only to a site with a service worker
//    that handles fetch.
//  - R-55 (22 Oct 2026, offline front desk step 1, owner #7): it also keeps the panel's own page and
//    its files, so the panel OPENS with no internet and shows the copy of the gym kept on this
//    device (src/crm/data/savedCopy.ts). Network first, always: online, the newest deploy is used
//    and kept; the kept copy is used only when the network fails, so a new deploy is never hidden
//    behind an old one. Never kept: the gym server (/sb), the Worker's own pages (/api, /j, /c, /app),
//    the landing page (/home), the stand-alone join, check-in, privacy, terms and data agreement
//    pages (#59), and anything not on this site (R-76: the site serves /privacy.html at /privacy,
//    which would otherwise be kept as the panel's own page).
const CACHE = 'forgeai-panel-v1';
const SHELL = '/';
const SKIP = /^\/(sb|api|j|c|app|home)(\/|$)|^\/(join|checkin|privacy|terms|data-agreement)(\.html)?$/;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(keepShell());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

/** The page and every /assets/ file it names, kept now (so the very first visit already works offline). */
async function keepShell(html) {
  try {
    const cache = await caches.open(CACHE);
    if (html === undefined) {
      const res = await fetch(SHELL, { cache: 'no-store' });
      if (!res.ok) return;
      html = await res.clone().text();
      await cache.put(SHELL, res);
    }
    const files = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
    await Promise.all([...files].map((f) => cache.match(f).then((hit) => hit || cache.add(f))));
    // A deploy's old files are dropped once the page no longer names them.
    for (const req of await cache.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith('/assets/') && !files.has(path)) await cache.delete(req);
    }
  } catch (err) {
    console.warn('[sw] the panel could not be kept for offline use', err);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    if (url.pathname.endsWith('.html')) return;
    e.respondWith(page(req));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith(file(req));
  }
});

/** A panel page (every route is the same single page): the network's, else the kept one. */
async function page(req) {
  try {
    const res = await fetch(req);
    const type = res.headers.get('Content-Type') || '';
    if (res.ok && type.includes('text/html')) {
      const copy = res.clone();
      copy
        .text()
        .then((html) => caches.open(CACHE).then((c) => c.put(SHELL, new Response(html, { headers: { 'Content-Type': type } })).then(() => keepShell(html))))
        .catch((err) => console.warn('[sw] page not kept', err));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(SHELL);
    if (hit) return hit;
    throw err;
  }
}

async function file(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch((err) => console.warn('[sw] not kept', req.url, err));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}

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
// F147: /f/<CODE> and friend.html, a member's "bring a friend" page, are never the panel's page either.
// R-480 (13 Nov 2026): the 4 policy pages (refund, delivery, contact, about) and delete-account are site pages too.
// R-513 (14 Nov 2026): /m/<CODE> and join-online.html, a gym's "Become a member" page, the same.
const SKIP = /^\/(sb|api|j|c|f|m|app|home)(\/|$)|^\/(join|join-online|checkin|friend|privacy|terms|data-agreement|delete-account|refund|delivery|contact|about)(\.html)?$/;

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
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/favicon.') || url.pathname === '/manifest.webmanifest') {
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

// R-506 phase 3 (supabase 0076): the gym's alerts with the admin app CLOSED (Web Push from the HQ Worker,
// deploy/hq/panelPush.js). A message is { title, body, route, tag }. The tag is the same one the open page's own notice
// uses (ui/NeedsYou.tsx), so one alert never shows twice. A tap opens that page of the admin app (an open tab is reused).
const ROUTE = /^\/[A-Za-z0-9/_-]{0,100}$/;

/** A push's words and page, checked (pure; also read by test/crm/webPush.test.ts). */
function pushNotice(m) {
  const o = m && typeof m === 'object' ? m : {};
  return {
    title: typeof o.title === 'string' && o.title.trim() ? o.title.slice(0, 80) : 'MettleUp: news from your members',
    body: typeof o.body === 'string' && o.body.trim() ? o.body.slice(0, 240) : 'Open the admin app to see what is new.',
    route: typeof o.route === 'string' && ROUTE.test(o.route) ? o.route : '/',
    tag: typeof o.tag === 'string' && o.tag ? o.tag.slice(0, 80) : 'mettleup-alert',
  };
}

// R-578 (supabase 0095): "Send a test alert". A test's tag is 'mettleup-test-<alert id>'. Once it is shown, this
// worker tells the gym server (panel_test_alert_shown: the alert id only, nothing about the person or the device) and
// any open admin app tab, so the alerts card can say "It showed on this device at 7:41 pm". The gym server is reached
// the way the page reaches it: our own address (/sb) on our site, Supabase's own address otherwise or if that fails.
// The key is the public one the page ships with (src/lib/supabase.ts); the call checks nothing but the alert id.
const TEST_TAG = /^mettleup-test-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const OUR_HOSTS = ['app.mettleup.fit', 'forgeai.aakashpahuja.in'];
const GYM_SERVER = 'https://hdxzqbdiokjklnypfisq.supabase.co';
const PUBLIC_KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';

/** The test alert's id in a notice tag, or null (pure; also read by test/crm/webPush.test.ts). */
function testAlertId(tag) {
  const m = TEST_TAG.exec(typeof tag === 'string' ? tag : '');
  return m ? m[1] : null;
}

/** Tell the gym server, then any open tab, that this test was shown. Never throws. */
async function testShown(id) {
  const host = new URL(self.location.origin).hostname;
  const bases = OUR_HOSTS.includes(host) ? [`${self.location.origin}/sb`, GYM_SERVER] : [GYM_SERVER];
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_KEY }, body: JSON.stringify({ p_alert: id }) };
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/rest/v1/rpc/panel_test_alert_shown`, opts);
      if (res.ok) break;
      console.warn('[sw] the test alert was shown, but the gym server answered', res.status);
    } catch (err) {
      console.warn('[sw] the test alert was shown, but the gym server could not be told', err);
    }
  }
  try {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'mettleup-test-shown', id });
  } catch (err) {
    console.warn('[sw] could not tell the open admin app about the test alert', err);
  }
}

self.addEventListener('push', (e) => {
  let m = null;
  try {
    m = e.data ? e.data.json() : null;
  } catch (err) {
    console.warn('[sw] a push that is not JSON', err);
  }
  const n = pushNotice(m);
  e.waitUntil(
    (async () => {
      await self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: '/brand/admin-icon-192.png', badge: '/brand/admin-icon-192.png', data: { route: n.route } });
      const test = testAlertId(n.tag);
      if (test) await testShown(test);
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const route = pushNotice({ route: e.notification.data && e.notification.data.route }).route;
  const url = new URL(`/#${route}`, self.location.origin).href;
  e.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of open) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        await c.focus();
        try {
          await c.navigate(url);
        } catch (err) {
          console.warn('[sw] could not open the page in the open tab', err);
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

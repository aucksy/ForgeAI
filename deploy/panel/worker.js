// The panel's Worker (14 Oct 2026). Everything is still the static panel (apps/dashboard/dist),
// except two paths that need a little server work (wrangler.jsonc run_worker_first):
//  - /j/<CODE>  the gym's invite link page (join.html), with the gym filled in before it is sent —
//               so WhatsApp's link preview shows "Join <gym>" and the gym's logo, and the page
//               draws at once. On a phone with the app, Android opens the app instead.
//  - /app       the newest ForgeAI APK (whatever the latest GitHub release is), so the page, the
//               poster and old messages never point at an old version.
// Android's link check (/.well-known/assetlinks.json) is a plain static file.

const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
// The public, read-only app key (the same one in the panel and the app).
const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
const REPO = 'https://github.com/aucksy/ForgeAI';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const invite = /^\/j\/([A-Za-z0-9]{6})\/?$/.exec(url.pathname);
    if (invite) return joinPage(request, env, ctx, url, invite[1].toUpperCase());
    if (url.pathname.startsWith('/j/')) return joinPage(request, env, ctx, url, null);
    if (url.pathname === '/app' || url.pathname === '/app/') return latestApk(ctx);
    return env.ASSETS.fetch(request);
  },
};

/** gym_preview (migration 0007), kept 5 minutes per code. undefined = could not ask. */
async function preview(code, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.forgeai/preview/${code}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/gym_preview`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    });
    if (!r.ok) return undefined;
    const gym = await r.json();
    const value = gym && gym.gymName ? gym : null;
    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(value), { headers: { 'Cache-Control': 'max-age=300' } })));
    return value;
  } catch {
    return undefined;
  }
}

async function joinPage(request, env, ctx, url, code) {
  // html_handling serves /join.html at /join. Never a "not modified" answer: the page carries this
  // gym's name and logo, so a browser's copy of another visit must not be reused.
  const ask = new Request(new URL('/join', url), request);
  ask.headers.delete('If-None-Match');
  ask.headers.delete('If-Modified-Since');
  const page = await env.ASSETS.fetch(ask);
  if (!page.ok) return page;
  const gym = code ? await preview(code, ctx) : null;
  let rw = new HTMLRewriter();
  if (gym !== undefined) {
    // Inside a <script>: "<" escaped so a gym name can never close the tag.
    const json = JSON.stringify(gym).replace(/</g, '\\u003c');
    rw = rw.on('head', { element: (e) => e.append(`<script>window.__GYM__=${json};</script>`, { html: true }) });
  }
  if (gym) {
    const title = `Join ${gym.gymName} on ForgeAI`;
    const desc = `${gym.gymName} invites you to the ForgeAI app. Tap to join. Gym code ${gym.joinCode}.`;
    rw = rw
      .on('title', { element: (e) => e.setInnerContent(title) })
      .on('meta[property="og:title"]', { element: (e) => e.setAttribute('content', title) })
      .on('meta[property="og:description"]', { element: (e) => e.setAttribute('content', desc) })
      .on('meta[name="description"]', { element: (e) => e.setAttribute('content', desc) });
    const logo = gym.brand && gym.brand.logoUrl;
    if (typeof logo === 'string' && logo.startsWith(`${SUPABASE}/storage/v1/object/public/gym-logos/`)) {
      rw = rw.on('head', { element: (e) => e.append(`<meta property="og:image" content="${logo.replace(/"/g, '&quot;')}">`, { html: true }) });
    }
  }
  const out = rw.transform(page);
  const headers = new Headers(out.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(out.body, { status: !code || gym === null ? 404 : 200, headers });
}

/** 302 to the newest release's APK; the tag is looked up at most every 10 minutes. */
async function latestApk(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.forgeai/latest-tag');
  let tag = null;
  const hit = await cache.match(cacheKey);
  if (hit) tag = await hit.text();
  if (!tag) {
    try {
      const r = await fetch(`${REPO}/releases/latest`, { redirect: 'manual', headers: { 'User-Agent': 'forgeai-panel' } });
      const m = /\/releases\/tag\/(v[0-9][0-9A-Za-z.\-]*)$/.exec(r.headers.get('Location') || '');
      if (m) {
        tag = m[1];
        ctx.waitUntil(cache.put(cacheKey, new Response(tag, { headers: { 'Cache-Control': 'max-age=600' } })));
      }
    } catch {
      tag = null;
    }
  }
  const to = tag ? `${REPO}/releases/download/${tag}/forgeai-${tag}.apk` : `${REPO}/releases/latest`;
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
}

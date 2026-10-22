// The panel's Worker (14 Oct 2026). Everything is still the static panel (apps/dashboard/dist),
// except two paths that need a little server work (wrangler.jsonc run_worker_first):
//  - /j/<CODE>  the gym's invite link page (join.html), with the gym filled in before it is sent —
//               so WhatsApp's link preview shows "Join <gym>" and the gym's logo, and the page
//               draws at once. On a phone with the app, Android opens the app instead.
//  - /c/<CODE>  the gym's check-in poster link (checkin.html), filled in the same way: on a phone
//               with the app, Android opens the app's "Check in at <gym>" screen instead; this page
//               is for phones without it ("Open this in the ForgeAI app to check in" + get the app).
//  - /api/feedback  "Send feedback" from both apps (feedback.js, launch H7).
//  - /api/lead      the landing page's "free demo" form (leads.js, launch I3; the page is /home/).
//  - /sb/...    the gym server (Supabase) at our own address, so a block of supabase.co cannot stop
//               the apps (proxy.js, owner R-40, built R-55).
//  - /app       the newest ForgeAI APK (whatever the latest GitHub release is), so the page, the
//               poster and old messages never point at an old version.
// Android's link check (/.well-known/assetlinks.json) is a plain static file.

import { handleFeedback } from './feedback.js';
import { handleLead } from './leads.js';
import { handleProxy, isProxyPath } from './proxy.js';

const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
// The public, read-only app key (the same one in the panel and the app).
const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
const REPO = 'https://github.com/aucksy/ForgeAI';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // R-55: the block-proof address for the gym server (proxy.js).
    if (isProxyPath(url.pathname)) return handleProxy(request, url);
    const invite = /^\/j\/([A-Za-z0-9]{6})\/?$/.exec(url.pathname);
    if (invite) return joinPage(request, env, ctx, url, invite[1].toUpperCase());
    if (url.pathname.startsWith('/j/')) return joinPage(request, env, ctx, url, null);
    const checkIn = /^\/c\/([A-Za-z0-9]{6})\/?$/.exec(url.pathname);
    if (checkIn) return joinPage(request, env, ctx, url, checkIn[1].toUpperCase(), CHECKIN);
    if (url.pathname.startsWith('/c/')) return joinPage(request, env, ctx, url, null, CHECKIN);
    if (url.pathname === '/app' || url.pathname === '/app/') return latestApk(ctx);
    if (url.pathname === '/api/feedback') return handleFeedback(request, env);
    if (url.pathname === '/api/lead') return env.LANDING === 'live' ? handleLead(request, env) : new Response('Not found', { status: 404 });
    // Launch I2: the landing page goes public only when the owner says yes (wrangler.jsonc vars.LANDING).
    if (url.pathname === '/home' || url.pathname.startsWith('/home/')) {
      return env.LANDING === 'live' ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
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

/** The two gym pages: what each one is called, and which static page it fills in. */
const JOIN = {
  asset: '/join',
  title: (g) => `Join ${g.gymName} on ForgeAI`,
  desc: (g) => `${g.gymName} invites you to the ForgeAI app. Tap to join. Gym code ${g.joinCode}.`,
};
const CHECKIN = {
  asset: '/checkin',
  title: (g) => `Check in at ${g.gymName}`,
  desc: (g) => `Open this in the ForgeAI app to check in at ${g.gymName}. Gym code ${g.joinCode}.`,
};

async function joinPage(request, env, ctx, url, code, kind = JOIN) {
  // html_handling serves /join.html at /join (and /checkin.html at /checkin). Never a "not modified" answer: the page carries this
  // gym's name and logo, so a browser's copy of another visit must not be reused.
  const ask = new Request(new URL(kind.asset, url), request);
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
    const title = kind.title(gym);
    const desc = kind.desc(gym);
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

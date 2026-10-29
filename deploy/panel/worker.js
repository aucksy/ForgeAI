// The panel's Worker (14 Oct 2026). Since MettleUp (R-105) it runs first for every path but the
// hashed /assets/ files, and first sends each address where it belongs (hosts.js: mettleup.fit is
// the landing page, app.mettleup.fit the admin app, the old address stays for good). Everything
// else is still the static panel (apps/dashboard/dist), except the paths that need server work:
//  - /api/moved, /api/move  the old address's admin app moving a desk to app.mettleup.fit (hosts.js).
//  - /j/<CODE>  the gym's invite link page (join.html), with the gym filled in before it is sent —
//               so WhatsApp's link preview shows "Join <gym>" and the gym's logo, and the page
//               draws at once. On a phone with the app, Android opens the app instead.
//  - /c/<CODE>  the gym's check-in poster link (checkin.html), filled in the same way: on a phone
//               with the app, Android opens the app's "Check in at <gym>" screen instead; this page
//               is for phones without it ("Open this in the MettleUp app to check in" + get the app).
//  - /api/feedback  "Send feedback" from both apps (feedback.js, launch H7).
//  - /api/feedback/voice  a spoken feedback clip -> text, via Groq Whisper (voice.js, R-206). Clip not kept.
//  - /api/crash     both apps' uncaught errors, no personal data (crash.js, #34 alerts).
// Every day at 03:00 India time (Cron Trigger, wrangler.jsonc) crash reports older than 90 days are
// deleted (#72, the privacy notice says so).
//  - /api/lead      the landing page's "free demo" form (leads.js, launch I3; the page is /home/).
//  - /api/ai/match-columns  "Ask AI to match the columns" in the member import (aiMatch.js, #47).
//  - /sb/...    the gym server (Supabase) at our own address, so a block of supabase.co cannot stop
//               the apps (proxy.js, owner R-40, built R-55). After the admin app sends a message or
//               starts an offer, HQ is told to send the phone pop-ups now (proxy.js pushAfter).
//  - /app       the newest MettleUp APK (whatever the latest GitHub release is), so the page, the
//               poster and old messages never point at an old version.
// Android's link check (/.well-known/assetlinks.json) is a plain static file.

import { deleteOldCrashes, handleCrash } from './crash.js';
import { handleFeedback } from './feedback.js';
import { handleLead } from './leads.js';
import { handleVoice } from './voice.js';
import { handleMatchColumns } from './aiMatch.js';
import { handleProxy, isProxyPath, pushAfter } from './proxy.js';
import { APP_HOST, APP_ORIGIN, handleMove, routeFor } from './hosts.js';

const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
// The public, read-only app key (the same one in the panel and the app).
const KEY = 'sb_publishable_-GBJ1u036bdCX2mtff3ghQ_Gx-hZyGo';
const REPO = 'https://github.com/aucksy/ForgeAI';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // MettleUp (R-105): which address shows what (hosts.js). Redirects first, then the landing page.
    const where = routeFor(url.hostname, url.pathname, url.search, request.method, { moveOld: env.MOVE !== 'off' });
    if (where.kind === 'redirect') return new Response(null, { status: where.status, headers: { Location: where.to, 'Cache-Control': 'max-age=3600' } });
    if (where.kind === 'landing') {
      if (env.LANDING !== 'live') return Response.redirect(`${APP_ORIGIN}/`, 302);
      return env.ASSETS.fetch(new Request(new URL('/home/', url), request));
    }
    // The old address's admin app asks whether to move (src/crm/move); "off" keeps every desk where it is.
    if (url.pathname === '/api/moved') {
      return new Response(JSON.stringify({ move: env.MOVE !== 'off', to: APP_ORIGIN }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    // The old address hands a desk's sign-in over to app.mettleup.fit (hosts.js handleMove).
    if (url.pathname === '/api/move') return url.hostname === APP_HOST ? handleMove(request) : new Response('Not found', { status: 404 });
    // R-55: the block-proof address for the gym server (proxy.js).
    // R-153 step 2: a message sent or an offer started goes to members' phones at once (deploy/hq/push.js).
    if (isProxyPath(url.pathname)) return pushAfter(request, url, env, ctx, await handleProxy(request, url));
    const invite = /^\/j\/([A-Za-z0-9]{6})\/?$/.exec(url.pathname);
    if (invite) return joinPage(request, env, ctx, url, invite[1].toUpperCase());
    if (url.pathname.startsWith('/j/')) return joinPage(request, env, ctx, url, null);
    const checkIn = /^\/c\/([A-Za-z0-9]{6})\/?$/.exec(url.pathname);
    if (checkIn) return joinPage(request, env, ctx, url, checkIn[1].toUpperCase(), CHECKIN);
    if (url.pathname.startsWith('/c/')) return joinPage(request, env, ctx, url, null, CHECKIN);
    if (url.pathname === '/app' || url.pathname === '/app/') return latestApk(ctx);
    const bundle = /^\/dl\/(v[0-9]+\.[0-9]+\.[0-9]+)\.aab$/.exec(url.pathname);
    if (bundle) return playBundle(request, bundle[1], `mettleup-${bundle[1]}.aab`, 'application/octet-stream');
    const storeArt = /^\/dl\/(v[0-9]+\.[0-9]+\.[0-9]+)\/(store-[a-z0-9-]+\.png)$/.exec(url.pathname);
    if (storeArt) return playBundle(request, storeArt[1], storeArt[2], 'image/png');
    if (url.pathname === '/api/feedback') return handleFeedback(request, env);
    if (url.pathname === '/api/feedback/voice') return handleVoice(request, env);
    if (url.pathname === '/api/crash') return handleCrash(request, env);
    if (url.pathname === '/api/ai/match-columns') return handleMatchColumns(request, env);
    if (url.pathname === '/api/lead') return env.LANDING === 'live' ? handleLead(request, env) : new Response('Not found', { status: 404 });
    // Launch I2: the landing page goes public only when the owner says yes (wrangler.jsonc vars.LANDING).
    if (url.pathname === '/home' || url.pathname.startsWith('/home/')) {
      return env.LANDING === 'live' ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },

  // #72 (30 Oct 2026): crash reports are kept 90 days.
  async scheduled(_controller, env, ctx) {
    if (!env.WEB) {
      console.error('[crash] clean-up skipped: D1 binding WEB missing');
      return;
    }
    ctx.waitUntil(
      deleteOldCrashes(env.WEB).then(
        (n) => console.log('[crash] clean-up: deleted', n, 'reports older than 90 days'),
        (e) => console.error('[crash] clean-up failed', e),
      ),
    );
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
  title: (g) => `Join ${g.gymName} on MettleUp`,
  desc: (g) => `${g.gymName} invites you to the MettleUp app. Tap to join. Gym code ${g.joinCode}.`,
};
const CHECKIN = {
  asset: '/checkin',
  title: (g) => `Check in at ${g.gymName}`,
  desc: (g) => `Open this in the MettleUp app to check in at ${g.gymName}. Gym code ${g.joinCode}.`,
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

/**
 * /dl/<tag>.aab: the release's Play bundle, passed through with a CORS header for the Play Console
 * page only (R-121, 25 Oct 2026). The browser tool cannot hand a 56 MB file to the console's upload
 * box, so the console page fetches it from here. The bundle is a public release file anyway.
 * /dl/<tag>/store-*.png does the same for the store icon, banner and screenshots attached to that release.
 */
async function playBundle(request, tag, file, type) {
  const cors = { 'Access-Control-Allow-Origin': 'https://play.google.com', Vary: 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const r = await fetch(`${REPO}/releases/download/${tag}/${file}`, { headers: { 'User-Agent': 'forgeai-panel' } });
  if (!r.ok) return new Response('Not found', { status: 404, headers: cors });
  const headers = { ...cors, 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (r.headers.get('Content-Length')) headers['Content-Length'] = r.headers.get('Content-Length');
  return new Response(r.body, { headers });
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
  const to = tag ? `${REPO}/releases/download/${tag}/mettleup-${tag}.apk` : `${REPO}/releases/latest`;
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
}

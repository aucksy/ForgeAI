// MettleUp HQ (#51): the system owner's own panel, at https://hq.mettleup.fit (R-105; the old
// https://forgeai-hq.aakashpahuja.in answers too). Sign-in uses the address it was opened on.
// Plan: docs/overhaul/research/R-owner-panel.md. A separate Worker from the gym panel
// (deploy/panel) on purpose: its own address, its own sign-in, its own server key; the gym admin app
// has no way in.
//
// Every request runs this Worker first (wrangler.jsonc run_worker_first: true), so nothing of HQ,
// not even its page, is served before the sign-in check:
//   /auth/login, /auth/callback, /auth/logout   Google sign-in (auth.js), Google mode only
//   /api/*                                      the JSON API (api.js); POST only from HQ's own page
//   PUBLIC_FILES below                          the install files (manifest, icons, sw.js, offline page):
//                                               no sign-in, because a browser fetches them without cookies
//   everything else                             the static page (apps/hq/public), signed in only
// A Cron Trigger runs the nightly clean-up at 03:00 India time (scheduled() below).
// Strict headers on every answer (the install files too): a Content-Security-Policy that allows only this address
// (connect-src 'self'), no framing, no referrer, HSTS.

import { googleFinish, googleStart, isAllowed, makeSession, maskEmail, missingSettings, OAUTH_COOKIE, SESSION_COOKIE, whoIsIt } from './auth.js';
import { handleApi, json } from './api.js';
import { rpc } from './db.js';
import { nightlyWeb } from './web.js';

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export function secure(response) {
  const r = new Response(response.body, response);
  r.headers.set('Content-Security-Policy', CSP);
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'no-referrer');
  r.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  r.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  r.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (!r.headers.has('Cache-Control')) r.headers.set('Cache-Control', 'no-store');
  return r;
}

/**
 * The only files served without sign-in besides /signin.css: what a phone needs to install HQ and
 * to show "You're offline". None has any private data. Exact paths, no prefix match.
 */
export const PUBLIC_FILES = {
  '/manifest.webmanifest': { type: 'application/manifest+json; charset=utf-8', cache: 'public, max-age=3600' },
  '/icons/icon-192.png': { type: 'image/png', cache: 'public, max-age=86400' },
  '/icons/icon-512.png': { type: 'image/png', cache: 'public, max-age=86400' },
  '/icons/icon-maskable-512.png': { type: 'image/png', cache: 'public, max-age=86400' },
  '/icons/apple-touch-icon.png': { type: 'image/png', cache: 'public, max-age=86400' },
  // The browser re-checks the service worker on every visit, so an old one never sticks.
  '/sw.js': { type: 'text/javascript; charset=utf-8', cache: 'no-cache' },
  '/offline.html': { type: 'text/html; charset=utf-8', cache: 'no-cache' },
  '/offline.css': { type: 'text/css; charset=utf-8', cache: 'no-cache' },
};

/** One of PUBLIC_FILES from the static files (a redirect such as /offline.html -> /offline is followed here). */
async function publicFile(request, env, url) {
  const spec = PUBLIC_FILES[url.pathname];
  let res = await env.ASSETS.fetch(request);
  for (let hops = 0; hops < 2 && res.status >= 300 && res.status < 400 && res.headers.get('Location'); hops++) {
    res = await env.ASSETS.fetch(new Request(new URL(res.headers.get('Location'), url), { method: request.method }));
  }
  if (res.status !== 200) return new Response('Not found', { status: 404 });
  const out = new Response(res.body, { status: 200, headers: { 'Content-Type': spec.type, 'Cache-Control': spec.cache } });
  return out;
}

const PAGE_STYLE =
  'body{font:16px/1.5 system-ui,sans-serif;background:#0f1115;color:#e9ecf1;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}' +
  'main{max-width:420px}a{color:#ff8a3d}';

/** A tiny page for the sign-in steps: no script, and its look from /signin.css (the strict CSP allows no inline style). */
function page(status, title, words, link) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/signin.css"></head><body><main><h1>${esc(title)}</h1><p>${esc(words)}</p>${link ? `<p><a href="${esc(link.href)}">${esc(link.text)}</a></p>` : ''}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function redirect(location, cookies = []) {
  const h = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
}

/** A POST must come from HQ's own page: same origin, JSON. */
export function sameOrigin(request, url) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const origin = request.headers.get('Origin');
  const type = request.headers.get('Content-Type') || '';
  return origin === url.origin && type.startsWith('application/json');
}

export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  const fetchImpl = deps.fetchImpl || fetch;
  const nowSec = Math.floor((deps.now || new Date()).getTime() / 1000);
  const missing = missingSettings(env);
  if (missing.length) {
    console.error('[hq] not set up; missing:', missing.join(', '));
    return page(503, 'MettleUp HQ is not set up yet', 'A setting is missing. Ask Claude to check the HQ setup list.');
  }
  // The sign-in page's own stylesheet is the one file served before sign-in.
  if (url.pathname === '/signin.css') {
    return new Response(PAGE_STYLE, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'max-age=3600' } });
  }
  if (Object.hasOwn(PUBLIC_FILES, url.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
    return publicFile(request, env, url);
  }
  const google = env.AUTH_MODE !== 'access';

  if (google && url.pathname === '/auth/login') {
    const start = await googleStart(env, url.origin, { fresh: url.searchParams.get('fresh') === '1', back: url.searchParams.get('back') || '/' }, nowSec);
    return redirect(start.location, [start.cookie]);
  }
  if (google && url.pathname === '/auth/callback') {
    const done = await googleFinish(request, env, { fetchImpl, nowSec });
    const clear = `${OAUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    if (done.error) {
      console.warn('[hq] sign-in refused:', done.error);
      const r = page(403, 'Could not sign you in', done.refused
        ? 'This Google account cannot open MettleUp HQ.'
        : 'The sign-in did not finish. Try again.', { href: '/auth/login', text: 'Try again' });
      r.headers.append('Set-Cookie', clear);
      return r;
    }
    try {
      await rpc(env, 'hq_log', { p_actor: done.email, p_action: 'sign_in', p_detail: { fresh: nowSec - done.authAt < 120 } }, { fetchImpl, clientIp: request.headers.get('CF-Connecting-IP') || '' });
    } catch (e) {
      console.error('[hq] sign-in not written to the audit log', e instanceof Error ? e.message : 'error');
      return page(503, 'Could not sign you in', 'The gym server did not answer, so the sign-in could not be written down. Try again in a minute.', { href: '/auth/login', text: 'Try again' });
    }
    return redirect(done.back || '/', [await makeSession(env, done.email, done.authAt, nowSec), clear]);
  }
  if (url.pathname === '/auth/logout') {
    if (!google) return redirect('/cdn-cgi/access/logout');
    return redirect('/signed-out', [`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`]);
  }
  if (url.pathname === '/signed-out') {
    return page(200, 'Signed out', 'You are signed out of MettleUp HQ.', google ? { href: '/auth/login', text: 'Sign in again' } : null);
  }

  const who = await whoIsIt(request, env, { fetchImpl, nowSec });
  if (!who || !isAllowed(env, who.email)) {
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'SIGN_IN' });
    if (!google) return page(403, 'Not allowed', 'Open this page through Cloudflare Access with the allowed account.');
    return redirect(`/auth/login?back=${encodeURIComponent(url.pathname)}`);
  }

  if (url.pathname.startsWith('/api/')) {
    if (!sameOrigin(request, url)) {
      console.warn('[hq] refused a POST from another page', maskEmail(who.email));
      return json(403, { error: 'SAME_ORIGIN' });
    }
    return handleApi(request, env, who, { fetchImpl, now: deps.now, clientIp: request.headers.get('CF-Connecting-IP') || '' });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Not found', { status: 404 });
  return env.ASSETS.fetch(request);
}

/** The nightly clean-up: Cloudflare's database first, then the gym server (which logs both). */
export async function nightly(env, { fetchImpl = fetch, now = new Date() } = {}) {
  let web = {};
  if (env.WEB) {
    try {
      web = await nightlyWeb(env.WEB, now);
    } catch (e) {
      console.error('[hq-cron] web clean-up failed', e instanceof Error ? e.message : 'error');
      web = { error: 'failed' };
    }
  }
  try {
    const out = await rpc(env, 'hq_nightly_cleanup', { p_detail: web }, { fetchImpl });
    console.log('[hq-cron] clean-up done', JSON.stringify(out));
    return out;
  } catch (e) {
    console.error('[hq-cron] gym server clean-up failed', e instanceof Error ? e.message : 'error');
    throw e;
  }
}

export default {
  async fetch(request, env) {
    return secure(await handle(request, env));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(nightly(env));
  },
};

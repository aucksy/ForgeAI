// MettleUp's addresses (R-105, 24 Oct 2026): which host shows what. One Worker serves them all
// (wrangler.jsonc routes); this file only decides, so it can be tested without Cloudflare.
//
//   mettleup.fit                 the landing page at "/" (the old /home/ page). Its files, the legal
//                                pages, icons and the demo form stay here; any other path moves to
//                                app.mettleup.fit (same path), so mettleup.fit/j/CODE still works.
//   www.mettleup.fit, mettleup.in, www.mettleup.in
//                                301 to https://mettleup.fit, same path.
//   app.mettleup.fit             the admin app, the gym server address (/sb), invite and check-in
//                                links (/j, /c), /api, /start, the legal pages, the service worker.
//                                /home moves to mettleup.fit.
//   forgeai.aakashpahuja.in      the old address, kept for good: old phones reach the gym server at
//                                /sb, printed posters carry /j and /c, old apps call /api. Only /home
//                                moves (to mettleup.fit). The admin app itself moves in the browser,
//                                and only once nothing is waiting to be sent (src/crm/move).
//   anything else (workers.dev, a laptop's `wrangler dev`)   behaves like the old address.

export const OLD_HOST = 'forgeai.aakashpahuja.in';
export const APP_HOST = 'app.mettleup.fit';
export const SITE_HOST = 'mettleup.fit';
export const APP_ORIGIN = `https://${APP_HOST}`;
export const SITE_ORIGIN = `https://${SITE_HOST}`;
/** Hosts that only send people to mettleup.fit. */
export const REDIRECT_HOSTS = ['www.mettleup.fit', 'mettleup.in', 'www.mettleup.in'];

/** Paths mettleup.fit keeps for itself (the landing page needs them, or they are fine anywhere). */
const SITE_KEEPS = [
  /^\/home\/[^/]+$/, // the landing page's own files (home.js, pictures)
  /^\/api\/lead$/, // the landing page's "free demo" form
  /^\/(icons|brand)\//,
  /^\/\.well-known\//,
  /^\/(privacy|terms|data-agreement)(\.html)?$/,
  /^\/(favicon\.ico|robots\.txt)$/,
];

/** 301 for a page, 308 for anything else (a POST stays a POST). */
function move(to, method) {
  return { kind: 'redirect', to, status: method === 'GET' || method === 'HEAD' ? 301 : 308 };
}

/**
 * What to do with one request, by host and path. PURE.
 * Returns { kind: 'redirect', to, status } | { kind: 'landing' } | { kind: 'app' }.
 *  - 'landing': serve the landing page (the /home/ file) at this path.
 *  - 'app': carry on as the admin app's Worker always did (static files, /j, /c, /sb, /api ...).
 * `moveOld` false (wrangler var MOVE "off") leaves the old address exactly as it was.
 */
export function routeFor(host, pathname, search = '', method = 'GET', { moveOld = true } = {}) {
  const h = String(host || '').toLowerCase();
  const rest = `${pathname}${search}`;
  if (REDIRECT_HOSTS.includes(h)) return move(`${SITE_ORIGIN}${rest}`, method);
  if (h === SITE_HOST) {
    if (pathname === '/') return { kind: 'landing' };
    if (pathname === '/home' || pathname === '/home/' || pathname === '/home/index.html') return move(`${SITE_ORIGIN}/${search}`, method);
    if (SITE_KEEPS.some((re) => re.test(pathname))) return { kind: 'app' };
    return move(`${APP_ORIGIN}${rest}`, method);
  }
  const homePage = pathname === '/home' || pathname === '/home/' || pathname === '/home/index.html';
  if (h === APP_HOST) {
    if (homePage) return move(`${SITE_ORIGIN}/${search}`, method);
    if (pathname.startsWith('/home/')) return move(`${SITE_ORIGIN}${rest}`, method);
    return { kind: 'app' };
  }
  // The old address (and any other host): only the landing page moves.
  if (moveOld && h === OLD_HOST && homePage) return move(`${SITE_ORIGIN}/${search}`, method);
  return { kind: 'app' };
}

// ------------------------------------------------------------------ carrying a sign-in across

/** The only browser keys the old address may hand over (the sign-in, branch keys, dark or light). */
export const MOVE_KEYS = ['forgeai.cloudGym.v1', 'forgeai.branchKeys.v1', 'forgeai.theme.v1'];
const MAX_PAYLOAD = 16_000;

/**
 * POST /api/move on app.mettleup.fit: the old address's admin app hands this device's sign-in over
 * as a form (method POST, so it never sits in an address bar or a log). Only a form sent from a page
 * of the old address is taken (its Origin header), so no other site can sign a desk into a gym
 * that is not theirs. The answer is a small page that writes the keys into this address's storage
 * (/move.js; nothing is written over a sign-in this address already has) and opens `to`.
 * PURE apart from reading the form.
 */
export async function handleMove(request) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  const origin = request.headers.get('Origin');
  if (origin !== `https://${OLD_HOST}`) return new Response('Not allowed', { status: 403 });
  let form;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const m = String(form.get('m') || '');
  const toRaw = String(form.get('to') || '/');
  if (m.length > MAX_PAYLOAD || !/^[A-Za-z0-9_-]*$/.test(m)) return new Response('Bad request', { status: 400 });
  const to = safePath(toRaw);
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Opening MettleUp</title><meta name="color-scheme" content="dark">' +
    `<meta name="mettleup-move" content="${m}"><meta name="mettleup-to" content="${escapeAttr(to)}">` +
    '<script src="/move.js"></script></head><body style="background:#07080C;color:#F4F5F8;font:16px system-ui,sans-serif;padding:24px">' +
    `<p>Opening MettleUp… <a style="color:#F2762E" href="${escapeAttr(to)}">Tap here if nothing happens</a>.</p></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}

/** A path on this site only ("/start", "/members?x=1"); anything else is "/". PURE. */
export function safePath(p) {
  const s = String(p || '');
  if (s.length > 300 || !s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\') || /[\u0000-\u001f\s]/.test(s)) return '/';
  if (/^\/api(\/|$)/.test(s)) return '/';
  return s;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

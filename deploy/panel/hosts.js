// MettleUp's addresses (R-105, 24 Oct 2026): which host shows what. One Worker serves them all
// (wrangler.jsonc routes); this file only decides, so it can be tested without Cloudflare.
//
//   mettleup.fit                 F184 (R-242, 31 Oct 2026): the MEMBER page at "/" (public/member-site/,
//                                the phone and watch app, nothing about gym software but one "recommend
//                                your gym" block). /gyms and /home (the old gym page) 301 to
//                                gyms.mettleup.fit, keeping the query. Its files, the legal pages, icons
//                                and the demo form stay here (an old open tab of the gym page still
//                                works); any other path moves to app.mettleup.fit (same path), so
//                                mettleup.fit/j/CODE still works.
//   gyms.mettleup.fit            F184: the gym-owner landing page at "/" (the /home/ page), with its
//                                files, the demo form (/api/lead), legal pages and icons. Any other
//                                path moves to app.mettleup.fit (same path), as on mettleup.fit.
//   www.mettleup.fit, mettleup.in, www.mettleup.in
//                                301 to https://mettleup.fit, same path.
//   app.mettleup.fit             the admin app, the gym server address (/sb), invite and check-in
//                                links (/j, /c), /api, /start, the legal pages, the service worker.
//                                /home moves to gyms.mettleup.fit (it is the gym page).
//   forgeai.aakashpahuja.in      the old address, kept for good: old phones reach the gym server at
//                                /sb, printed posters carry /j and /c, old apps call /api. Only /home
//                                moves (to gyms.mettleup.fit). The admin app itself moves in the browser,
//                                and only once nothing is waiting to be sent (src/crm/move).
//   join.mettleup.fit            F207 (R-519): every gym's own free page, join.mettleup.fit/<gym-slug>, and its forms
//                                (gymPageServe.js). HIDDEN: not in wrangler.jsonc's routes, and off unless GYM_PAGES is "live".
//   anything else (workers.dev, a laptop's `wrangler dev`)   behaves like the old address.

export const OLD_HOST = 'forgeai.aakashpahuja.in';
export const APP_HOST = 'app.mettleup.fit';
export const SITE_HOST = 'mettleup.fit';
export const GYMS_HOST = 'gyms.mettleup.fit';
/** F207: gym pages. A host of its own (not app.mettleup.fit, where the admin app keeps its sign-in). */
export const GYM_PAGE_HOST = 'join.mettleup.fit';
export const APP_ORIGIN = `https://${APP_HOST}`;
export const SITE_ORIGIN = `https://${SITE_HOST}`;
export const GYMS_ORIGIN = `https://${GYMS_HOST}`;
/** Hosts that only send people to mettleup.fit. */
export const REDIRECT_HOSTS = ['www.mettleup.fit', 'mettleup.in', 'www.mettleup.in'];

/** Paths mettleup.fit and gyms.mettleup.fit keep (the pages need them, or they are fine anywhere). */
const SITE_KEEPS = [
  /^\/home\/[^/]+$/, // the gym page's own files (home.js, pictures)
  /^\/member-site\/[^/]+$/, // the member page's own files (member.js, app pictures), F184
  /^\/api\/lead$/, // the gym page's "free demo" form
  /^\/(icons|brand)\//,
  /^\/\.well-known\//,
  /^\/(privacy|terms|data-agreement|delete-account)(\.html)?$/, // delete-account: Play's account-deletion page (3 Nov 2026)
  /^\/(refund|delivery|contact|about)(\.html)?$/, // the 4 policy pages payment companies look for (R-480, 13 Nov 2026)
  /^\/(favicon\.ico|robots\.txt)$/,
];

/** 301 for a page, 308 for anything else (a POST stays a POST). */
function move(to, method) {
  return { kind: 'redirect', to, status: method === 'GET' || method === 'HEAD' ? 301 : 308 };
}

/**
 * What to do with one request, by host and path. PURE.
 * Returns { kind: 'redirect', to, status } | { kind: 'landing' } | { kind: 'members' } | { kind: 'gympage' } | { kind: 'app' }.
 *  - 'gympage': join.mettleup.fit, every path (gymPageServe.js decides; F207).
 *  - 'landing': serve the gym-owner landing page (the /home/ file) at this path.
 *  - 'members': serve the member page (the /member-site/ file) at this path (F184).
 *  - 'app': carry on as the admin app's Worker always did (static files, /j, /c, /sb, /api ...).
 * `moveOld` false (wrangler var MOVE "off") leaves the old address exactly as it was.
 */
export function routeFor(host, pathname, search = '', method = 'GET', { moveOld = true } = {}) {
  const h = String(host || '').toLowerCase();
  const rest = `${pathname}${search}`;
  // The gym page by any of its old names: /home (R-105) and, on mettleup.fit, /gyms (F184).
  const homePage = pathname === '/home' || pathname === '/home/' || pathname === '/home/index.html';
  const gymsPage = pathname === '/gyms' || pathname === '/gyms/' || pathname === '/gyms/index.html';
  if (REDIRECT_HOSTS.includes(h)) return move(`${SITE_ORIGIN}${rest}`, method);
  if (h === GYM_PAGE_HOST) return { kind: 'gympage' };
  if (h === SITE_HOST) {
    if (pathname === '/') return { kind: 'members' };
    if (homePage || gymsPage) return move(`${GYMS_ORIGIN}/${search}`, method);
    if (SITE_KEEPS.some((re) => re.test(pathname))) return { kind: 'app' };
    return move(`${APP_ORIGIN}${rest}`, method);
  }
  if (h === GYMS_HOST) {
    if (pathname === '/') return { kind: 'landing' };
    if (homePage || gymsPage) return move(`${GYMS_ORIGIN}/${search}`, method);
    if (SITE_KEEPS.some((re) => re.test(pathname))) return { kind: 'app' };
    return move(`${APP_ORIGIN}${rest}`, method);
  }
  if (h === APP_HOST) {
    if (homePage) return move(`${GYMS_ORIGIN}/${search}`, method);
    if (pathname.startsWith('/home/')) return move(`${GYMS_ORIGIN}${rest}`, method);
    return { kind: 'app' };
  }
  // The old address (and any other host): only the gym page moves.
  if (moveOld && h === OLD_HOST && homePage) return move(`${GYMS_ORIGIN}/${search}`, method);
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
  // A refused hand-over must never strand a desk on a bare error page (security review, 24 Oct): send it to
  // the sign-in at this address instead. Nothing is written on these paths.
  const signIn = () => new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return signIn();
  const origin = request.headers.get('Origin');
  if (origin !== `https://${OLD_HOST}`) return signIn();
  let form;
  try {
    form = await request.formData();
  } catch {
    return signIn();
  }
  const m = String(form.get('m') || '');
  const toRaw = String(form.get('to') || '/');
  if (m.length > MAX_PAYLOAD || !/^[A-Za-z0-9_-]*$/.test(m)) return signIn();
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

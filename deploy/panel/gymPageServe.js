// F207 gym page (R-519, 14 Nov 2026): everything the Worker does at join.mettleup.fit (hosts.js kind 'gympage').
//   GET  /<gym-slug>          the gym's page, drawn here from gym_page_public(slug) (gymPage.js renderGymPage)
//   GET  /gym-page/page.js    the page's one script (a static file, apps/dashboard/public/gym-page/)
//   POST /api/gym-page/ask    "Ask the gym": checked, limited, then gym_page_ask_send puts it in the gym's Enquiries
//   POST /api/gym-page/report "Report this page": checked, limited, then gym_page_report_send tells MettleUp HQ
//   GET  /robots.txt          allow; each page says itself whether Google may list it (noindex until published)
//   GET  /                    to gyms.mettleup.fit (the page that offers gyms this free page)
//
// HIDDEN TWICE. (1) The Worker answers this host only when the var GYM_PAGES is "live" (wrangler.jsonc); unset, every
// address here is the plain "not here" page. (2) join.mettleup.fit is not in wrangler.jsonc's routes, so no request
// reaches this code yet. The gym server's functions (supabase/migrations/0080_gym_page.sql) are not live either; until
// they are, a page answers "not here" and the forms answer NOT_READY. docs/gym-page/PLAN.md has the switch-on steps.
//
// The forms use the friend page's guards (friend.js, selfJoin.js): a hidden "website" box, a size limit, a daily limit
// per network address in D1 friend_asks (own hash prefix, so no new D1 table). Nothing about the person is kept here.

import { PAGE_ORIGIN, pageFrom, renderGymPage, slugOk } from './gymPage.js';

export const ASK_PER_DAY = 5;
export const REPORT_PER_DAY = 5;
export const REPORT_REASONS = ['wrong', 'photos', 'offensive', 'scam', 'closed'];
/** How long one gym's page data is kept at the edge. The page itself is drawn fresh, so "Open now" is never stale. */
const DATA_SECONDS = 300;
const CACHE_ORIGIN = 'https://cache.forgeai/gym_page_public/';

// ------------------------------------------------------------------ the forms, checked (PURE)

/** "+91 98765 43210", "098765 43210" -> "9876543210"; anything else null. PURE. */
export function mobileOf(s) {
  const d = String(s ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** The "Ask the gym" form: {value} | {bot} | {error}. Only these fields ever go on. PURE. */
export function checkAsk(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'BAD_REQUEST' };
  if (typeof body.website === 'string' && body.website.trim()) return { bot: true };
  if (!slugOk(body.slug)) return { error: 'NO_GYM' };
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (name.length < 2 || !/\p{L}/u.test(name)) return { error: 'BAD_NAME' };
  const phone = mobileOf(body.phone);
  if (!phone) return { error: 'BAD_PHONE' };
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (question.length < 3) return { error: 'BAD_QUESTION' };
  // No links in a question: a question with a web address is almost always spam, and the owner would see it.
  if (/https?:\/\/|www\./i.test(question)) return { error: 'BAD_QUESTION' };
  if (body.consent !== true) return { error: 'NO_CONSENT' };
  return { value: { slug: body.slug, name, phone, question } };
}

/** The "Report this page" form. PURE. */
export function checkReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'BAD_REQUEST' };
  if (typeof body.website === 'string' && body.website.trim()) return { bot: true };
  if (!slugOk(body.slug)) return { error: 'NO_GYM' };
  if (!REPORT_REASONS.includes(body.reason)) return { error: 'BAD_REASON' };
  const details = typeof body.details === 'string' ? body.details.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return { value: { slug: body.slug, reason: body.reason, details } };
}

/** A gym server answer as the page's code; anything unknown is TRY_AGAIN. PURE. */
export function sendAnswer(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.ok === true) return { status: 201, body: { ok: true } };
  const e = row && typeof row.error === 'string' ? row.error : '';
  if (e === 'NO_GYM') return { status: 404, body: { error: e } };
  if (e === 'CLOSED') return { status: 403, body: { error: e } };
  if (['BAD_NAME', 'BAD_PHONE', 'BAD_QUESTION', 'BAD_REASON', 'NO_CONSENT'].includes(e)) return { status: 400, body: { error: e } };
  if (e === 'TOO_MANY') return { status: 429, body: { error: 'LIMIT' } };
  return { status: 503, body: { error: 'TRY_AGAIN' } };
}

// ------------------------------------------------------------------ the page's headers

/**
 * The page's own strict rules for the browser: only our script, Google's fonts, photos from our own photo
 * addresses; no frames, no other site's forms. The JSON blocks in the page are data, never run. PURE.
 */
export const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://hdxzqbdiokjklnypfisq.supabase.co",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

function pageHeaders(extra = {}) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': PAGE_CSP,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    ...extra,
  };
}

/** The one "not here" page for every address that is not a live gym page (no gym name, nothing to learn). PURE. */
export function notHerePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Page not found</title><style>body{margin:0;background:#E7ECEA;color:#15181C;font:17px/1.5 system-ui,sans-serif;padding:48px 20px}main{max-width:520px;margin:0 auto}h1{font-size:28px;line-height:1.15;margin:0 0 12px}a{color:#15181C;font-weight:600}</style></head>
<body><main><h1>This gym page is not here</h1><p>The link may be wrong, or the gym has taken its page down. Ask the gym for its page link, or <a href="https://mettleup.fit/">see the MettleUp app</a>.</p></main></body></html>`;
}

function notHere(status = 404) {
  return new Response(notHerePage(), { status, headers: pageHeaders({ 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex' }) });
}

function answer(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function refused(tag, status, code, why) {
  console.warn(`[gym-page] ${tag} refused ${status}: ${why}`);
  return answer(status, { error: code });
}

// ------------------------------------------------------------------ the page's data

/**
 * gym_page_public(slug), kept DATA_SECONDS at the edge. Returns the checked page, null (no such published page), or
 * undefined (could not ask: the gym server is down, or its function is not there yet).
 */
export async function pageData(slug, rpc, ctx, cache = globalThis.caches?.default) {
  const key = new Request(`${CACHE_ORIGIN}${slug}`);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return pageFrom(await hit.json());
    } catch (e) {
      console.warn('[gym-page] edge cache read failed', e instanceof Error ? e.message : e);
    }
  }
  let r;
  try {
    r = await rpc('gym_page_public', { p_slug: slug });
  } catch (e) {
    console.error('[gym-page] the gym server could not be reached', e);
    return undefined;
  }
  if (r.status === 404 || (r.data && r.data.code === 'PGRST202')) {
    console.error('[gym-page] the gym server has no gym_page_public yet (apply the gym page migration, docs/gym-page/PLAN.md)');
    return undefined;
  }
  if (r.status >= 400) {
    console.error('[gym-page] gym_page_public refused', r.status, r.data && r.data.message);
    return undefined;
  }
  const raw = Array.isArray(r.data) ? r.data[0] : r.data;
  const page = pageFrom(raw);
  // A missing page is kept too (a short time), or every wrong link would cost a gym server call.
  if (cache && ctx) {
    const body = JSON.stringify(page ? raw : null);
    ctx.waitUntil(cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${page ? DATA_SECONDS : 60}` } })).catch(() => {}));
  }
  return page;
}

// ------------------------------------------------------------------ the limit per network address

async function hashIp(prefix, ip, salt, day) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${prefix}:${salt}:${day}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** true = over the day's limit. Without D1 the send goes on (the gym server has its own limits); the log says why. */
async function overLimit(env, request, now, prefix, perDay) {
  if (!env.WEB || !env.FEEDBACK_SALT) {
    console.warn(`[gym-page] ${prefix}: no address limit (D1 binding WEB or secret FEEDBACK_SALT missing)`);
    return false;
  }
  const at = now.toISOString();
  const ipHash = await hashIp(prefix, request.headers.get('CF-Connecting-IP') || 'unknown', env.FEEDBACK_SALT, at.slice(0, 10));
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const row = await env.WEB.prepare('SELECT COUNT(*) AS n FROM friend_asks WHERE ip_hash = ? AND at > ?').bind(ipHash, dayAgo).first();
    if (row && Number(row.n) >= perDay) return true;
    await env.WEB.prepare('INSERT INTO friend_asks (at, ip_hash) VALUES (?, ?)').bind(at, ipHash).run();
  } catch (e) {
    console.warn(`[gym-page] ${prefix}: no address limit, friend_asks unusable (apply D1 migration 0010)`, e instanceof Error ? e.message : e);
  }
  return false;
}

/** One form: read, check, limit, send. */
async function handleForm(request, env, rpc, now, { tag, check, perDay, fn, args }) {
  if (request.method !== 'POST') return refused(tag, 405, 'BAD_REQUEST', 'not a POST');
  if (Number(request.headers.get('Content-Length') || 0) > 2000) return refused(tag, 413, 'BAD_REQUEST', 'body over 2000 bytes');
  const raw = await request.text();
  if (raw.length > 2000) return refused(tag, 413, 'BAD_REQUEST', 'body over 2000 bytes');
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return refused(tag, 400, 'BAD_REQUEST', `not JSON (${e instanceof Error ? e.message : 'parse error'})`);
  }
  const checked = check(body);
  if (checked.bot) {
    console.warn(`[gym-page] ${tag} dropped: the hidden "website" box was filled`);
    return answer(201, { ok: true });
  }
  if (checked.error) return refused(tag, checked.error === 'NO_GYM' ? 404 : 400, checked.error, checked.error);
  if (await overLimit(env, request, now, `gp${tag}`, perDay)) return refused(tag, 429, 'LIMIT', `${perDay} a day from one address reached`);
  let r;
  try {
    r = await rpc(fn, args(checked.value));
  } catch (e) {
    console.error(`[gym-page] ${tag}: the gym server could not be reached`, e);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  if (r.status === 404 || (r.data && r.data.code === 'PGRST202')) {
    console.error(`[gym-page] ${tag}: the gym server has no ${fn} yet (apply the gym page migration)`);
    return answer(503, { error: 'NOT_READY' });
  }
  if (r.status >= 400) {
    console.error(`[gym-page] ${tag}: the gym server refused`, r.status, r.data && r.data.message);
    return answer(503, { error: 'TRY_AGAIN' });
  }
  const out = sendAnswer(r.data);
  if (out.status !== 201) console.warn(`[gym-page] ${tag}: the gym server said ${out.body.error}`);
  return answer(out.status, out.body);
}

export function handleAsk(request, env, rpc, now = new Date()) {
  return handleForm(request, env, rpc, now, {
    tag: 'ask',
    check: checkAsk,
    perDay: ASK_PER_DAY,
    fn: 'gym_page_ask_send',
    args: (v) => ({ p_slug: v.slug, p_name: v.name, p_phone: v.phone, p_question: v.question, p_consent: true }),
  });
}

export function handleReport(request, env, rpc, now = new Date()) {
  return handleForm(request, env, rpc, now, {
    tag: 'report',
    check: checkReport,
    perDay: REPORT_PER_DAY,
    fn: 'gym_page_report_send',
    args: (v) => ({ p_slug: v.slug, p_reason: v.reason, p_details: v.details || null }),
  });
}

// ------------------------------------------------------------------ the page's photos (0082)

const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
/** How long a photo is kept at the edge and in the browser. Short, so MettleUp HQ taking a page down also takes its photos. */
const PHOTO_SECONDS = 3600;
/** The bucket's own limit is 1 MB; anything bigger is not one of ours. */
const PHOTO_MAX_BYTES = 1048576;

/**
 * /p/<gym_id>/<photo_id>.webp -> the file's place in the private bucket gym-page-photos, "<gym_id>/<photo_id>.webp";
 * null for any other address. Only the shape the admin app uploads (0082: a gym's uuid, a 32-letter id). PURE.
 */
export function photoObjectPath(pathname) {
  const m = /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{32})\.webp$/.exec(String(pathname ?? ''));
  return m ? `${m[1]}/${m[2]}.webp` : null;
}

/** Is this a WebP file ("RIFF....WEBP")? PURE. */
export function isWebp(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const at = (i, s) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  return b.length > 12 && at(0, 'RIFF') && at(8, 'WEBP');
}

function noPhoto(status = 404) {
  return new Response(null, { status, headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' } });
}

/**
 * One photo: read from the private bucket with the public app key. The gym server's read rule (0082
 * _gym_page_photo_read_ok) answers only for a photo on that gym's page row, not taken down by HQ, gym not paused; any
 * other answer is a plain 404. Kept PHOTO_SECONDS at the edge. `fetchImpl` and `cache` are for tests.
 */
export async function servePhoto(request, ctx, objectPath, { key, fetchImpl = fetch, cache = globalThis.caches?.default } = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return noPhoto(405);
  if (!key) {
    console.error('[gym-page] photo: no app key passed in (worker.js)');
    return noPhoto(503);
  }
  const cacheKey = new Request(`https://cache.forgeai/gym-page-photo/${objectPath}`);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return request.method === 'HEAD' ? new Response(null, { headers: hit.headers }) : hit;
    } catch (e) {
      console.warn('[gym-page] photo: edge cache read failed', e instanceof Error ? e.message : e);
    }
  }
  let r;
  try {
    r = await fetchImpl(`${SUPABASE}/storage/v1/object/authenticated/gym-page-photos/${objectPath}`, { headers: { apikey: key } });
  } catch (e) {
    console.error('[gym-page] photo: the gym server could not be reached', e);
    return noPhoto(503);
  }
  // Storage answers 400 "Object not found" for a file that is missing OR one the read rule does not allow.
  if (r.status >= 400 && r.status < 500) return noPhoto(404);
  if (!r.ok) {
    console.error('[gym-page] photo: the gym server refused', r.status);
    return noPhoto(503);
  }
  const body = new Uint8Array(await r.arrayBuffer());
  if (body.length > PHOTO_MAX_BYTES || !isWebp(body)) {
    console.error('[gym-page] photo: not a WebP file under 1 MB', objectPath, body.length);
    return noPhoto(404);
  }
  const out = new Response(body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': `public, max-age=${PHOTO_SECONDS}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
  if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, out.clone()).catch(() => {}));
  return request.method === 'HEAD' ? new Response(null, { headers: out.headers }) : out;
}

// ------------------------------------------------------------------ the host

/**
 * Every request to join.mettleup.fit. `rpc(fn, args)` -> {status, data} (worker.js passes the real one; tests a fake).
 * `opts.nowMs` and `opts.cache` are for tests. `opts.payOnline(code)` -> {online} (R-528, joinPay.js offerForCode): the
 * "Become a member" button then says "Join and pay online" instead of "Pay at the desk".
 */
export async function handleGymPageHost(request, env, ctx, url, rpc, opts = {}) {
  if (env.GYM_PAGES !== 'live') return notHere();
  const path = url.pathname;
  if (path === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  }
  if (path === '/' || path === '') return new Response(null, { status: 302, headers: { Location: 'https://gyms.mettleup.fit/', 'Cache-Control': 'max-age=3600' } });
  if (path.startsWith('/gym-page/')) return env.ASSETS.fetch(request);
  // 0082: a page's photo, from our own Supabase storage (R-529). `opts.appKey`: the public app key (worker.js).
  if (path.startsWith('/p/')) {
    const object = photoObjectPath(path);
    return object ? servePhoto(request, ctx, object, { key: opts.appKey, fetchImpl: opts.fetchImpl, cache: opts.cache }) : noPhoto(404);
  }
  if (path === '/api/gym-page/ask') return handleAsk(request, env, rpc);
  if (path === '/api/gym-page/report') return handleReport(request, env, rpc);
  if (request.method !== 'GET' && request.method !== 'HEAD') return notHere(405);
  // One gym's page: the slug in small letters; a capital or a trailing slash moves to the one true address.
  const m = /^\/([A-Za-z0-9-]{3,48})\/?$/.exec(path);
  if (!m) return notHere();
  const slug = m[1].toLowerCase();
  if (!slugOk(slug)) return notHere();
  if (path !== `/${slug}`) return new Response(null, { status: 301, headers: { Location: `${PAGE_ORIGIN}/${slug}${url.search}` } });
  const page = await pageData(slug, rpc, ctx, opts.cache);
  if (page === undefined) return notHere(503);
  if (!page) return notHere();
  let payOnline = false;
  if (opts.payOnline && page.joinOnline && page.joinCode) {
    try {
      payOnline = (await opts.payOnline(page.joinCode))?.online === true;
    } catch {
      console.warn('[gym-page] online pay not known; the button says pay at the desk');
    }
  }
  const html = renderGymPage(page, { nowMs: opts.nowMs ?? Date.now(), origin: PAGE_ORIGIN, payOnline });
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: pageHeaders({
      // A minute at the edge and in the browser: "Open now" moves with the clock.
      'Cache-Control': 'public, max-age=60',
      ...(page.indexable ? {} : { 'X-Robots-Tag': 'noindex' }),
    }),
  });
}

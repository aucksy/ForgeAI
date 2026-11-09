// R-411 (owner, 9 Nov 2026: "Why there are no release notes here for the user"): the app's full-screen
// "A new MettleUp is here" read its What's new lines only from GitHub's release download link, and GitHub's
// India download edge answered 504 for every release file that morning. So the phone showed the screen with
// no lines. This serves the same file from our own server (app.mettleup.fit/app/whats-new.json), read from
// GitHub through two different doors and cached at Cloudflare, with the last good copy kept for a week.
// The app asks here first and GitHub second (apps/mobile/src/lib/appUpdate.ts).

const API = 'https://api.github.com/repos/aucksy/ForgeAI/releases/latest';
const DOWNLOAD = 'https://github.com/aucksy/ForgeAI/releases/latest/download/whats-new.json';
const UA = { 'User-Agent': 'mettleup-panel' };
const FRESH_S = 600; // ask GitHub again after 10 minutes
const KEEP_S = 7 * 24 * 3600; // the last good copy, for when GitHub does not answer

/** The file's JSON when it looks like one: a plain version and a list of lines. PURE. */
export function cleanNews(v) {
  if (!v || typeof v !== 'object') return null;
  const version = typeof v.version === 'string' ? v.version.trim() : '';
  if (!/^v?\d+\.\d+\.\d+$/.test(version) || !Array.isArray(v.lines)) return null;
  const lines = v.lines.filter((t) => typeof t === 'string' && t.trim().length > 0).slice(0, 5);
  return { version: version.replace(/^v/, ''), lines };
}

async function viaApi(fetchFn) {
  const r = await fetchFn(API, { headers: { ...UA, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`release api ${r.status}`);
  const rel = await r.json();
  const asset = (rel.assets || []).find((a) => a && a.name === 'whats-new.json');
  if (!asset || !asset.url) throw new Error('release has no whats-new.json');
  const f = await fetchFn(asset.url, { headers: { ...UA, Accept: 'application/octet-stream' } });
  if (!f.ok) throw new Error(`asset ${f.status}`);
  return f.json();
}

async function viaDownload(fetchFn) {
  const f = await fetchFn(DOWNLOAD, { headers: UA });
  if (!f.ok) throw new Error(`download ${f.status}`);
  return f.json();
}

/** The newest release's What's new, from GitHub's API first, then its download link. null when neither answers. */
export async function readLatestNews(fetchFn = fetch) {
  for (const door of [viaApi, viaDownload]) {
    try {
      const n = cleanNews(await door(fetchFn));
      if (n) return n;
    } catch (e) {
      console.warn('[whats-new]', door.name, String(e && e.message ? e.message : e));
    }
  }
  return null;
}

function reply(body, status, maxAge) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge}` },
  });
}

/** GET /app/whats-new.json */
export async function handleWhatsNew(request, ctx, deps = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const cache = deps.cache ?? caches.default;
  const freshKey = new Request('https://cache.mettleup/whats-new-fresh');
  const keepKey = new Request('https://cache.mettleup/whats-new-keep');
  const hit = await cache.match(freshKey);
  if (hit) return reply(await hit.text(), 200, FRESH_S);
  const news = await readLatestNews(deps.fetch ?? fetch);
  if (news) {
    const body = JSON.stringify(news);
    ctx.waitUntil(cache.put(freshKey, reply(body, 200, FRESH_S)));
    ctx.waitUntil(cache.put(keepKey, reply(body, 200, KEEP_S)));
    return reply(body, 200, FRESH_S);
  }
  const kept = await cache.match(keepKey);
  if (kept) return reply(await kept.text(), 200, 60);
  return new Response('{"error":"not available"}', {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

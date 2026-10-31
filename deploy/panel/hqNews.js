// R-243 (31 Oct 2026): GET /api/hq-news -> { messages } for the admin app's notification bell: what
// MettleUp HQ sent to every gym (D1 `forgeai-web`, table hq_messages, migrations/0006; HQ writes it
// in deploy/hq/web.js). The same for every gym, so no sign-in: nothing here is private.
// Before the table exists (migration not applied) the answer is an empty list, never an error.

export const SHOWN = 10;
export const MAX_AGE_DAYS = 120;

function answer(status, body, cache = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
  });
}

/** The rows as the app reads them. PURE. */
export function publicMessages(rows) {
  return (rows || []).map((r) => ({
    id: Number(r.id),
    at: String(r.at),
    title: String(r.title || ''),
    body: String(r.body || ''),
    link: String(r.link || ''),
    label: String(r.label || ''),
  }));
}

/** GET /api/hq-news -> 200 { messages: [{ id, at, title, body, link, label }] } newest first. */
export async function handleHqNews(request, env, now = new Date()) {
  if (request.method !== 'GET') return answer(405, { error: 'Use GET.' });
  if (!env.WEB) return answer(200, { messages: [] });
  const since = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const rows = (await env.WEB
      .prepare('SELECT id, at, title, body, link, label FROM hq_messages WHERE removed_at IS NULL AND at > ? ORDER BY id DESC LIMIT ?')
      .bind(since, SHOWN)
      .all()).results;
    // A minute in the browser's cache: a page with many tabs open asks the database less.
    return answer(200, { messages: publicMessages(rows) }, 'private, max-age=60');
  } catch (e) {
    console.warn('[hq-news] not readable (migration 0006 not applied yet?)', e instanceof Error ? e.message : 'error');
    return answer(200, { messages: [] });
  }
}

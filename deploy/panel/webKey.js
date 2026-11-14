// R-506 phase 3 (supabase 0076): the public key the admin app's browsers subscribe to Web Push with. It lives with
// the HQ Worker (deploy/hq/panelPush.js, secret VAPID_PRIVATE_JWK), which sends the pushes; this Worker only passes
// the PUBLIC key on, over the service binding HQ_PUSH (wrangler.jsonc). Public by nature, so no key is asked for.
//
//   GET /api/push/web-key  -> {key} | 503 {error: 'NOT_SET_UP' | 'UNREACHABLE'}

const HQ_WEB_KEY = 'https://hq.mettleup.fit/push/web-key';

function answer(status, body, cache = 'no-store') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });
}

export async function handleWebKey(request, env) {
  if (request.method !== 'GET') return answer(405, { error: 'GET_ONLY' });
  if (!env || !env.HQ_PUSH) return answer(503, { error: 'NOT_SET_UP' });
  let res;
  try {
    res = await env.HQ_PUSH.fetch(HQ_WEB_KEY, { method: 'GET' });
  } catch {
    return answer(503, { error: 'UNREACHABLE' });
  }
  try {
    const body = await res.json();
    if (res.ok && typeof body.key === 'string' && /^[A-Za-z0-9_-]{80,100}$/.test(body.key)) return answer(200, { key: body.key }, 'public, max-age=3600');
    return answer(503, { error: 'NOT_SET_UP' });
  } catch {
    return answer(503, { error: 'UNREACHABLE' });
  }
}

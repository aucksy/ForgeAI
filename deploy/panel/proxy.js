// The block-proof server address (owner R-40, built R-55, 22 Oct 2026). Both apps reach the gym server
// at https://forgeai.aakashpahuja.in/sb/... and this Worker passes each request on to Supabase's own
// address. From 24 Feb to 3 Mar 2026 Indian networks blocked supabase.co (a Section 69A order about
// someone else's project); our own address on Cloudflare keeps working through such a block.
//
// Passed through as it is: method, path after /sb, query, body (streamed), apikey and
// Authorization. Dropped: cookies (ours, never Supabase's business) and Cloudflare's own headers.
// No caching here: answers carry Supabase's own Cache-Control. The apps fall back to the direct
// address by themselves if this one ever fails (mobile cloud/address.ts, panel lib/supabase.ts).

export const SUPABASE = 'https://hdxzqbdiokjklnypfisq.supabase.co';
export const PREFIX = '/sb';
/**
 * Review of R-55: an answer the apps can trust carries this header. Cloudflare's own error pages
 * (the free plan's daily limit, a Worker failure) do not, and our 502 says "unreachable"; the apps
 * then use Supabase's own address for a while (never sending the same request twice).
 */
export const STAMP = 'X-Forge-Proxy';

/** Is this one of ours? `/sb` and `/sb/...` only (never `/sbx`). PURE. */
export function isProxyPath(pathname) {
  return pathname === PREFIX || pathname.startsWith(PREFIX + '/');
}

/** Supabase's address for a request to `/sb/...`. PURE. */
export function targetUrl(url) {
  const path = url.pathname.slice(PREFIX.length) || '/';
  return SUPABASE + path + url.search;
}

const DROP = ['host', 'cookie', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker', 'x-forwarded-proto', 'x-real-ip'];

/** The headers sent on to Supabase. PURE (a new Headers). */
export function forwardHeaders(h) {
  const out = new Headers(h);
  for (const k of DROP) out.delete(k);
  return out;
}

export async function handleProxy(request, url, fetchImpl = fetch) {
  const target = targetUrl(url);
  // A WebSocket (Supabase realtime; neither app uses it today) goes through as the same request.
  if ((request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') return fetchImpl(new Request(target, request));
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    const res = await fetchImpl(target, {
      method: request.method,
      headers: forwardHeaders(request.headers),
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    });
    const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    out.headers.set(STAMP, '1');
    return out;
  } catch (e) {
    console.error('[sb proxy] Supabase did not answer', request.method, url.pathname, e);
    return new Response(JSON.stringify({ message: 'The gym server could not be reached. Try again.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', [STAMP]: 'unreachable' },
    });
  }
}

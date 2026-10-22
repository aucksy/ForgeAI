/**
 * The block-proof server address (owner R-40, built R-55, 22 Oct 2026). On our own site the panel
 * reaches the gym server at https://forgeai.aakashpahuja.in/sb (deploy/panel/proxy.js passes it
 * on to Supabase), so a block of supabase.co in India (24 Feb - 3 Mar 2026) cannot stop the desk.
 * Anywhere else (a laptop's dev server, the journeys, a preview) it keeps Supabase's own address.
 *
 * If a request through our address cannot even be sent (a network error, not an error answer),
 * the next ten minutes use the direct address. The failed request itself is NOT sent again: a
 * payment or a check-in must never be saved twice; the screen's own "try again" handles it.
 */
export const OUR_HOST = 'forgeai.aakashpahuja.in';
export const PROXY_PATH = '/sb';
/** How long the direct address is used after our address failed. */
export const FALLBACK_MS = 10 * 60_000;

/** The address the client is made with: ours on our site, else the direct one. PURE. */
export function serverBase(hostname: string | null | undefined, origin: string | null | undefined, direct: string): string {
  return hostname === OUR_HOST && origin ? `${origin}${PROXY_PATH}` : direct;
}

/**
 * supabase-js keeps the sign-in under a name made from its address. Keep the name the direct
 * address gives, so a desk signed in before the switch stays signed in. PURE.
 */
export function sessionKey(direct: string): string {
  return `sb-${new URL(direct).hostname.split('.')[0]}-auth-token`;
}

type Fetch = typeof fetch;

/** The header our Worker puts on every answer that really came from the gym server (proxy.js). */
export const STAMP = 'X-Forge-Proxy';

/**
 * Did our address fail with this answer? An answer without our Worker's stamp is Cloudflare's own
 * page (the free plan's daily limit, a Worker failure); "unreachable" is our Worker's 502. PURE.
 */
export function proxyFailed(res: { headers: { get(name: string): string | null } }): boolean {
  const stamp = res.headers.get(STAMP);
  return stamp === null || stamp === 'unreachable';
}

/**
 * A fetch that turns to the direct address for 10 minutes after our address failed: no answer, or
 * an answer that is not the gym server's. The failed request is never sent again (a payment or a
 * check-in is never saved twice). Typed loosely inside, whatever the lib's `fetch` type says.
 */
export function routedFetch(proxyBase: string, direct: string, base: Fetch, now: () => number = Date.now): Fetch {
  let directUntil = 0;
  const call = base as unknown as (input: unknown, init?: RequestInit) => Promise<Response>;
  const fail = (why: string, e?: unknown) => {
    directUntil = now() + FALLBACK_MS;
    console.warn(`[server] our address failed (${why}); the direct one for 10 minutes`, e ?? '');
  };
  return (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const viaProxy = url.startsWith(proxyBase + '/');
    if (viaProxy && now() < directUntil && (typeof input === 'string' || input instanceof URL)) {
      return call(direct + url.slice(proxyBase.length), init);
    }
    try {
      const res = await call(input, init);
      if (viaProxy && proxyFailed(res)) fail(`answer ${res.status} without the gym server's stamp`);
      return res;
    } catch (e) {
      if (viaProxy && !(e instanceof DOMException && e.name === 'AbortError')) fail('no answer', e);
      throw e;
    }
  }) as unknown as Fetch;
}

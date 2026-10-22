/**
 * The block-proof server address (owner R-40, built R-55, 22 Oct 2026). The app reaches the gym
 * server at https://forgeai.aakashpahuja.in/sb (app.json extra.supabaseProxyUrl; the panel Worker's
 * proxy.js passes each request on to Supabase), so a block of supabase.co in India like the one of
 * 24 Feb - 3 Mar 2026 cannot stop joining, check-in, the shop, messages or My membership.
 * Workouts never needed the server and still don't.
 *
 * If a request through our address cannot even be sent (a network error, not an error answer),
 * the next ten minutes use Supabase's own address. The failed request itself is NOT sent again:
 * a check-in or a shop order must never be made twice; the screen's own "try again" handles it.
 * Gym logos and shop photos keep their saved links (the server checks them); `viaOurAddress` only
 * changes where the picture is loaded from. PURE except the module's ten-minute memory.
 */
/** How long Supabase's own address is used after ours failed. */
export const FALLBACK_MS = 10 * 60_000;

/**
 * supabase-js keeps a sign-in under a name made from its address. Keep the name the direct
 * address gives, so nothing kept before the switch is lost. PURE.
 */
export function sessionKey(direct: string): string {
  return `sb-${new URL(direct).hostname.split('.')[0]}-auth-token`;
}

type Fetch = typeof fetch;

/** The header our Worker puts on every answer that really came from the gym server (proxy.js). */
export const STAMP = 'X-Forge-Proxy';
/** A request through our address cancelled after this long counts as "our address hangs". */
export const HANG_MS = 10_000;

/** Until when Supabase's own address is used (shared: pictures follow the same switch). */
let directUntil = 0;

/** Is Supabase's own address in use now (our address failed within the last 10 minutes)? */
export function usingDirect(now: number = Date.now()): boolean {
  return now < directUntil;
}

/** Test hook: forget a switch. */
export function resetAddressSwitch(): void {
  directUntil = 0;
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/**
 * Did our address fail with this answer? An answer without our Worker's stamp is Cloudflare's own
 * page (the free plan's daily limit, a Worker failure); "unreachable" is our Worker's 502. PURE.
 */
export function proxyFailed(res: { headers: { get(name: string): string | null } }): boolean {
  const stamp = res.headers.get(STAMP);
  return stamp === null || stamp === 'unreachable';
}

/**
 * A fetch that turns to the direct address for 10 minutes after our address failed: no answer, a
 * hang of 10 s or more, or an answer that is not the gym server's. The failed request is never sent
 * again. Typed loosely inside: React Native's and the browser's `fetch` types differ (a URL or not).
 */
export function routedFetch(proxyBase: string, direct: string, base: Fetch, now: () => number = Date.now): Fetch {
  const call = base as unknown as (input: unknown, init?: RequestInit) => Promise<Response>;
  const fail = (why: string, e?: unknown) => {
    directUntil = now() + FALLBACK_MS;
    console.warn(`[ForgeErr] our server address failed (${why}); Supabase's own for 10 minutes`, e ?? '');
  };
  return (async (input: unknown, init?: RequestInit) => {
    const url = urlOf(input);
    const viaProxy = url.startsWith(proxyBase + '/');
    // supabase-js always passes the address as text; anything else is left as it is.
    if (viaProxy && usingDirect(now()) && (typeof input === 'string' || input instanceof URL)) {
      return call(direct + url.slice(proxyBase.length), init);
    }
    const started = now();
    try {
      const res = await call(input, init);
      if (viaProxy && proxyFailed(res)) fail(`answer ${res.status} without the gym server's stamp`);
      return res;
    } catch (e) {
      const aborted = !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
      if (viaProxy && (!aborted || now() - started >= HANG_MS)) fail(aborted ? 'no answer in 10 s' : 'no answer', e);
      throw e;
    }
  }) as unknown as Fetch;
}

/**
 * A picture saved with Supabase's own address (a gym logo, a shop photo), loaded through ours.
 * Anything else is left as it is. PURE.
 */
export function viaOurAddress(url: string, direct: string, proxyBase: string): string;
export function viaOurAddress(url: string | null | undefined, direct: string, proxyBase: string): string | null | undefined;
export function viaOurAddress(url: string | null | undefined, direct: string, proxyBase: string): string | null | undefined {
  // Our address failed a moment ago: pictures load from Supabase's own address too (review of R-55).
  if (!url || !direct || !proxyBase || usingDirect()) return url;
  return url.startsWith(direct + '/') ? proxyBase + url.slice(direct.length) : url;
}

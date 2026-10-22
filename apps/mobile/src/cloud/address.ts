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

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/** A fetch that turns to the direct address for a while after our address failed to answer. */
export function routedFetch(proxyBase: string, direct: string, base: Fetch, now: () => number = Date.now): Fetch {
  let directUntil = 0;
  return async (input, init) => {
    const url = urlOf(input);
    const viaProxy = url.startsWith(proxyBase + '/');
    if (viaProxy && now() < directUntil) {
      const swapped = direct + url.slice(proxyBase.length);
      return base(typeof input === 'string' || input instanceof URL ? swapped : new Request(swapped, input as Request), init);
    }
    try {
      return await base(input, init);
    } catch (e) {
      const aborted = !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
      if (viaProxy && !aborted) {
        directUntil = now() + FALLBACK_MS;
        console.warn('[ForgeErr] our server address did not answer; Supabase\'s own for 10 minutes', e);
      }
      throw e;
    }
  };
}

/**
 * A picture saved with Supabase's own address (a gym logo, a shop photo), loaded through ours.
 * Anything else is left as it is. PURE.
 */
export function viaOurAddress(url: string, direct: string, proxyBase: string): string;
export function viaOurAddress(url: string | null | undefined, direct: string, proxyBase: string): string | null | undefined;
export function viaOurAddress(url: string | null | undefined, direct: string, proxyBase: string): string | null | undefined {
  if (!url || !direct || !proxyBase) return url;
  return url.startsWith(direct + '/') ? proxyBase + url.slice(direct.length) : url;
}

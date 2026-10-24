/**
 * The block-proof server addresses (owner R-40, built R-55, 22 Oct 2026; a list since MettleUp,
 * R-105, 24 Oct 2026). The app reaches the gym server through our own addresses, newest first:
 * https://app.mettleup.fit/sb, then https://forgeai.aakashpahuja.in/sb (kept for good: phones and
 * posters from before the new name), then Supabase's own address (app.json extra.supabaseProxyUrl +
 * supabaseProxyFallbackUrls; the panel Worker's proxy.js passes each request on to Supabase). So a
 * block of supabase.co in India like the one of 24 Feb - 3 Mar 2026 cannot stop joining, check-in,
 * the shop, messages or My membership. Workouts never needed the server and still don't.
 *
 * Which address a request uses: the first in the list that has not failed in the last ten minutes
 * AND is known to work. The LAST of our addresses (the one in use the longest) is trusted until it
 * fails; one ahead of it is used only after a harmless test call through it (a GET of the auth
 * health page) came back with the gym server's stamp. So a new address that is not live yet never
 * costs a member a request: the test call fails, quietly, and is tried again ten minutes later.
 *
 * If a request through one of our addresses cannot even be sent (a network error, not an error
 * answer), that address rests for ten minutes and the next one is used. The failed request itself
 * is NOT sent again: a check-in or a shop order must never be made twice; the screen's own "try
 * again" handles it. Gym logos and shop photos keep their saved links (the server checks them);
 * `viaOurAddress` only changes where the picture is loaded from. PURE except the module's memory.
 */
/** How long an address of ours rests after it failed (Supabase's own, or the next of ours, meanwhile). */
export const FALLBACK_MS = 10 * 60_000;

/**
 * supabase-js keeps a sign-in under a name made from its address. Keep the name the direct
 * address gives, so nothing kept before the switch is lost. PURE.
 */
export function sessionKey(direct: string): string {
  return `sb-${new URL(direct).hostname.split('.')[0]}-auth-token`;
}

/** Our addresses from app.json in order (supabaseProxyUrl, then the fallbacks), blanks and repeats left out. PURE. */
export function proxyList(first: unknown, rest: unknown): string[] {
  const all = [first, ...(Array.isArray(rest) ? rest : [])]
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => u.trim().replace(/\/+$/, ''));
  return all.filter((u, i) => all.indexOf(u) === i);
}

type Fetch = typeof fetch;

/** The header our Worker puts on every answer that really came from the gym server (proxy.js). */
export const STAMP = 'X-Forge-Proxy';
/** A request through our address cancelled after this long counts as "our address hangs". */
export const HANG_MS = 10_000;
/** The harmless test call that proves a newer address of ours works (no key, changes nothing). */
export const PROBE_PATH = '/auth/v1/health';

/** Until when each address of ours rests after a failure (ms). */
const restingUntil = new Map<string, number>();
/** Newer addresses whose test call came back from the gym server. */
const proven = new Set<string>();
/** Test calls running now (one per address at a time). */
const probing = new Set<string>();
/** The addresses of ours the app was built with (the last list routedFetch was given). */
let known: readonly string[] = [];

function listOf(proxies: string | readonly string[]): readonly string[] {
  const list = (typeof proxies === 'string' ? [proxies] : proxies).filter((p) => p.length > 0);
  return list.filter((p, i) => list.indexOf(p) === i);
}

/**
 * The address of ours to use now, or null for Supabase's own. The first that is not resting and is
 * either proven or the last (longest-serving) one. PURE given the module's memory.
 */
export function activeProxy(proxies: string | readonly string[], now: number = Date.now()): string | null {
  const list = listOf(proxies);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if ((restingUntil.get(p) ?? 0) > now) continue;
    if (i === list.length - 1 || proven.has(p)) return p;
  }
  return null;
}

/** Is Supabase's own address in use now (every address of ours failed within the last 10 minutes)? */
export function usingDirect(now: number = Date.now()): boolean {
  return known.length > 0 && activeProxy(known, now) === null;
}

/** Test hook: forget every failure, test call and list. */
export function resetAddressSwitch(): void {
  restingUntil.clear();
  proven.clear();
  probing.clear();
  known = [];
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/**
 * Did our address fail with this answer? An answer without our Worker's stamp is Cloudflare's own
 * page (the free plan's daily limit, a Worker failure, or a host with no Worker yet);
 * "unreachable" is our Worker's 502. PURE.
 */
export function proxyFailed(res: { headers: { get(name: string): string | null } }): boolean {
  const stamp = res.headers.get(STAMP);
  return stamp === null || stamp === 'unreachable';
}

/**
 * A fetch over our addresses (newest first; one string is a list of one). supabase-js builds every
 * request on the FIRST address; this sends it to the address in use now (activeProxy), else to
 * Supabase's own. An address that fails (no answer, a hang of 10 s or more, or an answer that is not
 * the gym server's) rests for 10 minutes; the failed request is never sent again. A newer address
 * not yet proven gets one test call in the background. Typed loosely inside: React Native's and the
 * browser's `fetch` types differ (a URL or not).
 */
export function routedFetch(proxies: string | readonly string[], direct: string, base: Fetch, now: () => number = Date.now): Fetch {
  const call = base as unknown as (input: unknown, init?: RequestInit) => Promise<Response>;
  const list = listOf(proxies);
  known = list;
  const first = list[0] ?? '';
  const fail = (p: string, why: string, e?: unknown) => {
    restingUntil.set(p, now() + FALLBACK_MS);
    const next = activeProxy(list, now()) ?? "Supabase's own";
    console.warn(`[ForgeErr] our server address ${p} failed (${why}); ${next} for 10 minutes`, e ?? '');
  };

  /** One harmless call through a newer address; it is used once the gym server answers through it. */
  const probe = (p: string): void => {
    if (probing.has(p)) return;
    probing.add(p);
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), HANG_MS);
    void (async () => {
      try {
        const res = await call(p + PROBE_PATH, { method: 'GET', signal: stop.signal });
        if (proxyFailed(res)) {
          restingUntil.set(p, now() + FALLBACK_MS);
          console.log(`[Forge] address ${p} not ready (answer ${res.status} without the gym server's stamp); tried again in 10 minutes`);
        } else {
          proven.add(p);
          console.log(`[Forge] address ${p} works; used from now on`);
        }
      } catch (e) {
        restingUntil.set(p, now() + FALLBACK_MS);
        console.log(`[Forge] address ${p} not reachable yet; tried again in 10 minutes`, e);
      } finally {
        clearTimeout(timer);
        probing.delete(p);
      }
    })();
  };

  /** Test the newer addresses ahead of the one in use (never one resting or already proven). */
  const probeAhead = (active: string | null): void => {
    const stopAt = active === null ? list.length : list.indexOf(active);
    for (let i = 0; i < stopAt; i++) {
      const p = list[i];
      if (!proven.has(p) && (restingUntil.get(p) ?? 0) <= now()) probe(p);
    }
  };

  return (async (input: unknown, init?: RequestInit) => {
    const url = urlOf(input);
    const ours = first !== '' && url.startsWith(first + '/');
    // supabase-js always passes the address as text; anything else is left as it is.
    if (!ours || !(typeof input === 'string' || input instanceof URL)) return call(input, init);
    const active = activeProxy(list, now());
    probeAhead(active);
    const target = (active ?? direct) + url.slice(first.length);
    if (active === null) return call(target, init);
    const started = now();
    try {
      const res = await call(target, init);
      if (proxyFailed(res)) fail(active, `answer ${res.status} without the gym server's stamp`);
      return res;
    } catch (e) {
      const aborted = !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
      if (!aborted || now() - started >= HANG_MS) fail(active, aborted ? 'no answer in 10 s' : 'no answer', e);
      throw e;
    }
  }) as unknown as Fetch;
}

/**
 * A picture saved with Supabase's own address (a gym logo, a shop photo), loaded through the
 * address of ours in use now. Anything else is left as it is. PURE given the module's memory.
 */
export function viaOurAddress(url: string, direct: string, proxies: string | readonly string[]): string;
export function viaOurAddress(url: string | null | undefined, direct: string, proxies: string | readonly string[]): string | null | undefined;
export function viaOurAddress(url: string | null | undefined, direct: string, proxies: string | readonly string[]): string | null | undefined {
  if (!url || !direct) return url;
  // Every address of ours failed a moment ago: pictures load from Supabase's own address too (review of R-55).
  const p = activeProxy(proxies);
  if (!p) return url;
  return url.startsWith(direct + '/') ? p + url.slice(direct.length) : url;
}

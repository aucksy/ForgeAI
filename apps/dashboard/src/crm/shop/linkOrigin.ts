/**
 * R-539 (owner, 14 Nov 2026): the "Become a member" link opened inside the installed admin app on his phone (its
 * splash first), because it was on app.mettleup.fit, the admin app's own address. Links for people who are not
 * members yet move to join.mettleup.fit, outside the admin app, once that address is connected: the panel's Worker
 * says which address to use (GET /api/links, deploy/panel/hosts.js joinOrigin, the var JOIN_HOST). Until it says
 * join.mettleup.fit, or when it cannot be asked, links stay on app.mettleup.fit, which serves the page for good.
 * Asked once per page; a failure is remembered too (no second wait).
 */

import { useEffect, useState } from 'react';

export const APP_LINK_ORIGIN = 'https://app.mettleup.fit';
export const JOIN_LINK_ORIGIN = 'https://join.mettleup.fit';

/** /api/links's answer: join.mettleup.fit only when it says exactly that; anything else app.mettleup.fit. PURE. */
export function joinOriginFrom(raw: unknown): string {
  const join = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { join?: unknown }).join : undefined;
  return join === JOIN_LINK_ORIGIN ? JOIN_LINK_ORIGIN : APP_LINK_ORIGIN;
}

let known: string | null = null;
let asking: Promise<string> | null = null;

/** What is known now (app.mettleup.fit until the Worker has answered). */
export function joinOriginNow(): string {
  return known ?? APP_LINK_ORIGIN;
}

/** Ask the Worker once. Never throws. */
export function loadJoinOrigin(fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<string> {
  if (known) return Promise.resolve(known);
  if (asking) return asking;
  asking = (async () => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeoutMs);
    let origin = APP_LINK_ORIGIN;
    try {
      const r = await fetchImpl('/api/links', { cache: 'no-store', signal: stop.signal });
      const type = r.headers.get('Content-Type') ?? '';
      if (r.ok && type.includes('json')) origin = joinOriginFrom(await r.json());
    } catch (e) {
      console.info('[links] /api/links not answered; join links stay on app.mettleup.fit', e instanceof Error ? e.message : e);
    } finally {
      clearTimeout(timer);
    }
    known = origin;
    return origin;
  })();
  return asking;
}

/** For tests: forget the answer. */
export function resetJoinOriginForTests(): void {
  known = null;
  asking = null;
}

/** The address to make "Become a member" links with; redraws once the Worker answers. */
export function useJoinOrigin(): string {
  const [origin, setOrigin] = useState(joinOriginNow);
  useEffect(() => {
    let live = true;
    void loadJoinOrigin().then((o) => {
      if (live) setOrigin(o);
    });
    return () => {
      live = false;
    };
  }, []);
  return origin;
}

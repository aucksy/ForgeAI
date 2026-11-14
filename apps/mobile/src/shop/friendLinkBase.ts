/**
 * R-539: where the "Bring a friend" link points. The panel's Worker says (GET https://app.mettleup.fit/api/links,
 * deploy/panel/hosts.js joinOrigin): join.mettleup.fit once that address is connected, else app.mettleup.fit.
 * Asked once per app run (a failure is remembered too, so a slow network costs one wait at most); until it answers,
 * and offline, the link stays on app.mettleup.fit, which serves the page for good.
 */
import { FRIEND_LINK_BASE, friendLinkBaseFrom } from './bringFriend';

export const LINKS_URL = 'https://app.mettleup.fit/api/links';

let known: string | null = null;
let asking: Promise<string> | null = null;

/** What is known now, without asking. */
export function knownFriendLinkBase(): string {
  return known ?? FRIEND_LINK_BASE;
}

/** Ask the Worker once. Never throws. */
export function friendLinkBase(fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<string> {
  if (known) return Promise.resolve(known);
  if (asking) return asking;
  asking = (async () => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeoutMs);
    let base = FRIEND_LINK_BASE;
    try {
      const r = await fetchImpl(LINKS_URL, { signal: stop.signal });
      if (r.ok) base = friendLinkBaseFrom(await r.json());
    } catch (e) {
      console.log('[friend] link address not answered; the link stays on app.mettleup.fit', e instanceof Error ? e.message : e);
    } finally {
      clearTimeout(timer);
    }
    known = base;
    return base;
  })();
  return asking;
}

/** For tests: forget the answer. */
export function resetFriendLinkBaseForTests(): void {
  known = null;
  asking = null;
}

/**
 * Audit Phase 7 review: a page's back arrow is never a dead button.
 *
 * Opened from a link, a notification or a widget, or after Android restored the app, a page can
 * be the only one on the stack — `router.back()` then does nothing and the member is stuck on
 * the page. With nothing to go back to, the arrow goes to the tab the page belongs under.
 */
import type { Href } from 'expo-router';

/** The tab a page belongs under, for when there is nothing to go back to. */
export type BackHome = '/' | '/workout' | '/history' | '/analytics' | '/settings';

/** Where the back arrow goes: back, or (nothing behind this page) the page's tab. PURE. */
export function backTarget(canGoBack: boolean, home: BackHome): 'back' | BackHome {
  return canGoBack ? 'back' : home;
}

interface BackNav {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
}

/** The back arrow: back when there is a page behind this one, otherwise the page's tab. */
export function goBack(router: BackNav, home: BackHome = '/'): void {
  const t = backTarget(router.canGoBack(), home);
  if (t === 'back') router.back();
  else router.replace(t);
}

/**
 * A ~70-line hash router.
 *
 * Deliberately not a dependency: the CRM is one console with a handful of routes,
 * and hash routing means the built SPA can be opened from a file, a LAN address or
 * any static host with no server rewrite rules — which matters for a product whose
 * first users are gyms on a shared PC behind whatever their ISP gave them.
 *
 * Routes are `#/members`, `#/members/:id`, `#/plans` …; the back button, deep links
 * and refresh all behave normally because it is real browser history.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export interface Route {
  /** Path segments after the `#/`, e.g. `['members', 'mem_1']`. */
  segments: string[];
  /** The raw path, always leading-slashed: `/members/mem_1`. */
  path: string;
}

function currentRoute(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return { path, segments: path.split('/').filter(Boolean).map(decodeURIComponent) };
}

/** Navigate, pushing history. */
export function navigate(path: string): void {
  const next = path.startsWith('/') ? path : `/${path}`;
  if (window.location.hash === `#${next}`) return;
  window.location.hash = next;
}

/** Replace the current entry — for redirects that shouldn't trap the back button. */
export function replace(path: string): void {
  const next = path.startsWith('/') ? path : `/${path}`;
  window.history.replaceState(null, '', `#${next}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// ---------------------------------------------------------------- address changes, as the browser sees them

/**
 * How many times the address has changed to another page since the app opened, counted from the browser's own
 * hashchange events. React may draw two quick changes as one (Money, then straight back to Today, before Money was
 * ever drawn), so a screen that stays on screen across that still sees the count move: it was left, and came back.
 */
let addressChanges = 0;
let lastPath: string | null = null;
const addressListeners = new Set<() => void>();

function onAddressChange(): void {
  const path = currentRoute().path;
  if (path === lastPath) return;
  lastPath = path;
  addressChanges += 1;
  for (const l of addressListeners) l();
}

function subscribeAddress(l: () => void): () => void {
  if (addressListeners.size === 0) {
    lastPath = currentRoute().path;
    window.addEventListener('hashchange', onAddressChange);
  }
  addressListeners.add(l);
  return () => {
    addressListeners.delete(l);
    if (addressListeners.size === 0) window.removeEventListener('hashchange', onAddressChange);
  };
}

/** The number of address changes so far (see `addressChanges`); it moves each time the page is left. */
export function useAddressChanges(): number {
  return useSyncExternalStore(subscribeAddress, () => addressChanges, () => 0);
}

/** Subscribe to the current route. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? { path: '/', segments: [] } : currentRoute(),
  );

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    // The hash may already be set before this effect runs (deep link, refresh).
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** Send an old address to its new place, without trapping the back button (`replace`). */
export function Redirect({ to }: { to: string }): null {
  useEffect(() => replace(to), [to]);
  return null;
}

/** `useRoute` plus the helpers a screen usually wants. */
export function useNavigation() {
  const route = useRoute();
  const go = useCallback((path: string) => navigate(path), []);
  const back = useCallback(() => window.history.back(), []);
  return useMemo(() => ({ route, go, back }), [route, go, back]);
}

/** An anchor that routes without a full page load. */
export function Link({
  to,
  children,
  style,
  title,
}: {
  to: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <a
      href={`#${to.startsWith('/') ? to : `/${to}`}`}
      title={title}
      style={{ textDecoration: 'none', color: 'inherit', ...style }}
    >
      {children}
    </a>
  );
}

/**
 * Audit Phase 7 review: a back arrow is never a dead button. Opened cold (a link, a widget, a
 * notification, Android restoring the app), a page with nothing behind it goes to its tab.
 */
import { describe, expect, it } from 'vitest';

import { backTarget, goBack } from '@/lib/goBack';

describe('the back arrow with nothing to go back to', () => {
  it('goes back when there is a page behind (PURE)', () => {
    expect(backTarget(true, '/workout')).toBe('back');
  });

  it('otherwise goes to the page’s own tab (PURE)', () => {
    expect(backTarget(false, '/workout')).toBe('/workout');
    expect(backTarget(false, '/')).toBe('/');
  });

  it('drives the router: back, or replace with the tab (Home by default)', () => {
    const calls: string[] = [];
    const nav = (can: boolean) => ({
      canGoBack: () => can,
      back: () => void calls.push('back'),
      replace: (h: unknown) => void calls.push(`replace:${String(h)}`),
    });
    goBack(nav(true), '/workout');
    goBack(nav(false), '/workout');
    goBack(nav(false));
    expect(calls).toEqual(['back', 'replace:/workout', 'replace:/']);
  });
});

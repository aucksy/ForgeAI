/**
 * R-583: a tapped notification opens the page it names, for every route the servers and the app send.
 */
import { describe, expect, it } from 'vitest';

import { alertTapPath } from '@/lib/alertRoute';

describe('a tapped notification opens its page (R-583)', () => {
  it('every page a notification names today', () => {
    for (const r of ['/shop/message', '/settings/feedback', '/shop/orders', '/shop/diet', '/measures', '/shop/inbox', '/shop/ask', '/shop', '/workout']) {
      expect(alertTapPath(r)).toBe(r);
    }
  });
  it('never a link out of the app, or anything odd', () => {
    for (const r of ['https://evil.example', '//evil.example', 'shop/message', '/shop/../x', '/Shop', '/shop?x=1', '/', '', null, 42, `/${'a'.repeat(60)}`]) {
      expect(alertTapPath(r)).toBeNull();
    }
  });
});

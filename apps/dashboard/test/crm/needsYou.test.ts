/** R-319 item 8a: "Needs you" on the gym admin panel (logic/needsYou.ts). */
import { describe, expect, it } from 'vitest';

import { arrivalLine, itemKeys, needsItems, needsLines, newArrivals, NEEDS_WORDS, titleWithCount } from '../../src/crm/logic/needsYou';

describe('Needs you', () => {
  const items = needsItems({ planRequests: ['p1', 'p2'], phoneLinks: ['l1'], shopOrders: ['o1'] });

  it('one count, one line per kind that has something, each opening its place', () => {
    expect(items).toHaveLength(4);
    expect(needsLines(items)).toEqual([
      { kind: 'plan-request', count: 2, text: '2 plan requests from the app to approve', to: '#needs-plan-requests' },
      { kind: 'phone-link', count: 1, text: '1 check-in number to confirm', to: '#needs-phone-links' },
      { kind: 'shop-order', count: 1, text: '1 new shop order to get ready', to: '/shop' },
    ]);
    expect(needsLines([])).toEqual([]);
    // TODO(0053) hook: member questions count once fed in.
    expect(needsLines(needsItems({ planRequests: [], phoneLinks: [], shopOrders: [], questions: ['q'] }))[0].to).toBe('/questions');
  });

  it('the tab title carries the count', () => {
    expect(titleWithCount('MettleUp for Gyms', 3)).toBe('(3) MettleUp for Gyms');
    expect(titleWithCount('MettleUp for Gyms', 0)).toBe('MettleUp for Gyms');
    expect(titleWithCount('MettleUp for Gyms', 120)).toBe('(99+) MettleUp for Gyms');
  });

  it('only what is new rings; the first look never does', () => {
    expect(newArrivals(null, items)).toEqual([]);
    const before = itemKeys(items);
    const now = needsItems({ planRequests: ['p2'], phoneLinks: ['l1'], shopOrders: ['o1', 'o2'] });
    expect(newArrivals(before, now)).toEqual([{ kind: 'shop-order', id: 'o2' }]);
    expect(arrivalLine([{ kind: 'shop-order', id: 'o2' }])).toBe('A new shop order came in.');
    expect(arrivalLine(now)).toMatch(/^4 new things need you/);
  });

  it('plain words', () => {
    for (const w of [...Object.values(NEEDS_WORDS), ...needsLines(items).map((l) => l.text)]) {
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
    }
  });
});

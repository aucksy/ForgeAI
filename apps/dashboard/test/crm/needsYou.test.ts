/** R-319 item 8a: "Needs you" on the gym admin panel (logic/needsYou.ts). */
import { describe, expect, it } from 'vitest';

import { arrivalLine, countIds, itemKeys, needsItems, needsLines, newArrivals, NEEDS_WORDS, titleWithCount } from '../../src/crm/logic/needsYou';

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
    // R-506: the questions (0053) and member messages (0069) waiting for a reply show and ring too.
    const talk = needsItems({ planRequests: [], phoneLinks: [], shopOrders: [], questions: countIds('q', 2), messages: countIds('m', 1) });
    expect(needsLines(talk)).toEqual([
      { kind: 'trainer-question', count: 2, text: '2 questions for trainers to answer', to: '/questions' },
      { kind: 'member-message', count: 1, text: '1 member message to reply to', to: '/member-messages' },
    ]);
    // A count that goes up is a new item, so it rings once.
    const more = needsItems({ planRequests: [], phoneLinks: [], shopOrders: [], questions: countIds('q', 2), messages: countIds('m', 2) });
    expect(newArrivals(itemKeys(talk), more)).toEqual([{ kind: 'member-message', id: 'm:2' }]);
    expect(arrivalLine([{ kind: 'member-message', id: 'm:2' }])).toBe('A member sent your gym a message. Open Member messages to reply.');
    expect(arrivalLine([{ kind: 'trainer-question', id: 'q:1' }])).toBe('A member asked a trainer a question. Open Questions for trainers to reply.');
    expect(countIds('q', 0)).toEqual([]);
    expect(countIds('q', Number.NaN)).toEqual([]);
    expect(countIds('q', 9999)).toHaveLength(500);
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

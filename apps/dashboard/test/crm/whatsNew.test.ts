// R-148: "What's new" in the admin app (logic/whatsNew.ts, ui/WhatsNew.tsx).
import { describe, expect, it } from 'vitest';

import { canOpen } from '../../src/crm/auth/permissions';
import {
  ADMIN_NEWS,
  SEEN_KEY,
  SHOWN_UPDATES,
  currentNews,
  markNewsSeen,
  newsDay,
  newsToShow,
  readNews,
  type AdminNewsEntry,
  type NewsStore,
} from '../../src/crm/logic/whatsNew';
import { newsGo } from '../../src/crm/ui/WhatsNew';

function store(seed: Record<string, string> = {}): NewsStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const LOG: AdminNewsEntry[] = [
  { id: '2026-11-05', lines: [{ text: 'C' }] },
  { id: '2026-11-01', lines: [] },
  { id: '2026-10-30', lines: [{ text: 'B' }] },
  { id: '2026-10-20', lines: [{ text: 'A' }] },
  { id: '2026-10-10', lines: [{ text: 'Z' }] },
];

describe('the list itself', () => {
  it('is newest first, one entry per day, real days, every line short and in plain words', () => {
    const ids = ADMIN_NEWS.map((e) => e.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ADMIN_NEWS) {
      expect(e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(newsDay(e.id)).not.toBe(e.id);
      for (const l of e.lines) {
        expect(l.text.length).toBeLessThanOrEqual(220);
        // Member words (R-98): none of the inside words.
        expect(l.text).not.toMatch(/\b(volume|PR|session|sync|FCM|D1|Supabase|RPC)\b/);
        if (l.go) expect(l.go.path).toMatch(/^\/[a-z/]+$/);
      }
    }
  });

  it('every button opens a page the app has, and the owner may open all of them', () => {
    for (const e of ADMIN_NEWS) for (const l of e.lines) if (l.go) expect(canOpen('owner', l.go.path)).toBe(true);
  });
});

describe('which updates the card shows', () => {
  it('nothing for a browser that never saw an update (remembered, not announced)', () => {
    expect(newsToShow(null, LOG)).toEqual([]);
    const s = store();
    expect(readNews(s, LOG)).toEqual([]);
    expect(s.map.get(SEEN_KEY)).toBe('2026-11-05');
    expect(readNews(s, LOG)).toEqual([]);
  });

  it('the updates newer than the one last seen, empty ones skipped, at most 3', () => {
    expect(newsToShow('2026-10-20', LOG).map((e) => e.id)).toEqual(['2026-11-05', '2026-10-30']);
    expect(newsToShow('2026-11-05', LOG)).toEqual([]);
    expect(newsToShow('2026-01-01', LOG).length).toBe(SHOWN_UPDATES);
  });

  it('"Got it" hides it until the next update', () => {
    const s = store({ [SEEN_KEY]: '2026-10-20' });
    expect(readNews(s, LOG).length).toBe(2);
    markNewsSeen(s, LOG);
    expect(readNews(s, LOG)).toEqual([]);
    const next = [{ id: '2026-12-01', lines: [{ text: 'D' }] }, ...LOG];
    expect(readNews(s, next).map((e) => e.id)).toEqual(['2026-12-01']);
  });

  it('never throws when storage is blocked', () => {
    const broken: NewsStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readNews(broken, LOG)).toEqual([]);
    expect(() => markNewsSeen(broken, LOG)).not.toThrow();
    expect(readNews(null, LOG)).toEqual([]);
  });

  it('the page is the newest update in the list', () => {
    expect(currentNews(LOG)).toBe('2026-11-05');
    expect(currentNews([])).toBeNull();
    expect(currentNews()).toBe(ADMIN_NEWS[0].id);
  });
});

describe('words and buttons', () => {
  it('shows the day in words', () => {
    expect(newsDay('2026-10-28')).toBe('28 Oct 2026');
    expect(newsDay('2026-01-05')).toBe('5 Jan 2026');
  });

  it('the front desk gets no button to a page it cannot open', () => {
    const line = { text: 'x', go: { label: 'Open Messages & offers', path: '/messages' } };
    expect(newsGo(line, 'owner')).toEqual(line.go);
    expect(newsGo(line, 'staff')).toBeNull();
    expect(newsGo({ text: 'no button' }, 'owner')).toBeNull();
  });
});

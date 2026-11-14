// R-148: "What's new" in the admin app (logic/whatsNew.ts, ui/WhatsNew.tsx).
import { describe, expect, it } from 'vitest';

import { canOpen } from '../../src/crm/auth/permissions';
import {
  ADMIN_NEWS,
  ADMIN_NEWS_PENDING,
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
        // A route may have a hyphen (R-459: /member-messages).
        if (l.go) expect(l.go.path).toMatch(/^\/[a-z/-]+$/);
      }
    }
  });

  it('every button opens a page the app has, and the owner may open all of them', () => {
    for (const e of ADMIN_NEWS) for (const l of e.lines) if (l.go) expect(canOpen('owner', l.go.path)).toBe(true);
  });

  // R-480: the lines waiting for a deploy follow the same rules, so they can move to ADMIN_NEWS as they are.
  it('the waiting lines are ready to move: short, plain, real pages; the AI Assistant says what credits cost', () => {
    for (const e of ADMIN_NEWS_PENDING) {
      expect(e.id).toMatch(/^pending-[a-z-]+$/);
      for (const l of e.lines) {
        expect(l.text.length).toBeLessThanOrEqual(220);
        expect(l.text).not.toMatch(/\b(volume|PR|session|sync|FCM|D1|Supabase|RPC)\b/);
        if (l.go) expect(canOpen('owner', l.go.path)).toBe(true);
      }
    }
    // R-480: the AI Assistant went live on 13 Nov 2026, so its lines now sit in ADMIN_NEWS.
    const ai = ADMIN_NEWS.find((e) => e.id === '2026-11-13')!.lines.map((l) => l.text).join(' ');
    for (const fact of ['question is free', '1 AI credit', 'uses 3', '20 AI credits, once', '50 on Starter, 100 on Pro', 'Monthly plans get none']) expect(ai).toContain(fact);
  });

  // R-555 (the safe panel deploy): what reaches owners and is ON in it, said once each; nothing about what stays off.
  it('the 14 Nov entry names what this deploy switches on, and never join payments or gym web pages (both off)', () => {
    const entry = ADMIN_NEWS.find((e) => e.id === '2026-11-14')!;
    const all = entry.lines.map((l) => l.text).join(' ');
    for (const fact of [
      'Join on your phone',
      'Joined online',
      'Make member',
      'Razorpay and Cashfree',
      'Invited again by',
      'Updated 30 s ago',
      'Refresh',
      'Trainer or Other',
      'six ready-made plans, veg and non-veg',
      'grow as you type',
      'line charts',
      '12 months',
      'only you and the front desk',
      'your reply reaches their phone at once',
      'Set your gym timings',
      '10 answers use 1 credit',
    ]) expect(all, fact).toContain(fact);
    // Held or off in this deploy (JOIN_PAY, GYM_PAGES): not a word about them.
    expect(all).not.toMatch(/pay online when|paid online|Approve|web page|join\.mettleup|Take payments/i);
    // Fewer, clearer lines (member-words): one entry stays readable on a phone.
    expect(entry.lines.length).toBeLessThanOrEqual(24);
    expect(entry.lines[0].text).toContain('logo');
    // Complete sentences: each line starts with a capital (or a quoted page name) and ends with a full stop.
    for (const l of entry.lines) {
      expect(l.text, l.text).toMatch(/^["A-Z]/);
      expect(l.text, l.text).toMatch(/\.$/);
    }
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

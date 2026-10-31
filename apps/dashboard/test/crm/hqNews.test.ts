import { describe, expect, it, vi } from 'vitest';

import { HQ_SEEN_KEY, cleanMessages, fetchHqNews, markHqSeen, readHqUnread, unreadHq, type HqMessage } from '../../src/crm/logic/hqNews';

const msg = (id: number, extra: Partial<HqMessage> = {}): HqMessage => ({ id, at: '2026-10-31T10:00:00Z', title: `T${id}`, body: 'B', link: '', label: '', ...extra });

function store(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('HQ messages in the bell (R-243)', () => {
  it('keeps only well-formed messages, newest first, and drops unsafe links', () => {
    const out = cleanMessages({
      messages: [
        msg(1),
        { id: 3, at: 'x', title: 'Go', body: 'b', link: 'javascript:alert(1)', label: 'Go' },
        { id: 'x', title: 'bad' },
        msg(2, { link: '/plans', label: 'Open plans' }),
      ],
    });
    expect(out.map((m) => m.id)).toEqual([3, 2, 1]);
    expect(out[0].link).toBe('');
    expect(out[0].label).toBe('');
    expect(out[1].link).toBe('/plans');
    expect(cleanMessages(null)).toEqual([]);
  });

  it('R-245: before the bell was ever opened, the last 14 days count; after, only newer messages', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const s = store();
    // The owner's case: the desk never opened the bell, then HQ's first message arrived: it must count.
    const old = msg(1, { at: '2026-10-10T10:00:00Z' });
    expect(readHqUnread([msg(2), old], s, now).map((m) => m.id)).toEqual([2]);
    expect(s.m.has(HQ_SEEN_KEY)).toBe(false);
    markHqSeen([msg(2), old], s);
    expect(s.m.get(HQ_SEEN_KEY)).toBe('2');
    expect(readHqUnread([msg(4), msg(3), msg(2)], s, now).map((m) => m.id)).toEqual([4, 3]);
    markHqSeen([msg(4), msg(3)], s);
    expect(readHqUnread([msg(4), msg(3)], s, now)).toEqual([]);
    expect(readHqUnread([], store(), now)).toEqual([]);
    expect(unreadHq([msg(1)], 0)).toHaveLength(1);
    expect(readHqUnread([msg(1)], null)).toEqual([]);
  });

  it('never throws: a failed answer is an empty list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fetchHqNews((async () => new Response('x', { status: 503 })) as typeof fetch)).toEqual([]);
    expect(await fetchHqNews((async () => { throw new Error('offline'); }) as typeof fetch)).toEqual([]);
    expect(await fetchHqNews((async () => new Response(JSON.stringify({ messages: [msg(5)] }))) as typeof fetch)).toHaveLength(1);
    warn.mockRestore();
  });
});

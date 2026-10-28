/**
 * Gym notices that pop up on the phone (shop/noticeAlerts.ts, the pure rules): which notices are
 * new, the first look that remembers without alerting, more than three at once, never twice, seen
 * ones skipped, nothing while the app is in front (but remembered), the cap, and the saved shape.
 */
import { describe, expect, it } from 'vitest';

import type { InboxMessage } from '@/shop/inbox';
import { ALERTED_CAP, alertedFromSaved, MAX_ALERT_AGE_MS, noticeTaskWanted, NOTICE_ROUTE, NOTICE_TASK_MINUTES, planNoticeAlerts } from '@/shop/noticeAlerts';

const NOW = Date.parse('2026-10-28T10:00:00Z');
const msg = (id: string, minsAgo: number, over: Partial<InboxMessage> = {}): InboxMessage => ({
  id,
  kind: 'announcement',
  title: `Notice ${id}`,
  body: '',
  createdAt: new Date(NOW - minsAgo * 60000).toISOString(),
  seen: false,
  ...over,
});

describe('which notices pop up', () => {
  it('the first look remembers every notice and shows none', () => {
    const p = planNoticeAlerts({ messages: [msg('a', 30), msg('b', 10)], alerted: null, inFront: false, now: NOW });
    expect(p.notify).toEqual([]);
    expect(p.alerted).toEqual(['a', 'b']);
  });

  it('after that, only notices not alerted before pop up, oldest first', () => {
    const p = planNoticeAlerts({ messages: [msg('c', 5), msg('a', 30), msg('b', 10)], alerted: ['a'], inFront: false, now: NOW });
    expect(p.notify.map((m) => m.id)).toEqual(['b', 'c']);
    expect(p.alerted).toEqual(['a', 'b', 'c']);
  });

  it('never twice: the same list again pops up nothing', () => {
    const list = [msg('a', 30), msg('b', 10)];
    const first = planNoticeAlerts({ messages: list, alerted: ['a'], inFront: false, now: NOW });
    expect(first.notify.map((m) => m.id)).toEqual(['b']);
    const again = planNoticeAlerts({ messages: list, alerted: first.alerted, inFront: false, now: NOW });
    expect(again.notify).toEqual([]);
    expect(again.alerted).toEqual(first.alerted);
  });

  it('a notice already seen is skipped (and remembered)', () => {
    const p = planNoticeAlerts({ messages: [msg('a', 30), msg('b', 10, { seen: true })], alerted: [], inFront: false, now: NOW });
    expect(p.notify.map((m) => m.id)).toEqual(['a']);
    expect(p.alerted).toEqual(['a', 'b']);
  });

  it('with the app in front nothing pops up, but the notices are remembered for the background job', () => {
    const list = [msg('a', 30), msg('b', 10)];
    const front = planNoticeAlerts({ messages: list, alerted: ['a'], inFront: true, now: NOW });
    expect(front.notify).toEqual([]);
    expect(front.alerted).toEqual(['a', 'b']);
    const later = planNoticeAlerts({ messages: list, alerted: front.alerted, inFront: false, now: NOW });
    expect(later.notify).toEqual([]);
  });

  it('a notice older than a week is remembered, not shown', () => {
    const old = msg('old', (MAX_ALERT_AGE_MS + 60000) / 60000);
    const p = planNoticeAlerts({ messages: [old, msg('new', 1)], alerted: [], inFront: false, now: NOW });
    expect(p.notify.map((m) => m.id)).toEqual(['new']);
    expect(p.alerted).toContain('old');
  });

  it('keeps the newest ids when more than the cap', () => {
    const many = Array.from({ length: ALERTED_CAP + 20 }, (_, i) => msg(`m${i}`, ALERTED_CAP + 30 - i));
    const p = planNoticeAlerts({ messages: many, alerted: null, inFront: false, now: NOW });
    expect(p.alerted).toHaveLength(ALERTED_CAP);
    expect(p.alerted.at(-1)).toBe(`m${ALERTED_CAP + 19}`);
    expect(p.alerted).not.toContain('m0');
  });

  it('an empty inbox on a first look still counts as the first look being done', () => {
    expect(planNoticeAlerts({ messages: [], alerted: null, inFront: false, now: NOW })).toEqual({ notify: [], alerted: [] });
    // The next notice after an empty first look does pop up.
    const p = planNoticeAlerts({ messages: [msg('a', 1)], alerted: [], inFront: false, now: NOW });
    expect(p.notify.map((m) => m.id)).toEqual(['a']);
  });
});

describe('what the phone keeps', () => {
  it('reads only what belongs to this member; anything else is a first look', () => {
    expect(alertedFromSaved({ memberId: 'm1', ids: ['a', 3, 'b'] }, 'm1')).toEqual(['a', 'b']);
    expect(alertedFromSaved({ memberId: 'm2', ids: ['a'] }, 'm1')).toBeNull();
    expect(alertedFromSaved(null, 'm1')).toBeNull();
    expect(alertedFromSaved({ memberId: 'm1' }, 'm1')).toBeNull();
    expect(alertedFromSaved('junk', 'm1')).toBeNull();
  });

  it('is capped on the way in', () => {
    const ids = Array.from({ length: ALERTED_CAP + 5 }, (_, i) => `i${i}`);
    const r = alertedFromSaved({ memberId: 'm1', ids }, 'm1')!;
    expect(r).toHaveLength(ALERTED_CAP);
    expect(r[0]).toBe('i5');
  });
});

describe('the background job', () => {
  it('runs only for a phone in a gym with the switch on, about every 15 minutes', () => {
    expect(noticeTaskWanted(true, true)).toBe(true);
    expect(noticeTaskWanted(false, true)).toBe(false);
    expect(noticeTaskWanted(true, false)).toBe(false);
    expect(NOTICE_TASK_MINUTES).toBe(15);
  });

  it('a tap opens the Gym inbox screen', () => {
    expect(NOTICE_ROUTE).toBe('/shop/inbox');
  });
});

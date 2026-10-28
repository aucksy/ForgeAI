/**
 * Gym notices that pop up: the words a member reads (shop/noticeAlertWords.ts). Plain English for a
 * gym member in India; no developer words.
 */
import { describe, expect, it } from 'vitest';

import type { InboxMessage } from '@/shop/inbox';
import {
  NOTICE_BLOCKED_SUB,
  NOTICE_BLOCKED_TITLE,
  NOTICE_BODY_MAX,
  NOTICE_CHANNEL_DESCRIPTION,
  NOTICE_CHANNEL_NAME,
  NOTICE_SWITCH_TITLE,
  noticeLine,
  noticePopups,
  noticeSwitchCaption,
} from '@/shop/noticeAlertWords';

const msg = (id: string, title: string): InboxMessage => ({ id, kind: 'announcement', title, body: 'More words', createdAt: '2026-10-28T09:00:00Z', seen: false });

describe('the pop-up words', () => {
  it('one notice: the gym name on top, the notice line under it', () => {
    expect(noticePopups("RAM'S FITNESS", [msg('a', 'Gym closed on Diwali')])).toEqual([{ id: 'gym-notice-a', title: "RAM'S FITNESS", body: 'Gym closed on Diwali' }]);
  });

  it('up to three notices: one pop-up each, each with its own id', () => {
    const p = noticePopups('Iron Den', [msg('a', 'One'), msg('b', 'Two'), msg('c', 'Three')]);
    expect(p.map((x) => x.body)).toEqual(['One', 'Two', 'Three']);
    expect(new Set(p.map((x) => x.id)).size).toBe(3);
  });

  it('more than three at once become one pop-up with the count and the gym', () => {
    const p = noticePopups('Iron Den', [msg('a', 'One'), msg('b', 'Two'), msg('c', 'Three'), msg('d', 'Four')]);
    expect(p).toEqual([{ id: 'gym-notices-many', title: '4 new messages from Iron Den', body: 'Tap to read them.' }]);
  });

  it('nothing new, nothing shown', () => {
    expect(noticePopups('Iron Den', [])).toEqual([]);
  });

  it('a long title is cut to about 120 characters; only its first line shows', () => {
    const long = 'x'.repeat(300);
    const line = noticeLine(long);
    expect(line.length).toBeLessThanOrEqual(NOTICE_BODY_MAX);
    expect(line.endsWith('…')).toBe(true);
    expect(noticeLine('First line\nSecond line')).toBe('First line');
    expect(noticeLine('  Spaced   out  ')).toBe('Spaced out');
    expect(noticeLine('Short')).toBe('Short');
  });

  it('a gym with no name still reads well', () => {
    expect(noticePopups('  ', [msg('a', 'Hi')])[0].title).toBe('Your gym');
    expect(noticeSwitchCaption('')).toContain('your gym');
  });
});

describe('the settings words', () => {
  const all = [NOTICE_CHANNEL_NAME, NOTICE_CHANNEL_DESCRIPTION, NOTICE_SWITCH_TITLE, NOTICE_BLOCKED_TITLE, NOTICE_BLOCKED_SUB, noticeSwitchCaption('Iron Den')].join(' | ');

  it('say what the member gets', () => {
    expect(NOTICE_CHANNEL_NAME).toBe('Messages from your gym');
    expect(NOTICE_SWITCH_TITLE).toBe('Messages from my gym');
    expect(noticeSwitchCaption('Iron Den')).toContain('Iron Den');
  });

  it('never use developer words', () => {
    expect(all).not.toMatch(/\b(volume|session|PR|sync|push|background|task|server)\b/i);
  });
});

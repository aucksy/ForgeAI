/**
 * Gym messages, Phase 1 (14 Oct 2026): the owner's checks before a message goes, the server's rows
 * read for the Sent list, and the words for the caps (0008_gym_messages.sql).
 */
import { describe, expect, it } from 'vitest';

import {
  DAY_MAX,
  MESSAGE_KINDS,
  calmNudge,
  capProblem,
  ordinal,
  draftProblem,
  isCapped,
  messageErrorWords,
  seenText,
  sentFromRows,
  type SentMessage,
} from '../../src/crm/shop/messages';

describe('a draft', () => {
  it('needs a title, fits the limits, and has no [blanks] left', () => {
    expect(draftProblem({ kind: 'announcement', title: '', body: '' })).toBe('Write a title.');
    expect(draftProblem({ kind: 'announcement', title: 'x'.repeat(61), body: '' })).toMatch(/60/);
    expect(draftProblem({ kind: 'announcement', title: 'Hi', body: 'x'.repeat(301) })).toMatch(/300/);
    const closed = MESSAGE_KINDS.find((k) => k.kind === 'closed')!;
    expect(draftProblem({ kind: 'closed', title: closed.title, body: closed.body })).toMatch(/brackets/);
    expect(draftProblem({ kind: 'closed', title: 'Gym closed on Sunday', body: 'Diwali.' })).toBeNull();
  });

  it('every ready-made title fits once its blanks are filled', () => {
    for (const k of MESSAGE_KINDS) expect(k.title.replace(/\[[^\]]*\]/g, 'Sunday').length).toBeLessThanOrEqual(60);
  });

  it('only offers and events are capped', () => {
    expect(MESSAGE_KINDS.filter((k) => isCapped(k.kind)).map((k) => k.kind)).toEqual(['offer', 'event']);
  });
});

describe('the server\'s limits, checked before sending (22 Oct 2026)', () => {
  // 22 Oct 2026, 10:00 in India.
  const NOW = Date.parse('2026-10-22T10:00:00+05:30');
  const at = (iso: string) => Date.parse(iso);
  const msg = (kind: SentMessage['kind'], createdAt: number, withdrawn = false): SentMessage => ({
    id: `${kind}-${createdAt}`,
    kind,
    title: 'x',
    body: '',
    createdAt,
    recipients: 10,
    seen: 0,
    withdrawn,
    sendAt: null,
    toGroup: false,
  });

  it('nothing stops a first offer, or gym news at any time', () => {
    expect(capProblem('offer', [], NOW)).toBeNull();
    expect(capProblem('offer', null, NOW)).toBeNull();
    expect(capProblem('closed', [msg('offer', at('2026-10-22T09:00:00+05:30'))], NOW)).toBeNull();
  });

  it('one offer or event a day, by the India day', () => {
    expect(capProblem('event', [msg('offer', at('2026-10-22T00:30:00+05:30'))], NOW)).toMatch(/already sent an offer or event today/);
    // 11:50 pm the day before, India time (18:20 UTC): yesterday.
    expect(capProblem('offer', [msg('offer', at('2026-10-21T23:50:00+05:30'))], NOW)).toBeNull();
    // One taken back does not count here (the server is asked, and has the last word).
    expect(capProblem('offer', [msg('offer', at('2026-10-22T09:00:00+05:30'), true)], NOW)).toBeNull();
  });

  it('three offers or events in any 7 days', () => {
    const week = ['2026-10-16', '2026-10-18', '2026-10-21'].map((d) => msg('offer', at(`${d}T12:00:00+05:30`)));
    expect(capProblem('offer', week, NOW)).toMatch(/3 offers or events this week/);
    const older = ['2026-10-15', '2026-10-18', '2026-10-21'].map((d) => msg('event', at(`${d}T12:00:00+05:30`)));
    expect(capProblem('offer', older, NOW)).toBeNull();
  });

  it('10 messages of any kind in a day (20 until R-195)', () => {
    expect(DAY_MAX).toBe(10);
    const many = Array.from({ length: 10 }, (_, i) => msg('closed', at('2026-10-22T08:00:00+05:30') + i * 60_000));
    expect(capProblem('announcement', many, NOW)).toBe(
      'You sent 10 messages today. That is the most for one day. Send it in the app tomorrow, or on WhatsApp now.',
    );
    expect(capProblem('announcement', many.slice(1), NOW)).toBeNull();
    // Yesterday's do not count.
    const yesterday = Array.from({ length: 10 }, (_, i) => msg('closed', at('2026-10-21T08:00:00+05:30') + i * 60_000));
    expect(capProblem('announcement', yesterday, NOW)).toBeNull();
  });
});

describe('the calm line before sending (R-195)', () => {
  const NOW = Date.parse('2026-10-22T10:00:00+05:30');
  const at = (iso: string) => Date.parse(iso);
  const msg = (createdAt: number, more: Partial<SentMessage> = {}): SentMessage => ({
    id: `m-${createdAt}-${Math.random()}`,
    kind: 'announcement',
    title: 'x',
    body: '',
    createdAt,
    recipients: 10,
    seen: 0,
    withdrawn: false,
    sendAt: null,
    toGroup: false,
    ...more,
  });
  const today = (h: number, more: Partial<SentMessage> = {}) => msg(at(`2026-10-22T0${h}:00:00+05:30`), more);
  const POPUP = 'so members get it in the app without a phone pop-up';

  it('says nothing before the 3rd message of the day', () => {
    expect(calmNudge(null, NOW)).toBeNull();
    expect(calmNudge([], NOW)).toBeNull();
    expect(calmNudge([today(8)], NOW)).toBeNull();
  });

  it('the 3rd message of the day gets the day line, with the pop-up words once the server marks quiet ones', () => {
    expect(calmNudge([today(8), today(9)], NOW)).toBe(
      'This is your 3rd message today. Members who get many messages start to ignore them, so send only what matters.',
    );
    expect(calmNudge([today(8, { quiet: false }), today(9, { quiet: false })], NOW)).toBe(
      `This is your 3rd message today, ${POPUP}. Members who get many messages start to ignore them.`,
    );
    expect(calmNudge([today(7), today(8), today(9, { quiet: true })], NOW)).toMatch(/^This is your 4th message today, /);
  });

  it('the 8th message in any 7 days gets the week line', () => {
    const week = ['16', '17', '18', '19', '20', '21', '22'].map((d) => msg(at(`2026-10-${d}T12:00:00+05:30`), { quiet: false }));
    expect(calmNudge(week, NOW)).toBe(
      'This is your 8th message this week. Members who get many messages start to ignore them, so send only what matters.',
    );
    // The 7th: nothing yet. The 15th was 8 days ago: outside the week.
    expect(calmNudge(week.slice(1), NOW)).toBeNull();
    expect(calmNudge([msg(at('2026-10-15T12:00:00+05:30')), ...week.slice(1)], NOW)).toBeNull();
  });

  it('messages taken back and messages of another day do not count', () => {
    expect(calmNudge([today(8), today(9, { withdrawn: true })], NOW)).toBeNull();
    expect(calmNudge([msg(at('2026-10-21T23:50:00+05:30')), today(1)], NOW)).toBeNull();
    // Timed for tomorrow: not today's.
    expect(calmNudge([today(8, { sendAt: at('2026-10-23T09:00:00+05:30') }), today(9)], NOW)).toBeNull();
  });

  it('a timed message counts on the day it appears', () => {
    // Two sent yesterday, both timed for today: today's 3rd.
    const timed = [0, 1].map((i) => msg(at('2026-10-21T20:00:00+05:30') + i, { sendAt: at('2026-10-22T18:00:00+05:30') }));
    expect(calmNudge(timed, NOW)).toMatch(/^This is your 3rd message today\./);
    // Timing this one for tomorrow, which already has 2: "that day".
    const tomorrow = [0, 1].map((i) => today(8, { sendAt: at('2026-10-23T07:00:00+05:30') + i, quiet: false }));
    expect(calmNudge(tomorrow, NOW, at('2026-10-23T19:00:00+05:30'))).toBe(
      `This is your 3rd message for that day, ${POPUP}. Members who get many messages start to ignore them.`,
    );
    expect(calmNudge(tomorrow, NOW)).toBeNull();
  });

  it('counts with the right endings', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  });

  it('reads the quiet mark from the server only when it is there', () => {
    const [a, b] = sentFromRows([
      { id: 'a', kind: 'closed', title: 'A', createdAt: '2026-10-22T04:00:00Z', quiet: true },
      { id: 'b', kind: 'closed', title: 'B', createdAt: '2026-10-22T04:00:00Z' },
    ]);
    expect(a.quiet).toBe(true);
    expect('quiet' in b).toBe(false);
  });
});

describe('the Sent list', () => {
  it('reads the rows and says how many saw each', () => {
    const list = sentFromRows([
      { id: 'a', kind: 'closed', title: 'Gym closed on Sunday', body: 'Diwali', createdAt: '2026-10-14T06:21:19Z', recipients: 40, seen: 12, withdrawn: false },
      { id: 'b', kind: 'weird', title: 'x', createdAt: '2026-10-14T06:21:19Z' },
    ]);
    expect(list).toHaveLength(1);
    expect(seenText(list[0])).toBe('Seen by 12 of 40');
    expect(seenText({ seen: 5, recipients: 3 })).toBe('Seen by 3 of 3');
    expect(seenText({ seen: 0, recipients: 0 })).toBe('No app members yet');
  });

  it('turns the caps into plain words', () => {
    expect(messageErrorWords(new Error('OFFER_TODAY'))).toMatch(/one a day/);
    expect(messageErrorWords({ message: 'OFFER_WEEK' })).toMatch(/3 a week/);
    expect(messageErrorWords(new Error('TOO_MANY'))).toBe('You sent 10 messages today. That is the most for one day. Send it tomorrow.');
    expect(messageErrorWords(new Error('deadlock detected'))).toBe('Something went wrong. Please try again. Check the Sent list below before sending it again.');
    expect(draftProblem({ kind: 'announcement', title: 'Closed [', body: '' })).toMatch(/brackets/);
  });
});

/**
 * Gym messages, Phase 1 (14 Oct 2026): the owner's checks before a message goes, the server's rows
 * read for the Sent list, and the words for the caps (0008_gym_messages.sql).
 */
import { describe, expect, it } from 'vitest';

import {
  MESSAGE_KINDS,
  capProblem,
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

  it('20 messages of any kind in a day', () => {
    const many = Array.from({ length: 20 }, (_, i) => msg('closed', at('2026-10-22T08:00:00+05:30') + i * 60_000));
    expect(capProblem('announcement', many, NOW)).toMatch(/20 messages today/);
    expect(capProblem('announcement', many.slice(1), NOW)).toBeNull();
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
    expect(messageErrorWords(new Error('TOO_MANY'))).toMatch(/20 messages/);
    expect(messageErrorWords(new Error('deadlock detected'))).toBe('Something went wrong. Please try again. Check the Sent list below before sending it again.');
    expect(draftProblem({ kind: 'announcement', title: 'Closed [', body: '' })).toMatch(/brackets/);
  });
});

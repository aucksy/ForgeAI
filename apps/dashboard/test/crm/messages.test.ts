/**
 * Gym messages, Phase 1 (14 Oct 2026): the owner's checks before a message goes, the server's rows
 * read for the Sent list, and the words for the caps (0008_gym_messages.sql).
 */
import { describe, expect, it } from 'vitest';

import { MESSAGE_KINDS, draftProblem, isCapped, messageErrorWords, seenText, sentFromRows } from '../../src/crm/shop/messages';

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
    expect(messageErrorWords(new Error('deadlock detected'))).toBe('Something went wrong. Please try again.');
  });
});

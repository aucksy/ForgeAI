/**
 * R-604 (owner, 16 Nov 2026, "yes alerts fix"): the bell as this person's to-do list, from the server's truth (0098
 * owner_alert_list). An action item stays until it is done in its page; news until it is opened; the X takes a card off
 * this person's list and never makes it done; Undo puts it back; nothing moves while the panel is open except a card
 * removed with the X; Today keeps an action item that was removed but is not done.
 */
import { describe, expect, it } from 'vitest';

import {
  INBOX_WORDS,
  alertInboxFrom,
  historyTag,
  historyWhileOpen,
  markOpened,
  markRead,
  markRemoved,
  shownWhileOpen,
  todayFromInbox,
  undoRemoved,
  unreadIds,
  type AlertInbox,
} from '../../src/crm/logic/alertInbox';

const NOW = Date.parse('2026-11-16T11:00:00+05:30');
const MIN = 60_000;

const q = (id: string, at: number, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'member_question',
  line: `Asha sent your gym a question (${id}). Open Member messages to reply.`,
  route: '/member-messages',
  urgent: false,
  at,
  needs: 'action',
  read: false,
  ...extra,
});
const joined = (id: string, at: number, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'member_joined',
  line: `Vikram joined your gym in the MettleUp app (${id}). See them in Members using the app.`,
  route: '/members/app',
  urgent: false,
  at,
  needs: 'info',
  read: false,
  ...extra,
});

function inbox(open: unknown[], history: unknown[] = []): AlertInbox {
  const box = alertInboxFrom({ ok: true, now: NOW, count: 99, newCount: 99, open, history });
  if (!box) throw new Error('not an inbox');
  return box;
}

describe('reading the server answer', () => {
  it('reads the lists, and counts from them (action not done + news not read)', () => {
    const box = inbox([q('a1', NOW - 5 * MIN), q('a2', NOW - 9 * MIN, { read: true }), joined('i1', NOW - 20 * MIN), joined('i2', NOW - 30 * MIN, { read: true })]);
    expect(box.open.map((a) => [a.id, a.needs, a.read])).toEqual([
      ['a1', 'action', false],
      ['a2', 'action', true],
      ['i1', 'info', false],
      ['i2', 'info', true],
    ]);
    // A read action item still counts (not done yet); a read news item does not.
    expect(box.count).toBe(3);
    expect(box.newCount).toBe(2);
    expect(box.now).toBe(NOW);
    expect(unreadIds(box)).toEqual(['a1', 'i1']);
  });

  it('reads History: why it left, when, who did it; newest first', () => {
    const box = inbox(
      [],
      [
        q('d1', NOW - 60 * MIN, { left: 'done', leftAt: NOW - 30 * MIN, done: true, doneBy: ' Dinesh ' }),
        joined('o1', NOW - 50 * MIN, { left: 'opened', leftAt: NOW - 10 * MIN, done: true }),
        q('r1', NOW - 40 * MIN, { left: 'removed', leftAt: NOW - 20 * MIN, done: false }),
        joined('x1', NOW - 8 * 24 * 60 * MIN, { left: 'nonsense' }),
      ],
    );
    expect(box.history.map((a) => [a.id, a.left, a.done, a.doneBy])).toEqual([
      ['o1', 'opened', true, null],
      ['r1', 'removed', false, null],
      ['d1', 'done', true, 'Dinesh'],
      ['x1', 'done', true, null],
    ]);
    expect(box.count).toBe(0);
  });

  it('is null for anything that is not an answer (the panel then keeps what it had)', () => {
    expect(alertInboxFrom(null)).toBeNull();
    expect(alertInboxFrom({ ok: false })).toBeNull();
    expect(alertInboxFrom({ ok: true, open: [] })).toBeNull();
    expect(alertInboxFrom({ ok: true, alerts: [] })).toBeNull();
  });

  it('drops a line it cannot show, keeps the rest', () => {
    const box = inbox([q('a1', NOW), { id: 'bad', kind: 'not_a_kind', line: 'x', at: NOW }, { id: 'bad2', kind: 'member_question', line: '', at: NOW }]);
    expect(box.open.map((a) => a.id)).toEqual(['a1']);
  });
});

describe('what this person does', () => {
  it('opening the panel reads what it shows: action items stay and still count, news stops counting', () => {
    const box = inbox([q('a1', NOW - MIN), joined('i1', NOW - 2 * MIN)]);
    const read = markRead(box, new Set(unreadIds(box)));
    expect(read.open.map((a) => a.id)).toEqual(['a1', 'i1']);
    expect(read.count).toBe(1);
    expect(read.newCount).toBe(0);
    expect(markRead(box, new Set())).toBe(box);
  });

  it('opening news moves it to History as Opened; opening an action item leaves it waiting until it is done', () => {
    const box = inbox([q('a1', NOW - MIN), joined('i1', NOW - 2 * MIN)]);
    const news = markOpened(box, 'i1', NOW);
    expect(news.open.map((a) => a.id)).toEqual(['a1']);
    expect(news.history[0]).toMatchObject({ id: 'i1', left: 'opened', leftAt: NOW, done: true });
    const action = markOpened(box, 'a1', NOW);
    expect(action.open.map((a) => [a.id, a.read])).toEqual([
      ['a1', true],
      ['i1', false],
    ]);
    expect(action.history).toEqual([]);
    expect(action.count).toBe(2);
    expect(markOpened(box, 'nope', NOW)).toBe(box);
  });

  it('the X never makes an action item done; Undo puts it back in its place by time', () => {
    const box = inbox([q('a1', NOW - MIN), q('a2', NOW - 5 * MIN), joined('i1', NOW - 9 * MIN)]);
    const removed = markRemoved(box, 'a2', NOW);
    expect(removed.open.map((a) => a.id)).toEqual(['a1', 'i1']);
    expect(removed.history[0]).toMatchObject({ id: 'a2', left: 'removed', done: false });
    expect(historyTag(removed.history[0])).toBe(`${INBOX_WORDS.removedTag} · ${INBOX_WORDS.notDoneYet}`);
    expect(removed.count).toBe(2);
    const back = undoRemoved(removed, 'a2');
    expect(back.open.map((a) => a.id)).toEqual(['a1', 'a2', 'i1']);
    expect(back.history).toEqual([]);
    expect(back.count).toBe(3);
    // Undo only puts back what the X took.
    const opened = markOpened(box, 'i1', NOW);
    expect(undoRemoved(opened, 'i1')).toBe(opened);
  });

  it('the X on news: Removed (it is not waiting for anything)', () => {
    const removed = markRemoved(inbox([joined('i1', NOW)]), 'i1', NOW);
    expect(removed.history[0]).toMatchObject({ left: 'removed', done: true });
    expect(historyTag(removed.history[0])).toBe(INBOX_WORDS.removedTag);
  });
});

describe('the open panel stays still', () => {
  it('keeps every card in place; one done meanwhile gets its Done tag; nothing new slips in', () => {
    const frozen = inbox([q('a1', NOW - MIN), q('a2', NOW - 5 * MIN)]).open;
    // Meanwhile: a2 was answered on another phone, and a new question came.
    const latest = inbox([q('a0', NOW), q('a1', NOW - MIN)], [q('a2', NOW - 5 * MIN, { left: 'done', leftAt: NOW, done: true })]);
    expect(shownWhileOpen(frozen, latest, new Map()).map((x) => [x.alert.id, x.doneNow])).toEqual([
      ['a1', false],
      ['a2', true],
    ]);
  });

  it('a card removed with the X leaves at once and is on top of History', () => {
    const box = inbox([q('a1', NOW - MIN), q('a2', NOW - 5 * MIN)], [joined('o1', NOW - 60 * MIN, { left: 'opened', leftAt: NOW - 30 * MIN })]);
    const removed = new Map([['a2', NOW]]);
    expect(shownWhileOpen(box.open, box, removed).map((x) => x.alert.id)).toEqual(['a1']);
    const hist = historyWhileOpen(box.open, box.history, removed);
    expect(hist.map((a) => [a.id, a.left])).toEqual([
      ['a2', 'removed'],
      ['o1', 'opened'],
    ]);
    expect(hist[0].done).toBe(false);
  });
});

describe('Today', () => {
  it('the last 24 hours: action items until done (removed from the bell too), news until seen on Today', () => {
    const day = 24 * 60 * MIN;
    const box = inbox(
      [q('a1', NOW - MIN), joined('i1', NOW - 2 * MIN), joined('i2', NOW - 3 * MIN), q('old', NOW - day - MIN)],
      [
        q('r1', NOW - 4 * MIN, { left: 'removed', leftAt: NOW, done: false }),
        q('d1', NOW - 5 * MIN, { left: 'done', leftAt: NOW, done: true }),
        joined('o1', NOW - 6 * MIN, { left: 'opened', leftAt: NOW, done: true }),
      ],
    );
    expect(todayFromInbox(box, new Set(['i2']), NOW).map((a) => a.id)).toEqual(['a1', 'i1', 'r1']);
    expect(todayFromInbox(box, new Set(), NOW, 2).map((a) => a.id)).toEqual(['a1', 'i1']);
  });
});

describe('the words', () => {
  it('History tags read as plain words', () => {
    expect(historyTag({ left: 'done', done: true, needs: 'action' })).toBe('Done');
    expect(historyTag({ left: 'opened', done: true, needs: 'info' })).toBe('Opened');
    expect(historyTag({ left: 'old', done: true, needs: 'info' })).toBe('Older than 7 days');
  });

  it('every line is a full sentence or a short label, with no jargon', () => {
    for (const w of Object.values(INBOX_WORDS)) {
      expect(w).not.toMatch(/\b(inbox|alert id|RPC|server|null|undefined)\b/i);
    }
    expect(INBOX_WORDS.allDone).toMatch(/\.$/);
    expect(INBOX_WORDS.removed).toMatch(/\.$/);
  });
});

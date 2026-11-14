/**
 * "Member messages" (owner request, 12 Nov 2026; 0069): the gym's side of "Message your gym". The server's answers
 * read defensively (a nameless feedback stays nameless), the type buttons per role, waiting / replied / done, the
 * names and status lines, refusal words, and the page staying hidden until the server has 0069.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import {
  MEMBER_MESSAGE_WORDS as W,
  splitTalk,
  talkChipLabel,
  talkCountFrom,
  talkErrorWords,
  talkFilterFrom,
  talkFilters,
  talkLineHead,
  talkListFrom,
  talkName,
  talkStatusLine,
  talkThreadAnswerFrom,
  talkThreadFrom,
  waitingOf,
  shownOf,
  type TalkThread,
} from '../../src/crm/logic/memberMessages';
import * as api from '../../src/crm/shop/memberMessagesApi';

const TODAY = '2026-11-12';
// 12 Nov 2026, 9:30 am India time.
const AT = Date.parse('2026-11-12T09:30:00+05:30');
const line = (id: string, fromGym: boolean, at: number, text = 'Hi', who: string | null = null) => ({ id, fromGym, who, text, at });

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  kind: 'question',
  anonymous: false,
  appId: 'app-1',
  memberId: 'm-asha',
  name: 'Asha Verma',
  phone: '98290 11111',
  createdAt: AT,
  lastAt: AT,
  lastFrom: 'member',
  waiting: true,
  done: false,
  doneAt: null,
  doneBy: null,
  readByMember: false,
  messages: [line('a', false, AT, 'Is the gym open on Diwali?')],
  ...over,
});

afterEach(() => {
  callMock.mockReset();
  api.resetMemberMessagesApiForTest();
});

describe('reading the server', () => {
  it('a conversation: lines oldest first, the member line has no "who"', () => {
    const t = talkThreadFrom(row({ messages: [line('b', true, AT + 60_000, 'Yes, 6 am to 12 noon.', 'Ravi'), line('a', false, AT, 'Open?', 'x')] }))!;
    expect(t.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(t.messages[0].who).toBeNull();
    expect(t.messages[1].who).toBe('Ravi');
    expect(t.name).toBe('Asha Verma');
    expect(t.waiting).toBe(true);
  });
  it('a nameless feedback shows no name, phone or ids even if the server sent them', () => {
    const t = talkThreadFrom(row({ kind: 'feedback', anonymous: true }))!;
    expect(t).toMatchObject({ anonymous: true, name: null, phone: null, appId: null, memberId: null });
    expect(talkName(t)).toBe('A member (name hidden)');
    // Only feedback may be nameless: a question with the flag keeps its sender.
    expect(talkThreadFrom(row({ anonymous: true }))!.anonymous).toBe(false);
  });
  it('refuses what is not a conversation', () => {
    expect(talkThreadFrom(row({ kind: 'rant' }))).toBeNull();
    expect(talkThreadFrom(row({ messages: [] }))).toBeNull();
    expect(talkThreadFrom(row({ id: '' }))).toBeNull();
    expect(talkThreadFrom('x')).toBeNull();
  });
  it('done is never waiting; a missing "waiting" is worked out from the last line', () => {
    expect(talkThreadFrom(row({ done: true, waiting: true }))!.waiting).toBe(false);
    expect(talkThreadFrom(row({ waiting: undefined }))!.waiting).toBe(true);
    expect(talkThreadFrom(row({ waiting: undefined, messages: [line('a', true, AT, 'Hello', 'Ravi')] }))!.waiting).toBe(false);
  });
  it('the list, the count and one answer', () => {
    const list = talkListFrom([{ ok: true, role: 'staff', waiting: 1, threads: [row({ id: 'old', lastAt: AT - 9_000 }), row(), { junk: true }] }])!;
    expect(list.role).toBe('staff');
    expect(list.threads.map((t) => t.id)).toEqual(['t1', 'old']);
    expect(talkListFrom({ ok: false })).toBeNull();
    expect(talkListFrom({ ok: true, role: 'owner' })).toBeNull();
    expect(talkListFrom({ ok: true, role: 'boss', threads: [] })!.role).toBe('owner');
    // R-552 (0087): a trainer's answer says feedback: false; a server without 0087 says nothing (feedback shown).
    expect(list.seesFeedback).toBe(true);
    expect(talkListFrom({ ok: true, role: 'staff', feedback: false, threads: [] })!.seesFeedback).toBe(false);
    expect(talkListFrom({ ok: true, role: 'staff', feedback: true, threads: [] })!.seesFeedback).toBe(true);
    expect(talkListFrom({ ok: true, role: 'owner', feedback: false, threads: [] })!.seesFeedback).toBe(true);
    expect(talkCountFrom({ ok: true, waiting: 3 })).toBe(3);
    expect(talkCountFrom({ ok: true, waiting: -1 })).toBe(0);
    expect(talkCountFrom({ ok: true })).toBeNull();
    expect(talkThreadAnswerFrom({ ok: true, thread: row() })!.id).toBe('t1');
    expect(talkThreadAnswerFrom({ ok: true })).toBeNull();
  });
});

describe('the page', () => {
  const q = talkThreadFrom(row({ id: 'q', lastAt: AT }))!;
  const fOld = talkThreadFrom(row({ id: 'f', kind: 'feedback', lastAt: AT - 60_000 }))!;
  const replied = talkThreadFrom(row({ id: 'r', kind: 'complaint', waiting: false, messages: [line('a', false, AT), line('b', true, AT + 1, 'Sorry', 'Owner Singh')] }))!;
  const done = talkThreadFrom(row({ id: 'd', done: true, doneAt: AT, doneBy: 'Ravi' }))!;
  const all: TalkThread[] = [q, fOld, replied, done];

  it('the desk gets no Complaints button', () => {
    expect(talkFilters('owner')).toEqual(['all', 'question', 'feedback', 'complaint']);
    expect(talkFilters('staff')).toEqual(['all', 'question', 'feedback']);
  });
  it('R-552: a trainer gets no Feedback button either, and an old Feedback link opens All', () => {
    expect(talkFilters('staff', false)).toEqual(['all', 'question']);
    expect(talkFilters('owner', false)).toEqual(['all', 'question', 'feedback', 'complaint']);
    expect(talkFilterFrom('feedback', 'staff', false)).toBe('all');
    expect(talkFilterFrom('question', 'staff', false)).toBe('question');
    expect(W.trainerNote).toBe(
      'Feedback goes to the owner and front desk, and complaints go to the owner only, so they are not shown here.',
    );
  });
  it('waiting (longest wait first), replied, done; and by type', () => {
    const s = splitTalk(all, 'all');
    expect(s.waiting.map((t) => t.id)).toEqual(['f', 'q']);
    expect(s.replied.map((t) => t.id)).toEqual(['r']);
    expect(s.done.map((t) => t.id)).toEqual(['d']);
    expect(splitTalk(all, 'feedback').waiting.map((t) => t.id)).toEqual(['f']);
    expect(splitTalk(all, 'complaint').waiting).toEqual([]);
    expect(waitingOf(all, 'all')).toBe(2);
    expect(waitingOf(all, 'question')).toBe(1);
    expect(waitingOf(all, 'complaint')).toBe(0);
    // The type buttons count every card they show, not only the waiting ones (fresh-eyes review, 12 Nov 2026).
    expect(shownOf(all, 'all')).toBe(4);
    expect(shownOf(all, 'question')).toBe(2);
    expect(shownOf(all, 'complaint')).toBe(1);
  });
  it('fresh eyes: a type button says in words what waits ("All 3" read as 3 waiting while 1 did)', () => {
    expect(talkChipLabel(all, 'all')).toBe('All · 2 waiting');
    expect(talkChipLabel(all, 'question')).toBe('Questions · 1 waiting');
    expect(talkChipLabel(all, 'complaint')).toBe('Complaints');
    expect(talkChipLabel([], 'all')).toBe('All');
  });
  it('fresh eyes: a line on Today opens its own type; the desk never opens Complaints', () => {
    expect(talkFilterFrom('complaint', 'owner')).toBe('complaint');
    expect(talkFilterFrom('feedback', 'staff')).toBe('feedback');
    expect(talkFilterFrom('complaint', 'staff')).toBe('all');
    expect(talkFilterFrom('nonsense', 'owner')).toBe('all');
    expect(talkFilterFrom(undefined, 'owner')).toBe('all');
  });
  it('who wrote each line, with when (India time)', () => {
    expect(talkLineHead(q, q.messages[0], TODAY)).toBe('Asha Verma · Today, 9:30 am');
    expect(talkLineHead(replied, replied.messages[1], TODAY)).toBe('Owner Singh replied · Today, 9:30 am');
    const anon = talkThreadFrom(row({ kind: 'feedback', anonymous: true }))!;
    expect(talkLineHead(anon, anon.messages[0], TODAY)).toBe('The member · Today, 9:30 am');
    expect(talkLineHead(anon, line('x', true, AT, 'Thanks'), TODAY)).toBe('The gym replied · Today, 9:30 am');
  });
  it('the line under a conversation', () => {
    expect(talkStatusLine(q, TODAY)).toBeNull();
    expect(talkStatusLine(replied, TODAY)).toBe(W.notReadYet);
    expect(talkStatusLine({ ...replied, readByMember: true }, TODAY)).toBe(W.readByMember);
    expect(talkStatusLine(done, TODAY)).toBe('Marked as done by Ravi, Today, 9:30 am. If the member writes again, it moves back to Waiting for a reply.');
  });
  it('refusals in plain words', () => {
    expect(talkErrorWords(new Error('NOT_FOUND'))).toMatch(/no longer here/);
    expect(talkErrorWords({ message: 'THREAD_FULL' })).toBe(W.full);
    expect(talkErrorWords(new Error('INVALID'))).toMatch(/up to 1000 letters/);
    expect(talkErrorWords(new Error('SUSPENDED'))).toMatch(/paused/);
    expect(talkErrorWords(new Error('boom'))).toBeNull();
  });
  it('plain words: no tech words, nothing that sounds like support tickets', () => {
    const words: string[] = [
      ...(Object.values(W) as unknown[]).filter((v): v is string => typeof v === 'string'),
      ...Object.values(W.filter),
      ...Object.values(W.kind),
      W.gymLine('Ravi'),
      W.doneBy('Ravi', 'Today, 9:30 am'),
      W.counter(10),
    ];
    for (const w of words) {
      expect(w, w).not.toMatch(/\b(thread|ticket|anonymous|submit|sync|RPC|server|inbox)\b/i);
      expect(w.length, w).toBeLessThanOrEqual(160);
    }
  });
});

describe('hidden until the server has 0069', () => {
  it('"no such function" is remembered: no more calls', async () => {
    callMock.mockRejectedValueOnce({ code: 'PGRST202', message: 'Could not find the function public.owner_talk_count' });
    expect(await api.getTalkCount('k')).toBe('missing');
    expect(await api.getTalkList('k')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(api.memberMessagesMissing()).toBe(true);
  });
  it('any other failure is thrown and not remembered', async () => {
    callMock.mockRejectedValueOnce(new Error('timed out'));
    await expect(api.getTalkCount('k')).rejects.toThrow('timed out');
    expect(api.memberMessagesMissing()).toBe(false);
    callMock.mockResolvedValueOnce({ ok: true, waiting: 2 });
    expect(await api.getTalkCount('k')).toBe(2);
  });
  it('reply and done send the right arguments', async () => {
    callMock.mockResolvedValueOnce({ ok: true, thread: row({ waiting: false }) });
    await api.replyTalk('k', 't1', 'Yes');
    expect(callMock).toHaveBeenLastCalledWith('owner_talk_reply', { p_key: 'k', p_thread: 't1', p_text: 'Yes' });
    callMock.mockResolvedValueOnce({ ok: true, thread: row({ done: true }) });
    expect((await api.setTalkDone('k', 't1', true)).done).toBe(true);
    expect(callMock).toHaveBeenLastCalledWith('owner_talk_done', { p_key: 'k', p_thread: 't1', p_done: true });
  });
});

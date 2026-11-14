/**
 * "Message your gym" (owner request 12 Nov 2026; 0069): the pure half (src/shop/gymTalk.ts). Readers of the
 * server's answers, the status line, the Gym tab row, the refusals in member words, the QA builds' pretend gym,
 * and the member-words rules.
 */
import { describe, expect, it } from 'vitest';

import {
  PRETEND_REPLY,
  PRETEND_REPLY_AFTER_MS,
  PretendRefusal,
  TALK_MAX,
  TALK_WORDS,
  canSendAnonymous,
  createPretendTalk,
  hasTalkStandIn,
  talkErrorWords,
  talkRowSub,
  talkSentFrom,
  talkStatus,
  talkThreadFrom,
  talkThreadsFrom,
  talkUnreadFrom,
  unreadThreads,
  type TalkThread,
} from '@/shop/gymTalk';
import { talkUnreadFor } from '@/shop/gymTalkStore';

const line = (id: string, fromGym: boolean, at: number, text = 'Hi', who: string | null = null) => ({ id, fromGym, who, text, at });

const serverThread = {
  id: 't1',
  kind: 'question',
  anonymous: false,
  createdAt: 1000,
  lastAt: 3000,
  done: false,
  seenByGym: true,
  unread: true,
  messages: [line('m2', true, 3000, 'Yes, 6 am to 12 noon.', 'Ravi'), line('m1', false, 1000, 'Is the gym open on Diwali?')],
};

describe('reading the server', () => {
  it('a thread: lines oldest first, the gym name only on gym lines', () => {
    const t = talkThreadFrom(serverThread)!;
    expect(t.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(t.messages[0].who).toBeNull();
    expect(t.messages[1].who).toBe('Ravi');
    expect(t.unread).toBe(true);
    expect(t.seenByGym).toBe(true);
  });
  it('refuses what is not a thread', () => {
    expect(talkThreadFrom({ ...serverThread, kind: 'rant' })).toBeNull();
    expect(talkThreadFrom({ ...serverThread, messages: [] })).toBeNull();
    expect(talkThreadFrom({ ...serverThread, id: '' })).toBeNull();
    expect(talkThreadFrom(null)).toBeNull();
  });
  it('anonymous only counts for feedback (a server mistake never shows "without your name" on a complaint)', () => {
    expect(talkThreadFrom({ ...serverThread, anonymous: true })!.anonymous).toBe(false);
    expect(talkThreadFrom({ ...serverThread, kind: 'feedback', anonymous: true })!.anonymous).toBe(true);
  });
  it('the list: newest first, broken rows dropped; null when it is not an answer', () => {
    const list = talkThreadsFrom([{ ok: true, threads: [{ ...serverThread, id: 'old', lastAt: 10 }, serverThread, { junk: 1 }] }])!;
    expect(list.map((t) => t.id)).toEqual(['t1', 'old']);
    expect(talkThreadsFrom({ ok: false })).toBeNull();
    expect(talkThreadsFrom({ ok: true })).toBeNull();
  });
  it('the count and a sent thread', () => {
    expect(talkUnreadFrom({ ok: true, unread: 2 })).toBe(2);
    expect(talkUnreadFrom({ ok: true, unread: -3 })).toBe(0);
    expect(talkUnreadFrom({ ok: true })).toBeNull();
    expect(talkSentFrom({ ok: true, thread: serverThread })!.id).toBe('t1');
    expect(talkSentFrom({ ok: true })).toBeNull();
  });
});

describe('what the member reads', () => {
  const t = talkThreadFrom(serverThread)!;
  it('status: done, seen, waiting, or nothing after the gym replied', () => {
    expect(talkStatus(t)).toBeNull();
    const mine = { ...t, messages: [t.messages[0]] };
    expect(talkStatus({ ...mine, seenByGym: false })).toBe(TALK_WORDS.waiting);
    expect(talkStatus({ ...mine, seenByGym: true })).toBe(TALK_WORDS.seen);
    expect(talkStatus({ ...t, done: true })).toBe(TALK_WORDS.done);
  });
  it('the Gym tab row', () => {
    expect(talkRowSub(0)).toBe(TALK_WORDS.rowSub);
    expect(talkRowSub(1)).toBe('Your gym replied. Tap to read it.');
    expect(talkRowSub(3)).toBe('Your gym replied to 3 messages. Tap to read them.');
    expect(unreadThreads([t, { ...t, unread: false }])).toBe(1);
  });
  it('the red count belongs to one member, and only while the feature is there', () => {
    expect(talkUnreadFor({ memberId: 'a', unread: 2, mode: 'live' }, 'a')).toBe(2);
    expect(talkUnreadFor({ memberId: 'a', unread: 2, mode: 'live' }, 'b')).toBe(0);
    expect(talkUnreadFor({ memberId: 'a', unread: 2, mode: null }, 'a')).toBe(0);
    expect(talkUnreadFor({ memberId: 'a', unread: 2, mode: 'live' }, null)).toBe(0);
  });
  it('refusals in plain words', () => {
    expect(talkErrorWords('INVALID')).toBe(TALK_WORDS.errEmpty);
    expect(talkErrorWords(' TOO_MANY ')).toBe(TALK_WORDS.errTooMany);
    expect(talkErrorWords('ANON_FEEDBACK_ONLY')).toBe(TALK_WORDS.errAnon);
    expect(talkErrorWords('THREAD_FULL')).toBe(TALK_WORDS.full);
    expect(talkErrorWords('NOT_FOUND')).toBe(TALK_WORDS.errGone);
    expect(talkErrorWords('SUSPENDED')).toBe(TALK_WORDS.errPaused);
    expect(talkErrorWords(undefined)).toBe(TALK_WORDS.failedOffline);
  });
  it('only feedback may go without the name', () => {
    expect(canSendAnonymous('feedback')).toBe(true);
    expect(canSendAnonymous('question')).toBe(false);
    expect(canSendAnonymous('complaint')).toBe(false);
  });
});

describe('the QA builds pretend gym', () => {
  it('only a build with the gymTalk stand-in', () => {
    expect(hasTalkStandIn({ qaStandIns: ['friendInvite', 'gymTalk'] })).toBe(true);
    expect(hasTalkStandIn({ qaStandIns: ['friendInvite'] })).toBe(false);
    expect(hasTalkStandIn(undefined)).toBe(false);
  });
  it('send, the gym answers once a moment later (unread), reading marks it read, write back reopens', () => {
    let now = 1_000_000;
    const p = createPretendTalk(() => now);
    expect(() => p.send('question', true, 'Hi')).toThrow(PretendRefusal);
    expect(() => p.send('question', false, '   ')).toThrow('INVALID');
    expect(() => p.send('question', false, 'a'.repeat(TALK_MAX + 1))).toThrow('INVALID');
    const t = p.send('feedback', true, 'Please add a second squat rack.');
    expect(t.anonymous).toBe(true);
    expect(p.unread()).toBe(0);
    now += PRETEND_REPLY_AFTER_MS;
    expect(p.unread()).toBe(1);
    const [read] = p.list();
    expect(read.unread).toBe(true);
    expect(read.messages.map((m) => m.text)).toEqual(['Please add a second squat rack.', PRETEND_REPLY.text]);
    expect(read.messages[1].who).toBe(PRETEND_REPLY.who);
    expect(p.unread()).toBe(0);
    now += 60_000;
    const back = p.reply(t.id, 'Thank you!');
    expect(back.messages).toHaveLength(3);
    expect(talkStatus(back)).toBe(TALK_WORDS.waiting);
    now += 60_000;
    // Answered once per thread only.
    expect(p.unread()).toBe(0);
    expect(() => p.reply('nope', 'Hi')).toThrow('NOT_FOUND');
  });
  it('a full conversation is refused', () => {
    let now = 0;
    const p = createPretendTalk(() => now);
    const t: TalkThread = p.send('question', false, 'First');
    for (let i = 0; i < 48; i++) {
      now += 1;
      p.reply(t.id, `Line ${i}`);
    }
    now += 10_000;
    p.unread(); // the gym's one answer makes 50 lines
    expect(() => p.reply(t.id, 'One more')).toThrow('THREAD_FULL');
  });
});

describe('member words', () => {
  const BANNED = /\b(volume|sessions?|PRs?|sync(ing|ed)?|chat|thread|ticket|anonymous|submit)\b/i;
  it('plain words, none of the banned ones, short', () => {
    const lines: string[] = [
      ...(Object.values(TALK_WORDS) as unknown[]).filter((v): v is string => typeof v === 'string'),
      ...Object.values(TALK_WORDS.kind),
      ...Object.values(TALK_WORDS.kindHint),
      ...Object.values(TALK_WORDS.placeholder),
      TALK_WORDS.rowReplied(1),
      TALK_WORDS.rowReplied(4),
      TALK_WORDS.rowSpoken(1),
      TALK_WORDS.rowSpoken(2),
      TALK_WORDS.counter(120),
      TALK_WORDS.fromGym('Ravi'),
      TALK_WORDS.fromGym(null),
    ];
    for (const l of lines) {
      expect(l, l).not.toMatch(BANNED);
      expect(l.length, l).toBeLessThanOrEqual(120);
    }
  });
  it('the complaint hint says who reads it (the server rule: the owner only)', () => {
    expect(TALK_WORDS.kindHint.complaint).toMatch(/Only the gym owner reads complaints/);
    expect(TALK_WORDS.anonHint).toMatch(/will not see who sent it/);
  });
});

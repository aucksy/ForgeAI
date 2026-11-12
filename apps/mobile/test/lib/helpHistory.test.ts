// R-319 item 10 / R-320: "Your questions" in Help and feedback (lib/helpHistory.ts).
// R-452: every team reply in order, the unread count behind the red dot, the pop-up once per reply,
// and the conversation order (question, quick automatic answer, the team's replies).
import { describe, expect, it } from 'vitest';

import {
  addQuestion,
  anyWaiting,
  conversationOf,
  dotNumber,
  HELP_HISTORY_WORDS,
  HELP_KEEP,
  isHelpKey,
  joinReplies,
  keysToAsk,
  markRepliesSeen,
  mergeServer,
  parseHistory,
  qaStandInQuestion,
  questionShows,
  rateQuestion,
  repliesToTell,
  REPLIES_KEEP,
  serverItemsFrom,
  settleQuestion,
  unreadQuestions,
  unreadReplies,
  unreadWords,
  WAIT_MS,
  type ServerHelpItem,
} from '@/lib/helpHistory';

const K1 = 'aaaaaaaa-1111-2222-3333-444444444444-x';
const K2 = 'bbbbbbbb-1111-2222-3333-444444444444-y';
const T0 = 1_800_000_000_000;
const R1 = { text: 'Yes, up to 30 days.', at: '2026-11-12T05:13:43.678Z' };
const R2 = { text: 'Correction: yearly plans can pause for 45 days.', at: '2026-11-12T05:20:00.000Z' };
const item = (key: string, replies: { text: string; at: string }[], extra: Partial<ServerHelpItem> = {}): ServerHelpItem => ({
  key,
  id: 7,
  answer: 'The team will reply.',
  covered: 'no',
  replies,
  ...extra,
});
/** A question with an AI answer that said the team will reply. */
const asked = (key = K1, pushed = false) =>
  settleQuestion(addQuestion([], key, 'Can I pause my plan?', T0, pushed), key, { id: 7, answer: 'Open Gym, then Pause my plan.', ai: true, covered: false });

describe('Your questions', () => {
  it('a question is kept at once, waiting, then gets its answer', () => {
    let list = addQuestion([], K1, 'How do I pause my plan?', T0);
    expect(list[0]).toMatchObject({ key: K1, waiting: true, answer: '', replies: [], seenAt: '', pushed: false });
    expect(questionShows(list[0], T0 + 1000)).toBe('waiting');
    list = settleQuestion(list, K1, { id: 7, answer: 'Open Gym, then Pause my plan.', ai: true, covered: true });
    expect(list[0]).toMatchObject({ id: 7, waiting: false, answer: 'Open Gym, then Pause my plan.', ai: true, covered: 'yes' });
    expect(questionShows(list[0], T0 + 1000)).toBe('answer');
  });

  it('no AI answer: the team will reply; a failed send leaves the list', () => {
    let list = addQuestion([], K1, 'Hi', T0);
    list = settleQuestion(list, K1, { id: 8, answer: 'Thanks! We read every message.', ai: false });
    expect(list[0]).toMatchObject({ answer: '', covered: 'none' });
    expect(questionShows(list[0], T0)).toBe('team-will-reply');
    expect(settleQuestion(addQuestion([], K2, 'x', T0), K2, null)).toEqual([]);
  });

  it('a question whose answer never came back is asked for, and after a while reads "the team will reply"', () => {
    const list = addQuestion([], K1, 'Hi', T0);
    expect(anyWaiting(list, T0 + 10_000)).toBe(true);
    expect(anyWaiting(list, T0 + WAIT_MS + 1)).toBe(false);
    expect(questionShows(list[0], T0 + WAIT_MS + 1)).toBe('team-will-reply');
    // The server had it: the late answer is taken.
    const merged = mergeServer(list, [item(K1, [], { id: 9, answer: 'Late answer', covered: 'yes' })]);
    expect(merged[0]).toMatchObject({ id: 9, waiting: false, answer: 'Late answer', ai: true });
  });

  it('the tap is kept; the list survives a save and drops what is broken; newest first, at most HELP_KEEP', () => {
    let list = mergeServer(asked(), [item(K1, [R1])]);
    list = rateQuestion(list, 7, 'no');
    expect(list[0].rated).toBe('no');
    const raw = JSON.stringify([...list, { key: 'short', text: 'x', at: 1 }, 'junk']);
    expect(parseHistory(raw)).toEqual(list);
    expect(parseHistory('not json')).toEqual([]);
    let many: ReturnType<typeof addQuestion> = [];
    for (let i = 0; i < HELP_KEEP + 5; i++) many = addQuestion(many, `${K1}-${i}`, `q${i}`, T0 + i);
    expect(many.length).toBe(HELP_KEEP);
    expect(many[0].text).toBe(`q${HELP_KEEP + 4}`);
    expect(keysToAsk(many).length).toBeLessThanOrEqual(50);
    // The check when the app opens asks only about the recent ones.
    expect(keysToAsk(many, T0 + HELP_KEEP + 3)).toEqual([`${K1}-${HELP_KEEP + 4}`, `${K1}-${HELP_KEEP + 3}`]);
  });

  it('server items are checked; an older server\'s one reply becomes a list of one', () => {
    expect(serverItemsFrom({ items: [{ key: K1, id: 1, answer: 'a', covered: 'yes', reply: '', replyAt: '' }, { key: 'bad', id: 2 }, null] })).toHaveLength(1);
    expect(serverItemsFrom(null)).toEqual([]);
    const [old] = serverItemsFrom({ items: [{ key: K1, id: 1, answer: '', covered: 'no', reply: ' Yes. ', replyAt: R1.at }] });
    expect(old.replies).toEqual([{ text: 'Yes.', at: R1.at }]);
    const [both] = serverItemsFrom({ items: [{ key: K1, id: 1, answer: '', covered: 'no', reply: R2.text, replyAt: R2.at, replies: [R2, R1, { text: ' ', at: 'x' }] }] });
    expect(both.replies).toEqual([R1, R2]);
    expect(isHelpKey(K1)).toBe(true);
    expect(isHelpKey('a b')).toBe(false);
  });

  it('member words: plain, and never the banned ones', () => {
    for (const w of Object.values(HELP_HISTORY_WORDS)) {
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
      expect(w.length).toBeLessThan(120);
    }
    expect(unreadWords(1)).toBe('1 new reply from the MettleUp team');
    expect(unreadWords(2)).toBe('2 new replies from the MettleUp team');
  });
});

describe('R-452: replies from the team, the red dot and the pop-up', () => {
  it('every reply is kept in time order; an older server that replaced the first one loses nothing', () => {
    let list = mergeServer(asked(), [item(K1, [R1])]);
    expect(list[0].replies).toEqual([R1]);
    // The server before migration 0014 hands back only the newest reply.
    list = mergeServer(list, [item(K1, [R2])]);
    expect(list[0].replies).toEqual([R1, R2]);
    // The same answer again changes nothing (the same object: no save, no redraw).
    const again = mergeServer(list, [item(K1, [R1, R2])]);
    expect(again[0]).toBe(list[0]);
    expect(joinReplies([R2], [R1, R2])).toEqual([R1, R2]);
    const many = Array.from({ length: REPLIES_KEEP + 4 }, (_, i) => ({ text: `r${i}`, at: `2026-11-12T06:${String(i).padStart(2, '0')}:00.000Z` }));
    expect(joinReplies([], many)).toHaveLength(REPLIES_KEEP);
  });

  it('the red dot counts unread replies on every question; shown = read', () => {
    let list = [...asked(K2), ...asked(K1)];
    expect(unreadReplies(list)).toBe(0);
    list = mergeServer(list, [item(K1, [R1, R2]), item(K2, [R1])]);
    expect(unreadReplies(list)).toBe(3);
    expect(unreadQuestions(list).map((q) => q.key)).toEqual([K2, K1]);
    // Only the conversations on screen count as read.
    list = markRepliesSeen(list, [K1]);
    expect(unreadReplies(list)).toBe(1);
    expect(unreadQuestions(list).map((q) => q.key)).toEqual([K2]);
    list = markRepliesSeen(list);
    expect(unreadReplies(list)).toBe(0);
    // A top-up after it was read is unread again, alone.
    const R3 = { text: 'One more thing: ask at the desk.', at: '2026-11-12T07:00:00.000Z' };
    list = mergeServer(list, [item(K1, [R1, R2, R3])]);
    expect(unreadReplies(list)).toBe(1);
    expect(dotNumber(1)).toBe('1');
    expect(dotNumber(12)).toBe('9+');
  });

  it('a pop-up tells about each new reply once, and never repeats the one HQ already pushed', () => {
    // Sent with a push address: HQ pops up the FIRST reply itself.
    let list = mergeServer(asked(K1, true), [item(K1, [R1])]);
    let told = repliesToTell(list);
    expect(told.count).toBe(0);
    list = told.list;
    // A correction later: HQ has no address any more, the phone tells.
    list = mergeServer(list, [item(K1, [R1, R2])]);
    told = repliesToTell(list);
    expect(told.count).toBe(1);
    // Asked again: nothing new to tell.
    expect(repliesToTell(told.list).count).toBe(0);
    // No push address: the first reply is told by the phone.
    expect(repliesToTell(mergeServer(asked(K2), [item(K2, [R1])])).count).toBe(1);
    // Already read on screen: no pop-up.
    expect(repliesToTell(markRepliesSeen(mergeServer(asked(K2), [item(K2, [R1])]))).count).toBe(0);
  });

  it('a list saved by 0.77 (one reply and a seen flag) is read: no pop-up for what was already there', () => {
    const saved = JSON.stringify([
      { key: K1, id: 78, text: 'Q1', at: T0, waiting: false, answer: 'A', ai: true, covered: 'no', rated: 'no', reply: 'Yes.', replyAt: R1.at, replySeen: false },
      { key: K2, id: 80, text: 'Q2', at: T0, waiting: false, answer: 'A', ai: true, covered: 'no', rated: 'yes', reply: 'Done.', replyAt: R2.at, replySeen: true },
    ]);
    const list = parseHistory(saved);
    expect(list[0]).toMatchObject({ replies: [{ text: 'Yes.', at: R1.at }], seenAt: '', toldAt: R1.at, pushed: false });
    expect(list[1]).toMatchObject({ replies: [{ text: 'Done.', at: R2.at }], seenAt: R2.at });
    // The unread one shows the red dot (1); nothing pops up for it.
    expect(unreadReplies(list)).toBe(1);
    expect(repliesToTell(list).count).toBe(0);
  });

  it('a conversation reads: the question, the quick automatic answer, then the team\'s replies in time order', () => {
    const q = mergeServer(asked(), [item(K1, [R2, R1])])[0];
    const lines = conversationOf(q, T0 + WAIT_MS * 10);
    expect(lines.map((l) => l.kind)).toEqual(['question', 'quick', 'team', 'team']);
    expect(lines[0]).toMatchObject({ text: 'Can I pause my plan?' });
    expect(lines[1]).toMatchObject({ text: 'Open Gym, then Pause my plan.', ai: true });
    expect(lines.slice(2).map((l) => (l.kind === 'team' ? l.text : ''))).toEqual([R1.text, R2.text]);
    expect(lines.slice(2).every((l) => l.kind === 'team' && l.isNew)).toBe(true);
    // Seen when the screen opened up to R1: only the correction is New.
    const later = conversationOf(q, T0 + WAIT_MS * 10, R1.at);
    expect(later.slice(2).map((l) => l.kind === 'team' && l.isNew)).toEqual([false, true]);
    // No AI answer and no reply yet: "the team will reply"; with a reply, that line goes.
    const plain = settleQuestion(addQuestion([], K2, 'Receipt?', T0), K2, { id: 9, answer: 'Thanks', ai: false });
    expect(conversationOf(plain[0], T0).map((l) => l.kind)).toEqual(['question', 'team-will-reply']);
    expect(conversationOf(mergeServer(plain, [item(K2, [R1], { answer: '', covered: 'none' })])[0], T0).map((l) => l.kind)).toEqual(['question', 'team']);
    // Still on its way: "waiting".
    expect(conversationOf(addQuestion([], K2, 'x', T0)[0], T0 + 1000).map((l) => l.kind)).toEqual(['question', 'waiting']);
  });

  it('the QA stand-in has a quick answer and two unread replies, with a secret the server accepts', () => {
    const q = qaStandInQuestion(T0);
    expect(isHelpKey(q.key)).toBe(true);
    expect(unreadReplies([q])).toBe(2);
    expect(conversationOf(q, T0).map((l) => l.kind)).toEqual(['question', 'quick', 'team', 'team']);
  });
});

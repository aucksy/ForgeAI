// R-319 item 10 / R-320: "Your questions" in Help and feedback (lib/helpHistory.ts).
import { describe, expect, it } from 'vitest';

import {
  addQuestion,
  anyWaiting,
  HELP_HISTORY_WORDS,
  HELP_KEEP,
  isHelpKey,
  keysToAsk,
  markRepliesSeen,
  mergeServer,
  parseHistory,
  questionShows,
  rateQuestion,
  serverItemsFrom,
  settleQuestion,
  unseenReplies,
  WAIT_MS,
} from '@/lib/helpHistory';

const K1 = 'aaaaaaaa-1111-2222-3333-444444444444-x';
const K2 = 'bbbbbbbb-1111-2222-3333-444444444444-y';
const T0 = 1_800_000_000_000;

describe('Your questions', () => {
  it('a question is kept at once, waiting, then gets its answer', () => {
    let list = addQuestion([], K1, 'How do I pause my plan?', T0);
    expect(list[0]).toMatchObject({ key: K1, waiting: true, answer: '' });
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
    const merged = mergeServer(list, [{ key: K1, id: 9, answer: 'Late answer', covered: 'yes', reply: '', replyAt: '' }]);
    expect(merged[0]).toMatchObject({ id: 9, waiting: false, answer: 'Late answer', ai: true });
  });

  it('a reply from the team is New until seen; a changed reply is New again', () => {
    let list = settleQuestion(addQuestion([], K1, 'Can I pause 3 months?', T0), K1, { id: 7, answer: 'The team will reply.', ai: true, covered: false });
    list = mergeServer(list, [{ key: K1, id: 7, answer: 'The team will reply.', covered: 'no', reply: 'Yes, 30 days.', replyAt: '2026-11-04T10:00:00Z' }]);
    expect(list[0]).toMatchObject({ reply: 'Yes, 30 days.', replySeen: false });
    expect(unseenReplies(list)).toBe(1);
    list = markRepliesSeen(list);
    expect(unseenReplies(list)).toBe(0);
    const same = mergeServer(list, [{ key: K1, id: 7, answer: '', covered: 'no', reply: 'Yes, 30 days.', replyAt: '2026-11-04T10:00:00Z' }]);
    expect(unseenReplies(same)).toBe(0);
    const changed = mergeServer(list, [{ key: K1, id: 7, answer: '', covered: 'no', reply: 'Correction: 45 days.', replyAt: '2026-11-04T11:00:00Z' }]);
    expect(unseenReplies(changed)).toBe(1);
  });

  it('the tap is kept; the list survives a save and drops what is broken; newest first, at most HELP_KEEP', () => {
    let list = settleQuestion(addQuestion([], K1, 'Q', T0), K1, { id: 7, answer: 'A', ai: true, covered: true });
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
  });

  it('server items are checked', () => {
    expect(serverItemsFrom({ items: [{ key: K1, id: 1, answer: 'a', covered: 'yes', reply: '', replyAt: '' }, { key: 'bad', id: 2 }, null] })).toHaveLength(1);
    expect(serverItemsFrom(null)).toEqual([]);
    expect(isHelpKey(K1)).toBe(true);
    expect(isHelpKey('a b')).toBe(false);
  });

  it('member words: plain, and never the banned ones', () => {
    for (const w of Object.values(HELP_HISTORY_WORDS)) {
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
      expect(w.length).toBeLessThan(120);
    }
  });
});

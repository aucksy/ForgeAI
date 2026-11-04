/**
 * R-319 items 1 and 11: members' questions on the admin panel (read defensively, waiting first, "to whom", times,
 * refusal words) and a member's live Progress (the chart's points and line, best lifts with days, the staff-only
 * line), plus everything staying hidden until the server has 0053.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const callMock = vi.fn();
vi.mock('../../src/crm/shop/api', () => ({ call: (...a: unknown[]) => callMock(...a) }));
vi.mock('../../src/lib/demoLock', () => ({ isDemoLocked: () => false }));

import {
  QUESTION_WORDS,
  answeredFrom,
  closedText,
  gymQuestionsFrom,
  questionCountFrom,
  questionErrorWords,
  splitQuestions,
  toWhomLine,
  whenText,
} from '../../src/crm/logic/askQuestions';
import { formatDayShort } from '../../src/crm/logic/dates';
import {
  bestLifts,
  exerciseLine,
  lastNewBestDay,
  linePath,
  memberProgressFrom,
  niceMax,
  recentWorkoutsFrom,
  upsellLine,
  weekPoints,
  type RecentWorkout,
} from '../../src/crm/logic/memberProgress';
import { setText, summaryFrom } from '../../src/crm/logic/trainerView';
import * as api from '../../src/crm/shop/questionsApi';

const TODAY = '2026-11-04';
const ROHIT = 'aaaaaaaa-0000-0000-0000-000000000001';

afterEach(() => {
  callMock.mockReset();
  api.resetQuestionsApiForTest();
});

describe('questions from the server', () => {
  const raw = {
    ok: true,
    role: 'trainer',
    open: 2,
    questions: [
      { id: 'q1', appId: 'a1', memberId: 'm1', name: 'Asha', question: 'Squat?', askedAt: 3000, trainerId: ROHIT, trainerName: 'Rohit Sharma', trainerLive: true, open: true },
      { id: 'q2', appId: 'a2', name: '', question: 'Bench?', askedAt: 1000, trainerId: null, trainerName: 'ignored', open: true },
      { id: 'q3', appId: 'a3', name: 'Zoya', question: 'Diet?', askedAt: 5000, answer: 'Eat well.', answeredBy: 'Rohit Sharma', answeredAt: 6000, open: true },
      { id: 'q4', appId: 'a4', name: 'Bilal', question: 'Old', askedAt: 500, withdrawn: true, open: false },
      { id: '', appId: 'x', question: 'bad', askedAt: 1 },
    ],
  };
  it('reads every row defensively; an answered question is never waiting', () => {
    const r = gymQuestionsFrom(raw)!;
    expect(r.role).toBe('trainer');
    expect(r.open).toBe(2);
    expect(r.questions.map((q) => q.id)).toEqual(['q3', 'q1', 'q2', 'q4']);
    const q2 = r.questions.find((q) => q.id === 'q2')!;
    expect(q2).toMatchObject({ name: 'A member', memberId: null, trainerId: null, trainerName: null, trainerLive: true });
    expect(r.questions.find((q) => q.id === 'q3')).toMatchObject({ open: false, answer: 'Eat well.', answeredAt: 6000 });
    expect(gymQuestionsFrom({ ok: false })).toBeNull();
    expect(gymQuestionsFrom([raw])?.questions).toHaveLength(4);
  });
  it('waiting first, longest wait on top; then the rest, newest first', () => {
    const { waiting, done } = splitQuestions(gymQuestionsFrom(raw)!.questions);
    expect(waiting.map((q) => q.id)).toEqual(['q2', 'q1']);
    expect(done.map((q) => q.id)).toEqual(['q3', 'q4']);
  });
  it('the count and a sent reply', () => {
    expect(questionCountFrom({ ok: true, open: 3 })).toBe(3);
    expect(questionCountFrom({ ok: true })).toBeNull();
    expect(answeredFrom({ ok: true, question: { id: 'q', appId: 'a', question: 'x', askedAt: 1, answer: 'y', answeredAt: 2 } })?.answer).toBe('y');
    expect(answeredFrom({ ok: true })).toBeNull();
  });
  it('to whom, from where the reader sits', () => {
    expect(toWhomLine({ trainerId: null, trainerName: null, trainerLive: true }, ROHIT)).toBe(QUESTION_WORDS.anyTrainer);
    expect(toWhomLine({ trainerId: ROHIT, trainerName: 'Rohit Sharma', trainerLive: true }, ROHIT)).toBe('To you');
    expect(toWhomLine({ trainerId: ROHIT, trainerName: 'Rohit Sharma', trainerLive: true }, null)).toBe('To Rohit Sharma');
    expect(toWhomLine({ trainerId: ROHIT, trainerName: 'Rohit Sharma', trainerLive: false }, null)).toBe('To Rohit Sharma (no longer a trainer)');
  });
  it('times in India time', () => {
    expect(whenText(Date.UTC(2026, 10, 4, 12, 12), TODAY)).toBe('Today, 5:42 pm');
    expect(whenText(Date.UTC(2026, 10, 3, 18, 35), TODAY)).toBe('Today, 12:05 am');
    expect(whenText(Date.UTC(2026, 10, 3, 6, 30), TODAY)).toBe('Yesterday, 12:00 pm');
    expect(whenText(Date.UTC(2026, 9, 28, 3, 35), TODAY)).toBe(`${formatDayShort('2026-10-28')}, 9:05 am`);
  });
  it('closed lines and refusal words', () => {
    expect(closedText({ answer: null, withdrawn: true, open: false })).toBe(QUESTION_WORDS.takenBack);
    expect(closedText({ answer: null, withdrawn: false, open: false })).toBe(QUESTION_WORDS.noReply);
    expect(closedText({ answer: 'x', withdrawn: false, open: false })).toBeNull();
    expect(questionErrorWords(new Error('ALREADY_ANSWERED'))).toMatch(/already replied/);
    expect(questionErrorWords({ message: 'WITHDRAWN' })).toMatch(/took this question back/);
    expect(questionErrorWords(new Error('P0001: NOT_FOUND'))).toMatch(/no longer here/);
    expect(questionErrorWords(new Error('timed out'))).toBeNull();
  });
  it('staff words stay plain', () => {
    const lines = (Object.values(QUESTION_WORDS) as unknown[]).filter((v): v is string => typeof v === 'string');
    for (const l of lines) expect(l, l).not.toMatch(/\b(volume|sessions?|PRs?|sync)\b/i);
  });
});

describe('hidden until the server has 0053', () => {
  it('"no such function" is remembered: no second call, and Progress stays hidden too', async () => {
    callMock.mockRejectedValueOnce({ code: 'PGRST202', message: 'Could not find the function' });
    expect(await api.getQuestionCount('k')).toBe('missing');
    expect(await api.getQuestions('k')).toBe('missing');
    expect(await api.getMemberProgress('k', 'm1')).toBe('missing');
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(api.questionsMissing()).toBe(true);
  });
  it('the desk without the Trainer tick is refused, not "missing"; Progress is simply hidden', async () => {
    callMock.mockRejectedValue(new Error('TRAINER_ONLY'));
    expect(await api.getQuestionCount('k')).toBe('refused');
    expect(await api.getQuestions('k')).toBe('refused');
    expect(await api.getMemberProgress('k', 'm1')).toBe('missing');
    expect(api.questionsMissing()).toBe(false);
  });
  it('the calls carry the key', async () => {
    callMock.mockResolvedValueOnce({ ok: true, open: 4 });
    expect(await api.getQuestionCount('k')).toBe(4);
    expect(callMock).toHaveBeenCalledWith('owner_question_count', { p_key: 'k' });
    callMock.mockResolvedValueOnce({ ok: true, question: { id: 'q', appId: 'a', question: 'x', askedAt: 1, answer: 'Do this.', answeredAt: 2 } });
    expect((await api.answerQuestion('k', 'q', 'Do this.')).answer).toBe('Do this.');
    expect(callMock).toHaveBeenLastCalledWith('owner_answer_question', { p_key: 'k', p_id: 'q', p_answer: 'Do this.' });
    callMock.mockRejectedValueOnce(new Error('timed out'));
    await expect(api.getQuestions('k')).rejects.toThrow('timed out');
  });
});

describe('a member’s Progress', () => {
  it('reads the answer: not allowed, not shared, shared', () => {
    expect(memberProgressFrom({ ok: true, allowed: false })).toMatchObject({ allowed: false, shared: false, recent: [] });
    expect(memberProgressFrom({ ok: true, allowed: true, shared: false })).toMatchObject({ allowed: true, shared: false, hasRecent: false });
    const p = memberProgressFrom({
      ok: true,
      allowed: true,
      shared: true,
      hasRecent: true,
      updatedAt: 99,
      summary: { weeks: [{ w: '2026-11-02', n: 2, kg: 5000 }], best: [], records: [], last: '2026-11-03' },
      recent: [{ d: '2026-10-01', n: 'Legs', x: [{ n: 'Squat', w: 90, r: 5, s: 3 }] }, { d: 'bad' }, { d: '2026-11-03', n: '', x: [{ n: '', w: 1, r: 1 }] }],
    })!;
    expect(p.recent.map((w) => [w.d, w.n, w.x.length])).toEqual([
      ['2026-11-03', 'Workout', 0],
      ['2026-10-01', 'Legs', 1],
    ]);
    expect(p.updatedAt).toBe(99);
    expect(memberProgressFrom({ ok: false })).toBeNull();
  });
  it('12 weeks for the line, oldest first, this week last, gaps as 0', () => {
    const pts = weekPoints(summaryFrom({ weeks: [{ w: '2026-11-02', n: 2, kg: 5000.4 }, { w: '2026-10-19', n: 1, kg: 800 }] }), TODAY);
    expect(pts).toHaveLength(12);
    expect(pts[11]).toEqual({ w: '2026-11-02', kg: 5000, n: 2 });
    expect(pts[9]).toEqual({ w: '2026-10-19', kg: 800, n: 1 });
    expect(pts[10]!.kg).toBe(0);
    expect(pts[0]!.w).toBe('2026-08-17');
  });
  it('the line and a tidy top', () => {
    expect(niceMax(0)).toBe(100);
    expect(niceMax(1234)).toBe(2000);
    expect(niceMax(5000)).toBe(5000);
    expect(niceMax(5001)).toBe(10000);
    expect(linePath([0, 50, 100], 100, 50).d).toBe('M0 50 L50 25 L100 0');
    expect(linePath([], 100, 50).d).toBe('');
  });

  const W = (d: string, x: [string, number, number][]): RecentWorkout => ({ d: d as RecentWorkout['d'], n: 'Workout', x: x.map(([n, w, r]) => ({ n, w, r, s: 1 })) });
  it('best lifts with the first day they were done; an older app has no days', () => {
    const recent = [W('2026-11-03', [['Squat', 100, 5]]), W('2026-10-20', [['Squat', 100, 5], ['Bench', 60, 8]]), W('2026-10-01', [['Squat', 90, 5]])];
    expect(bestLifts({ summary: summaryFrom({}), recent })).toEqual([
      { n: 'Squat', w: 100, r: 5, t: 3, d: '2026-10-20' },
      { n: 'Bench', w: 60, r: 8, t: 1, d: '2026-10-20' },
    ]);
    expect(lastNewBestDay(recent)).toBe('2026-10-20');
    expect(bestLifts({ summary: summaryFrom({ best: [{ n: 'Squat', w: 80, r: 5, t: 4 }] }), recent: [] })).toEqual([{ n: 'Squat', w: 80, r: 5, t: 4, d: null }]);
  });
  it('the staff-only line: still training, no new best for 6 weeks', () => {
    const flat = [
      W('2026-11-01', [['Squat', 100, 5]]),
      W('2026-10-20', [['Squat', 100, 5]]),
      W('2026-10-10', [['Squat', 100, 5]]),
      W('2026-10-01', [['Squat', 100, 5]]),
      W('2026-09-01', [['Squat', 100, 5]]),
    ];
    const base = { summary: summaryFrom({}), recent: flat, hasRecent: true };
    expect(upsellLine(base, TODAY)).toBe('No new best in 6 weeks. A good time to offer personal training.');
    // A new best in the summary, or in the list, inside the 6 weeks: no line.
    expect(upsellLine({ ...base, summary: summaryFrom({ records: [{ n: 'Squat', w: 105, r: 5, d: '2026-10-30' }] }) }, TODAY)).toBeNull();
    expect(upsellLine({ ...base, recent: [W('2026-11-01', [['Squat', 105, 5]]), ...flat.slice(1)] }, TODAY)).toBeNull();
    // Not enough to tell, or not training much (a different talk): no line.
    expect(upsellLine({ ...base, hasRecent: false }, TODAY)).toBeNull();
    expect(upsellLine({ ...base, recent: flat.slice(0, 4) }, TODAY)).toBeNull();
    expect(upsellLine({ ...base, recent: [flat[0]!, flat[1]!, flat[4]!] }, TODAY)).toBeNull();
  });
  it('one exercise of a recent workout', () => {
    const x = { n: 'Leg press', w: 120, r: 9, s: 3 };
    expect(exerciseLine(x)).toBe(`${setText(x)} · 3 sets`);
    expect(exerciseLine({ ...x, s: 1 })).toBe(setText(x));
    expect(recentWorkoutsFrom('nope')).toEqual([]);
  });
});

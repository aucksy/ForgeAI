/**
 * R-319 (0053): "Ask a trainer" (the gym's answers read defensively, the first pick, the Gym tab's row line, the
 * member's words) and the recent workouts the phone sends for the gym's Progress (only what is listed, never
 * notes, warm-ups or body weight; capped).
 */
import { describe, expect, it } from 'vitest';

import {
  ASK_MAX,
  ASK_WORDS,
  askChoicesFrom,
  askErrorWords,
  askQuestionsFrom,
  askRowSub,
  askSentFrom,
  askWhen,
  closedLine,
  defaultPick,
  openQuestion,
} from '@/shop/askTrainer';
import { RECENT_CHARS, recentFrom, trainerRecentFrom, type RecentSetRow } from '@/shop/trainerRecent';
import { TRAINER_WORDS } from '@/shop/trainerShare';

const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';

describe('the choices', () => {
  it('reads trainers, the owner flag and the member’s own trainer', () => {
    const c = askChoicesFrom([{ ok: true, mine: T1, open: false, trainers: [{ id: T1, name: ' Rohit S. ' }, { id: T2, name: 'Owner S.', owner: true }, { id: '', name: 'x' }] }]);
    expect(c).toEqual({ mine: T1, open: false, trainers: [{ id: T1, name: 'Rohit S.', owner: false }, { id: T2, name: 'Owner S.', owner: true }] });
    expect(defaultPick(c)).toBe(T1);
  });
  it('a "mine" that is not in the list is dropped; nothing picked means any trainer', () => {
    const c = askChoicesFrom({ ok: true, mine: 'gone', trainers: [], open: true });
    expect(c).toEqual({ mine: null, trainers: [], open: true });
    expect(defaultPick(c)).toBeNull();
    expect(defaultPick(null)).toBeNull();
  });
  it('anything else is not an answer', () => {
    expect(askChoicesFrom({ trainers: [] })).toBeNull();
    expect(askChoicesFrom('nope')).toBeNull();
  });
});

describe('the questions', () => {
  const raw = {
    ok: true,
    questions: [
      { id: 'a', question: 'Old one', trainer: null, askedAt: 1000, answer: null, withdrawn: true, open: false },
      { id: 'b', question: 'Squat?', trainer: 'Rohit S.', askedAt: 3000, answer: 'Chest up.', answeredBy: 'Rohit', answeredAt: 4000, open: false },
      { id: 'c', question: 'Deadlift?', trainer: 'Rohit S.', askedAt: 5000, answer: null, open: true },
      { id: '', question: 'bad' },
    ],
  };
  it('newest first, bad rows dropped, an answered question is never open', () => {
    const list = askQuestionsFrom(raw)!;
    expect(list.map((q) => q.id)).toEqual(['c', 'b', 'a']);
    expect(openQuestion(list)?.id).toBe('c');
    expect(list[1]).toMatchObject({ answer: 'Chest up.', answeredBy: 'Rohit', answeredAt: 4000, open: false });
    expect(askQuestionsFrom({ ok: true, questions: [{ id: 'x', question: 'q', askedAt: 1, answer: 'a', open: true }] })![0].open).toBe(false);
    expect(askQuestionsFrom({ ok: false })).toBeNull();
  });
  it('the sent question', () => {
    expect(askSentFrom({ ok: true, question: { id: 'n', question: 'Hi', askedAt: 9, open: true } })?.open).toBe(true);
    expect(askSentFrom({ ok: true })).toBeNull();
  });
  it('the Gym tab row: a new reply first, then a waiting question, else the invitation', () => {
    const list = askQuestionsFrom(raw)!;
    expect(askRowSub(list, 0)).toBe(ASK_WORDS.rowReplied);
    expect(askRowSub(list, 4000)).toBe(ASK_WORDS.rowWaiting);
    expect(askRowSub(list.filter((q) => !q.open), 4000)).toBe(ASK_WORDS.rowSub);
    expect(askRowSub(null, 0)).toBe(ASK_WORDS.rowSub);
  });
  it('a closed question says why it has no reply', () => {
    const list = askQuestionsFrom(raw)!;
    expect(closedLine(list[2])).toBe(ASK_WORDS.takenBack);
    expect(closedLine(list[1])).toBeNull();
    expect(closedLine({ ...list[0], withdrawn: false, open: false })).toBe(ASK_WORDS.noReply);
  });
  it('the server’s refusals in plain words', () => {
    expect(askErrorWords('OPEN_QUESTION')).toBe(ASK_WORDS.errOpen);
    expect(askErrorWords(' TOO_MANY ')).toBe(ASK_WORDS.errTooMany);
    expect(askErrorWords('NOT_TRAINER')).toBe(ASK_WORDS.errTrainer);
    expect(askErrorWords('INVALID')).toBe(ASK_WORDS.errEmpty);
    expect(askErrorWords(undefined)).toBe(ASK_WORDS.failedOffline);
  });
  it('times read like a person says them', () => {
    const now = new Date(2026, 10, 4, 18, 0).getTime();
    expect(askWhen(new Date(2026, 10, 4, 17, 42).getTime(), now)).toBe('Today, 5:42 pm');
    expect(askWhen(new Date(2026, 10, 3, 0, 5).getTime(), now)).toBe('Yesterday, 12:05 am');
    expect(askWhen(new Date(2026, 9, 28, 9, 5).getTime(), now)).toBe('28 Oct, 9:05 am');
    expect(askWhen(new Date(2025, 11, 31, 12, 0).getTime(), now)).toBe('31 Dec 2025, 12:00 pm');
  });
});

describe('member words', () => {
  const BANNED = /\b(volume|sessions?|PRs?|sync(ing|ed)?|chat)\b/i;
  it('plain words, none of the banned ones, short', () => {
    const lines = [
      ...Object.values(ASK_WORDS).filter((v): v is string => typeof v === 'string'),
      ASK_WORDS.yours('Rohit S.'),
      ASK_WORDS.owner('Owner S.'),
      ASK_WORDS.counter(120),
      ASK_WORDS.replied('Rohit'),
      ASK_WORDS.replied(null),
      ASK_WORDS.askedTo(null),
      TRAINER_WORDS.shareCaptionRecent,
    ];
    for (const l of lines) {
      expect(l, l).not.toMatch(BANNED);
      expect(l.length, l).toBeLessThanOrEqual(230);
    }
    expect(ASK_MAX).toBe(500);
  });
  it('the switch caption names everything the gym sees and what it never sees', () => {
    expect(TRAINER_WORDS.shareCaptionRecent).toMatch(/30 workouts/);
    expect(TRAINER_WORDS.shareCaptionRecent).toMatch(/Never your body weight, photos or notes/);
  });
});

describe('recent workouts', () => {
  const TODAY = '2026-11-04';
  const row = (w: string, d: string, ex: string, name: string, kg: number, reps: number, at = 0): RecentSetRow => ({
    workoutId: w,
    dateISO: d,
    startedAt: at,
    exerciseId: ex,
    name,
    weightKg: kg,
    reps,
  });
  it('per workout: its name, each exercise’s best set and how many working sets; newest first', () => {
    const rows = [
      row('w1', '2026-11-03', 'lp', 'Leg press', 100, 10),
      row('w1', '2026-11-03', 'lp', 'Leg press', 120, 8),
      row('w1', '2026-11-03', 'lp', 'Leg press', 120, 9),
      row('w1', '2026-11-03', 'pu', 'Pull-up', 0, 12),
      row('w2', '2026-10-30', 'sq', 'Squat', 80, 5),
    ];
    const out = trainerRecentFrom(rows, new Map([['w1', 'Leg day'], ['w2', '']]), TODAY);
    expect(out).toEqual([
      { d: '2026-11-03', n: 'Leg day', x: [{ n: 'Leg press', w: 120, r: 9, s: 3 }, { n: 'Pull-up', w: 0, r: 12, s: 1 }] },
      { d: '2026-10-30', n: 'Workout', x: [{ n: 'Squat', w: 80, r: 5, s: 1 }] },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/note|photo|body|warm/i);
  });
  it('two workouts on one day: the later one first; empty sets and old days are left out', () => {
    const rows = [
      row('am', TODAY, 'a', 'Bench', 50, 5, 1000),
      row('pm', TODAY, 'a', 'Bench', 55, 5, 9000),
      row('empty', TODAY, 'a', 'Bench', 0, 0, 5000),
      row('old', '2026-01-01', 'a', 'Bench', 40, 5),
    ];
    expect(trainerRecentFrom(rows, new Map(), TODAY).map((w) => w.x[0].w)).toEqual([55, 50]);
    expect(recentFrom(TODAY)).toBe('2026-08-05');
  });
  it('at most 30 workouts and 20 exercises each, and never over the size cap', () => {
    const rows: RecentSetRow[] = [];
    for (let w = 0; w < 40; w++) for (let e = 0; e < 25; e++) rows.push(row(`w${w}`, '2026-10-20', `e${e}`, `Exercise with a long name number ${e} 🏋️`, 100, 10, w));
    const out = trainerRecentFrom(rows, new Map(), TODAY);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.every((w) => w.x.length <= 20)).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(RECENT_CHARS);
    // Whole characters only: no half emoji at a cut.
    for (const w of out) for (const x of w.x) expect(Array.from(x.n).length).toBeLessThanOrEqual(40);
  });
});

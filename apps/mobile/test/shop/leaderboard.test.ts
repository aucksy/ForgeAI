/**
 * R-133: the member app's side of the gym leaderboard (src/shop/leaderboard.ts): the day totals the
 * phone sends (with the plausibility limits) and the gym's answer read defensively.
 */
import { describe, expect, it } from 'vitest';

import { boardDays, boardFromRow, challengeFill, type WorkoutTotal } from '@/shop/leaderboard';

const TODAY = '2026-10-26';
const w = (dateISO: string, volumeKg: number, sets = 5): WorkoutTotal => ({ dateISO, volumeKg, sets });

describe('day totals', () => {
  it('one entry per day with workouts, oldest first, days with none left out', () => {
    const days = boardDays([w('2026-10-25', 3000), w('2026-10-20', 4500.4), w('2026-10-25', 2000)], TODAY);
    expect(days).toEqual([
      { d: '2026-10-20', w: 1, kg: 4500 },
      { d: '2026-10-25', w: 2, kg: 5000 },
    ]);
  });

  it('covers the last 31 days ending today, nothing older, nothing in the future', () => {
    const days = boardDays([w('2026-09-26', 100), w('2026-09-25', 100), w('2026-10-26', 100), w('2026-10-27', 100)], TODAY);
    expect(days.map((d) => d.d)).toEqual(['2026-09-26', '2026-10-26']);
  });

  it('a workout with no working set does not count', () => {
    expect(boardDays([w('2026-10-25', 0, 0), w('2026-10-25', 800, 3)], TODAY)).toEqual([{ d: '2026-10-25', w: 1, kg: 800 }]);
    expect(boardDays([w('2026-10-25', 0, 0)], TODAY)).toEqual([]);
  });

  it('a day with only timed or distance work is a workout of 0 kg', () => {
    expect(boardDays([w('2026-10-25', 0, 4)], TODAY)).toEqual([{ d: '2026-10-25', w: 1, kg: 0 }]);
  });

  it('a day with more than 3 workouts counts 3 (the day is kept), 3 is 3', () => {
    expect(boardDays([w('2026-10-25', 10), w('2026-10-25', 10), w('2026-10-25', 10)], TODAY)[0]?.w).toBe(3);
    expect(boardDays([w('2026-10-25', 10), w('2026-10-25', 10), w('2026-10-25', 10), w('2026-10-25', 10), w('2026-10-25', 10)], TODAY)).toEqual([{ d: '2026-10-25', w: 3, kg: 50 }]);
  });

  it('a day with more than 60,000 kg is left out whole (no workouts, no kg), exactly 60,000 is fine', () => {
    expect(boardDays([w('2026-10-25', 60000)], TODAY)).toEqual([{ d: '2026-10-25', w: 1, kg: 60000 }]);
    expect(boardDays([w('2026-10-25', 60000.6)], TODAY)).toEqual([]);
    expect(boardDays([w('2026-10-25', 40000), w('2026-10-25', 30000)], TODAY)).toEqual([]);
    expect(boardDays([w('2026-10-24', 500), w('2026-10-25', 70000)], TODAY)).toEqual([{ d: '2026-10-24', w: 1, kg: 500 }]);
  });

  it('kg is never negative or not-a-number', () => {
    expect(boardDays([w('2026-10-25', -50)], TODAY)).toEqual([{ d: '2026-10-25', w: 1, kg: 0 }]);
    expect(boardDays([w('2026-10-25', Number.NaN), w('2026-10-25', 100)], TODAY)).toEqual([{ d: '2026-10-25', w: 2, kg: 100 }]);
    expect(boardDays([w('2026-10-25', Number.POSITIVE_INFINITY)], TODAY)).toEqual([{ d: '2026-10-25', w: 1, kg: 0 }]);
  });

  it('a date that is not a day is dropped', () => {
    expect(boardDays([w('yesterday', 100), w('2026-10-2', 100)], TODAY)).toEqual([]);
  });

  it('nothing in, nothing out', () => {
    expect(boardDays([], TODAY)).toEqual([]);
  });
});

const list = (top: unknown[], me: unknown = null) => ({ top, me });
const good = {
  ok: true,
  gymName: ' RAM Fitness ',
  members: 12,
  workouts: list([{ rank: 1, name: 'Rahul S.', value: 14, me: false }, { rank: 2, name: 'A member', value: 12, me: true }], { rank: 2, value: 12 }),
  kg: list([{ rank: 1, name: 'A member', value: 41200.5, me: false }], { rank: 7, value: 9000 }),
  challenge: { id: 'c1', title: 'November challenge', measure: 'workouts', goal: 16, startsOn: '2026-11-01', endsOn: '2026-11-30', prizeDays: 7, myValue: 12, hit: false, hitters: 3 },
};

describe("the gym's answer", () => {
  it('a full answer', () => {
    const b = boardFromRow(good);
    expect(b?.gymName).toBe('RAM Fitness');
    expect(b?.members).toBe(12);
    expect(b?.workouts.top.map((r) => [r.rank, r.name, r.value, r.me])).toEqual([[1, 'Rahul S.', 14, false], [2, 'A member', 12, true]]);
    expect(b?.workouts.me).toEqual({ rank: 2, value: 12 });
    expect(b?.kg.me).toEqual({ rank: 7, value: 9000 });
    expect(b?.challenge).toMatchObject({ title: 'November challenge', measure: 'workouts', goal: 16, myValue: 12, hit: false, prizeDays: 7, endsOn: '2026-11-30' });
  });

  it('the one-row array PostgREST can give is read too', () => {
    expect(boardFromRow([good])?.gymName).toBe('RAM Fitness');
  });

  it('not an answer: null, so the card stays hidden', () => {
    expect(boardFromRow(null)).toBeNull();
    expect(boardFromRow(undefined)).toBeNull();
    expect(boardFromRow('x')).toBeNull();
    expect(boardFromRow([])).toBeNull();
    expect(boardFromRow({ ok: false })).toBeNull();
    expect(boardFromRow({ error: 'BAD_KEY' })).toBeNull();
  });

  it('missing parts become empty, never a crash', () => {
    const b = boardFromRow({ ok: true });
    expect(b).toEqual({ gymName: 'Your gym', members: 0, workouts: { top: [], me: null }, kg: { top: [], me: null }, challenge: null });
    expect(boardFromRow({ ok: true, workouts: 5, kg: 'x', challenge: [] })?.workouts).toEqual({ top: [], me: null });
  });

  it('bad rows are skipped, good ones kept', () => {
    const b = boardFromRow({
      ok: true,
      workouts: list([
        null,
        'x',
        { rank: 0, name: 'Zero', value: 3 },
        { rank: 1.5, name: 'Half', value: 3 },
        { rank: 'a', name: 'Letter', value: 3 },
        { rank: 2, name: 'Neg', value: -1 },
        { rank: 3, name: 'NoValue' },
        { rank: 4, name: '   ', value: 5 },
        { rank: '5', name: 'Text numbers', value: '8' },
      ]),
    });
    expect(b?.workouts.top.map((r) => [r.rank, r.name, r.value])).toEqual([[4, 'A member', 5], [5, 'Text numbers', 8]]);
  });

  it('never more than 10 rows', () => {
    const top = Array.from({ length: 14 }, (_, i) => ({ rank: i + 1, name: `M${i}`, value: 20 - i, me: false }));
    expect(boardFromRow({ ok: true, workouts: list(top) })?.workouts.top).toHaveLength(10);
  });

  it('a bad "me" is nothing, not a crash', () => {
    expect(boardFromRow({ ok: true, workouts: list([], { rank: 'x', value: 1 }) })?.workouts.me).toBeNull();
    expect(boardFromRow({ ok: true, workouts: list([], 7) })?.workouts.me).toBeNull();
    expect(boardFromRow({ ok: true, workouts: list([], { rank: 0, value: 1 }) })?.workouts.me).toBeNull();
  });

  it('a challenge with a missing or wrong field is no challenge', () => {
    const c = good.challenge;
    for (const bad of [
      { ...c, title: '' },
      { ...c, measure: 'steps' },
      { ...c, goal: 0 },
      { ...c, goal: 'x' },
      { ...c, startsOn: 'soon' },
      { ...c, endsOn: undefined },
      'x',
    ]) {
      expect(boardFromRow({ ok: true, challenge: bad })?.challenge).toBeNull();
    }
    expect(boardFromRow({ ok: true, challenge: c })?.challenge).not.toBeNull();
  });

  it('a challenge: a missing prize is 0 days, "hit" follows the numbers, the date may carry a time', () => {
    const b = boardFromRow({ ok: true, challenge: { ...good.challenge, prizeDays: undefined, myValue: 16, hit: undefined, endsOn: '2026-11-30T00:00:00Z' } });
    expect(b?.challenge).toMatchObject({ prizeDays: 0, hit: true, endsOn: '2026-11-30' });
  });

  it('the bar fills from 0 to 1 and no further', () => {
    expect(challengeFill({ goal: 16, myValue: 4 })).toBe(0.25);
    expect(challengeFill({ goal: 16, myValue: 40 })).toBe(1);
    expect(challengeFill({ goal: 16, myValue: 0 })).toBe(0);
    expect(challengeFill({ goal: 0, myValue: 3 })).toBe(0);
  });
});

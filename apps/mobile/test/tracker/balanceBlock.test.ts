/**
 * F52 (owner idea R-201): balance check and focus block — the pure rules.
 */
import { describe, expect, it } from 'vitest';

import type { Muscle } from '@/tracker/catalog/muscles';
import {
  bestFor,
  blockDue,
  blockWeek,
  dueQuestion,
  enoughHistory,
  heavyLine,
  parseBalanceState,
  pickSwapOut,
  progressLine,
  quietMuscles,
  restoreOrder,
  runningTitle,
  typicalSets,
  weakLine,
  weakSpot,
  weeklyFromShares,
  withSnooze,
  type RoutineIn,
} from '@/tracker/engine/balanceBlock';

const week = (o: Partial<Record<Muscle, number>>) => new Map(Object.entries(o) as [Muscle, number][]);

/** A typical PPL lifter: everything around 10, rear shoulders 2, biceps 16. */
const ppl = week({
  chest: 12,
  side_delts: 8,
  rear_delts: 2,
  lats: 10,
  upper_back: 10,
  biceps: 16,
  triceps: 10,
  abs: 6,
  glutes: 10,
  quads: 12,
  hamstrings: 9,
  calves: 6,
});

describe('enoughHistory', () => {
  it('needs 4 weeks since the first workout and 6 workouts', () => {
    expect(enoughHistory(null, '2026-11-02', 10)).toBe(false);
    expect(enoughHistory('2026-10-10', '2026-11-02', 10)).toBe(false);
    expect(enoughHistory('2026-10-05', '2026-11-02', 5)).toBe(false);
    expect(enoughHistory('2026-10-05', '2026-11-02', 6)).toBe(true);
  });
});

describe('weeklyFromShares', () => {
  it('averages counted sets over the weeks', () => {
    const s = (m: Muscle, n: number) => ({ shares: new Map([[m, n]]) as ReadonlyMap<Muscle, number> });
    const w = weeklyFromShares([s('chest', 1), s('chest', 1), s('triceps', 0.5), s('chest', 1), s('chest', 1)], 4);
    expect(w.get('chest')).toBe(1);
    expect(w.get('triceps')).toBe(0.125);
  });
});

describe('weakSpot', () => {
  it('finds the one muscle far under the typical one', () => {
    expect(typicalSets(ppl)).toBe(10);
    expect(weakSpot(ppl)).toEqual({ muscle: 'rear_delts', sets: 2, typical: 10 });
    expect(weakLine(weakSpot(ppl)!)).toBe('Rear shoulders: 2 sets a week (most muscles get 10)');
  });

  it('says nothing to a member who trains everything lightly', () => {
    const light = week({ chest: 3, side_delts: 2, rear_delts: 1, lats: 3, upper_back: 3, biceps: 3, triceps: 3, abs: 2, glutes: 3, quads: 3, hamstrings: 2, calves: 1 });
    expect(weakSpot(light)).toBeNull();
  });

  it('says nothing when the week is balanced', () => {
    expect(weakSpot(week({ ...Object.fromEntries(ppl), rear_delts: 6 }))).toBeNull();
  });

  it('skips quiet muscles and picks the next', () => {
    const two = week({ ...Object.fromEntries(ppl), calves: 0 });
    expect(weakSpot(two)?.muscle).toBe('calves');
    expect(weakSpot(two, new Set<Muscle>(['calves']))?.muscle).toBe('rear_delts');
    expect(weakLine({ muscle: 'calves', sets: 1, typical: 9 })).toBe('Calves: 1 set a week (most muscles get 9)');
  });
});

const row = (peId: string, name: string, primary: Muscle[], secondary: Muscle[] = [], compound = false) => ({
  peId,
  exerciseId: `x-${peId}`,
  name,
  primary,
  secondary,
  compound,
  catalogKey: null,
});

describe('pickSwapOut', () => {
  const pull: RoutineIn = {
    id: 'pull',
    name: 'Pull day',
    dayType: 'pull',
    following: true,
    rows: [row('p1', 'Lat Pulldown', ['lats'], ['biceps', 'rear_delts'], true), row('p2', 'Barbell Curl', ['biceps']), row('p3', 'Seated Row', ['upper_back'], ['biceps'], true)],
  };
  const push: RoutineIn = {
    id: 'push',
    name: 'Push day',
    dayType: 'push',
    following: true,
    rows: [row('q1', 'Bench Press', ['chest'], ['triceps', 'front_delts'], true), row('q2', 'Cable Fly', ['chest'])],
  };

  it('takes out a single-joint exercise for a busy muscle on the weak muscle home day', () => {
    const out = pickSwapOut([push, pull], ppl, 10, 'rear_delts');
    expect(out).toMatchObject({ routineId: 'pull', peId: 'p2', name: 'Barbell Curl', index: 1, heavy: 'biceps', heavySets: 16 });
    expect(heavyLine(out!)).toBe('Your biceps already get 16 sets a week.');
  });

  it('never takes out an exercise that trains the weak muscle, nor one for a muscle at or under typical', () => {
    const onlyLats: RoutineIn = { ...pull, rows: [pull.rows[0], row('p9', 'Hammer Curl', ['biceps'], ['rear_delts'])] };
    expect(pickSwapOut([onlyLats], ppl, 10, 'rear_delts')).toBeNull();
    const tight = week({ ...Object.fromEntries(ppl), biceps: 10, chest: 10 });
    expect(pickSwapOut([push, pull], tight, 10, 'rear_delts')).toBeNull();
  });

  it('prefers the followed folder and leaves one-exercise routines alone', () => {
    const other: RoutineIn = { ...pull, id: 'old', following: false };
    expect(pickSwapOut([other, pull], ppl, 10, 'rear_delts')?.routineId).toBe('pull');
    const tiny: RoutineIn = { ...pull, rows: [row('t1', 'Curl', ['biceps'])] };
    expect(pickSwapOut([tiny], ppl, 10, 'rear_delts')).toBeNull();
  });

  it('chest gets the singular verb', () => {
    expect(heavyLine({ heavy: 'chest', heavySets: 1 })).toBe('Your chest already gets 1 set a week.');
  });
});

describe('bestFor', () => {
  const gym = { equipment: 'gym' as const, sore: [], avoid: [] };

  it('gives three exercises that train the muscle first, best first', () => {
    const best = bestFor('rear_delts', 'intermediate', gym);
    expect(best).toHaveLength(3);
    for (const b of best) expect(typeof b.name).toBe('string');
    expect(new Set(best.map((b) => b.key)).size).toBe(3);
  });

  it('leaves out what the routine has and what the member never wants', () => {
    const first = bestFor('side_delts', 'beginner', gym)[0].key;
    expect(bestFor('side_delts', 'beginner', gym, [first]).map((b) => b.key)).not.toContain(first);
    expect(bestFor('side_delts', 'beginner', { ...gym, avoid: [first] }).map((b) => b.key)).not.toContain(first);
  });

  it('fits a member with no equipment', () => {
    const best = bestFor('chest', 'beginner', { equipment: 'none', sore: [], avoid: [] });
    expect(best.length).toBeGreaterThan(0);
    for (const b of best) expect(b.equipment).toBe('bodyweight');
  });
});

describe('block state', () => {
  const block = {
    muscle: 'rear_delts',
    routineId: 'pull',
    routineName: 'Pull day',
    peId: 'p2',
    oldExerciseId: 'x-p2',
    oldName: 'Barbell Curl',
    oldIndex: 1,
    oldSets: 3,
    oldRepMin: 8,
    oldRepMax: 12,
    oldList: ['a', 'x-p2', 'c'],
    newExerciseId: 'face',
    newName: 'Face Pull',
    startISO: '2026-11-02',
    endISO: '2026-12-28',
    before: 2,
  } as const;

  it('round-trips and survives broken values', () => {
    const s = withSnooze({ block: { ...block, oldList: [...block.oldList] }, snoozed: {} }, 'calves', '2026-12-01');
    expect(parseBalanceState(JSON.stringify(s))).toEqual(s);
    expect(parseBalanceState('{oops')).toEqual({ block: null, snoozed: {} });
    expect(parseBalanceState(null)).toEqual({ block: null, snoozed: {} });
    expect(parseBalanceState(JSON.stringify({ block: { muscle: 'wings' }, snoozed: { nope: 'x', calves: '2026-12-01' } }))).toEqual({
      block: null,
      snoozed: { calves: '2026-12-01' },
    });
  });

  it('snoozes until the day', () => {
    const s = withSnooze({ block: null, snoozed: {} }, 'calves', '2026-12-01');
    expect(quietMuscles(s, '2026-11-30').has('calves')).toBe(true);
    expect(quietMuscles(s, '2026-12-01').has('calves')).toBe(false);
  });

  it('counts weeks 1 to 8 and is due after 8 weeks', () => {
    expect(blockWeek(block, '2026-11-02')).toBe(1);
    expect(blockWeek(block, '2026-11-16')).toBe(3);
    expect(blockWeek(block, '2027-02-01')).toBe(8);
    expect(runningTitle(block, '2026-11-16')).toBe('Rear shoulders: week 3 of 8');
    expect(blockDue(block, '2026-12-27')).toBe(false);
    expect(blockDue(block, '2026-12-28')).toBe(true);
    expect(dueQuestion(block)).toBe('Keep Face Pull in Pull day, or go back to Barbell Curl?');
  });

  it('progress line waits for a whole week', () => {
    expect(progressLine('rear_delts', null, 2)).toBeNull();
    expect(progressLine('rear_delts', 6.4, 2)).toBe('Your rear shoulders now get 6 sets a week (it was 2).');
    expect(progressLine('chest', 1, 0)).toBe('Your chest now gets 1 set a week (it was 0).');
  });

  it('puts a re-added row back at its old place', () => {
    expect(restoreOrder(['a', 'c', 'new'], 'new', 1)).toEqual(['a', 'new', 'c']);
    expect(restoreOrder(['a', 'new'], 'new', 5)).toEqual(['a', 'new']);
    expect(restoreOrder(['new', 'a'], 'new', 0)).toEqual(['new', 'a']);
  });
});

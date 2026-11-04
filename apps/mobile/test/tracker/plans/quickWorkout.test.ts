/**
 * F60 Quick workout: the picker fits the time, respects the equipment and the "never" list, and
 * prefers exercises done before (with last time's set).
 */
import { describe, expect, it } from 'vitest';

import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { fitsEquipment } from '@/tracker/plans/fit';
import { buildQuickWorkout, estimateMinutes, QUICK_MINUTES, type QuickHistory, type QuickInput } from '@/tracker/plans/quickWorkout';
import { quickHistoryOf } from '@/tracker/services/quickWorkoutService';
import { BANNED_MEMBER_WORDS } from '@/lib/words';

const base: QuickInput = {
  minutes: 30,
  parts: ['chest', 'back'],
  level: 'intermediate',
  goal: 'muscle',
  equipment: 'gym',
  sore: [],
  avoid: [],
  history: new Map(),
};

describe('fits the time', () => {
  for (const minutes of QUICK_MINUTES) {
    for (const parts of [['chest', 'back'], ['legs'], ['arms', 'shoulders', 'core'], ['legs', 'chest', 'back']] as const) {
      for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
        it(`${minutes} min, ${parts.join('+')}, ${level}`, () => {
          const q = buildQuickWorkout({ ...base, minutes, parts, level });
          expect(q.exercises.length).toBeGreaterThan(0);
          expect(estimateMinutes(q.exercises)).toBeLessThanOrEqual(minutes);
          expect(q.minutes).toBeLessThanOrEqual(minutes);
          // It uses the time it was given (not a 10-minute workout for an hour).
          expect(estimateMinutes(q.exercises)).toBeGreaterThanOrEqual(minutes * 0.7);
          for (const x of q.exercises) expect(x.sets).toBeGreaterThanOrEqual(2);
          expect(new Set(q.exercises.map((x) => x.key)).size).toBe(q.exercises.length);
        });
      }
    }
  }

  it('more time, more exercises: 3 / 4 / 5 / 6', () => {
    const counts = QUICK_MINUTES.map((m) => buildQuickWorkout({ ...base, minutes: m, parts: ['chest', 'back', 'legs'] }).exercises.length);
    expect(counts).toEqual([3, 4, 5, 6]);
  });

  it('big lifts come first, and the name says what it trains', () => {
    const q = buildQuickWorkout({ ...base, minutes: 45, parts: ['back', 'legs'] });
    const firstSmall = q.exercises.findIndex((x) => !x.compound);
    if (firstSmall >= 0) expect(q.exercises.slice(firstSmall).every((x) => !x.compound)).toBe(true);
    expect(q.name).toBe('Quick workout: Back and Legs');
  });
});

describe('respects the equipment and the member', () => {
  for (const equipment of ['dumbbells', 'dumbbells_bench', 'bar', 'none'] as const) {
    it(`only what ${equipment} allows`, () => {
      for (const parts of [['chest', 'back'], ['legs', 'arms'], ['shoulders', 'core']] as const) {
        const q = buildQuickWorkout({ ...base, minutes: 60, parts, equipment });
        for (const x of q.exercises) expect(fitsEquipment(catalogEntry(x.key)!, equipment)).toBe(true);
      }
    });
  }

  it('never an exercise on the "never give me" list, nor one a sore knee rules out', () => {
    const first = buildQuickWorkout({ ...base, parts: ['chest'] }).exercises[0].key;
    const q = buildQuickWorkout({ ...base, parts: ['chest'], avoid: [first] });
    expect(q.exercises.map((x) => x.key)).not.toContain(first);
    const knee = buildQuickWorkout({ ...base, minutes: 60, parts: ['legs'], sore: ['knee'] });
    for (const x of knee.exercises) expect(['leg_extension', 'walking_lunge', 'bulgarian_split_squat', 'dumbbell_reverse_lunge']).not.toContain(x.key);
  });
});

describe('uses the member\'s history', () => {
  const done: QuickHistory = { lastISO: '2026-11-01', times: 6, lastKg: 22.5, lastReps: 10 };

  it('an exercise done before wins its slot, carrying last time\'s set', () => {
    // The builder's first chest press for an intermediate is the barbell bench; he does dumbbells.
    const fresh = buildQuickWorkout({ ...base, parts: ['chest'] });
    expect(fresh.exercises[0].key).toBe('barbell_bench_press');
    expect(fresh.exercises[0].last).toBeNull();
    const q = buildQuickWorkout({ ...base, parts: ['chest'], history: new Map([['dumbbell_bench_press', done]]) });
    const x = q.exercises.find((e) => e.slot === 'h_push')!;
    expect(x.key).toBe('dumbbell_bench_press');
    expect(x.last).toEqual(done);
  });

  it('of two done before, the more recent', () => {
    const q = buildQuickWorkout({
      ...base,
      parts: ['chest'],
      history: new Map([
        ['dumbbell_bench_press', { ...done, lastISO: '2026-10-01', times: 20 }],
        ['machine_chest_press', { ...done, lastISO: '2026-11-02', times: 2 }],
      ]),
    });
    expect(q.exercises.find((e) => e.slot === 'h_push')!.key).toBe('machine_chest_press');
  });

  it('last time = the newest workout\'s heaviest set (then most reps)', () => {
    const h = quickHistoryOf([
      { k: 'deadlift', workout_id: 'b', d: '2026-11-03', w: 100, r: 5 },
      { k: 'deadlift', workout_id: 'b', d: '2026-11-03', w: 110, r: 3 },
      { k: 'deadlift', workout_id: 'b', d: '2026-11-03', w: 110, r: 4 },
      { k: 'deadlift', workout_id: 'a', d: '2026-10-28', w: 140, r: 1 },
      { k: 'push_up', workout_id: 'b', d: '2026-11-03', w: 0, r: 20 },
    ]);
    expect(h.get('deadlift')).toEqual({ lastISO: '2026-11-03', times: 2, lastKg: 110, lastReps: 4 });
    expect(h.get('push_up')).toEqual({ lastISO: '2026-11-03', times: 1, lastKg: 0, lastReps: 20 });
  });

  it('the words on the plan never use a banned word', () => {
    const q = buildQuickWorkout({ ...base, minutes: 60, parts: ['legs', 'core'] });
    for (const b of BANNED_MEMBER_WORDS) expect(q.name).not.toMatch(b.re);
  });
});

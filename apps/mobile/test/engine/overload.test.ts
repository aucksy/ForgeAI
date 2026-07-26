import { describe, expect, it } from 'vitest';

import { computeOverloadTarget, epleyE1rm, roundToIncrement } from '@/engine/overload';
import type { Exercise } from '@/types/models';

/** Minimal Exercise fixture; only the fields the engine reads matter. */
function ex(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'e1',
    name: 'Bench Press',
    aliases: [],
    muscleGroup: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
    isCompound: true,
    incrementKg: 2.5,
    ...over,
  } as Exercise;
}

const target = { targetSets: 3, repRangeMin: 8, repRangeMax: 12 };
const S = (weightKg: number, reps: number) => ({ weightKg, reps });

describe('epleyE1rm', () => {
  it('applies w * (1 + reps/30)', () => {
    expect(epleyE1rm(100, 0)).toBe(100);
    expect(epleyE1rm(100, 30)).toBe(200);
    expect(epleyE1rm(60, 10)).toBeCloseTo(80, 10);
  });
});

describe('roundToIncrement', () => {
  it('snaps to the nearest increment', () => {
    expect(roundToIncrement(61, 2.5)).toBe(60);
    expect(roundToIncrement(61.3, 2.5)).toBe(62.5);
    expect(roundToIncrement(5, 5)).toBe(5);
  });
  it('passes the weight through when the increment is non-positive', () => {
    expect(roundToIncrement(63.7, 0)).toBe(63.7);
    expect(roundToIncrement(63.7, -1)).toBe(63.7);
  });
  it('avoids binary-float noise (returns clean multiples)', () => {
    expect(roundToIncrement(7.5, 2.5)).toBe(7.5);
    expect(roundToIncrement(0.1 + 0.2, 0.05)).toBe(0.3);
  });
});

describe('computeOverloadTarget', () => {
  it('starts conservatively by equipment when there is no history', () => {
    const bb = computeOverloadTarget({ exercise: ex(), target, history: [] });
    expect(bb.action).toBe('start');
    expect(bb.targetWeightKg).toBe(20); // empty bar
    expect(bb.last).toBeNull();

    const bw = computeOverloadTarget({
      exercise: ex({ equipment: 'bodyweight', incrementKg: 1 }),
      target,
      history: [],
    });
    expect(bw.targetWeightKg).toBe(0);
    expect(bw.reason).toMatch(/bodyweight/i);
  });

  it('adds load when every working set hit the top of the range at one weight', () => {
    const r = computeOverloadTarget({
      exercise: ex(),
      target,
      history: [{ dateISO: '2026-07-20', sets: [S(60, 12), S(60, 12), S(60, 12)] }],
    });
    expect(r.action).toBe('increase');
    expect(r.targetWeightKg).toBe(62.5);
  });

  it('deloads after reps slip under the range two sessions running', () => {
    const r = computeOverloadTarget({
      exercise: ex(),
      target,
      history: [
        { dateISO: '2026-07-20', sets: [S(80, 6)] }, // newest
        { dateISO: '2026-07-13', sets: [S(80, 7)] },
      ],
    });
    expect(r.action).toBe('deload');
    // 10% off 80 = 72, FLOORED to the 2.5 increment -> 70.
    expect(r.targetWeightKg).toBe(70);
    expect(r.targetWeightKg).toBeLessThan(80);
  });

  it('holds at the floor when a slip cannot be deloaded (bodyweight)', () => {
    const r = computeOverloadTarget({
      exercise: ex({ equipment: 'bodyweight', incrementKg: 1 }),
      target,
      history: [
        { dateISO: '2026-07-20', sets: [S(0, 5)] },
        { dateISO: '2026-07-13', sets: [S(0, 6)] },
      ],
    });
    expect(r.action).toBe('hold');
    expect(r.targetWeightKg).toBe(0);
  });

  it('deloads a genuine plateau (same top weight three sessions, reps not climbing)', () => {
    const r = computeOverloadTarget({
      exercise: ex(),
      target,
      history: [
        { dateISO: '2026-07-20', sets: [S(100, 8)] },
        { dateISO: '2026-07-13', sets: [S(100, 8)] },
        { dateISO: '2026-07-06', sets: [S(100, 8)] },
      ],
    });
    expect(r.action).toBe('deload');
    expect(r.targetWeightKg).toBe(90);
  });

  it('holds and chases reps on a plateau where reps are climbing', () => {
    const r = computeOverloadTarget({
      exercise: ex(),
      target,
      history: [
        { dateISO: '2026-07-20', sets: [S(100, 10)] },
        { dateISO: '2026-07-13', sets: [S(100, 9)] },
        { dateISO: '2026-07-06', sets: [S(100, 8)] },
      ],
    });
    expect(r.action).toBe('hold');
    expect(r.targetWeightKg).toBe(100);
    expect(r.targetRepsMin).toBe(11); // chase r0+1, capped at max
  });

  it('default path holds the weight and adds a rep', () => {
    const r = computeOverloadTarget({
      exercise: ex(),
      target,
      history: [{ dateISO: '2026-07-20', sets: [S(70, 9), S(70, 9)] }],
    });
    expect(r.action).toBe('hold');
    expect(r.targetWeightKg).toBe(70);
    expect(r.targetRepsMin).toBe(10);
  });
});

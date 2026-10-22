/** R-75 (owner, 22 Oct 2026): which exercises went up or down on the finish screen, and why. */
import { describe, expect, it } from 'vitest';

import { deltaReason, deltaTag, exerciseDeltas, mainCause, type CompareExercise } from '@/tracker/lib/workoutCompare';

const ex = (exerciseId: string, name: string, sets: [number, number][]): CompareExercise => ({
  exerciseId,
  name,
  volumeKg: sets.reduce((a, [w, r]) => a + w * r, 0),
  sets: sets.map(([weightKg, r]) => ({ weightKg, reps: r })),
});

describe('R-75: each exercise against the compared workout', () => {
  const last = [
    ex('pd', 'Lat Pulldown', [[50, 10], [50, 10], [50, 9]]),
    ex('row', 'Barbell Row', [[60, 8], [60, 8], [60, 8], [60, 8]]),
    ex('curl', 'Dumbbell Curl', [[10, 12], [10, 12]]),
  ];
  const today = [
    ex('pd', 'Lat Pulldown', [[55, 10], [55, 10], [55, 9]]),
    ex('row', 'Barbell Row', [[60, 8], [60, 8]]),
    ex('fp', 'Face Pull', [[15, 15], [15, 15]]),
  ];
  const d = exerciseDeltas(today, last);

  it('up, down, new and not today, each with its reason', () => {
    expect(d.map((x) => [x.name, x.kind, deltaTag(x), x.reason])).toEqual([
      ['Lat Pulldown', 'up', '+10%', '5 kg heavier'],
      ['Barbell Row', 'down', '−50%', '2 sets fewer'],
      ['Face Pull', 'new', 'new', null],
      ['Dumbbell Curl', 'skipped', 'not today', null],
    ]);
  });

  it('what explains most of the total change', () => {
    const total = today.reduce((a, e) => a + e.volumeKg, 0) - last.reduce((a, e) => a + e.volumeKg, 0);
    expect(total).toBeLessThan(0);
    expect(mainCause(d, total)).toBe('Mostly Barbell Row: 2 sets fewer.');
    expect(mainCause(d, 0)).toBeNull();
  });

  it('reasons: sets first, then weight, then reps; nothing when equal', () => {
    const kg = (n: number) => `${n} kg`;
    expect(deltaReason([{ weightKg: 60, reps: 8 }], [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }], kg)).toBe('1 set fewer');
    expect(deltaReason([{ weightKg: 57.5, reps: 8 }], [{ weightKg: 60, reps: 8 }], kg)).toBe('2.5 kg lighter');
    expect(deltaReason([{ weightKg: 60, reps: 11 }], [{ weightKg: 60, reps: 8 }], kg)).toBe('3 more reps');
    expect(deltaReason([{ weightKg: 60, reps: 8 }], [{ weightKg: 60, reps: 8 }], kg)).toBeNull();
  });

  it('a small change reads as the same; an exercise listed twice is added up', () => {
    const same = exerciseDeltas([ex('a', 'A', [[50, 10]])], [ex('a', 'A', [[50, 10]]), ex('a', 'A', [[0, 0]])]);
    expect(same[0].kind).toBe('same');
    const twice = exerciseDeltas([ex('a', 'A', [[50, 10]]), ex('a', 'A', [[40, 10]])], [ex('a', 'A', [[50, 10]])]);
    expect(twice).toHaveLength(1);
    expect(twice[0].todayKg).toBe(900);
  });

  it('member words never say volume, PR or session', () => {
    for (const x of d) expect(`${deltaTag(x)} ${x.reason ?? ''}`).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

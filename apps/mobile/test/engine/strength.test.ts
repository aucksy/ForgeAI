import { describe, expect, it } from 'vitest';

import { computeStrengthScore } from '@/engine/strength';

describe('computeStrengthScore', () => {
  it('is 0 with no bodyweight or no matching lifts', () => {
    expect(computeStrengthScore({ bodyWeightKg: 0, lifts: [] }).score).toBe(0);
    expect(
      computeStrengthScore({ bodyWeightKg: 80, lifts: [{ exerciseName: 'Curl', e1rmKg: 30 }] }).score,
    ).toBe(0);
  });

  it('scores a lift hitting its benchmark ratio around the mid band', () => {
    // Bench benchmark = 1.25x BW. 80kg BW * 1.25 = 100kg e1RM -> component 1.0 -> ~83.
    const r = computeStrengthScore({
      bodyWeightKg: 80,
      lifts: [{ exerciseName: 'Bench Press', e1rmKg: 100 }],
    });
    expect(r.score).toBe(83);
    expect(r.label).toBe('Elite territory');
    expect(r.keyLifts[0]).toMatchObject({ exerciseName: 'Bench Press', ratio: 1.25 });
  });

  it('caps a single runaway lift so it cannot dominate the composite', () => {
    // A 4x-BW bench would be ratio 4 / 1.25 = 3.2, but the component is capped at 1.2.
    const r = computeStrengthScore({
      bodyWeightKg: 80,
      lifts: [{ exerciseName: 'Bench Press', e1rmKg: 320 }],
    });
    expect(r.score).toBe(100); // component capped at 1.2 -> round(1.2*83.33)=100
  });

  it('matches distinct lifts to distinct benchmarks', () => {
    const r = computeStrengthScore({
      bodyWeightKg: 100,
      lifts: [
        { exerciseName: 'Barbell Row', e1rmKg: 100 }, // matches row (1.0x)
        { exerciseName: 'Bench Press', e1rmKg: 125 }, // matches bench (1.25x)
      ],
    });
    expect(r.keyLifts.map((k) => k.exerciseName).sort()).toEqual(['Barbell Row', 'Bench Press']);
  });

  it('consumes a lift that matches two benchmarks exactly once (reuse guard)', () => {
    // "Overhead Row" matches BOTH overhead (0.75x, checked first) and row (1.0x).
    // The `used` guard must claim it for overhead and skip it for row.
    const r = computeStrengthScore({
      bodyWeightKg: 100,
      lifts: [{ exerciseName: 'Overhead Row', e1rmKg: 75 }],
    });
    expect(r.keyLifts).toHaveLength(1);
    expect(r.keyLifts[0]).toMatchObject({ exerciseName: 'Overhead Row', ratio: 0.75 });
    expect(r.score).toBe(83); // single component 1.0 (75/100 / 0.75) -> round(83.33)
  });
});

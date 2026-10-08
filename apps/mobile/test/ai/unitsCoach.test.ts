/**
 * Pounds in the coach (v0.27.0): under "lb, miles" a bare number the member types is read in
 * lb, an explicit "kg"/"lb" word wins whatever the setting, and replies show lb. Stored kg.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setDisplayUnits } from '@/lib/units';

describe('coach under lb, miles', () => {
  beforeEach(() => setDisplayUnits('imperial'));
  afterEach(() => setDisplayUnits('metric'));

  it('reads "bench 135 for 8" as 135 lb, stored as 61.23 kg', async () => {
    const { parseWorkout } = await import('@/ai/localCoach');
    const out = parseWorkout('bench 135 for 8');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('bench');
    expect(out[0].sets).toHaveLength(1);
    expect(out[0].sets[0].reps).toBe(8);
    expect(Math.round(out[0].sets[0].weightKg * 100) / 100).toBe(61.23);
  });

  it('honours an explicit kg or lb word whatever the setting', async () => {
    const { parseWorkout, parseBodyWeight } = await import('@/ai/localCoach');
    expect(parseWorkout('squat 60 kg for 5')[0].sets[0].weightKg).toBe(60);
    expect(parseWorkout('squat 3 sets of 5 at 60 kgs')[0].sets.map((s) => s.weightKg)).toEqual([60, 60, 60]);
    expect(parseWorkout('squat 100 lb x 5')[0].sets[0].weightKg).toBeCloseTo(45.359, 3);
    expect(parseBodyWeight('body weight 60 kg')).toBe(60);
    expect(parseBodyWeight('body weight 180')).toBeCloseTo(81.647, 3);
    setDisplayUnits('metric');
    expect(parseWorkout('squat 100 pounds for 5')[0].sets[0].weightKg).toBeCloseTo(45.359, 3);
    expect(parseWorkout('bench 135 for 8')[0].sets[0].weightKg).toBe(135);
  });

  it('the logged-workout reply reads in lb', async () => {
    const { buildWorkoutLoggedCard } = await import('@/ai/tools');
    type Logged = Parameters<typeof buildWorkoutLoggedCard>[0];
    const logged = {
      detail: { exercises: [], totalVolumeKg: 1000 },
      newPrs: [{ exerciseName: 'Bench Press', kind: 'weight', value: 61.23496 }],
      skipped: [],
    } as unknown as Logged;
    expect(buildWorkoutLoggedCard(logged)?.text).toBe(
      'Logged 0 exercises, 0 sets — 2,205 lb volume. New PR: Bench Press 135 lb (weight).',
    );
    setDisplayUnits('metric');
    expect(buildWorkoutLoggedCard(logged)?.text).toBe(
      'Logged 0 exercises, 0 sets — 1,000 kg volume. New PR: Bench Press 61.2kg (weight).',
    );
  });

  it('shows weights and volume in lb in reply strings', async () => {
    const { cw, cwTight, cvol } = await import('@/ai/unitText');
    expect(cw(61.23496)).toBe('135 lb');
    expect(`Logged: Bench Press — ${cvol(1000)} total volume.`).toBe('Logged: Bench Press — 2,205 lb total volume.');
    setDisplayUnits('metric');
    expect(cw(62.5)).toBe('62.5 kg');
    expect(cwTight(62.5)).toBe('62.5kg');
    expect(cvol(12480)).toBe('12,480 kg');
  });
});

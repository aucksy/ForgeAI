/**
 * Phase 2 review — today's workout keeps exercises that get no Target (distance work, timed
 * cardio). Before the fix they vanished from the Home card, the coach's "today's workout"
 * and the chat plan card, while the Workout tab still counted them.
 *
 * Contract test over the DB-bound service: every read it makes is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Exercise } from '@/types/models';

const ex = (id: string, name: string): Exercise => ({
  id,
  name,
  aliases: [],
  muscleGroup: id === 'run' ? 'quads' : 'chest',
  secondaryMuscles: [],
  equipment: id === 'run' ? 'machine' : 'barbell',
  isCompound: true,
  incrementKg: 2.5,
});
const plan = [
  { id: 'pe1', planDayId: 'd1', exerciseId: 'bench', order: 0, targetSets: 3, repRangeMin: 8, repRangeMax: 12, exercise: ex('bench', 'Barbell Bench Press') },
  { id: 'pe2', planDayId: 'd1', exerciseId: 'run', order: 1, targetSets: 1, repRangeMin: 8, repRangeMax: 12, exercise: ex('run', 'Treadmill Run') },
  { id: 'pe3', planDayId: 'd1', exerciseId: 'stairs', order: 2, targetSets: 1, repRangeMin: 8, repRangeMax: 12, exercise: ex('stairs', 'Stair Climber') },
];

vi.mock('@/lib/date', () => ({ todayISO: () => '2026-10-06' }));
vi.mock('@/db/repos/userRepo', () => ({ getProfile: async () => ({ experience: 'intermediate' }) }));
vi.mock('@/db/repos/planRepo', () => ({
  getActivePlan: async () => ({ days: [{ id: 'd1', exercises: plan }] }),
}));
vi.mock('@/services/coach', () => ({
  getTodaysWorkout: async () => ({
    planDayId: 'd1',
    dayName: 'Push + cardio',
    dayType: 'push',
    headline: 'Push day',
    targets: plan.map((p) => ({ exerciseId: p.exerciseId })),
  }),
}));
vi.mock('@/tracker/db/progressionHistory', () => ({ getProgressionHistory: async () => [] }));
vi.mock('@/tracker/db/exerciseInfo', () => ({
  getExerciseIdsByCatalogKey: async () => new Map(),
  getTrackerExercisesByIds: async () =>
    new Map([
      ['bench', { id: 'bench', catalogKey: null, logType: 'weight_reps', loadMode: 'one', muscles: { primary: ['chest'], secondary: [] } }],
      ['run', { id: 'run', catalogKey: null, logType: 'time_distance', loadMode: 'one', muscles: { primary: ['cardio'], secondary: [] } }],
      ['stairs', { id: 'stairs', catalogKey: null, logType: 'time', loadMode: 'one', muscles: { primary: ['cardio'], secondary: [] } }],
    ]),
}));

const { getTargetsForPlanDay, getTodaysWorkoutWithTargets } = await import('@/tracker/services/coachTargets');
const { targetFill, targetLine } = await import('@/tracker/engine/progression');

beforeEach(() => vi.clearAllMocks());

describe("today's workout keeps cardio (review finding)", () => {
  it('Home and the coach list every exercise of the day, in order', async () => {
    const tw = await getTodaysWorkoutWithTargets();
    expect(tw.targets.map((t) => t.exerciseName)).toEqual(['Barbell Bench Press', 'Treadmill Run', 'Stair Climber']);
    const [bench, run, stairs] = tw.targets;
    expect(bench.free).toBeUndefined();
    expect(targetLine(run)).toBe('Time and distance');
    expect(targetLine(stairs)).toBe('Time'); // never "Hold 20 min"
    expect(targetFill(stairs)).toBeNull();
  });
  it('the workout card gets a Target only for the lift', async () => {
    const m = await getTargetsForPlanDay('d1');
    expect([...m.keys()]).toEqual(['bench']);
  });
});

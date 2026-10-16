/**
 * 16 Oct 2026 end-to-end audit, C4 (import and export) — against REAL SQLite.
 * Audit/e2e-v2/C4-import-export.md. Each test failed on the code before its fix.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
});

describe('C4-4: Repeat a workout keeps its rows and their types', () => {
  it('W W n n n | W n n n n D F: the same rows, warm-ups with their PREVIOUS, no phantom set', async () => {
    const id = (n: string) => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [n])[0].id;
    const incline = id('Incline Barbell Press');
    const lateral = id('Lateral Raise');
    const { createSession, getSessionDetail } = await import('@/db/repos/workoutRepo');
    const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const s = await createSession({ dateISO: yesterday, dayType: 'push', source: 'manual', startedAt: Date.now() - 86_400_000 });
    const w = (exerciseId: string, weightKg: number, reps: number) => ({ exerciseId, weightKg, reps, isWarmup: true });
    const n = (exerciseId: string, weightKg: number, reps: number, setType: 'normal' | 'drop' | 'failure' = 'normal') => ({ exerciseId, weightKg, reps, isWarmup: false, setType });
    await addSetsWithMeta(s.id, [
      w(incline, 20, 10),
      w(incline, 40, 5),
      n(incline, 60, 8),
      n(incline, 60, 8),
      n(incline, 60, 7),
      w(lateral, 5, 15),
      n(lateral, 10, 12),
      n(lateral, 10, 12),
      n(lateral, 10, 11),
      n(lateral, 10, 10),
      n(lateral, 6, 12, 'drop'),
      n(lateral, 10, 8, 'failure'),
    ]);
    const detail = (await getSessionDetail(s.id))!;
    const { useActiveWorkout, prevForSet } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromSession(detail);
    const ex = useActiveWorkout.getState().exercises;
    const types = (i: number) => ex[i].sets.map((x) => (x.isWarmup ? 'W' : x.setType === 'drop' ? 'D' : x.setType === 'failure' ? 'F' : 'n')).join('');
    expect(types(0)).toBe('WWnnn');
    expect(types(1)).toBe('WnnnnDF');
    const firstWarm = ex[0].sets[0];
    expect(prevForSet(ex[0], firstWarm.key)).toMatchObject({ weightKg: 20, reps: 10 });
  });
});

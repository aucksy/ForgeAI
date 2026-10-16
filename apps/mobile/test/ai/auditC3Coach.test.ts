/**
 * 16 Oct 2026 end-to-end audit, C3 — the coach's routine tools against REAL SQLite.
 * Audit/e2e-v2/C3-routines-suggestions.md (C3-10, C3-18). Each test failed before its fix.
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

async function tool(name: string) {
  const { COACH_TOOLS } = await import('@/ai/tools');
  const t = COACH_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return (args: Record<string, unknown>) => t.execute(args) as Promise<{ resultForModel: Record<string, unknown> }>;
}

describe('C3-10: the coach sees every routine the Routines screen shows', () => {
  it('create_routine then add_exercise_to_routine finds the new routine', async () => {
    await (await tool('create_routine'))({ name: 'Push Coach', dayType: 'push' });
    const res = await (await tool('add_exercise_to_routine'))({ routineName: 'Push Coach', exerciseName: 'Barbell Bench Press', targetSets: 3 });
    expect(JSON.stringify(res.resultForModel)).not.toContain('No routine found');
    const day = db.all<{ id: string }>("SELECT id FROM plan_days WHERE name = 'Push Coach'")[0].id;
    expect(db.count('plan_exercises', `plan_day_id = '${day}'`)).toBe(1);
  });

  it('get_routines lists routines of a folder he does not follow, with the folder name', async () => {
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
    await createFolderWithRoutines('From Hevy', [{ name: 'Hevy Push', dayType: 'push', exercises: [{ exerciseId: bench, sets: 3, repMin: 6, repMax: 8 }] }]);
    const res = await (await tool('get_routines'))({});
    const list = res.resultForModel.routines as { name: string; folder?: string }[];
    expect(list.find((r) => r.name === 'Hevy Push')).toMatchObject({ folder: 'From Hevy' });
  });
});

describe('C3-18: the coach never sees a rep range on a timed hold', () => {
  it('Plank with Higher reps reads "3 sets" with no 12-20', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setRepRange('higher');
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    const plank = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Plank'")[0].id;
    await createFolderWithRoutines('Core', [{ name: 'Core Day', dayType: 'full', exercises: [{ exerciseId: plank, sets: 3, repMin: 8, repMax: 12 }] }]);
    const res = await (await tool('get_routines'))({});
    const list = res.resultForModel.routines as { name: string; exercises: string[] }[];
    const line = list.find((r) => r.name === 'Core Day')!.exercises[0];
    expect(line).not.toContain('12-20');
    expect(line).toContain('Plank');
  });
});

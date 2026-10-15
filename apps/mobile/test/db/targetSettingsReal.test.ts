/**
 * Oct 2026 (owner) — "Weight jumps", "Rep range" and the gym's plates reach the Targets, against
 * REAL SQL (test/helpers/realDb.ts). Synthetic history only.
 *  - a change of either setting (or of the plates) gives a new answer at once — never a
 *    remembered one (the Target memo is keyed on them);
 *  - a routine row still on its default range follows "Rep range"; a row given its own keeps it;
 *  - the live workout's Targets (the query the screen sends) follow the same settings.
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
const memory = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  const { usePlateSetup } = await import('@/tracker/store/plateSetupStore');
  // The settings are persisted; here they are kept in memory (no phone storage in a unit test).
  useTrackerPrefs.persist.setOptions({ storage: memory });
  usePlateSetup.persist.setOptions({ storage: memory });
  useTrackerPrefs.setState({ weightJump: 'standard', repRange: 'goal' });
  usePlateSetup.getState().resetSetup('metric');
});

const idOf = (where: string): string => db.all<{ id: string }>(`SELECT id FROM exercises WHERE ${where} LIMIT 1`)[0].id;

/** One past workout of one exercise, `daysAgo` days before today. */
async function logged(exerciseId: string, daysAgo: number, rows: [number, number][]) {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { toISO } = await import('@/lib/date');
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const s = await createSession({ dateISO: toISO(d), dayType: 'push', source: 'manual', startedAt: d.getTime() });
  await addSetsWithMeta(s.id, rows.map(([weightKg, reps]) => ({ exerciseId, weightKg, reps, isWarmup: false })));
}

/** A routine of one exercise; no range given = the default for the member's goal. */
async function routineOf(exerciseId: string, range?: { repRangeMin: number; repRangeMax: number }): Promise<string> {
  const { createRoutine, addExerciseToRoutine } = await import('@/tracker/db/routineRepo');
  const r = await createRoutine({ name: 'Push A', dayType: 'push' });
  await addExerciseToRoutine(r, exerciseId, { targetSets: 3, ...(range ?? {}) });
  return r;
}

async function targetOf(routine: string, exerciseId: string) {
  const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
  return (await getTargetsForCards(routine, [{ key: 'c', exerciseId }])).get('c')!;
}

describe('Weight jumps and the gym plates reach the Target, with no stale answer', () => {
  it('60 kg at the top: Standard 62.5 → Large 65 → back to 62.5 → no 1.25 kg plates 65', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    await logged(bench, 3, [[60, 12], [60, 12], [60, 12]]);
    const routine = await routineOf(bench, { repRangeMin: 8, repRangeMax: 12 });
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    const { usePlateSetup } = await import('@/tracker/store/plateSetupStore');
    const { EMPTY_SETUP, togglePlate } = await import('@/tracker/services/plateMath');
    expect((await targetOf(routine, bench)).targetWeightKg).toBe(62.5);
    useTrackerPrefs.getState().setWeightJump('large');
    expect((await targetOf(routine, bench)).targetWeightKg).toBe(65);
    useTrackerPrefs.getState().setWeightJump('standard');
    expect((await targetOf(routine, bench)).targetWeightKg).toBe(62.5);
    usePlateSetup.getState().setSetup('metric', togglePlate(EMPTY_SETUP, 1.25, false));
    expect((await targetOf(routine, bench)).targetWeightKg).toBe(65);
  });

  it('the live workout: starting a routine stores Targets that follow the setting, under the screen’s own query', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    await logged(bench, 3, [[60, 12], [60, 12], [60, 12]]);
    const routine = await routineOf(bench, { repRangeMin: 8, repRangeMax: 12 });
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setWeightJump('large');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { querySignature, targetQuery, useTargets } = await import('@/tracker/store/targetStore');
    await useActiveWorkout.getState().startFromPlanDay(routine);
    const st = useActiveWorkout.getState();
    expect(useTargets.getState().sig).toBe(querySignature(targetQuery(st.planDayId, st.exercises, { easy: false, effort: false })));
    expect(useTargets.getState().targets.get(st.exercises[0].key)?.targetWeightKg).toBe(65);
  });
});

describe('Rep range reaches the Target', () => {
  it('a row on its default range follows the choice; a row given its own keeps it', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    await logged(bench, 3, [[60, 9], [60, 8], [60, 8]]);
    const byDefault = await routineOf(bench); // goal "muscle": the bench's default 6–10
    const own = await routineOf(bench, { repRangeMin: 8, repRangeMax: 12 });
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');

    const t0 = await targetOf(byDefault, bench);
    expect([t0.targetRepsMin, t0.targetRepsMax]).toEqual([6, 10]);
    expect(t0.setGoals).toEqual([10, 8, 8]);

    useTrackerPrefs.getState().setRepRange('strength');
    const t1 = await targetOf(byDefault, bench);
    expect([t1.targetRepsMin, t1.targetRepsMax]).toEqual([3, 6]);
    expect(t1.rule).toBe('R2'); // 9, 8, 8 is past the top of 3–6: time to add weight
    expect(t1.targetWeightKg).toBe(62.5);
    const kept = await targetOf(own, bench);
    expect([kept.targetRepsMin, kept.targetRepsMax]).toEqual([8, 12]);

    useTrackerPrefs.getState().setRepRange('higher');
    const t2 = await targetOf(byDefault, bench);
    expect([t2.targetRepsMin, t2.targetRepsMax]).toEqual([12, 20]);
  });
});

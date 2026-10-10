/**
 * Phase 2, packet C — "Targets you can load", against REAL SQL (test/helpers/realDb.ts).
 * Synthetic history only (never the owner's export).
 *
 *  - TG-01 the Target's "Up" is the next weight the member has used, read from ALL history
 *    (not just the last 12 workouts);
 *  - TG-03 a Counting change keeps the Target and PREVIOUS the same physical load;
 *  - TG-06 a swapped-in exercise keeps a Target (its own, or a calm first-time line);
 *  - TG-08 last time's drop set comes back as a drop set;
 *  - TG-11 starting a routine stores the Targets with the cards (first frame has them);
 *  - SH-09 experience saved in Profile reaches the Targets.
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
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
});

const idOf = (where: string): string => db.all<{ id: string }>(`SELECT id FROM exercises WHERE ${where} LIMIT 1`)[0].id;

type Row = [number, number] | [number, number, 'drop'];
/** One past workout of one exercise, `daysAgo` days before today. */
async function logged(exerciseId: string, daysAgo: number, rows: Row[], loadMode?: 'one' | 'both') {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { toISO } = await import('@/lib/date');
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const s = await createSession({ dateISO: toISO(d), dayType: 'push', source: 'manual', startedAt: d.getTime() });
  await addSetsWithMeta(
    s.id,
    rows.map(([weightKg, reps, t]) => ({ exerciseId, weightKg, reps, isWarmup: false, ...(t ? { setType: t } : {}), ...(loadMode ? { loadMode } : {}) })),
  );
}

async function routineOf(exerciseIds: string[]): Promise<string> {
  const { createRoutine, addExerciseToRoutine } = await import('@/tracker/db/routineRepo');
  const r = await createRoutine({ name: 'Push A', dayType: 'push' });
  for (const id of exerciseIds) await addExerciseToRoutine(r, id, { targetSets: 3, repRangeMin: 8, repRangeMax: 12 });
  return r;
}

describe('TG-01 your own weight ladder, from all history', () => {
  it('Up is the next weight he has used — 25 kg dumbbells, never 22.5 — even when 25 was 20 workouts ago', async () => {
    const curl = idOf("name = 'Dumbbell Curl'");
    // Long ago: 10, 12.5, 15, 25 (the old 12-workout window cannot see these).
    await logged(curl, 200, [[25, 6], [25, 6]]);
    await logged(curl, 190, [[15, 10], [12.5, 10], [10, 12]]);
    for (let i = 20; i >= 2; i--) await logged(curl, i * 3, [[20, 12], [20, 12], [20, 12]]);
    await logged(curl, 3, [[20, 16], [20, 16], [20, 16]]); // well past the top: time to move
    const routine = await routineOf([curl]);
    const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
    const t = (await getTargetsForCards(routine, [{ key: 'c1', exerciseId: curl }])).get('c1')!;
    expect(t.change).toBe('up');
    expect(t.targetWeightKg).toBe(25); // his own next dumbbell (old rule: 22.5, never used)
  });
});

describe('TG-03 Counting changes never double or halve', () => {
  it('history typed "as typed" (both dumbbells, 50) reads as 25 each once Counting is "each dumbbell"', async () => {
    const press = idOf("name = 'Dumbbell Curl'");
    const { setExerciseLoadMode } = await import('@/tracker/db/exerciseInfo');
    await setExerciseLoadMode(press, 'one');
    await logged(press, 9, [[45, 12], [45, 12], [45, 12]]);
    await logged(press, 6, [[50, 10], [50, 10], [50, 10]]);
    await logged(press, 3, [[50, 12], [50, 12], [50, 12]]);
    await setExerciseLoadMode(press, 'both'); // old sets are stamped 'one' first
    const routine = await routineOf([press]);
    const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
    const t = (await getTargetsForCards(routine, [{ key: 'c1', exerciseId: press, loadMode: 'both' }])).get('c1')!;
    expect(t.last?.weightKg).toBe(25);
    expect(t.each).toBe(true);
    expect(t.targetWeightKg).toBe(27.5); // the next dumbbell (each), not 52.5 "each"

    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlanDay(routine);
    const card = useActiveWorkout.getState().exercises[0];
    expect(card.loadMode).toBe('both');
    expect(card.previousSets.map((p) => p.weightKg)).toEqual([25, 25, 25]);
    // Changing it back mid-workout re-reads PREVIOUS the other way.
    useActiveWorkout.getState().setLoadMode(card.key, 'one');
    expect(useActiveWorkout.getState().exercises[0].previousSets.map((p) => p.weightKg)).toEqual([50, 50, 50]);
  });
});

describe('TG-06 a swapped exercise keeps a Target', () => {
  it('with no history of its own: the calm first-time line, with the routine row\'s range', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    const other = idOf("name = 'Leg Press'");
    await logged(bench, 3, [[60, 10], [60, 10], [60, 10]]);
    const routine = await routineOf([bench]);
    const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
    const { targetLine } = await import('@/tracker/engine/progression');
    const m = await getTargetsForCards(routine, [{ key: 'c1', exerciseId: other, planExerciseId: bench }]);
    const t = m.get('c1')!;
    expect(t.exerciseId).toBe(other);
    expect(t.rule).toBe('R0');
    expect(targetLine(t)).toBe('First time · find a weight for 8–12 reps');
  });

  it('through the store: Swap leaves the card with its own Target', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    const other = idOf("name = 'Leg Press'");
    await logged(bench, 3, [[60, 12], [60, 12], [60, 12]]);
    await logged(other, 4, [[40, 12], [40, 12], [40, 12]]);
    await logged(other, 8, [[35, 12], [35, 12], [35, 12]]);
    await logged(other, 12, [[30, 12], [30, 12], [30, 12]]);
    const routine = await routineOf([bench]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    const { loadTargets, targetQuery, useTargets } = await import('@/tracker/store/targetStore');
    await useActiveWorkout.getState().startFromPlanDay(routine);
    const key = useActiveWorkout.getState().exercises[0].key;
    expect(await useActiveWorkout.getState().swapExercise(key, (await getExerciseById(other))!)).toBe(true);
    const st = useActiveWorkout.getState();
    await loadTargets(targetQuery(st.planDayId, st.exercises, { easy: false, effort: false }));
    const t = useTargets.getState().targets.get(key)!;
    expect(t.exerciseId).toBe(other);
    expect(t.targetWeightKg).toBe(45); // his machine moves in 5s (35 → 40 → 45)
  });
});

describe('TG-08 drop sets carry forward as drop sets', () => {
  it('3 sets + a drop last time → 3 rows and a drop row (PREVIOUS = the drop), not a 4th plain set', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    await logged(bench, 3, [[80, 10], [80, 9], [80, 8], [60, 10, 'drop']]);
    const routine = await routineOf([bench]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlanDay(routine);
    const card = useActiveWorkout.getState().exercises[0];
    expect(card.sets.map((s) => s.setType ?? 'normal')).toEqual(['normal', 'normal', 'normal', 'drop']);
    expect(card.previousSets[3]).toEqual({ weightKg: 60, reps: 10 });
  });
});

describe('TG-11 Targets arrive with the cards', () => {
  it('the moment the workout opens, every routine card already has its Target', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    await logged(bench, 3, [[60, 12], [60, 12], [60, 12]]);
    const routine = await routineOf([bench]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { querySignature, targetQuery, useTargets } = await import('@/tracker/store/targetStore');
    await useActiveWorkout.getState().startFromPlanDay(routine);
    const st = useActiveWorkout.getState();
    // Same signature as the screen computes → the screen does not reload; the map is there.
    expect(useTargets.getState().sig).toBe(querySignature(targetQuery(st.planDayId, st.exercises, { easy: false, effort: false })));
    expect(useTargets.getState().targets.get(st.exercises[0].key)?.targetWeightKg).toBe(62.5);
  });
});

describe('SH-09 experience from Profile reaches the Targets', () => {
  it('switching to "New to lifting" lets an easy set jump two steps', async () => {
    const bench = idOf("name = 'Barbell Bench Press'");
    await logged(bench, 3, [[60, 15], [60, 15], [60, 15]]);
    const routine = await routineOf([bench]);
    const { getTargetsForCards } = await import('@/tracker/services/coachTargets');
    const { updateProfile } = await import('@/db/queuedWrites');
    const before = (await getTargetsForCards(routine, [{ key: 'c', exerciseId: bench }])).get('c')!;
    expect(before.targetWeightKg).toBe(62.5);
    await updateProfile({ experience: 'beginner' });
    const after = (await getTargetsForCards(routine, [{ key: 'c', exerciseId: bench }])).get('c')!;
    expect(after.rule).toBe('R2c');
    expect(after.targetWeightKg).toBe(65);
  });
});

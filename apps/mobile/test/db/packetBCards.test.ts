/**
 * Phase 2, packet B against REAL SQL (test/helpers/realDb.ts):
 *  - LW-05 / LW-28 / TG-05: a routine with Bench twice (heavy, then back-off). Each card keeps
 *    its own rows, its own PREVIOUS and its own Target; after saving the two cards stay two
 *    (tracker schema v10 stores each set's card).
 *  - TG-07: a tick on a weight × reps row with reps but no weight (and nothing to hint) asks for
 *    the weight; it is never saved as 0 kg.
 *  - TG-11 (reopen): a draft restored after the app was closed has its Targets before it opens.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

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
});

const exerciseId = (name: string) => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

/** Push A: Bench 3 × 4–6 (heavy), then Bench 3 × 8–12 (back-off). */
async function benchTwice(): Promise<string> {
  const r = await import('@/tracker/db/routineRepo');
  const day = await r.createRoutine({ name: 'Push A', dayType: 'push' });
  const bench = exerciseId('Barbell Bench Press');
  await r.addExerciseToRoutine(day, bench, { targetSets: 3, repRangeMin: 4, repRangeMax: 6 });
  await r.addExerciseToRoutine(day, bench, { targetSets: 3, repRangeMin: 8, repRangeMax: 12 });
  return day;
}

async function store() {
  return (await import('@/tracker/store/activeWorkoutStore')).useActiveWorkout;
}

/** Tick every row of card `i` at `w` × `r`. */
async function tickCard(i: number, w: number, r: number): Promise<void> {
  const st = (await store()).getState();
  const c = st.exercises[i];
  for (const s of c.sets) {
    st.updateSet(c.key, s.key, { weightKg: w, reps: r });
    expect(st.toggleDone(c.key, s.key)).toBeNull();
  }
}

describe('the same exercise twice (LW-05, LW-28, TG-05)', () => {
  it('heavy and back-off keep their own rows, PREVIOUS and Target — and stay two cards after saving', async () => {
    const day = await benchTwice();
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    expect(aw.getState().exercises).toHaveLength(2);
    await tickCard(0, 100, 5);
    await tickCard(1, 70, 10);
    const sid = (await aw.getState().finish(null))!;

    // Stored: the back-off sets carry card 1; the heavy ones stay NULL like every older set.
    const stored = db.all<{ weight_kg: number; card_index: number | null }>(
      'SELECT weight_kg, card_index FROM set_entries WHERE session_id = ? ORDER BY rowid',
      [sid],
    );
    expect(stored.map((s) => [s.weight_kg, s.card_index])).toEqual([
      [100, null], [100, null], [100, null],
      [70, 1], [70, 1], [70, 1],
    ]);

    // History and the finish summary: two Bench cards, not one with sets 1–6.
    const { getSessionSummary } = await import('@/tracker/services/finishSummary');
    const summary = (await getSessionSummary(sid))!;
    expect(summary.session.exercises.map((g) => g.sets.map((s) => s.weightKg))).toEqual([
      [100, 100, 100],
      [70, 70, 70],
    ]);

    // Next time: each card reads its own card of last time, with its own row count and Target.
    await aw.getState().startFromPlanDay(day);
    const [heavy, back] = aw.getState().exercises;
    expect(heavy.sets).toHaveLength(3);
    expect(back.sets).toHaveLength(3);
    expect(heavy.previousSets.map((p) => `${p.weightKg}x${p.reps}`)).toEqual(['100x5', '100x5', '100x5']);
    expect(back.previousSets.map((p) => `${p.weightKg}x${p.reps}`)).toEqual(['70x10', '70x10', '70x10']);
    const { useTargets } = await import('@/tracker/store/targetStore');
    const targets = useTargets.getState().targets;
    expect(targets.get(heavy.key)?.last?.weightKg).toBe(100);
    expect(targets.get(back.key)?.last?.weightKg).toBe(70);
    expect(targets.get(back.key)!.targetWeightKg).toBeLessThan(90);
  });
});

describe('TG-07: a blank weight is missing, never 0 kg', () => {
  it('first time on a lift, reps typed, weight blank → the tick asks for the weight and nothing is ticked', async () => {
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    const aw = await store();
    aw.getState().startEmpty();
    await aw.getState().addExercise((await getExerciseById(exerciseId('Barbell Bench Press')))!);
    const c = aw.getState().exercises[0];
    aw.getState().updateSet(c.key, c.sets[0].key, { reps: 10 });
    expect(aw.getState().toggleDone(c.key, c.sets[0].key)).toBe('weight');
    expect(aw.getState().exercises[0].sets[0].done).toBe(false);
    expect(aw.getState().exercises[0].sets[0].weightKg).toBeNull();
    // And an empty row says reps (LW-13).
    aw.getState().addSet(c.key);
    const blank = aw.getState().exercises[0].sets[1];
    expect(aw.getState().toggleDone(c.key, blank.key)).toBe('reps');
  });
});

describe('TG-11: reopening the app mid-workout', () => {
  it('the restored draft has its Targets before it opens (hints never start from last time)', async () => {
    const day = await benchTwice();
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    await tickCard(0, 100, 5);
    await tickCard(1, 70, 10);
    await aw.getState().finish(null);
    await aw.getState().startFromPlanDay(day);
    const { flushDraft } = await import('@/tracker/store/activeWorkoutStore');
    await flushDraft();
    const keys = aw.getState().exercises.map((e) => e.key);

    // The app is closed: nothing in memory, the draft only on disk.
    const { useTargets } = await import('@/tracker/store/targetStore');
    useTargets.setState({ sig: null, targets: new Map() });
    aw.setState({ hydrated: false, active: false, exercises: [] });
    await aw.getState().hydrate();
    expect(aw.getState().active).toBe(true);
    const t = useTargets.getState().targets;
    expect(keys.map((k) => t.get(k)?.last?.weightKg)).toEqual([100, 70]);
  });
});

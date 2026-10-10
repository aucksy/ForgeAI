/**
 * Phase 2 review fixes (10 Oct 2026) against REAL SQL (test/helpers/realDb.ts). Synthetic
 * history only. Each test failed before its fix.
 *  #2  a swap after a tick: the continuation card shares its parent's routine row — it never
 *      loses its Target (Bench × 1) nor steals the back-off's (Bench heavy + back-off);
 *  #10 moving back-off above heavy keeps each card's own number (history, Target, save);
 *  #11 the first workout with a second Bench card reads the lift's older history (sets saved
 *      before cards were numbered) instead of saying "first time".
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
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
});

const idOf = (name: string) => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;

async function logged(exerciseId: string, daysAgo: number, rows: [number, number][]): Promise<void> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { toISO } = await import('@/lib/date');
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const s = await createSession({ dateISO: toISO(d), dayType: 'push', source: 'manual', startedAt: d.getTime() });
  await addSetsWithMeta(s.id, rows.map(([weightKg, reps]) => ({ exerciseId, weightKg, reps, isWarmup: false })));
}

/** A routine: each entry is one row (same lift twice = heavy, then back-off). */
async function routine(rows: { id: string; min: number; max: number }[]): Promise<string> {
  const r = await import('@/tracker/db/routineRepo');
  const day = await r.createRoutine({ name: 'Push A', dayType: 'push' });
  for (const x of rows) await r.addExerciseToRoutine(day, x.id, { targetSets: 3, repRangeMin: x.min, repRangeMax: x.max });
  return day;
}

async function store() {
  return (await import('@/tracker/store/activeWorkoutStore')).useActiveWorkout;
}

async function targetsNow() {
  const aw = await store();
  const { loadTargets, targetQuery, useTargets } = await import('@/tracker/store/targetStore');
  const st = aw.getState();
  await loadTargets(targetQuery(st.planDayId, st.exercises, { easy: false, effort: false }));
  return useTargets.getState().targets;
}

async function tickFirst(i: number, w: number, r: number): Promise<void> {
  const st = (await store()).getState();
  const c = st.exercises[i];
  st.updateSet(c.key, c.sets[0].key, { weightKg: w, reps: r });
  expect(st.toggleDone(c.key, c.sets[0].key)).toBeNull();
}

async function swap(i: number, name: string): Promise<void> {
  const aw = await store();
  const { getExerciseById } = await import('@/db/repos/exerciseRepo');
  const key = aw.getState().exercises[i].key;
  expect(await aw.getState().swapExercise(key, (await getExerciseById(idOf(name)))!)).toBe(true);
}

describe('#2 swap after a tick keeps every Target', () => {
  it('Bench × 1: the continuation card gets the Bench row\'s Target (before: none)', async () => {
    const bench = idOf('Barbell Bench Press');
    await logged(bench, 3, [[60, 10], [60, 10], [60, 10]]);
    const day = await routine([{ id: bench, min: 8, max: 12 }]);
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    await tickFirst(0, 60, 10);
    await swap(0, 'Leg Press');
    const [kept, cont] = aw.getState().exercises;
    expect(cont.splitFrom).toBe(kept.key);
    const t = await targetsNow();
    expect(t.get(kept.key)?.exerciseId).toBe(bench);
    expect(t.get(cont.key)?.exerciseId).toBe(idOf('Leg Press'));
    expect([t.get(cont.key)?.targetRepsMin, t.get(cont.key)?.targetRepsMax]).toEqual([8, 12]);
  });

  it('Bench heavy + back-off: swapping heavy never takes the back-off\'s row (before: it did, back-off lost its Target)', async () => {
    const bench = idOf('Barbell Bench Press');
    await logged(bench, 3, [[100, 5], [100, 5], [100, 5]]);
    const day = await routine([
      { id: bench, min: 4, max: 6 },
      { id: bench, min: 8, max: 12 },
    ]);
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    await tickFirst(0, 100, 5);
    await swap(0, 'Leg Press');
    const [heavy, cont, back] = aw.getState().exercises;
    expect(cont.splitFrom).toBe(heavy.key);
    const t = await targetsNow();
    expect([t.get(heavy.key)?.targetRepsMin, t.get(heavy.key)?.targetRepsMax]).toEqual([4, 6]);
    expect([t.get(cont.key)?.targetRepsMin, t.get(cont.key)?.targetRepsMax]).toEqual([4, 6]);
    expect(t.get(back.key)?.exerciseId).toBe(bench);
    expect([t.get(back.key)?.targetRepsMin, t.get(back.key)?.targetRepsMax]).toEqual([8, 12]);
  });
});

describe('#10 a card keeps its number when moved', () => {
  it('back-off moved above heavy: its Target, and its saved sets, stay the back-off\'s', async () => {
    const bench = idOf('Barbell Bench Press');
    const day = await routine([
      { id: bench, min: 4, max: 6 },
      { id: bench, min: 8, max: 12 },
    ]);
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    const [heavy, back] = aw.getState().exercises;
    aw.getState().moveExercise(back.key, -1);
    expect(aw.getState().exercises.map((e) => e.key)).toEqual([back.key, heavy.key]);
    const t = await targetsNow();
    expect(t.get(back.key)?.targetRepsMin).toBe(8);
    expect(t.get(heavy.key)?.targetRepsMin).toBe(4);
    for (const [i, w, r] of [[0, 70, 10], [1, 100, 5]] as const) {
      const c = aw.getState().exercises[i];
      for (const s of c.sets) {
        aw.getState().updateSet(c.key, s.key, { weightKg: w, reps: r });
        aw.getState().toggleDone(c.key, s.key);
      }
    }
    const sid = (await aw.getState().finish(null))!;
    const stored = db.all<{ weight_kg: number; card_index: number | null }>(
      'SELECT weight_kg, card_index FROM set_entries WHERE session_id = ? ORDER BY rowid',
      [sid],
    );
    expect(stored.map((s) => [s.weight_kg, s.card_index ?? 0])).toEqual([
      [70, 1], [70, 1], [70, 1],
      [100, 0], [100, 0], [100, 0],
    ]);
  });
});

describe('#11 a second card falls back to the lift\'s own history', () => {
  it('Bench back-off with only older (un-numbered) Bench history: PREVIOUS and Target from it, not "first time"', async () => {
    const bench = idOf('Barbell Bench Press');
    await logged(bench, 9, [[80, 8], [80, 8], [80, 8]]);
    await logged(bench, 3, [[80, 9], [80, 9], [80, 9]]);
    const { getProgressionHistory } = await import('@/tracker/db/progressionHistory');
    expect(await getProgressionHistory(bench, 5, { card: 1 })).toHaveLength(2);
    const day = await routine([
      { id: bench, min: 4, max: 6 },
      { id: bench, min: 8, max: 12 },
    ]);
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    const back = aw.getState().exercises[1];
    expect(back.previousSets.map((p) => `${p.weightKg}x${p.reps}`)).toEqual(['80x9', '80x9', '80x9']);
    const t = await targetsNow();
    expect(t.get(back.key)?.last?.weightKg).toBe(80);
    expect(t.get(back.key)?.rule).not.toBe('R0');
  });

  it('a card with history of its own still reads only its own', async () => {
    const bench = idOf('Barbell Bench Press');
    const day = await routine([
      { id: bench, min: 4, max: 6 },
      { id: bench, min: 8, max: 12 },
    ]);
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    for (const [i, w, r] of [[0, 100, 5], [1, 70, 10]] as const) {
      const c = aw.getState().exercises[i];
      for (const s of c.sets) {
        aw.getState().updateSet(c.key, s.key, { weightKg: w, reps: r });
        aw.getState().toggleDone(c.key, s.key);
      }
    }
    await aw.getState().finish(null);
    const { getProgressionHistory } = await import('@/tracker/db/progressionHistory');
    const own = await getProgressionHistory(bench, 5, { card: 1 });
    expect(own.flatMap((s) => s.sets.map((x) => x.weightKg))).toEqual([70, 70, 70]);
  });
});

/**
 * 13 Oct 2026 — rep records and the overload gate against REAL SQL (test/helpers/realDb.ts):
 * the live pop-up and the saved workout's records (the finish screen, the feed card's count, the
 * set medals on the workout page — all `getSessionRecords`) agree.
 *
 * Bench before today: 20 × 10, 20 × 10; then 20 × 12, 30 × 3. Today, live: 10 × 30 (lighter,
 * more reps — Best set by kilos but gated: no pop-up, no record), then 22.5 × 12 (a rep record
 * and a best set at more weight, and the workout passes the best workout).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

const MEMBER: OnboardingInput = {
  name: 'Rep Tester',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;
let bench: string;
let clock: number;

async function logPast(sets: { weightKg: number; reps: number }[], easyWeek = false): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { getDb } = await import('@/db');
  const { addDays, todayISO } = await import('@/lib/date');
  day += 1;
  clock += 86_400_000;
  const s = await createSession({ dateISO: addDays(todayISO(), -10 + day), dayType: 'push', source: 'manual', startedAt: clock });
  await addSetsWithMeta(s.id, sets.map((x) => ({ exerciseId: bench, ...x, isWarmup: false })));
  if (easyWeek) await getDb().runAsync('UPDATE workout_sessions SET easy_week = 1 WHERE id = ?', [s.id]);
  return s.id;
}

let day = 0;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  day = 0;
  clock = Date.now() - 20 * 86_400_000;
  await logPast([
    { weightKg: 20, reps: 10 },
    { weightKg: 20, reps: 10 },
  ]);
  await logPast([
    { weightKg: 20, reps: 12 },
    { weightKg: 30, reps: 3 },
  ]);
});

/** Live: tick each set in turn and say what the pop-up would announce for it. */
async function liveTicks(sets: { weightKg: number; reps: number }[]) {
  const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
  const { getExerciseById } = await import('@/db/repos/exerciseRepo');
  const { toastHit, recordLabel, liveRecordFlags } = await import('@/tracker/services/liveRecords');
  useActiveWorkout.getState().startEmpty();
  await useActiveWorkout.getState().addExercise((await getExerciseById(bench))!);
  const key = useActiveWorkout.getState().exercises[0].key;
  for (let i = 1; i < sets.length; i++) useActiveWorkout.getState().addSet(key);
  const toasts: (string | null)[] = [];
  sets.forEach((v, i) => {
    const st = useActiveWorkout.getState();
    const row = st.exercises[0].sets.filter((x) => !x.isWarmup)[i];
    st.updateSet(key, row.key, v);
    st.toggleDone(key, row.key);
    const hit = toastHit(useActiveWorkout.getState().exercises, key, row.key);
    toasts.push(hit ? recordLabel(hit, { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', units: 'metric' }) : null);
  });
  const card = useActiveWorkout.getState().exercises[0];
  const medals = [...liveRecordFlags(card).entries()].map(([k, kind]) => {
    const s = card.sets.find((x) => x.key === k)!;
    return [`${s.weightKg}×${s.reps}`, kind];
  });
  return { store: useActiveWorkout, toasts, medals };
}

describe('the live pop-up and the saved workout agree', () => {
  it('a lighter set with more reps is no record anywhere; the heavier rep record is everywhere', async () => {
    const { store, toasts, medals } = await liveTicks([
      { weightKg: 10, reps: 30 },
      { weightKg: 22.5, reps: 12 },
    ]);
    expect(toasts).toEqual([null, 'Rep record · 22.5 kg × 12 (was 20 kg)']);
    expect(medals).toEqual([['22.5×12', 'rep_record']]);

    const id = (await store.getState().finish(null))!;
    const { getSessionRecords } = await import('@/tracker/services/recordsService');
    const recs = await getSessionRecords(id);
    // Every record of the saved workout sits on the set the pop-up celebrated — none on 10 × 30.
    expect(recs.map((r) => `${r.set ? `${r.set.weightKg}×${r.set.reps}` : 'workout'}:${r.kind}`).sort()).toEqual(
      ['22.5×12:best_set', '22.5×12:rep_record', 'workout:best_session'].sort(),
    );
    // The workout page's medals (records matched to sets) agree.
    const { recordSets } = await import('@/tracker/services/workoutDetail');
    const saved = db.all<{ id: string; weight_kg: number; reps: number; is_warmup: number }>(
      'SELECT id, weight_kg, reps, is_warmup FROM set_entries WHERE session_id = ? ORDER BY set_number',
      [id],
    );
    const held = recordSets(
      saved.map((s) => ({ id: s.id, weightKg: s.weight_kg, reps: s.reps, isWarmup: s.is_warmup === 1 })),
      {},
      recs,
    );
    const medalled = saved.filter((s) => held.has(s.id)).map((s) => `${s.weight_kg}×${s.reps}`);
    expect(medalled).toEqual(['22.5×12']);
    // The exercise page still lists 10 × 30 as the best set by kilos (records list unchanged).
    const { getRecordsByExercise } = await import('@/tracker/services/recordsService');
    const r = (await getRecordsByExercise([bench])).get(bench)!;
    expect(r.records.bests.find((b) => b.kind === 'best_set')?.set).toMatchObject({ weightKg: 10, reps: 30 });
    // ...and its Set records ladder has the new rung (the same rule as the pop-up).
    expect(r.records.ladder?.find((x) => x.reps === 12)?.weightKg).toBe(22.5);
  });

  it('an easy-week workout never sets the bar (nor is news)', async () => {
    await logPast([{ weightKg: 40, reps: 12 }], true);
    const { toasts } = await liveTicks([{ weightKg: 22.5, reps: 12 }]);
    // The 40 × 12 of the easy week is left out: 22.5 × 12 still beats the 20 kg before it.
    expect(toasts).toEqual(['Rep record · 22.5 kg × 12 (was 20 kg)']);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().discard();
  });
});

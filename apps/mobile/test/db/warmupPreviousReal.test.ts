/**
 * Warm-ups on PREVIOUS (owner, 13 Oct 2026: "warm-up rows show nothing under PREVIOUS") against
 * REAL SQL (test/helpers/realDb.ts). Bench is logged with two warm-ups (40×10, 60×5) and three
 * working sets; a routine with two warm-up rows then shows last time's warm-ups on its W rows,
 * by warm-up order, from the SAME workout the working rows' PREVIOUS comes from:
 *  - working rows, the Target and records are unchanged (warm-ups never leak into them);
 *  - an easy-week workout is skipped for warm-ups exactly as for working sets;
 *  - "Same routine" reads that routine's last workout's warm-ups;
 *  - a back-off card reads its own card's warm-ups; editing a past workout reads the one before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreviousFrom } from '@/tracker/store/trackerPrefsStore';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let bench: string;
let R1: string;
let R2: string;
let clock: number;

type Pair = [number, number];

async function setting(v: PreviousFrom): Promise<void> {
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.getState().setPreviousFrom(v);
}

/** One Bench workout from `routineId`: its warm-ups first, then its working sets. */
async function logBench(
  routineId: string | null,
  title: string | null,
  warmups: Pair[],
  working: Pair[],
  opts: { easy?: boolean; backoff?: { warmups: Pair[]; working: Pair[] }; daysAgo?: number } = {},
): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { getDb } = await import('@/db');
  const { toISO, todayISO } = await import('@/lib/date');
  clock += 60_000;
  const dateISO = opts.daysAgo ? toISO(new Date(Date.now() - opts.daysAgo * 86_400_000)) : todayISO();
  const s = await createSession({ dateISO, dayType: 'push', source: 'manual', startedAt: clock });
  const rows = (w: Pair[], k: Pair[], cardIndex?: number) => [
    ...w.map(([weightKg, reps]) => ({ exerciseId: bench, weightKg, reps, isWarmup: true, ...(cardIndex ? { cardIndex } : {}) })),
    ...k.map(([weightKg, reps]) => ({ exerciseId: bench, weightKg, reps, isWarmup: false, ...(cardIndex ? { cardIndex } : {}) })),
  ];
  await addSetsWithMeta(s.id, [...rows(warmups, working), ...(opts.backoff ? rows(opts.backoff.warmups, opts.backoff.working, 1) : [])]);
  await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [routineId, title, s.id]);
  if (opts.easy) await getDb().runAsync('UPDATE workout_sessions SET easy_week = 1 WHERE id = ?', [s.id]);
  return s.id;
}

/** Each row of a card as "W 40×10" / "1 100×5" (PREVIOUS), "—" when it has none. */
async function previousColumn(cardIndex = 0): Promise<string[]> {
  const { useActiveWorkout, prevForSet } = await import('@/tracker/store/activeWorkoutStore');
  const card = useActiveWorkout.getState().exercises[cardIndex];
  let n = 0;
  return card.sets.map((s) => {
    const p = prevForSet(card, s.key);
    const label = s.isWarmup ? 'W' : String(++n);
    return `${label} ${p ? `${p.weightKg}×${p.reps}` : '—'}`;
  });
}

const WARM_ROUTINE = [{ type: 'warmup' as const }, { type: 'warmup' as const }, { type: 'normal' as const }, { type: 'normal' as const }, { type: 'normal' as const }];

beforeEach(async () => {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
  bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const row = { exerciseId: bench, sets: 3, repMin: 5, repMax: 8, setList: WARM_ROUTINE };
  const gym = await createFolderWithRoutines('Gym', [
    { name: 'Push 1', dayType: 'push', exercises: [row] },
    { name: 'Push 2', dayType: 'push', exercises: [row] },
  ]);
  const idOf = (name: string): string => db.all<{ id: string }>('SELECT id FROM plan_days WHERE plan_id = ? AND name = ?', [gym, name])[0].id;
  R1 = idOf('Push 1');
  R2 = idOf('Push 2');
  clock = Number(db.all<{ t: number | null }>('SELECT MAX(started_at) AS t FROM workout_sessions')[0].t ?? Date.now() - 86_400_000);
  await setting('any');
});

describe('warm-up rows show last time’s warm-ups', () => {
  it('2 warm-ups + 3 working sets: W rows read 40×10 and 60×5; working rows, Target and records unchanged', async () => {
    await logBench(R1, 'Push 1', [[40, 10], [60, 5]], [[100, 5], [100, 5], [100, 5]]);
    const { useActiveWorkout, fillForSet } = await import('@/tracker/store/activeWorkoutStore');
    const { useTargets } = await import('@/tracker/store/targetStore');
    await useActiveWorkout.getState().startFromPlanDay(R1);
    expect(await previousColumn()).toEqual(['W 40×10', 'W 60×5', '1 100×5', '2 100×5', '3 100×5']);
    const card = useActiveWorkout.getState().exercises[0];
    // Working-set PREVIOUS never holds a warm-up.
    expect(card.previousSets).toEqual([{ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }]);
    expect(card.previousWarmups).toEqual([{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 5 }]);
    // The Target reads working sets only; records were made from working sets only.
    const target = useTargets.getState().targets.get(card.key);
    expect(target?.last?.weightKg).toBe(100);
    expect(card.bests?.weightKg).toBe(100);
    // The grey hint (and so a tick) on an empty W row is last time's same warm-up — never the
    // Target, never a working set's numbers.
    const [w1, w2, s1] = card.sets;
    const tf = { weightKg: 102.5, reps: 5 };
    expect(fillForSet(card, w1.key, tf)).toEqual({ weightKg: 40, reps: 10 });
    expect(fillForSet(card, w2.key, tf)).toEqual({ weightKg: 60, reps: 5 });
    expect(fillForSet(card, s1.key, tf)).toEqual({ weightKg: 102.5, reps: 5 });
    // Ticking the empty first warm-up saves 40×10.
    expect(useActiveWorkout.getState().toggleDone(card.key, w1.key, fillForSet(card, w1.key, tf))).toBeNull();
    const ticked = useActiveWorkout.getState().exercises[0].sets[0];
    expect([ticked.done, ticked.weightKg, ticked.reps]).toEqual([true, 40, 10]);
    // A Bench added on the spot (its own read, not the start's batch) agrees.
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    await useActiveWorkout.getState().addExercise((await getExerciseById(bench))!);
    const added = useActiveWorkout.getState().exercises[1];
    expect(added.previousWarmups).toEqual([{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 5 }]);
    await useActiveWorkout.getState().discard();
  });

  it('more W rows than last time’s warm-ups: the extra row shows nothing; none last time: nothing', async () => {
    await logBench(R1, 'Push 1', [[40, 10]], [[100, 5], [100, 5], [100, 5]]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlanDay(R1);
    expect(await previousColumn()).toEqual(['W 40×10', 'W —', '1 100×5', '2 100×5', '3 100×5']);
    await useActiveWorkout.getState().discard();
    await logBench(R1, 'Push 1', [], [[105, 5], [105, 5], [105, 5]]);
    await useActiveWorkout.getState().startFromPlanDay(R1);
    expect(await previousColumn()).toEqual(['W —', 'W —', '1 105×5', '2 105×5', '3 105×5']);
    await useActiveWorkout.getState().discard();
  });

  it('an easy-week workout is skipped for warm-ups as for working sets', async () => {
    await logBench(R1, 'Push 1', [[40, 10], [60, 5]], [[100, 5], [100, 5], [100, 5]]);
    await logBench(R1, 'Push 1', [[30, 10]], [[80, 5], [80, 5]], { easy: true });
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlanDay(R1);
    expect(await previousColumn()).toEqual(['W 40×10', 'W 60×5', '1 100×5', '2 100×5', '3 100×5']);
    await useActiveWorkout.getState().discard();
  });

  it('Same routine: warm-ups come from that routine’s last workout', async () => {
    await logBench(R1, 'Push 1', [[40, 10], [60, 5]], [[100, 5], [100, 5], [100, 5]]);
    await logBench(R2, 'Push 2', [[50, 8]], [[110, 3], [110, 3], [110, 3]]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await setting('routine');
    await useActiveWorkout.getState().startFromPlanDay(R1);
    expect(await previousColumn()).toEqual(['W 40×10', 'W 60×5', '1 100×5', '2 100×5', '3 100×5']);
    await useActiveWorkout.getState().discard();
    await useActiveWorkout.getState().startFromPlanDay(R2);
    expect(await previousColumn()).toEqual(['W 50×8', 'W —', '1 110×3', '2 110×3', '3 110×3']);
    await useActiveWorkout.getState().discard();
    // Any workout: the newest (Push 2's) for both.
    await setting('any');
    await useActiveWorkout.getState().startFromPlanDay(R1);
    expect(await previousColumn()).toEqual(['W 50×8', 'W —', '1 110×3', '2 110×3', '3 110×3']);
    await useActiveWorkout.getState().discard();
  });

  it('a back-off card reads its own card’s warm-ups, the heavy card its own', async () => {
    await logBench(R1, 'Push 1', [[40, 10], [60, 5]], [[100, 5], [100, 5], [100, 5]], {
      backoff: { warmups: [[70, 3]], working: [[80, 10], [80, 10]] },
    });
    const { useActiveWorkout, prevForSet } = await import('@/tracker/store/activeWorkoutStore');
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    const ex = (await getExerciseById(bench))!;
    useActiveWorkout.getState().startEmpty();
    await useActiveWorkout.getState().addExercises([ex, ex]);
    const [heavy, back] = useActiveWorkout.getState().exercises;
    expect(heavy.previousWarmups).toEqual([{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 5 }]);
    expect(back.previousWarmups).toEqual([{ weightKg: 70, reps: 3 }]);
    expect(back.previousSets.map((p) => p.weightKg)).toEqual([80, 80]);
    useActiveWorkout.getState().insertWarmupSets(back.key, [{ weightKg: 0, reps: 0 }]);
    const b = useActiveWorkout.getState().exercises[1];
    expect(prevForSet(b, b.sets.find((s) => s.isWarmup)!.key)).toEqual({ weightKg: 70, reps: 3 });
    await useActiveWorkout.getState().discard();
  });

  it('a change of counting converts warm-ups as it converts working sets', async () => {
    await logBench(R1, 'Push 1', [[40, 10], [60, 5]], [[100, 5], [100, 5], [100, 5]]);
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlanDay(R1);
    const card = useActiveWorkout.getState().exercises[0];
    useActiveWorkout.getState().setLoadMode(card.key, 'both');
    const now = useActiveWorkout.getState().exercises[0];
    expect(now.previousSets[0].weightKg).toBe(50);
    expect(now.previousWarmups).toEqual([{ weightKg: 20, reps: 10 }, { weightKg: 30, reps: 5 }]);
    await useActiveWorkout.getState().discard();
  });

  it('editing a past workout: its W rows read the warm-ups of the workout before it', async () => {
    await logBench(R1, 'Push 1', [[40, 10], [60, 5]], [[100, 5], [100, 5], [100, 5]], { daysAgo: 3 });
    const second = await logBench(R1, 'Push 1', [[45, 10]], [[102.5, 5], [102.5, 5], [102.5, 5]], { daysAgo: 2 });
    await logBench(R1, 'Push 1', [[50, 10]], [[105, 5], [105, 5], [105, 5]], { daysAgo: 1 }); // later: never read
    const { getSessionDetail } = await import('@/db/repos/workoutRepo');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startEditingSession((await getSessionDetail(second))!);
    expect(await previousColumn()).toEqual(['W 40×10', '1 100×5', '2 100×5', '3 100×5']);
    await useActiveWorkout.getState().discard();
  });
});

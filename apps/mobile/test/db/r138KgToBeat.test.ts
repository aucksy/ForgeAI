/**
 * R-138 (owner, 27 Oct 2026): the "kg to beat" line read a DIFFERENT last time than the PREVIOUS
 * column on the same card. His case, against REAL SQL (test/helpers/realDb.ts):
 *   one folder, routines "Push 1" and "Push 2", both with the same lift (20 kg, 4 sets);
 *   13 Oct Push 2: 20 x 19, 15, 15, 14; 20 Oct Push 1: 20 x 19, 16, 15, 14; 27 Oct he starts Push 2.
 * PREVIOUS showed 20 Oct (19, 16, 15, 14) but the Target said "Last time 19, 15, 15, 14 ... aim for
 * 20, 15, 15, 14" = 1,280 kg: exactly what PREVIOUS already shows, so it asked for no progress.
 * Cause: under "Any workout" the Target read the routine's OWN last time first (C3-3 / R-61) while
 * PREVIOUS read the newest workout anywhere. Fixed: under "Any workout" both read the newest
 * workout; "Same routine" keeps both on the routine's own last time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreviousFrom } from '@/tracker/store/trackerPrefsStore';
import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let lift: string;
let P1: string;
let P2: string;
let clock: number;

async function setting(v: PreviousFrom): Promise<void> {
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.getState().setPreviousFrom(v);
}

function daysAgo(n: number, today: string): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One workout of the lift from `routineId`, `ago` days back, one set per entry of `reps`. */
async function log(routineId: string, title: string, ago: number, weightKg: number, reps: number[]): Promise<void> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { getDb } = await import('@/db');
  const { todayISO } = await import('@/lib/date');
  clock += 60_000;
  const s = await createSession({ dateISO: daysAgo(ago, todayISO()), dayType: 'push', source: 'manual', startedAt: clock });
  await addSetsWithMeta(
    s.id,
    reps.map((r) => ({ exerciseId: lift, weightKg, reps: r, isWarmup: false })),
  );
  await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [routineId, title, s.id]);
}

beforeEach(async () => {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
  useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
  lift = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const row = { exerciseId: lift, sets: 4, repMin: 10, repMax: 20 };
  const folder = await createFolderWithRoutines('Gym', [
    { name: 'Push 1', dayType: 'push', exercises: [row] },
    { name: 'Push 2', dayType: 'push', exercises: [row] },
  ]);
  const idOf = (name: string): string =>
    db.all<{ id: string }>('SELECT id FROM plan_days WHERE plan_id = ? AND name = ?', [folder, name])[0].id;
  P1 = idOf('Push 1');
  P2 = idOf('Push 2');
  clock = Number(db.all<{ t: number | null }>('SELECT MAX(started_at) AS t FROM workout_sessions')[0].t ?? Date.now() - 86_400_000);
  await log(P2, 'Push 2', 14, 20, [19, 15, 15, 14]);
  await log(P1, 'Push 1', 7, 20, [19, 16, 15, 14]);
});

/** Starts Push 2 and returns its card's PREVIOUS and Target. */
async function startPush2() {
  const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
  const { useTargets } = await import('@/tracker/store/targetStore');
  await useActiveWorkout.getState().startFromPlanDay(P2);
  const card = useActiveWorkout.getState().exercises[0];
  const target = useTargets.getState().targets.get(card.key) as import('@/tracker/services/coachTargets').KgTarget | undefined;
  return { card, target, discard: () => useActiveWorkout.getState().discard() };
}

describe('R-138: the kg to beat and PREVIOUS read the same last time', () => {
  it('Any workout: Push 2 after Push 1 — Target, its kg line and PREVIOUS all read 20 Oct (19, 16, 15, 14)', async () => {
    await setting('any');
    const { card, target, discard } = await startPush2();
    expect(card.previousSets.map((p) => p.reps)).toEqual([19, 16, 15, 14]);
    expect(target).toBeDefined();
    expect(target!.last?.dateISO).toBe(card.lastFrom?.dateISO);
    expect(target!.lastSets?.map((s) => s.reps)).toEqual([19, 16, 15, 14]);
    await discard();
  });

  it('Same routine: both read Push 2’s own last time (19, 15, 15, 14)', async () => {
    await setting('routine');
    const { card, target, discard } = await startPush2();
    expect(card.previousSets.map((p) => p.reps)).toEqual([19, 15, 15, 14]);
    expect(target!.last?.dateISO).toBe(card.lastFrom?.dateISO);
    expect(target!.lastSets?.map((s) => s.reps)).toEqual([19, 15, 15, 14]);
    await discard();
  });

  it('the plan never aims below (or at) last time’s total when it has the same sets', async () => {
    const { kgPlan } = await import('@/tracker/lib/kgTarget');
    for (const v of ['any', 'routine'] as const) {
      await setting(v);
      const { card, target, discard } = await startPush2();
      const shown = card.previousSets.map((p) => ({ weightKg: p.weightKg ?? 0, reps: p.reps ?? 0 }));
      const plan = kgPlan(target!, target!.lastSets ?? [])!;
      expect(plan).not.toBeNull();
      const shownTotal = shown.reduce((a, s) => a + s.weightKg * s.reps, 0);
      // Against what the card's PREVIOUS column shows, not a hidden other copy of last time.
      expect(plan.last).toBe(shownTotal);
      expect(plan.total).toBeGreaterThan(shownTotal);
      // And set by set: never below last time's reps at the same weight.
      plan.sets.forEach((s, i) => {
        if (s.weightKg === shown[i].weightKg) expect(s.reps).toBeGreaterThanOrEqual(shown[i].reps);
      });
      await discard();
    }
  });
});

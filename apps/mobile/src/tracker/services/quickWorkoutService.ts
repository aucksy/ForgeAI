/**
 * F60 Quick workout: the reads and the start. The picking is PURE in `plans/quickWorkout.ts`.
 */
import { getExerciseById } from '@/db/repos/exerciseRepo';
import { getProfile } from '@/db/repos/userRepo';
import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import type { Exercise, Goal } from '@/types/models';

import { exerciseIdsForKeys } from '../db/folderRepo';
import type { Level } from '../plans/builder';
import type { FitContext } from '../plans/fit';
import type { QuickHistory, QuickWorkout } from '../plans/quickWorkout';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { swapContextFor } from './plansService';

/** How far back "done before" looks. */
export const QUICK_HISTORY_DAYS = 180;

interface HistRow {
  k: string;
  workout_id: string;
  d: string;
  w: number;
  r: number;
}

/** Each library exercise the member did in the window: last time's best set and how often. PURE. */
export function quickHistoryOf(rows: readonly HistRow[]): Map<string, QuickHistory> {
  // Rows come newest workout first; the first workout seen for a key is its last time.
  const out = new Map<string, QuickHistory & { lastWorkout: string; workouts: Set<string> }>();
  for (const x of rows) {
    let h = out.get(x.k);
    if (!h) {
      h = { lastISO: x.d, times: 0, lastKg: x.w, lastReps: x.r, lastWorkout: x.workout_id, workouts: new Set() };
      out.set(x.k, h);
    } else if (x.workout_id === h.lastWorkout && (x.w > h.lastKg || (x.w === h.lastKg && x.r > h.lastReps))) {
      h.lastKg = x.w;
      h.lastReps = x.r;
    }
    h.workouts.add(x.workout_id);
    h.times = h.workouts.size;
  }
  return new Map([...out].map(([k, h]) => [k, { lastISO: h.lastISO, times: h.times, lastKg: h.lastKg, lastReps: h.lastReps }]));
}

export async function getQuickHistory(today: string = todayISO()): Promise<Map<string, QuickHistory>> {
  const rows = await getDb().getAllAsync<HistRow>(
    `SELECT e.catalog_key AS k, ws.id AS workout_id, ws.date_iso AS d, se.weight_kg AS w, se.reps AS r
       FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
       JOIN exercises e ON e.id = se.exercise_id
      WHERE se.is_warmup = 0 AND e.catalog_key IS NOT NULL AND ws.date_iso >= ?
      ORDER BY ws.started_at DESC`,
    [addDays(today, -QUICK_HISTORY_DAYS)],
  );
  return quickHistoryOf(rows);
}

export interface QuickSetup extends FitContext {
  level: Level;
  goal: Goal;
}

/** Equipment, sore areas and "never" list from the followed plan (a full gym without one); level and goal from the profile. */
export async function getQuickSetup(): Promise<QuickSetup> {
  const [ctx, profile] = await Promise.all([swapContextFor(null), getProfile().catch(() => null)]);
  return { ...ctx, goal: profile?.goal ?? 'muscle' };
}

/** Start the quick workout as a normal workout (weights from last time, as an added exercise). */
export async function startQuickWorkout(quick: QuickWorkout): Promise<void> {
  const ids = await exerciseIdsForKeys(quick.exercises.map((x) => x.key));
  const items: { exercise: Exercise; sets: number }[] = [];
  for (const x of quick.exercises) {
    const id = ids.get(x.key);
    const ex = id ? await getExerciseById(id) : null;
    if (ex) items.push({ exercise: ex, sets: x.sets });
  }
  if (items.length === 0) throw new Error('quick workout: no exercise could be found on this phone');
  await useActiveWorkout.getState().startQuick(quick.name, items);
}

/**
 * Writable routine editor — CRUD over the FROZEN plan tables
 * (`workout_plans` / `plan_days` / `plan_exercises`). No schema change; this is
 * purely a new write path the frozen `planRepo` (read-only `getActivePlan`) lacks.
 *
 * Model (owner decision 2026-07-09): a "routine" == one `plan_day` inside the
 * single ACTIVE plan. Editing days keeps the frozen rotation engine intact —
 * `getActivePlan` / `services/coach.getTodaysWorkout` continue to read exactly the
 * same rows. Reads reuse the frozen `getActivePlan`; only writes live here.
 */
import { getDb } from '@/db';
import { getActivePlan } from '@/db/repos/planRepo';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { uuid } from '@/lib/uuid';
import type { DayType } from '@/types/models';

/** Day types offered in the editor (rotation days — 'rest' isn't a startable routine). */
export const ROUTINE_DAY_TYPES: DayType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full'];

/**
 * Serialize transaction-wrapped writes. Two `withTransactionAsync` calls that
 * overlap on the shared connection would nest BEGINs ("cannot start a transaction
 * within a transaction") and the inner ROLLBACK would abort BOTH — e.g. rapid
 * reorder taps. Chaining guarantees one runs fully before the next begins;
 * last-enqueued wins, matching the caller's optimistic UI order.
 */
let opChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.catch(() => undefined);
  return run;
}

/**
 * The id of the active plan, creating an empty one if none exists (e.g. a wiped
 * install). Only ever ONE plan is active — frozen `getActivePlan` does
 * `WHERE is_active = 1 LIMIT 1`, so we deactivate any strays before inserting.
 */
export async function ensureActivePlanId(): Promise<string> {
  const db = getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workout_plans WHERE is_active = 1 LIMIT 1',
  );
  if (row) return row.id;
  const id = uuid();
  await db.runAsync('UPDATE workout_plans SET is_active = 0');
  await db.runAsync('INSERT INTO workout_plans(id, name, is_active) VALUES(?, ?, 1)', [
    id,
    'My Routines',
  ]);
  return id;
}

/** All routines (= the active plan's days), ordered by day_order. Reuses the frozen read. */
export async function listRoutines(): Promise<PlanDayFull[]> {
  const active = await getActivePlan();
  return active ? active.days : [];
}

/** One routine (day) with its exercises, or null. */
export async function getRoutine(dayId: string): Promise<PlanDayFull | null> {
  const active = await getActivePlan();
  if (!active) return null;
  return active.days.find((d) => d.id === dayId) ?? null;
}

/** Create a new empty routine at the end of the active plan; returns its id. */
export async function createRoutine(input: { name: string; dayType: DayType }): Promise<string> {
  const db = getDb();
  const planId = await ensureActivePlanId();
  const maxRow = await db.getFirstAsync<{ max_o: number | null }>(
    'SELECT MAX(day_order) AS max_o FROM plan_days WHERE plan_id = ?',
    [planId],
  );
  const order = (maxRow?.max_o ?? -1) + 1;
  const id = uuid();
  await db.runAsync(
    'INSERT INTO plan_days(id, plan_id, day_type, day_order, name) VALUES(?, ?, ?, ?, ?)',
    [id, planId, input.dayType, order, input.name.trim() || 'Routine'],
  );
  return id;
}

/** Rename / retype a routine. */
export async function updateRoutine(
  dayId: string,
  patch: { name?: string; dayType?: DayType },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.name != null) {
    sets.push('name = ?');
    args.push(patch.name.trim() || 'Routine');
  }
  if (patch.dayType != null) {
    sets.push('day_type = ?');
    args.push(patch.dayType);
  }
  if (sets.length === 0) return;
  await getDb().runAsync(`UPDATE plan_days SET ${sets.join(', ')} WHERE id = ?`, [...args, dayId]);
}

/** Delete a routine. Its plan_exercises cascade (FK ON DELETE CASCADE, PRAGMA foreign_keys=ON). */
export async function deleteRoutine(dayId: string): Promise<void> {
  await getDb().runAsync('DELETE FROM plan_days WHERE id = ?', [dayId]);
}

/** Clone a routine (name + " (copy)") with all its exercises; returns the new id. */
export async function duplicateRoutine(dayId: string): Promise<string> {
  const db = getDb();
  const day = await db.getFirstAsync<{ day_type: string; name: string }>(
    'SELECT day_type, name FROM plan_days WHERE id = ?',
    [dayId],
  );
  if (!day) throw new Error(`Routine not found: ${dayId}`);
  const newId = await createRoutine({ name: `${day.name} (copy)`, dayType: day.day_type as DayType });
  const exRows = await db.getAllAsync<{
    exercise_id: string;
    ex_order: number;
    target_sets: number;
    rep_range_min: number;
    rep_range_max: number;
  }>(
    `SELECT exercise_id, ex_order, target_sets, rep_range_min, rep_range_max
     FROM plan_exercises WHERE plan_day_id = ? ORDER BY ex_order ASC`,
    [dayId],
  );
  for (const r of exRows) {
    await db.runAsync(
      `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), newId, r.exercise_id, r.ex_order, r.target_sets, r.rep_range_min, r.rep_range_max],
    );
  }
  return newId;
}

/** Persist a new day order (call with the full, reordered list of day ids). */
export async function reorderRoutines(orderedDayIds: string[]): Promise<void> {
  const db = getDb();
  await serialize(() =>
    db.withTransactionAsync(async () => {
      for (let i = 0; i < orderedDayIds.length; i++) {
        await db.runAsync('UPDATE plan_days SET day_order = ? WHERE id = ?', [i, orderedDayIds[i]]);
      }
    }),
  );
}

// ---------------------------------------------------------------- exercises in a routine

/** Append an exercise to a routine (sensible target defaults); returns the plan_exercise id. */
export async function addExerciseToRoutine(
  dayId: string,
  exerciseId: string,
  opts?: { targetSets?: number; repRangeMin?: number; repRangeMax?: number },
): Promise<string> {
  const db = getDb();
  const maxRow = await db.getFirstAsync<{ max_o: number | null }>(
    'SELECT MAX(ex_order) AS max_o FROM plan_exercises WHERE plan_day_id = ?',
    [dayId],
  );
  const order = (maxRow?.max_o ?? -1) + 1;
  const id = uuid();
  await db.runAsync(
    `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [id, dayId, exerciseId, order, opts?.targetSets ?? 3, opts?.repRangeMin ?? 8, opts?.repRangeMax ?? 12],
  );
  return id;
}

/** Update a routine exercise's target sets / rep range. Values are clamped by callers. */
export async function updateRoutineExercise(
  peId: string,
  patch: { targetSets?: number; repRangeMin?: number; repRangeMax?: number },
): Promise<void> {
  const sets: string[] = [];
  const args: number[] = [];
  if (patch.targetSets != null) {
    sets.push('target_sets = ?');
    args.push(patch.targetSets);
  }
  if (patch.repRangeMin != null) {
    sets.push('rep_range_min = ?');
    args.push(patch.repRangeMin);
  }
  if (patch.repRangeMax != null) {
    sets.push('rep_range_max = ?');
    args.push(patch.repRangeMax);
  }
  if (sets.length === 0) return;
  await getDb().runAsync(`UPDATE plan_exercises SET ${sets.join(', ')} WHERE id = ?`, [...args, peId]);
}

/** Remove an exercise from a routine. */
export async function removeRoutineExercise(peId: string): Promise<void> {
  await getDb().runAsync('DELETE FROM plan_exercises WHERE id = ?', [peId]);
}

/** Persist a new exercise order within a routine (full reordered list of plan_exercise ids). */
export async function reorderRoutineExercises(dayId: string, orderedPeIds: string[]): Promise<void> {
  const db = getDb();
  await serialize(() =>
    db.withTransactionAsync(async () => {
      for (let i = 0; i < orderedPeIds.length; i++) {
        await db.runAsync('UPDATE plan_exercises SET ex_order = ? WHERE id = ? AND plan_day_id = ?', [
          i,
          orderedPeIds[i],
          dayId,
        ]);
      }
    }),
  );
}

// ---------------------------------------------------------------- Phase 1: update from a workout

/**
 * Rewrite a routine to match a finished workout ("Update routine?" → yes):
 * exercise list and order follow the workout; an exercise already in the routine
 * keeps its rep range and takes the workout's set count (when it had sets); a new
 * exercise is added with the usual 8–12 range. One transaction — all or nothing.
 */
export async function syncRoutineToWorkout(
  dayId: string,
  items: { exerciseId: string; workingSets: number }[],
): Promise<void> {
  const db = getDb();
  await serialize(() =>
    db.withTransactionAsync(async () => {
      const existing = await db.getAllAsync<{ id: string; exercise_id: string; target_sets: number }>(
        'SELECT id, exercise_id, target_sets FROM plan_exercises WHERE plan_day_id = ? ORDER BY ex_order ASC',
        [dayId],
      );
      // Rows matched by OCCURRENCE per lift, so a routine that has the same exercise
      // twice on purpose (Bench, then Bench back-off) keeps both rows: the workout's
      // 1st Bench updates the routine's 1st Bench row, the 2nd the 2nd.
      const queues = new Map<string, { id: string; target_sets: number }[]>();
      for (const r of existing) {
        const q = queues.get(r.exercise_id) ?? [];
        q.push(r);
        queues.set(r.exercise_id, q);
      }
      const keep = new Set<string>();
      let order = 0;
      for (const it of items) {
        const row = queues.get(it.exerciseId)?.shift();
        if (row) {
          keep.add(row.id);
          const sets = it.workingSets > 0 ? it.workingSets : row.target_sets;
          await db.runAsync('UPDATE plan_exercises SET ex_order = ?, target_sets = ? WHERE id = ?', [order, sets, row.id]);
        } else {
          await db.runAsync(
            `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max)
             VALUES(?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), dayId, it.exerciseId, order, Math.max(1, it.workingSets || 3), 8, 12],
          );
        }
        order += 1;
      }
      for (const r of existing) {
        if (!keep.has(r.id)) await db.runAsync('DELETE FROM plan_exercises WHERE id = ?', [r.id]);
      }
    }),
  );
}

/** "Save as routine" from a logged workout: a new routine with its exercises and set counts. */
export async function createRoutineFromWorkout(input: {
  name: string;
  dayType: DayType;
  items: { exerciseId: string; workingSets: number }[];
}): Promise<string> {
  const id = await createRoutine({ name: input.name, dayType: input.dayType });
  await syncRoutineToWorkout(id, input.items);
  return id;
}

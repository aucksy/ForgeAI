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
import { enqueueWrite } from '@/db/writeQueue';
import { getExerciseById } from '@/db/repos/exerciseRepo';
import { getActivePlan } from '@/db/repos/planRepo';
import { getRoutineAnywhere, myRoutinesFolderIdUnqueued, type RoutineFull } from '@/tracker/db/folderRepo';
import {
  MAX_ROUTINE_SETS,
  parsePlanSets,
  planSetsJson,
  resizeWorking,
  withTypes,
  workingCount,
  type PlanSet,
  type PlanSetType,
} from '@/tracker/plans/routineSets';
import { getProfile } from '@/db/repos/userRepo';
import { defaultRepRange } from '@/tracker/engine/repRanges';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { uuid } from '@/lib/uuid';
import type { DayType, Goal, UserProfile } from '@/types/models';

/** Day types offered in the editor (rotation days — 'rest' isn't a startable routine). */
export const ROUTINE_DAY_TYPES: DayType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full'];

/**
 * Transaction-wrapped writes go through the ONE app-wide write queue (DS-04). Two
 * `withTransactionAsync` calls that overlap on the shared connection would nest BEGINs and
 * the inner ROLLBACK would abort BOTH — e.g. rapid reorder taps, or a reorder during a
 * history import. FIFO: last-enqueued wins, matching the caller's optimistic UI order.
 */
const serialize = enqueueWrite;
// Single statements too: an unqueued write issued while an import's transaction is open runs
// INSIDE it and is rolled back with it. Nothing here is called from inside a queued job, except
// `createRoutineUnqueued` (by `duplicateRoutine`'s own job).

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

/**
 * One routine (day) with its exercises, or null. Phase 4: from ANY folder — a routine in a
 * folder the member does not follow still opens, starts and gets its Target line.
 */
export async function getRoutine(dayId: string): Promise<RoutineFull | null> {
  return getRoutineAnywhere(dayId);
}

/**
 * Create a new empty routine at the end of a folder; returns its id. With no folder given it
 * goes to "My routines" (RP-08) — never silently into the followed plan, and never a new plan
 * that is followed by itself.
 */
export function createRoutine(input: { name: string; dayType: DayType; folderId?: string | null }): Promise<string> {
  return serialize(() => createRoutineUnqueued(input));
}

/** `createRoutine` for a caller already inside a queued job. */
async function createRoutineUnqueued(input: { name: string; dayType: DayType; folderId?: string | null }): Promise<string> {
  const db = getDb();
  const planId = input.folderId ?? (await myRoutinesFolderIdUnqueued());
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
  await serialize(() => getDb().runAsync(`UPDATE plan_days SET ${sets.join(', ')} WHERE id = ?`, [...args, dayId]));
}

/** Delete a routine. Its plan_exercises cascade (FK ON DELETE CASCADE, PRAGMA foreign_keys=ON). */
export async function deleteRoutine(dayId: string): Promise<void> {
  await serialize(() => getDb().runAsync('DELETE FROM plan_days WHERE id = ?', [dayId]));
}

/**
 * Clone a routine (name + " (copy)") with all its exercises — sets, rest, supersets and notes
 * too; returns the new id. It goes to `folderId` when given; otherwise to the same folder, unless
 * that folder is the followed plan — then to "My routines" (RP-08: a copy never silently joins
 * the plan's rotation).
 */
export function duplicateRoutine(dayId: string, folderId?: string | null): Promise<string> {
  return serialize(() => duplicateRoutineUnqueued(dayId, folderId ?? null));
}

async function duplicateRoutineUnqueued(dayId: string, folderId: string | null): Promise<string> {
  const db = getDb();
  const day = await db.getFirstAsync<{ day_type: string; name: string; plan_id: string; is_active: number }>(
    `SELECT pd.day_type, pd.name, pd.plan_id, wp.is_active
       FROM plan_days pd JOIN workout_plans wp ON wp.id = pd.plan_id WHERE pd.id = ?`,
    [dayId],
  );
  if (!day) throw new Error(`Routine not found: ${dayId}`);
  const target = folderId ?? (day.is_active === 1 ? await myRoutinesFolderIdUnqueued() : day.plan_id);
  const newId = await createRoutineUnqueued({ name: `${day.name} (copy)`, dayType: day.day_type as DayType, folderId: target });
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM plan_exercises WHERE plan_day_id = ? ORDER BY ex_order ASC', [dayId]);
  for (const r of rows) {
    await db.runAsync(
      `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max,
                                  sets_json, rest_sec, superset_group, note)
       SELECT ?, ?, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec, superset_group, note
         FROM plan_exercises WHERE id = ?`,
      [uuid(), newId, r.id],
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

/**
 * Default rep range per exercise for NEW routine rows, from the member's goal and the
 * exercise kind (`tracker/engine/repRanges.ts`). Read before any transaction opens.
 */
async function defaultRangesFor(
  exerciseIds: string[],
): Promise<Map<string, { repRangeMin: number; repRangeMax: number }>> {
  let goal: Goal | null = null;
  let experience: UserProfile['experience'] | null = null;
  try {
    const p = await getProfile();
    goal = p.goal;
    experience = p.experience;
  } catch {
    // no profile yet — defaultRepRange falls back to 8–12
  }
  const out = new Map<string, { repRangeMin: number; repRangeMax: number }>();
  for (const id of new Set(exerciseIds)) {
    const ex = await getExerciseById(id);
    out.set(id, ex ? defaultRepRange(ex, goal, experience) : { repRangeMin: 8, repRangeMax: 12 });
  }
  return out;
}

/** Append an exercise to a routine (rep range from goal × exercise kind unless given); returns the plan_exercise id. */
export async function addExerciseToRoutine(
  dayId: string,
  exerciseId: string,
  opts?: { targetSets?: number; repRangeMin?: number; repRangeMax?: number },
): Promise<string> {
  const db = getDb();
  const id = uuid();
  const def = (await defaultRangesFor([exerciseId])).get(exerciseId) ?? { repRangeMin: 8, repRangeMax: 12 };
  // Only one end given (e.g. the coach says "max 6"): the default fills the other end
  // without crossing it, so the range stays valid.
  const repMin = opts?.repRangeMin ?? Math.min(def.repRangeMin, opts?.repRangeMax ?? def.repRangeMin);
  const repMax = Math.max(repMin, opts?.repRangeMax ?? def.repRangeMax);
  await serialize(async () => {
    // The position is read inside the job, so two quick adds never take the same place.
    const maxRow = await db.getFirstAsync<{ max_o: number | null }>(
      'SELECT MAX(ex_order) AS max_o FROM plan_exercises WHERE plan_day_id = ?',
      [dayId],
    );
    const order = (maxRow?.max_o ?? -1) + 1;
    await db.runAsync(
      `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [id, dayId, exerciseId, order, opts?.targetSets ?? 3, repMin, repMax],
    );
  });
  return id;
}

/** RP-19: what else the editor can change on a routine row. */
export interface RoutineExercisePatch {
  targetSets?: number;
  repRangeMin?: number;
  repRangeMax?: number;
  /** The whole set list (types, targets); the set count follows it. */
  sets?: PlanSet[] | null;
  /** null = the exercise's own rest. */
  restSec?: number | null;
  supersetGroup?: number | null;
  note?: string | null;
}

/**
 * Update a routine exercise: sets, rep range, set list, rest, superset, note. Values are clamped
 * by callers. A new set count on a row with its own set list resizes that list (warm-ups and
 * the remaining sets keep their types). Awaited by the editor, which says when it fails (RP-15).
 */
export async function updateRoutineExercise(peId: string, patch: RoutineExercisePatch): Promise<void> {
  const sets: string[] = [];
  const args: (number | string | null)[] = [];
  if (patch.sets !== undefined) {
    sets.push('sets_json = ?', 'target_sets = ?');
    args.push(planSetsJson(patch.sets), Math.max(1, Math.min(MAX_ROUTINE_SETS, patch.sets ? workingCount(patch.sets) : patch.targetSets ?? 1)));
  } else if (patch.targetSets != null) {
    sets.push('target_sets = ?');
    args.push(patch.targetSets);
  }
  if (patch.restSec !== undefined) {
    sets.push('rest_sec = ?');
    args.push(patch.restSec != null && patch.restSec >= 0 ? Math.round(patch.restSec) : null);
  }
  if (patch.supersetGroup !== undefined) {
    sets.push('superset_group = ?');
    args.push(patch.supersetGroup);
  }
  if (patch.note !== undefined) {
    sets.push('note = ?');
    args.push(patch.note?.trim() ? patch.note.trim() : null);
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
  await serialize(async () => {
    const db = getDb();
    if (patch.sets === undefined && patch.targetSets != null) {
      // A row with its own set list: the list is resized, so the two never disagree.
      const row = await db.getFirstAsync<{ sets_json: string | null }>('SELECT sets_json FROM plan_exercises WHERE id = ?', [peId]);
      const list = parsePlanSets(row?.sets_json);
      if (list) {
        sets.push('sets_json = ?');
        args.push(planSetsJson(resizeWorking(list, patch.targetSets)));
      }
    }
    await db.runAsync(`UPDATE plan_exercises SET ${sets.join(', ')} WHERE id = ?`, [...args, peId]);
  });
}

/**
 * Phase 4 swap "for good": another exercise takes this one's place in the routine, with the
 * same sets and rep range (the member's own numbers are never reset).
 */
export async function replaceRoutineExercise(peId: string, exerciseId: string): Promise<void> {
  await serialize(() => getDb().runAsync('UPDATE plan_exercises SET exercise_id = ? WHERE id = ?', [exerciseId, peId]));
}

/** Remove an exercise from a routine. */
export async function removeRoutineExercise(peId: string): Promise<void> {
  await serialize(() => getDb().runAsync('DELETE FROM plan_exercises WHERE id = ?', [peId]));
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
 * exercise is added with the default range for the member's goal and its kind.
 * One transaction — all or nothing.
 */
export async function syncRoutineToWorkout(dayId: string, items: RoutineSyncItem[]): Promise<void> {
  const db = getDb();
  const defaults = await defaultRangesFor(items.map((it) => it.exerciseId));
  await serialize(() =>
    db.withTransactionAsync(async () => {
      const existing = await db.getAllAsync<{ id: string; exercise_id: string; target_sets: number; sets_json: string | null }>(
        'SELECT id, exercise_id, target_sets, sets_json FROM plan_exercises WHERE plan_day_id = ? ORDER BY ex_order ASC',
        [dayId],
      );
      // Rows matched by OCCURRENCE per lift, so a routine that has the same exercise
      // twice on purpose (Bench, then Bench back-off) keeps both rows: the workout's
      // 1st Bench updates the routine's 1st Bench row, the 2nd the 2nd.
      const queues = new Map<string, { id: string; target_sets: number; sets_json: string | null }[]>();
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
          const old = parsePlanSets(row.sets_json);
          let sets = it.workingSets > 0 ? it.workingSets : row.target_sets;
          let json = old ? planSetsJson(resizeWorking(old, sets)) : null;
          // RP-19: the set types as done (warm-ups, drops, failure) — only when the member changed
          // them; each kept set keeps its target.
          if (it.typesChanged && it.types && it.types.length > 0) {
            const list = withTypes(old ?? [], it.types);
            json = planSetsJson(list);
            sets = Math.max(1, workingCount(list));
          }
          await db.runAsync('UPDATE plan_exercises SET ex_order = ?, target_sets = ?, sets_json = ? WHERE id = ?', [order, sets, json, row.id]);
          await writeExtras(row.id, it);
        } else {
          // RP-20: an added exercise keeps the rows the member did (not 3); its warm-ups and
          // drops come too.
          const list = it.types && it.types.length > 0 ? withTypes([], it.types) : null;
          const count = list ? workingCount(list) : it.workingSets || it.rows || 3;
          const id = uuid();
          await db.runAsync(
            `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              dayId,
              it.exerciseId,
              order,
              Math.max(1, Math.min(MAX_ROUTINE_SETS, count)),
              defaults.get(it.exerciseId)?.repRangeMin ?? 8,
              defaults.get(it.exerciseId)?.repRangeMax ?? 12,
              planSetsJson(list),
            ],
          );
          await writeExtras(id, it);
        }
        order += 1;
      }
      for (const r of existing) {
        if (!keep.has(r.id)) await db.runAsync('DELETE FROM plan_exercises WHERE id = ?', [r.id]);
      }
    }),
  );
}

/** One exercise of a finished workout, for `syncRoutineToWorkout`. */
export interface RoutineSyncItem {
  exerciseId: string;
  /** Working rows when the member added or removed rows; 0 = keep the routine's count. */
  workingSets: number;
  /** RP-20: the working rows on screen (used for an exercise the routine did not have). */
  rows?: number;
  /** RP-19: the rows' types in order (absent = keep the routine's list). */
  types?: PlanSetType[];
  /**
   * The member changed the types of a routine exercise's rows. Without it `types` only shapes an
   * exercise the routine did not have — a card opened with last time's drop sets is no new plan.
   */
  typesChanged?: boolean;
  /** The rest to keep in this routine (undefined = leave as it is; null = the exercise's own). */
  restSec?: number | null;
  /** The superset it was in (undefined = leave as it is; null = none). */
  supersetGroup?: number | null;
  /** The note to keep (undefined = leave as it is; null = none). */
  note?: string | null;
}

/** The extras of one row (inside the caller's job). */
async function writeExtras(peId: string, it: RoutineSyncItem): Promise<void> {
  const cols: string[] = [];
  const args: (string | number | null)[] = [];
  if (it.restSec !== undefined) {
    cols.push('rest_sec = ?');
    args.push(it.restSec != null && it.restSec >= 0 ? Math.round(it.restSec) : null);
  }
  if (it.supersetGroup !== undefined) {
    cols.push('superset_group = ?');
    args.push(it.supersetGroup);
  }
  if (it.note !== undefined) {
    cols.push('note = ?');
    args.push(it.note?.trim() ? it.note.trim() : null);
  }
  if (cols.length > 0) await getDb().runAsync(`UPDATE plan_exercises SET ${cols.join(', ')} WHERE id = ?`, [...args, peId]);
}

/**
 * "Save as routine" from a logged workout: a new routine with its exercises and set counts. It
 * goes to `folderId`, else to "My routines" — never silently into the followed plan (RP-08).
 */
export async function createRoutineFromWorkout(input: {
  name: string;
  dayType: DayType;
  items: RoutineSyncItem[];
  folderId?: string | null;
}): Promise<string> {
  const id = await createRoutine({ name: input.name, dayType: input.dayType, folderId: input.folderId ?? null });
  await syncRoutineToWorkout(id, input.items);
  return id;
}

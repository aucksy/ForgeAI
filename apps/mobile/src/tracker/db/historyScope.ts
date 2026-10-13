/**
 * "Previous values" (Settings → Workouts, 13 Oct 2026) — which past workouts an exercise's
 * numbers come from in the live workout. Hevy's "Previous Workout Values" (any workout / same
 * routine), plus the owner's "Same folder": he keeps one folder per gym, so Push 1A and Push 1B
 * of one folder share numbers and another gym's folder never leaks in.
 *
 * A scope is the routines it covers (ids) and their names (as `nameKey` compares them). A
 * workout is IN scope when:
 *  - its `routine_id` is one of the routines; OR
 *  - it has no known routine (`routine_id` NULL: older or imported workouts) or its routine
 *    exists in no folder any more, AND its name (its title; an old import with no title: the
 *    first line of its notes) is one of the names — the same rule "Today" places a workout by
 *    (`plans/todayPlan.ts` placeSession steps 1–2), with its normalisation;
 *  - an empty workout (`routine_id` '') never is.
 * No scope (null) = every workout, as before: the setting is "Any workout", the workout has no
 * routine (an empty workout), or its routine cannot be found.
 *
 * Scoped (the live workout's past numbers): PREVIOUS and the rows it prefills
 * (`exerciseHistory`), the Target's history (`progressionHistory` via `coachTargets`), and the
 * carried exercise note (`exercisePrefs`). No fallback: the first time in scope, PREVIOUS is
 * empty and the Target is its first-time line.
 *
 * NOT scoped (always every workout): records and live record alerts (`getPriorBests*`), the
 * exercise pages and charts (`exerciseStats`), Statistics, Profile, reports, rest timer prefs,
 * Up next, the Target's weight ladder (weights he really loads), and the early easy-week stall
 * count (`stalledLiftsInPlan`).
 */
import { getDb } from '@/db';

import { nameKey, workoutNameKey } from '../plans/todayPlan';
import { useTrackerPrefs, type PreviousFrom } from '../store/trackerPrefsStore';

export interface HistoryScope {
  /** The routines whose workouts count. */
  routineIds: string[];
  /** Their names (`nameKey`), for workouts with no known routine or a routine that is gone. */
  names: string[];
}

/** A saved workout as the scope sees it. */
export interface ScopeWorkout {
  /** `null` = not known; `''` = none (an empty workout). */
  routineId: string | null;
  /** True when `routineId` names a routine that exists in no folder any more. */
  routineGone?: boolean;
  title: string | null;
  notes?: string | null;
}

/** Is this workout's history read under `scope` (null = every workout)? PURE. */
export function inHistoryScope(scope: HistoryScope | null, w: ScopeWorkout): boolean {
  if (!scope) return true;
  if (w.routineId === '') return false;
  if (w.routineId != null && scope.routineIds.includes(w.routineId)) return true;
  if (w.routineId != null && !w.routineGone) return false; // a routine outside the scope
  const name = workoutNameKey(w.title, w.notes);
  return name !== '' && scope.names.includes(name);
}

/** One string per scope (the Target's memo key): equal strings = the same workouts. PURE. */
export function scopeKey(scope: HistoryScope | null): string {
  if (!scope) return '';
  return JSON.stringify([[...scope.routineIds].sort(), [...scope.names].sort()]);
}

/**
 * `nameKey` in SQL: tabs and line breaks to spaces, runs of up to 32 spaces to one, trimmed, lower
 * case. SQLite's lower() only folds A–Z: a name differing only in the case of a letter outside
 * A–Z (Ü / ü) does not match here (the routine's name is folded fully in JS).
 */
function nameKeySql(expr: string): string {
  let s = `replace(replace(replace(${expr}, char(9), ' '), char(10), ' '), char(13), ' ')`;
  for (let i = 0; i < 5; i++) s = `replace(${s}, '  ', ' ')`;
  return `lower(trim(${s}))`;
}

/** The workout's name in SQL, as `workoutNameKey`: its title, else its notes' first line. */
function workoutNameSql(alias: string): string {
  const title = nameKeySql(`COALESCE(${alias}.title, '')`);
  const notes = `COALESCE(${alias}.notes, '')`;
  const firstLine = nameKeySql(`substr(${notes}, 1, instr(${notes} || char(10), char(10)) - 1)`);
  return `(CASE WHEN ${title} <> '' THEN ${title} ELSE ${firstLine} END)`;
}

/**
 * The scope as a condition on a `workout_sessions` alias ("AND (…)"), with its parameters, to
 * put beside the other conditions of a history read. No scope = '' (every workout). PURE.
 */
export function historyScopeSql(alias: string, scope: HistoryScope | null): { sql: string; params: string[] } {
  if (!scope) return { sql: '', params: [] };
  const marks = (n: number): string => Array.from({ length: n }, () => '?').join(', ');
  const parts: string[] = [];
  if (scope.routineIds.length > 0) parts.push(`${alias}.routine_id IN (${marks(scope.routineIds.length)})`);
  if (scope.names.length > 0) {
    parts.push(
      `((${alias}.routine_id IS NULL
          OR (${alias}.routine_id <> '' AND NOT EXISTS (SELECT 1 FROM plan_days hs_pd WHERE hs_pd.id = ${alias}.routine_id)))
        AND ${workoutNameSql(alias)} IN (${marks(scope.names.length)}))`,
    );
  }
  if (parts.length === 0) return { sql: 'AND 0', params: [] };
  return { sql: `AND (${parts.join(' OR ')})`, params: [...scope.routineIds, ...scope.names] };
}

/**
 * The scope of a workout of `routineId` (the routine it was started from, or counts as) under the
 * member's "Previous values" setting. null = every workout: "Any workout", no routine (null or
 * ''), or a routine that cannot be found. "Same routine": that routine. "Same folder": every
 * routine of its folder.
 *
 * Reads `plan_days` directly: the folder helpers (`getRoutineAnywhere`, `listFolders`) also read
 * every routine's exercises, and a scope needs only ids and names.
 */
export async function historyScopeFor(
  routineId: string | null | undefined,
  setting: PreviousFrom = useTrackerPrefs.getState().previousFrom,
): Promise<HistoryScope | null> {
  if ((setting !== 'routine' && setting !== 'folder') || !routineId) return null;
  const db = getDb();
  const day = await db.getFirstAsync<{ id: string; plan_id: string; name: string }>(
    'SELECT id, plan_id, name FROM plan_days WHERE id = ?',
    [routineId],
  );
  if (!day) return null;
  const days =
    setting === 'folder'
      ? await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM plan_days WHERE plan_id = ? ORDER BY day_order ASC, rowid ASC', [
          day.plan_id,
        ])
      : [day];
  const names = [...new Set(days.map((d) => nameKey(d.name)).filter((n) => n !== ''))];
  return { routineIds: days.map((d) => d.id), names };
}

/** `historyScopeFor` that never throws: a failed read is every workout (never blocks a start). */
export function historyScopeOrAll(routineId: string | null | undefined, setting?: PreviousFrom): Promise<HistoryScope | null> {
  return historyScopeFor(routineId, setting).catch(() => null);
}

/** Settings → Workouts → Previous values: each choice and the line under it. */
export const PREVIOUS_FROM_CHOICES: readonly { value: PreviousFrom; label: string; line: string }[] = [
  { value: 'any', label: 'Any workout', line: 'Previous, Target and notes come from the last time you did the exercise.' },
  { value: 'routine', label: 'Same routine', line: 'Previous, Target and notes come from the last time you did it in this routine.' },
  {
    value: 'folder',
    label: 'Same folder',
    line: 'Previous, Target and notes come from the last time you did it in any routine of this folder. Handy when each folder is a gym.',
  },
];

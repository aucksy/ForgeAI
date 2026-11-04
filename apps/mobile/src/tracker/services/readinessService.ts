/**
 * F59: the reads behind "Which muscles are ready today". The rules are PURE in
 * `engine/readiness.ts`; this only reads the logged workouts of the last few days.
 */
import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';

import type { Muscle } from '../catalog/muscles';
import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { lastTrainedByMuscle } from '../engine/bodyMap';
import { muscleReadiness, type LoggedExercise, type MuscleReadiness } from '../engine/readiness';
import { getExerciseLastDays } from './progressTop';

/** Each exercise of each workout in the last 4 days, with its working sets. */
export async function getRecentLoggedExercises(today: string = todayISO()): Promise<LoggedExercise[]> {
  const rows = await getDb().getAllAsync<{ workout_id: string; at: number; exercise_id: string; n: number }>(
    `SELECT ws.id AS workout_id, COALESCE(ws.ended_at, ws.started_at) AS at, se.exercise_id, COUNT(*) AS n
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.date_iso >= ? AND se.is_warmup = 0
      GROUP BY ws.id, se.exercise_id`,
    [addDays(today, -4)],
  );
  const infos = await getTrackerExercisesByIds([...new Set(rows.map((r) => r.exercise_id))]);
  const out: LoggedExercise[] = [];
  for (const r of rows) {
    const info = infos.get(r.exercise_id);
    if (info) out.push({ at: r.at, workoutId: r.workout_id, muscles: info.muscles, working: r.n });
  }
  return out;
}

export interface ReadinessNow {
  rows: MuscleReadiness[];
  /** Each muscle's newest day with a working set, ever. */
  lastTrained: Map<Muscle, string>;
  /** The member has logged at least one workout with a working set. */
  hasHistory: boolean;
  now: number;
}

export async function getReadinessNow(now: number = Date.now()): Promise<ReadinessNow> {
  const [logged, last] = await Promise.all([getRecentLoggedExercises(), getExerciseLastDays()]);
  return { rows: muscleReadiness(logged, now), lastTrained: lastTrainedByMuscle(last), hasHistory: last.length > 0, now };
}

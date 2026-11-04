/**
 * F61 "Ask your own AI": reads the last 4 weeks of working sets and builds the text
 * (`engine/aiSummary.ts`, PURE). Reads only exercises and sets: never the profile (name, phone)
 * and never body weight.
 */
import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { AI_SUMMARY_DAYS, aiSummaryText, type SummaryWorkout } from '../engine/aiSummary';

interface Row {
  workout_id: string;
  d: string;
  exercise_id: string;
  w: number;
  r: number;
  dur: number | null;
  dist: number | null;
}

export async function getAiSummaryWorkouts(today: string = todayISO()): Promise<SummaryWorkout[]> {
  const rows = await getDb().getAllAsync<Row>(
    `SELECT ws.id AS workout_id, ws.date_iso AS d, se.exercise_id, se.weight_kg AS w, se.reps AS r,
            se.duration_sec AS dur, se.distance_m AS dist
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE se.is_warmup = 0 AND ws.date_iso BETWEEN ? AND ?
      ORDER BY ws.started_at ASC, se.set_number ASC`,
    [addDays(today, -(AI_SUMMARY_DAYS - 1)), today],
  );
  const infos = await getTrackerExercisesByIds([...new Set(rows.map((r) => r.exercise_id))]);
  const byWorkout = new Map<string, SummaryWorkout>();
  for (const r of rows) {
    const info = infos.get(r.exercise_id);
    if (!info) continue;
    let w = byWorkout.get(r.workout_id);
    if (!w) {
      w = { id: r.workout_id, dateISO: r.d, exercises: [] };
      byWorkout.set(r.workout_id, w);
    }
    let x = w.exercises.find((e) => e.exerciseId === r.exercise_id);
    if (!x) {
      x = { exerciseId: info.id, name: info.name, logType: info.logType, distUnit: info.distUnit, muscles: info.muscles, sets: [] };
      w.exercises.push(x);
    }
    x.sets.push({ weightKg: r.w, reps: r.r, durationSec: r.dur, distanceM: r.dist });
  }
  return [...byWorkout.values()];
}

/** The text to share, and how many workouts it covers. */
export async function getAiSummary(today: string = todayISO()): Promise<{ text: string; workouts: number }> {
  const workouts = await getAiSummaryWorkouts(today);
  return { text: aiSummaryText(workouts, today), workouts: workouts.length };
}

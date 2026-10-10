/**
 * Reads for the top of Progress (audit Phase 5): "This week vs your usual" and "Your lifts",
 * plus the per-exercise sets behind a tapped muscle on the body map. The rules are PURE in
 * `engine/progressTop` and `engine/bodyMap`; records come from the one record rule.
 */
import { getDb } from '@/db';
import { addDays, todayISO, weekStartISO } from '@/lib/date';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import type { MuscleGroupSets } from '../engine/bodyMap';
import { liftPoints, topLifts, USUAL_WEEKS, weekVsUsual, type LiftSeries, type ProgressSession, type ProgressSet, type WeekVsUsual } from '../engine/progressTop';
import { getRecordEvents } from './recordsService';

/** How far back "Your lifts" looks (the longest range chip). */
export const LIFTS_WINDOW_DAYS = 180;
/** How many lifts "Your lifts" lists. */
export const TOP_LIFTS = 4;

export interface ProgressTop {
  /** Every workout ever (0 → a new member's one welcome card). */
  totalWorkouts: number;
  week: WeekVsUsual;
  lifts: LiftSeries[];
}

interface SessionRow {
  id: string;
  date_iso: string;
  easy: number;
}
interface SetRow {
  session_id: string;
  date_iso: string;
  easy: number;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  is_warmup: number;
}

async function readWindow(from: string, to: string): Promise<{ sessions: ProgressSession[]; sets: ProgressSet[] }> {
  const db = getDb();
  const [sRows, setRows] = await Promise.all([
    db.getAllAsync<SessionRow>(
      `SELECT id, date_iso, COALESCE(easy_week, 0) AS easy FROM workout_sessions
        WHERE date_iso BETWEEN ? AND ? ORDER BY date_iso ASC, started_at ASC`,
      [from, to],
    ),
    db.getAllAsync<SetRow>(
      `SELECT se.session_id, ws.date_iso AS date_iso, COALESCE(ws.easy_week, 0) AS easy, se.exercise_id,
              se.weight_kg, se.reps, se.is_warmup
         FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.date_iso BETWEEN ? AND ?
        ORDER BY ws.date_iso ASC, ws.started_at ASC, se.session_id ASC, se.set_number ASC`,
      [from, to],
    ),
  ]);
  return {
    sessions: sRows.map((r) => ({ id: r.id, dateISO: r.date_iso, easy: r.easy === 1 })),
    sets: setRows.map((r) => ({
      sessionId: r.session_id,
      dateISO: r.date_iso,
      easy: r.easy === 1,
      exerciseId: r.exercise_id,
      weightKg: r.weight_kg,
      reps: r.reps,
      isWarmup: r.is_warmup === 1,
    })),
  };
}

export async function getProgressTop(today: string = todayISO()): Promise<ProgressTop> {
  const weekFrom = weekStartISO(today);
  const usualFrom = addDays(weekFrom, -7 * USUAL_WEEKS);
  const liftsFrom = addDays(today, -(LIFTS_WINDOW_DAYS - 1));
  const from = usualFrom < liftsFrom ? usualFrom : liftsFrom;
  const [total, window, events] = await Promise.all([
    getDb().getFirstAsync<{ n: number; first: string | null }>('SELECT COUNT(*) AS n, MIN(date_iso) AS first FROM workout_sessions'),
    readWindow(from, today),
    getRecordEvents({ from: weekFrom, to: today }),
  ]);
  const infos = await getTrackerExercisesByIds([...new Set(window.sets.map((s) => s.exerciseId))]);
  const week = weekVsUsual({ ...window, infos, events, today, firstWorkoutISO: total?.first ?? null });
  const lifts = topLifts(liftPoints(window.sets.filter((s) => s.dateISO >= liftsFrom), infos), TOP_LIFTS);
  return { totalWorkouts: total?.n ?? 0, week, lifts };
}

/** Each exercise's working sets between two days, with the muscles it trains (the body-map sheet). */
export async function getMuscleGroupsBetween(from: string, to: string): Promise<MuscleGroupSets[]> {
  const rows = await getDb().getAllAsync<{ exercise_id: string; n: number }>(
    `SELECT se.exercise_id, COUNT(*) AS n FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.date_iso BETWEEN ? AND ? AND se.is_warmup = 0 GROUP BY se.exercise_id`,
    [from, to],
  );
  const infos = await getTrackerExercisesByIds(rows.map((r) => r.exercise_id));
  const out: MuscleGroupSets[] = [];
  for (const r of rows) {
    const info = infos.get(r.exercise_id);
    if (info) out.push({ exerciseId: info.id, name: info.name, muscles: info.muscles, working: r.n });
  }
  return out;
}

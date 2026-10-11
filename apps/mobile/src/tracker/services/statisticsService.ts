/**
 * Reads for the Statistics screen (R3). Every number goes through the existing rules: session
 * details → the ONE volume rule (`applyVolume`) → `toReportSessions` (as the monthly report),
 * plus each workout's sets per muscle group (engine/statistics).
 */
import { getDb } from '@/db';
import type { SessionDetail } from '@/types/models';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { getSessionDetailsBetween } from '../db/sessionDetails';
import { sessionGroupSets, type StatSession } from '../engine/statistics';
import { toReportSessions } from './reportsService';
import { applyVolume, getVolumeContext, toVolumeSession, type VolumeContext } from './volumeService';

/** Details → Statistics sessions (one volume context for all). PURE. */
export function toStatSessions(raw: readonly SessionDetail[], ctx: VolumeContext): StatSession[] {
  const reports = toReportSessions(raw.map((d) => applyVolume(d, ctx)));
  return reports.map((r, i) => ({ ...r, groups: sessionGroupSets(toVolumeSession(raw[i], ctx)) }));
}

/** Every workout between two days (inclusive), oldest first, as Statistics counts it. */
export async function getStatSessions(from: string, to: string): Promise<StatSession[]> {
  const raw = await getSessionDetailsBetween(from, to);
  const ctx = await getVolumeContext([...new Set(raw.flatMap((d) => d.exercises.map((g) => g.exercise.id)))]);
  return toStatSessions(raw, ctx).sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
}

/** Workouts between two days (inclusive). */
export async function countWorkoutsBetween(from: string, to: string): Promise<number> {
  const r = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions WHERE date_iso BETWEEN ? AND ?', [from, to]);
  return Number(r?.n ?? 0);
}

export interface MainExercise {
  exerciseId: string;
  name: string;
  /** Workouts it was in. */
  times: number;
  lastISO: string;
}

/** The exercises done in the most workouts, most first (Hevy's "Main exercises"). */
export async function getMainExercises(limit = 6): Promise<MainExercise[]> {
  const rows = await getDb().getAllAsync<{ exercise_id: string; n: number; last: string }>(
    `SELECT se.exercise_id, COUNT(DISTINCT se.session_id) AS n, MAX(ws.date_iso) AS last
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      GROUP BY se.exercise_id ORDER BY n DESC, last DESC LIMIT ?`,
    [Math.max(1, Math.floor(limit))],
  );
  const infos = await getTrackerExercisesByIds(rows.map((r) => r.exercise_id));
  const out: MainExercise[] = [];
  for (const r of rows) {
    const info = infos.get(r.exercise_id);
    if (info) out.push({ exerciseId: r.exercise_id, name: info.name, times: Number(r.n), lastISO: r.last });
  }
  return out;
}

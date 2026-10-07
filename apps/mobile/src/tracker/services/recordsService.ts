/**
 * Records from the database — Phase 3. Reads working sets and runs the one record rule
 * (`engine/records`) over them. Nothing is stored: the frozen `personal_records` table keeps
 * feeding its old readers (the coach's list, Home's "new PR" line, the strength score),
 * while every Phase 3 screen derives its records here.
 */
import { getDb } from '@/db';
import { todayISO } from '@/lib/date';

import { getTrackerExercisesByIds, type TrackerExercise } from '../db/exerciseInfo';
import { isLoadMode } from '../engine/logTypes';
import { exerciseRecords, type ExerciseRecords, type RecordEvent, type RecordKind, type RecordSession } from '../engine/records';
import { bodyweightOn, type BodyweightPoint } from '../engine/volume';
import type { PriorBests } from './liveRecords';
import { getBodyweightTimeline } from './volumeService';

interface SetRow {
  session_id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  duration_sec: number | null;
  distance_m: number | null;
  load_mode: string | null;
  date_iso: string;
  started_at: number;
}

const COLS = `se.session_id, se.exercise_id, se.weight_kg, se.reps, se.duration_sec, se.distance_m, se.load_mode,
              ws.date_iso AS date_iso, ws.started_at AS started_at`;
const ORDER = 'ORDER BY ws.started_at ASC, ws.date_iso ASC, se.session_id ASC, se.set_number ASC';

/** Working sets of these exercises (all of them when omitted), oldest workout first. */
async function readWorkingSets(exerciseIds?: readonly string[]): Promise<SetRow[]> {
  const db = getDb();
  if (exerciseIds == null) {
    return db.getAllAsync<SetRow>(
      `SELECT ${COLS} FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id WHERE se.is_warmup = 0 ${ORDER}`,
    );
  }
  const unique = [...new Set(exerciseIds)];
  const out: SetRow[] = [];
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    out.push(
      ...(await db.getAllAsync<SetRow>(
        `SELECT ${COLS} FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.is_warmup = 0 AND se.exercise_id IN (${chunk.map(() => '?').join(', ')}) ${ORDER}`,
        chunk,
      )),
    );
  }
  return out;
}

/** Rows → each exercise's workouts with their sets. PURE (exported for tests). */
export function groupRecordSessions(rows: readonly SetRow[]): Map<string, RecordSession[]> {
  const byExercise = new Map<string, Map<string, RecordSession>>();
  for (const r of rows) {
    let sessions = byExercise.get(r.exercise_id);
    if (!sessions) {
      sessions = new Map();
      byExercise.set(r.exercise_id, sessions);
    }
    let s = sessions.get(r.session_id);
    if (!s) {
      s = { sessionId: r.session_id, dateISO: r.date_iso, startedAt: r.started_at, sets: [] };
      sessions.set(r.session_id, s);
    }
    s.sets.push({
      weightKg: r.weight_kg,
      reps: r.reps,
      durationSec: r.duration_sec,
      distanceM: r.distance_m,
      loadMode: isLoadMode(r.load_mode) ? r.load_mode : null,
    });
  }
  return new Map([...byExercise].map(([id, m]) => [id, [...m.values()]]));
}

export interface ExerciseRecordSet {
  info: TrackerExercise;
  records: ExerciseRecords;
}

/** Every record of these exercises (all exercises when omitted). */
export async function getRecordsByExercise(exerciseIds?: readonly string[]): Promise<Map<string, ExerciseRecordSet>> {
  const [rows, bw] = await Promise.all([readWorkingSets(exerciseIds), getBodyweightTimeline()]);
  const grouped = groupRecordSessions(rows);
  const infos = await getTrackerExercisesByIds([...grouped.keys()]);
  const out = new Map<string, ExerciseRecordSet>();
  for (const [id, sessions] of grouped) {
    const info = infos.get(id);
    if (!info) continue;
    out.set(id, { info, records: exerciseRecords(sessions, info, bw) });
  }
  return out;
}

/** A record event with what a list needs to show it. */
export interface RecordEventRow extends RecordEvent {
  exerciseId: string;
  exerciseName: string;
  info: Pick<TrackerExercise, 'logType' | 'loadMode' | 'distUnit'>;
}

/** Every record event, newest first. PURE over the per-exercise records (exported for tests). */
export function flattenEvents(byExercise: ReadonlyMap<string, ExerciseRecordSet>): RecordEventRow[] {
  const rows: RecordEventRow[] = [];
  for (const [exerciseId, { info, records }] of byExercise) {
    for (const e of records.events) {
      rows.push({ ...e, exerciseId, exerciseName: info.name, info: { logType: info.logType, loadMode: info.loadMode, distUnit: info.distUnit } });
    }
  }
  return rows.sort((a, b) => (a.dateISO === b.dateISO ? 0 : a.dateISO < b.dateISO ? 1 : -1));
}

/** Record events between two days (inclusive), newest first. Omitted bounds are open. */
export async function getRecordEvents(range: { from?: string; to?: string } = {}): Promise<RecordEventRow[]> {
  const all = flattenEvents(await getRecordsByExercise());
  return all.filter((e) => (range.from == null || e.dateISO >= range.from) && (range.to == null || e.dateISO <= range.to));
}

/** The records one workout set (empty for a first workout with every exercise). */
export async function getSessionRecords(sessionId: string): Promise<RecordEventRow[]> {
  const ids = await getDb().getAllAsync<{ exercise_id: string }>(
    'SELECT DISTINCT exercise_id FROM set_entries WHERE session_id = ? AND is_warmup = 0',
    [sessionId],
  );
  if (ids.length === 0) return [];
  const byExercise = await getRecordsByExercise(ids.map((r) => r.exercise_id));
  return flattenEvents(byExercise).filter((e) => e.sessionId === sessionId);
}

/**
 * The bests before a new workout, for the live pop-up. Built by the same rule as the finish
 * screen, so the pop-up and the saved record agree. null when the exercise has no history.
 */
export function priorBestsFrom(records: ExerciseRecords, info: Pick<TrackerExercise, 'bwShare'>, bw: readonly BodyweightPoint[], today: string): PriorBests | null {
  if (records.bests.length === 0) return null;
  const by: Partial<Record<RecordKind, number>> = {};
  for (const h of records.bests) by[h.kind] = h.value;
  return {
    weightKg: by.weight ?? 0,
    e1rm: by.e1rm ?? 0,
    by,
    bwShare: info.bwShare,
    bodyweightKg: bodyweightOn(bw, today),
  };
}

export async function getPriorRecordBests(exerciseId: string): Promise<PriorBests | null> {
  const [rows, bw] = await Promise.all([readWorkingSets([exerciseId]), getBodyweightTimeline()]);
  const sessions = groupRecordSessions(rows).get(exerciseId);
  if (!sessions || sessions.length === 0) return null;
  const info = (await getTrackerExercisesByIds([exerciseId])).get(exerciseId);
  if (!info) return null;
  return priorBestsFrom(exerciseRecords(sessions, info, bw), info, bw, todayISO());
}

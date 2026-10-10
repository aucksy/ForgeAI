/**
 * Records from the database — Phase 3. Reads working sets and runs the one record rule
 * (`engine/records`) over them. Nothing is stored: the frozen `personal_records` table keeps
 * feeding its old readers (the coach's list, Home's "new PR" line, the strength score),
 * while every Phase 3 screen derives its records here.
 */
import { getDb } from '@/db';
import { onWriteFailed, quietSince, writeQueueMark } from '@/db/writeQueue';
import { todayISO } from '@/lib/date';

import { getTrackerExercisesByIds, type TrackerExercise } from '../db/exerciseInfo';
import { trainingChangesSince, trainingVersion } from '../db/trainingVersion';
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

/**
 * Working sets of these exercises (all of them when omitted), oldest workout first. Phase 4:
 * easy-week workouts stay out of records (research v3 §6.4) — a lighter week is no record.
 */
async function readWorkingSets(exerciseIds?: readonly string[]): Promise<SetRow[]> {
  const db = getDb();
  if (exerciseIds == null) {
    return db.getAllAsync<SetRow>(
      `SELECT ${COLS} FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0 ${ORDER}`,
    );
  }
  const unique = [...new Set(exerciseIds)];
  const out: SetRow[] = [];
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    out.push(
      ...(await db.getAllAsync<SetRow>(
        `SELECT ${COLS} FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.is_warmup = 0 AND COALESCE(ws.easy_week, 0) = 0
            AND se.exercise_id IN (${chunk.map(() => '?').join(', ')}) ${ORDER}`,
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

/**
 * Phase 3 review: Progress re-read every working set on each visit (8,800 rows after a big
 * Hevy import). The full read is now kept until the data it was made from changes.
 *
 * Audit Phase 8: "has it changed?" used to be SQLite's own write counters (total_changes() and
 * `PRAGMA data_version`), which move with EVERY write — so a draft save, a note or a settings
 * row threw the kept records away and the next screen re-read all 28,000 sets of five years.
 * Now the tracker schema's `training_changes` table (v13, kept by triggers — see
 * trackerSchema.ts) says exactly what changed: its `#version` moves only when a set, a
 * workout's day or time, an exercise or a body weight changes, and each exercise row holds the
 * version of its own last change. After a Finish or an edit only those exercises are worked
 * out again and merged into the kept records; a body-weight change (`#all`) rebuilds all.
 * Each exercise's records depend only on its own sets, its own row and the body weight, so the
 * merge equals a full rebuild (test/tracker/phase8Records.test.ts checks it on random edits).
 *
 * Audit Phase 8 review — a write that rolls back: a read while a queued write (an import, a
 * Finish, an edit, a merge) is open on the shared connection sees its uncommitted rows and a
 * higher `#version`; when it rolls back the version drops again. So (1) nothing read while a
 * write runs, or while one started and ended during the read, is ever kept (`quietSince`);
 * (2) a kept version HIGHER than the current one is a rolled-back write's (or another
 * database's) — dropped and rebuilt; (3) a failed write drops the kept records at once.
 */
let cache: { version: number; data: Map<string, ExerciseRecordSet> } | null = null;
/**
 * Review fix (Phase 5): the full read in progress. Progress's top card and its records section
 * both ask for every record as the tab opens; the second caller now shares the first one's read
 * (same data version) instead of reading every working set again alongside it.
 */
let inflight: { version: number | null; mark: number; promise: Promise<Map<string, ExerciseRecordSet>> } | null = null;

export { trainingVersion } from '../db/trainingVersion';

/** Drop the kept records (tests; a new data source). */
export function forgetRecordCache(): void {
  cache = null;
  inflight = null;
  catching = null;
}

function pick(data: ReadonlyMap<string, ExerciseRecordSet>, exerciseIds: readonly string[]): Map<string, ExerciseRecordSet> {
  const some = new Map<string, ExerciseRecordSet>();
  for (const id of exerciseIds) {
    const r = data.get(id);
    if (r) some.set(id, r);
  }
  return some;
}

/** A catch-up in progress (see `catchUp`). */
let catching: { version: number; mark: number; promise: Promise<Map<string, ExerciseRecordSet> | null> } | null = null;

// A failed (rolled-back) write: nothing read while it ran is trusted.
onWriteFailed(forgetRecordCache);

/**
 * The kept records brought up to `version`: only the exercises changed since they were kept are
 * worked out again. null when that is not possible (nothing kept, a body-weight change) — the
 * caller rebuilds.
 */
async function catchUp(version: number, mark: number | null): Promise<Map<string, ExerciseRecordSet> | null> {
  const kept = cache;
  if (kept == null) return null;
  if (kept.version === version) return kept.data;
  if (kept.version > version) {
    // A write landed after `version` was read (and the kept records already include it), or
    // the kept version is a rolled-back write's / another database's: then the version is
    // still below it — drop it and rebuild.
    const now = await trainingVersion();
    if (now != null && now >= kept.version && cache === kept) return kept.data;
    if (cache === kept) cache = null;
    return null;
  }
  // While a write runs: worked out for this read only, never shared or kept.
  if (mark == null) return mergeChanged(kept, version, mark);
  // Home reads records from two places at once: the second waits for the first one's catch-up.
  if (catching && catching.version === version && catching.mark === mark) return catching.promise;
  const promise = mergeChanged(kept, version, mark);
  const mine = { version, mark, promise };
  catching = mine;
  const done = (): void => {
    if (catching === mine) catching = null;
  };
  promise.then(done, done);
  return promise;
}

async function mergeChanged(
  kept: { version: number; data: Map<string, ExerciseRecordSet> },
  version: number,
  mark: number | null,
): Promise<Map<string, ExerciseRecordSet> | null> {
  const changed = await trainingChangesSince(kept.version);
  if (changed.includes('#all')) return null;
  const ids = changed.filter((id) => !id.startsWith('#'));
  const fresh = ids.length > 0 ? await computeRecords(ids) : new Map<string, ExerciseRecordSet>();
  const data = new Map(kept.data);
  for (const id of ids) {
    const r = fresh.get(id);
    if (r) data.set(id, r);
    else data.delete(id);
  }
  // Rows read after `version` was read are at least that new; anything changed since is marked
  // with a later version and is worked out again on the next read.
  if (quietSince(mark) && (cache === kept || cache == null || cache.version < version)) cache = { version, data };
  return data;
}

/** Every record of these exercises (all exercises when omitted). */
export async function getRecordsByExercise(exerciseIds?: readonly string[]): Promise<Map<string, ExerciseRecordSet>> {
  // Taken before anything is read: a write that starts during the read makes it unkeepable.
  const mark = writeQueueMark();
  const version = await trainingVersion();
  if (version != null && cache != null) {
    const data = await catchUp(version, mark).catch(() => null);
    if (data) return exerciseIds == null ? data : pick(data, exerciseIds);
  }
  // Nothing kept: a few exercises (a workout's cards) are cheaper read on their own.
  if (exerciseIds != null) return computeRecords(exerciseIds);
  // While a write runs: read for this caller only, never shared or kept.
  if (mark == null) return computeRecords();
  // Shared only within one quiet spell: a read that a rolled-back write ran under is never handed on.
  if (inflight && inflight.version === version && inflight.mark === mark) return inflight.promise;
  const promise = computeRecords().then((data) => {
    if (version != null && quietSince(mark) && (cache == null || cache.version <= version)) cache = { version, data };
    return data;
  });
  const mine = { version, mark, promise };
  inflight = mine;
  const done = (): void => {
    if (inflight === mine) inflight = null;
  };
  promise.then(done, done);
  return promise;
}

/** Records worked out from the database now, nothing kept (exported for tests: the full rebuild). */
export async function computeRecords(exerciseIds?: readonly string[]): Promise<Map<string, ExerciseRecordSet>> {
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
  // Newest first: by day, then — two workouts on one day — by start time.
  return rows.sort((a, b) => (a.dateISO === b.dateISO ? (b.startedAt ?? 0) - (a.startedAt ?? 0) : a.dateISO < b.dateISO ? 1 : -1));
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
    kinds: records.kinds,
  };
}

export async function getPriorRecordBests(exerciseId: string): Promise<PriorBests | null> {
  return (await getPriorRecordBestsMany([exerciseId])).get(exerciseId) ?? null;
}

/**
 * Audit Phase 8: every card of a workout at once — one version check, one records read (none
 * when the kept records are current) and one body-weight read, instead of those per card.
 */
export async function getPriorRecordBestsMany(exerciseIds: readonly string[]): Promise<Map<string, PriorBests | null>> {
  const out = new Map<string, PriorBests | null>();
  if (exerciseIds.length === 0) return out;
  const [byExercise, bw] = await Promise.all([getRecordsByExercise(exerciseIds), getBodyweightTimeline()]);
  const today = todayISO();
  for (const id of exerciseIds) {
    const r = byExercise.get(id);
    out.set(id, r ? priorBestsFrom(r.records, r.info, bw, today) : null);
  }
  return out;
}

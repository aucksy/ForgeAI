/**
 * Batched recent-session details — the same read as the frozen
 * `workoutRepo.getRecentSessionDetails`, without its N+1.
 *
 * The frozen fn lists N sessions, then calls `buildDetail` per session: 2 awaited
 * SQLite round-trips each (its sets, then its exercises). `getRecentSessionDetails(50)`
 * on every History focus = 1 + 2×50 = 101 round-trips over the JS↔native bridge,
 * recurring on each tab switch (Library re-reads 12 the same way).
 *
 * This module does it in 3 queries regardless of N: the sessions, ALL their sets in one
 * `WHERE session_id IN (…)`, ALL the referenced exercises in one `WHERE id IN (…)` — then
 * groups in JS. The frozen `workoutRepo` is UNTOUCHED and its other callers keep working;
 * only non-frozen callers point here.
 *
 * PARITY with the frozen fn (byte-identical `SessionDetail[]`), mirroring `buildDetail`:
 *  - sessions ordered `date_iso DESC, started_at DESC`, capped at `limit`;
 *  - a session's exercise groups appear in first-set-`rowid` order; each group's sets
 *    are sorted by `setNumber`;
 *  - a set whose exercise row is missing is SKIPPED (as `buildDetail`'s `if (!exercise)`);
 *  - `volumeKg` excludes warm-ups; `totalVolumeKg` = Σ group volumes;
 *  - a session with no sets still returns, with `exercises: []` and `totalVolumeKg: 0`.
 */
import { getDb } from '@/db';
import type {
  DayType,
  Exercise,
  MuscleGroup,
  SessionDetail,
  SetEntry,
  WorkoutSession,
} from '@/types/models';

interface SessionRow {
  id: string;
  date_iso: string;
  started_at: number;
  ended_at: number | null;
  day_type: string;
  notes: string | null;
  source: string;
}

interface SetRow {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: number;
}

interface ExerciseRow {
  id: string;
  name: string;
  aliases: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  is_compound: number;
  increment_kg: number;
}

function mapSession(r: SessionRow): WorkoutSession {
  return {
    id: r.id,
    dateISO: r.date_iso,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    dayType: r.day_type as DayType,
    notes: r.notes,
    source: r.source as WorkoutSession['source'],
  };
}

function mapSet(r: SetRow): SetEntry {
  return {
    id: r.id,
    sessionId: r.session_id,
    exerciseId: r.exercise_id,
    setNumber: r.set_number,
    weightKg: r.weight_kg,
    reps: r.reps,
    isWarmup: r.is_warmup === 1,
  };
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapExerciseRow(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    aliases: parseJsonArray(r.aliases),
    muscleGroup: r.muscle_group as MuscleGroup,
    secondaryMuscles: parseJsonArray(r.secondary_muscles) as MuscleGroup[],
    equipment: r.equipment as Exercise['equipment'],
    isCompound: r.is_compound === 1,
    incrementKg: r.increment_kg,
  };
}

/**
 * SQLite caps host parameters per statement (SQLITE_MAX_VARIABLE_NUMBER, 999 on older
 * builds). Chunk the IN-lists so a big `limit` (or a wide exercise catalogue) can't
 * blow the cap. Sets chunk BY SESSION, so a session's rows never split across chunks
 * and their per-chunk `rowid` order stays each session's true order.
 */
const CHUNK = 400;

function chunked<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/** Newest-first session details, batched into ~3 queries instead of 1 + 2×N. */
export async function getRecentSessionDetailsBatched(limit: number): Promise<SessionDetail[]> {
  if (limit <= 0) return [];
  const db = getDb();

  const sessionRows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM workout_sessions ORDER BY date_iso DESC, started_at DESC LIMIT ?',
    [limit],
  );
  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((r) => r.id);
  const setRows: SetRow[] = [];
  for (const ids of chunked(sessionIds)) {
    const rows = await db.getAllAsync<SetRow>(
      `SELECT * FROM set_entries WHERE session_id IN (${placeholders(ids.length)}) ORDER BY rowid ASC`,
      ids,
    );
    setRows.push(...rows);
  }

  const exerciseIds = [...new Set(setRows.map((r) => r.exercise_id))];
  const exercises = new Map<string, Exercise>();
  for (const ids of chunked(exerciseIds)) {
    const rows = await db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises WHERE id IN (${placeholders(ids.length)})`,
      ids,
    );
    for (const r of rows) exercises.set(r.id, mapExerciseRow(r));
  }

  // Bucket the sets by session, preserving each session's rowid order (chunking is
  // by session, so a session's rows arrive together and in order).
  const setsBySession = new Map<string, SetRow[]>();
  for (const r of setRows) {
    const list = setsBySession.get(r.session_id);
    if (list) list.push(r);
    else setsBySession.set(r.session_id, [r]);
  }

  return sessionRows.map((sr) => {
    const session = mapSession(sr);
    const groups: SessionDetail['exercises'] = [];
    const groupByExercise = new Map<string, SessionDetail['exercises'][number]>();
    for (const r of setsBySession.get(sr.id) ?? []) {
      const exercise = exercises.get(r.exercise_id);
      if (!exercise) continue; // mirrors buildDetail: orphaned set → skipped
      let group = groupByExercise.get(r.exercise_id);
      if (!group) {
        group = { exercise, sets: [], volumeKg: 0 };
        groupByExercise.set(r.exercise_id, group);
        groups.push(group);
      }
      const set = mapSet(r);
      group.sets.push(set);
      if (!set.isWarmup) group.volumeKg += set.weightKg * set.reps;
    }
    for (const group of groups) group.sets.sort((a, b) => a.setNumber - b.setNumber);
    return {
      ...session,
      exercises: groups,
      totalVolumeKg: groups.reduce((sum, g) => sum + g.volumeKg, 0),
    };
  });
}

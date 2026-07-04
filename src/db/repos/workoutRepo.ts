import { getDb } from '@/db';
import { checkAndRecordPrs } from '@/db/repos/prRepo';
import { addDays, fromISO, todayISO, weekStartISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import type {
  ConsistencyCell,
  DayType,
  Exercise,
  MuscleGroup,
  MuscleVolumeSlice,
  SessionDetail,
  SetEntry,
  VolumePoint,
  WorkoutSession,
} from '@/types/models';

// ---------------------------------------------------------------- rows

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

/** Backdated entries get a mid-day timestamp so started_at ordering matches days. */
function defaultStartedAt(dateISO: string): number {
  return dateISO === todayISO() ? Date.now() : fromISO(dateISO).getTime() + 12 * 3_600_000;
}

// ---------------------------------------------------------------- sessions

export async function createSession(input: {
  dateISO: string;
  dayType: DayType;
  notes?: string | null;
  source?: WorkoutSession['source'];
  startedAt?: number;
  endedAt?: number | null;
}): Promise<WorkoutSession> {
  const session: WorkoutSession = {
    id: uuid(),
    dateISO: input.dateISO,
    startedAt: input.startedAt ?? defaultStartedAt(input.dateISO),
    endedAt: input.endedAt ?? null,
    dayType: input.dayType,
    notes: input.notes ?? null,
    source: input.source ?? 'chat',
  };
  await getDb().runAsync(
    `INSERT INTO workout_sessions(id, date_iso, started_at, ended_at, day_type, notes, source)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.dateISO, session.startedAt, session.endedAt, session.dayType, session.notes, session.source],
  );
  return session;
}

/**
 * Appends sets with continued per-(session, exercise) set numbers, then runs
 * PR detection for the session. No transaction here — callers (e.g. the seed)
 * may already hold one.
 */
export async function addSets(
  sessionId: string,
  sets: { exerciseId: string; weightKg: number; reps: number; isWarmup?: boolean }[],
): Promise<SetEntry[]> {
  const db = getDb();
  const session = await db.getFirstAsync<SessionRow>(
    'SELECT * FROM workout_sessions WHERE id = ?',
    [sessionId],
  );
  if (!session) throw new Error(`Workout session not found: ${sessionId}`);

  const counters = new Map<string, number>();
  const existing = await db.getAllAsync<{ exercise_id: string; max_n: number }>(
    'SELECT exercise_id, MAX(set_number) AS max_n FROM set_entries WHERE session_id = ? GROUP BY exercise_id',
    [sessionId],
  );
  for (const row of existing) counters.set(row.exercise_id, row.max_n);

  const created: SetEntry[] = [];
  for (const s of sets) {
    const setNumber = (counters.get(s.exerciseId) ?? 0) + 1;
    counters.set(s.exerciseId, setNumber);
    const entry: SetEntry = {
      id: uuid(),
      sessionId,
      exerciseId: s.exerciseId,
      setNumber,
      weightKg: s.weightKg,
      reps: s.reps,
      isWarmup: s.isWarmup ?? false,
    };
    await db.runAsync(
      `INSERT INTO set_entries(id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.sessionId, entry.exerciseId, entry.setNumber, entry.weightKg, entry.reps, entry.isWarmup ? 1 : 0],
    );
    created.push(entry);
  }

  if (created.length > 0) await checkAndRecordPrs(sessionId);
  return created;
}

async function buildDetail(session: WorkoutSession): Promise<SessionDetail> {
  const db = getDb();
  const setRows = await db.getAllAsync<SetRow>(
    'SELECT * FROM set_entries WHERE session_id = ? ORDER BY rowid ASC',
    [session.id],
  );
  const exerciseIds = [...new Set(setRows.map((r) => r.exercise_id))];
  const exercises = new Map<string, Exercise>();
  if (exerciseIds.length > 0) {
    const placeholders = exerciseIds.map(() => '?').join(', ');
    const exRows = await db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises WHERE id IN (${placeholders})`,
      exerciseIds,
    );
    for (const r of exRows) exercises.set(r.id, mapExerciseRow(r));
  }

  const groups: SessionDetail['exercises'] = [];
  const groupByExercise = new Map<string, SessionDetail['exercises'][number]>();
  for (const r of setRows) {
    const exercise = exercises.get(r.exercise_id);
    if (!exercise) continue;
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
}

export async function getSessionDetail(id: string): Promise<SessionDetail | null> {
  const row = await getDb().getFirstAsync<SessionRow>(
    'SELECT * FROM workout_sessions WHERE id = ?',
    [id],
  );
  return row ? buildDetail(mapSession(row)) : null;
}

export async function getSessionsBetween(fromISO_: string, toISO: string): Promise<WorkoutSession[]> {
  const rows = await getDb().getAllAsync<SessionRow>(
    'SELECT * FROM workout_sessions WHERE date_iso BETWEEN ? AND ? ORDER BY date_iso ASC, started_at ASC',
    [fromISO_, toISO],
  );
  return rows.map(mapSession);
}

export async function getRecentSessionDetails(limit: number): Promise<SessionDetail[]> {
  const rows = await getDb().getAllAsync<SessionRow>(
    'SELECT * FROM workout_sessions ORDER BY date_iso DESC, started_at DESC LIMIT ?',
    [limit],
  );
  const details: SessionDetail[] = [];
  for (const row of rows) details.push(await buildDetail(mapSession(row)));
  return details;
}

export async function getLastSessionOfDayType(
  dayType: DayType,
  beforeISO?: string,
): Promise<SessionDetail | null> {
  const db = getDb();
  const row = beforeISO
    ? await db.getFirstAsync<SessionRow>(
        `SELECT * FROM workout_sessions WHERE day_type = ? AND date_iso < ?
         ORDER BY date_iso DESC, started_at DESC LIMIT 1`,
        [dayType, beforeISO],
      )
    : await db.getFirstAsync<SessionRow>(
        'SELECT * FROM workout_sessions WHERE day_type = ? ORDER BY date_iso DESC, started_at DESC LIMIT 1',
        [dayType],
      );
  return row ? buildDetail(mapSession(row)) : null;
}

/** Working sets only, grouped per session, newest first. */
export async function getExerciseHistory(
  exerciseId: string,
  limit?: number,
): Promise<{ sessionId: string; dateISO: string; sets: SetEntry[]; volumeKg: number }[]> {
  const rows = await getDb().getAllAsync<SetRow & { date_iso: string }>(
    `SELECT se.*, ws.date_iso AS date_iso
     FROM set_entries se
     JOIN workout_sessions ws ON ws.id = se.session_id
     WHERE se.exercise_id = ? AND se.is_warmup = 0
     ORDER BY ws.started_at DESC, ws.date_iso DESC, se.set_number ASC`,
    [exerciseId],
  );
  const out: { sessionId: string; dateISO: string; sets: SetEntry[]; volumeKg: number }[] = [];
  const bySession = new Map<string, (typeof out)[number]>();
  for (const r of rows) {
    let group = bySession.get(r.session_id);
    if (!group) {
      if (limit != null && out.length >= limit) break; // rows are session-contiguous
      group = { sessionId: r.session_id, dateISO: r.date_iso, sets: [], volumeKg: 0 };
      bySession.set(r.session_id, group);
      out.push(group);
    }
    const set = mapSet(r);
    group.sets.push(set);
    group.volumeKg += set.weightKg * set.reps;
  }
  return out;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  // PRs earned in this session lose their backing data — remove them too.
  await db.runAsync('DELETE FROM personal_records WHERE session_id = ?', [id]);
  await db.runAsync('DELETE FROM workout_sessions WHERE id = ?', [id]); // sets cascade
}

// ---------------------------------------------------------------- analytics

/**
 * Walk back day-by-day from `today`. A run of >= 2 consecutive rest days ends
 * the streak; the result counts DISTINCT workout days in the unbroken run
 * (an untrained today alone does not break it).
 */
export async function getStreakDays(todayISO_: string): Promise<number> {
  const rows = await getDb().getAllAsync<{ date_iso: string }>(
    'SELECT DISTINCT date_iso FROM workout_sessions',
  );
  const trained = new Set(rows.map((r) => r.date_iso));
  if (trained.size === 0) return 0;
  const earliest = [...trained].sort()[0];

  let streak = 0;
  let restRun = 0;
  let cursor = todayISO_;
  while (cursor >= earliest) {
    if (trained.has(cursor)) {
      streak += 1;
      restRun = 0;
    } else {
      restRun += 1;
      if (restRun >= 2) break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Monday buckets: the trailing `weeks` weeks including the current one. */
function weekBuckets(weeks: number): Map<string, number> {
  const buckets = new Map<string, number>();
  const firstWeek = addDays(weekStartISO(todayISO()), -7 * (weeks - 1));
  for (let i = 0; i < weeks; i++) buckets.set(addDays(firstWeek, i * 7), 0);
  return buckets;
}

export async function getWeeklyVolume(weeks: number): Promise<VolumePoint[]> {
  if (weeks <= 0) return [];
  const buckets = weekBuckets(weeks);
  const firstWeek = [...buckets.keys()][0];
  const rows = await getDb().getAllAsync<{ date_iso: string; volume: number | null }>(
    `SELECT ws.date_iso AS date_iso, SUM(se.weight_kg * se.reps) AS volume
     FROM set_entries se
     JOIN workout_sessions ws ON ws.id = se.session_id
     WHERE se.is_warmup = 0 AND ws.date_iso >= ?
     GROUP BY ws.date_iso`,
    [firstWeek],
  );
  for (const r of rows) {
    const week = weekStartISO(r.date_iso);
    if (buckets.has(week)) buckets.set(week, (buckets.get(week) ?? 0) + (r.volume ?? 0));
  }
  return [...buckets.entries()].map(([dateISO, volumeKg]) => ({ dateISO, volumeKg }));
}

/** Primary muscle gets full set volume, each secondary muscle 50%. */
export async function getMuscleGroupVolume(
  fromISO_: string,
  toISO: string,
): Promise<MuscleVolumeSlice[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ exercise_id: string; weight_kg: number; reps: number }>(
    `SELECT se.exercise_id, se.weight_kg, se.reps
     FROM set_entries se
     JOIN workout_sessions ws ON ws.id = se.session_id
     WHERE se.is_warmup = 0 AND ws.date_iso BETWEEN ? AND ?`,
    [fromISO_, toISO],
  );
  if (rows.length === 0) return [];
  const exRows = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercises');
  const exercises = new Map(exRows.map((r) => [r.id, mapExerciseRow(r)]));

  const acc = new Map<MuscleGroup, { volumeKg: number; sets: number }>();
  const bump = (muscle: MuscleGroup, volumeKg: number, sets: number): void => {
    const cur = acc.get(muscle) ?? { volumeKg: 0, sets: 0 };
    cur.volumeKg += volumeKg;
    cur.sets += sets;
    acc.set(muscle, cur);
  };
  for (const r of rows) {
    const ex = exercises.get(r.exercise_id);
    if (!ex) continue;
    const volume = r.weight_kg * r.reps;
    bump(ex.muscleGroup, volume, 1);
    for (const muscle of ex.secondaryMuscles) bump(muscle, volume * 0.5, 0.5);
  }
  return [...acc.entries()]
    .map(([muscleGroup, v]) => ({ muscleGroup, volumeKg: v.volumeKg, sets: Math.round(v.sets) }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

/** Every day present asc; level 0 on rest days, else volume quartile 1..4 within the window. */
export async function getConsistency(days: number): Promise<ConsistencyCell[]> {
  if (days <= 0) return [];
  const today = todayISO();
  const from = addDays(today, -(days - 1));
  const rows = await getDb().getAllAsync<{ date_iso: string; volume: number | null }>(
    `SELECT ws.date_iso AS date_iso, SUM(se.weight_kg * se.reps) AS volume
     FROM set_entries se
     JOIN workout_sessions ws ON ws.id = se.session_id
     WHERE se.is_warmup = 0 AND ws.date_iso BETWEEN ? AND ?
     GROUP BY ws.date_iso`,
    [from, today],
  );
  const volumeByDay = new Map(rows.map((r) => [r.date_iso, r.volume ?? 0]));
  const nonZero = [...volumeByDay.values()].filter((v) => v > 0).sort((a, b) => a - b);

  const levelFor = (volume: number): ConsistencyCell['level'] => {
    if (volume <= 0 || nonZero.length === 0) return 0;
    let atOrBelow = 0;
    for (const v of nonZero) if (v <= volume) atOrBelow += 1;
    const quartile = Math.ceil((atOrBelow / nonZero.length) * 4);
    return Math.min(4, Math.max(1, quartile)) as ConsistencyCell['level'];
  };

  const cells: ConsistencyCell[] = [];
  for (let i = 0; i < days; i++) {
    const dateISO = addDays(from, i);
    cells.push({ dateISO, level: levelFor(volumeByDay.get(dateISO) ?? 0) });
  }
  return cells;
}

export async function getWorkoutFrequency(
  weeks: number,
): Promise<{ weekISO: string; sessions: number }[]> {
  if (weeks <= 0) return [];
  const buckets = weekBuckets(weeks);
  const firstWeek = [...buckets.keys()][0];
  const rows = await getDb().getAllAsync<{ date_iso: string; n: number }>(
    'SELECT date_iso, COUNT(*) AS n FROM workout_sessions WHERE date_iso >= ? GROUP BY date_iso',
    [firstWeek],
  );
  for (const r of rows) {
    const week = weekStartISO(r.date_iso);
    if (buckets.has(week)) buckets.set(week, (buckets.get(week) ?? 0) + r.n);
  }
  return [...buckets.entries()].map(([weekISO, sessions]) => ({ weekISO, sessions }));
}

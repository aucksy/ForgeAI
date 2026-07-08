import { getDb } from '@/db';
import { uuid } from '@/lib/uuid';
import type { PersonalRecord } from '@/types/models';

// ---------------------------------------------------------------- rows

interface PrRow {
  id: string;
  exercise_id: string;
  kind: string;
  value: number;
  weight_kg: number;
  reps: number;
  date_iso: string;
  session_id: string;
}

function mapPr(r: PrRow): PersonalRecord {
  return {
    id: r.id,
    exerciseId: r.exercise_id,
    kind: r.kind as PersonalRecord['kind'],
    value: r.value,
    weightKg: r.weight_kg,
    reps: r.reps,
    dateISO: r.date_iso,
    sessionId: r.session_id,
  };
}

/** Epley estimated 1RM — inlined so repos stay independent of the engine module. */
function epleyE1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------- api

/** Best 'weight' + 'e1rm' PR per exercise, joined with the exercise name, date desc. */
export async function getAllPrs(): Promise<(PersonalRecord & { exerciseName: string })[]> {
  const rows = await getDb().getAllAsync<PrRow & { exercise_name: string }>(
    `SELECT pr.*, e.name AS exercise_name
     FROM personal_records pr
     JOIN exercises e ON e.id = pr.exercise_id
     WHERE pr.kind IN ('weight', 'e1rm')`,
  );
  const best = new Map<string, PrRow & { exercise_name: string }>();
  for (const r of rows) {
    const key = `${r.exercise_id}|${r.kind}`;
    const cur = best.get(key);
    if (!cur || r.value > cur.value || (r.value === cur.value && r.date_iso > cur.date_iso)) {
      best.set(key, r);
    }
  }
  return [...best.values()]
    .sort((a, b) => (a.date_iso === b.date_iso ? 0 : a.date_iso > b.date_iso ? -1 : 1))
    .map((r) => ({ ...mapPr(r), exerciseName: r.exercise_name }));
}

/**
 * Scan a session's WORKING sets and record at most one 'weight' and one 'e1rm'
 * PR per exercise, compared against history strictly BEFORE the session
 * (by started_at). Re-running for the same session upgrades (never duplicates)
 * this session's PR rows. Returns the newly recorded PRs.
 */
export async function checkAndRecordPrs(sessionId: string): Promise<PersonalRecord[]> {
  const db = getDb();
  const session = await db.getFirstAsync<{ id: string; date_iso: string; started_at: number }>(
    'SELECT id, date_iso, started_at FROM workout_sessions WHERE id = ?',
    [sessionId],
  );
  if (!session) return [];

  const sets = await db.getAllAsync<{ exercise_id: string; weight_kg: number; reps: number }>(
    'SELECT exercise_id, weight_kg, reps FROM set_entries WHERE session_id = ? AND is_warmup = 0',
    [sessionId],
  );
  if (sets.length === 0) return [];

  interface Tops {
    topWeight: { weightKg: number; reps: number };
    topE1rm: { weightKg: number; reps: number; e1rm: number };
  }
  const perExercise = new Map<string, Tops>();
  for (const s of sets) {
    const e1rm = epleyE1rm(s.weight_kg, s.reps);
    const cur = perExercise.get(s.exercise_id);
    if (!cur) {
      perExercise.set(s.exercise_id, {
        topWeight: { weightKg: s.weight_kg, reps: s.reps },
        topE1rm: { weightKg: s.weight_kg, reps: s.reps, e1rm },
      });
      continue;
    }
    if (
      s.weight_kg > cur.topWeight.weightKg ||
      (s.weight_kg === cur.topWeight.weightKg && s.reps > cur.topWeight.reps)
    ) {
      cur.topWeight = { weightKg: s.weight_kg, reps: s.reps };
    }
    if (e1rm > cur.topE1rm.e1rm) {
      cur.topE1rm = { weightKg: s.weight_kg, reps: s.reps, e1rm };
    }
  }

  const recorded: PersonalRecord[] = [];
  for (const [exerciseId, tops] of perExercise) {
    const prior = await db.getFirstAsync<{
      best_weight: number | null;
      best_e1rm: number | null;
    }>(
      `SELECT MAX(se.weight_kg) AS best_weight,
              MAX(se.weight_kg * (1 + se.reps / 30.0)) AS best_e1rm
       FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE se.exercise_id = ? AND se.is_warmup = 0
         AND ws.started_at < ? AND ws.id <> ?`,
      [exerciseId, session.started_at, sessionId],
    );
    const priorWeight = prior?.best_weight ?? null;
    const priorE1rm = prior?.best_e1rm ?? null;

    if (priorWeight === null || tops.topWeight.weightKg > priorWeight) {
      const rec = await upsertSessionPr(
        exerciseId,
        'weight',
        tops.topWeight.weightKg,
        tops.topWeight.weightKg,
        tops.topWeight.reps,
        session,
      );
      if (rec) recorded.push(rec);
    }
    if (priorE1rm === null || tops.topE1rm.e1rm > priorE1rm) {
      const rec = await upsertSessionPr(
        exerciseId,
        'e1rm',
        round1(tops.topE1rm.e1rm),
        tops.topE1rm.weightKg,
        tops.topE1rm.reps,
        session,
      );
      if (rec) recorded.push(rec);
    }
  }
  return recorded;
}

/** Insert, or upgrade an existing PR row for this (session, exercise, kind). */
async function upsertSessionPr(
  exerciseId: string,
  kind: 'weight' | 'e1rm',
  value: number,
  weightKg: number,
  reps: number,
  session: { id: string; date_iso: string },
): Promise<PersonalRecord | null> {
  const db = getDb();
  const existing = await db.getFirstAsync<PrRow>(
    'SELECT * FROM personal_records WHERE session_id = ? AND exercise_id = ? AND kind = ?',
    [session.id, exerciseId, kind],
  );
  if (existing) {
    if (value <= existing.value) return null; // already recorded by an earlier addSets call
    await db.runAsync('UPDATE personal_records SET value = ?, weight_kg = ?, reps = ? WHERE id = ?', [
      value,
      weightKg,
      reps,
      existing.id,
    ]);
    return { id: existing.id, exerciseId, kind, value, weightKg, reps, dateISO: existing.date_iso, sessionId: session.id };
  }
  const id = uuid();
  await db.runAsync(
    `INSERT INTO personal_records(id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, exerciseId, kind, value, weightKg, reps, session.date_iso, session.id],
  );
  return { id, exerciseId, kind, value, weightKg, reps, dateISO: session.date_iso, sessionId: session.id };
}

export async function getPrHistory(exerciseId: string): Promise<PersonalRecord[]> {
  const rows = await getDb().getAllAsync<PrRow>(
    'SELECT * FROM personal_records WHERE exercise_id = ? ORDER BY date_iso ASC, rowid ASC',
    [exerciseId],
  );
  return rows.map(mapPr);
}

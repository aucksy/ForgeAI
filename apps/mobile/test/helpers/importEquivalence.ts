/**
 * Audit Phase 8 — helpers to prove the import's fast write path leaves the SAME database as the
 * old one-row-at-a-time path. Every file here is made up.
 *
 *  - `edgeHevyCsv`: a Hevy export with every kind of row the importer handles (warm-ups, drop and
 *    failure sets, RPE, notes with quotes and line breaks, supersets, a repeated block, timed and
 *    distance rows, bodyweight / assisted / weighted moves, a carried weight on a timed row, a new
 *    custom exercise, an emoji title, two workouts in the same minute, rows with nothing to log),
 *    in kg or lb.
 *  - `canonicalDump`: every table of a database, with each uuid replaced by its order of first
 *    appearance — two databases built the same way compare equal although their ids differ.
 */
import type { RealDb } from './realDb';

const HEAD = (lb: boolean): string =>
  `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type",${lb ? '"weight_lbs"' : '"weight_kg"'},"reps",${lb ? '"distance_miles"' : '"distance_km"'},"duration_seconds","rpe"`;

interface Row {
  title: string;
  start: string;
  end: string;
  desc?: string;
  ex: string;
  ss?: string;
  note?: string;
  i: number;
  type?: string;
  kg?: number | null;
  reps?: number | null;
  km?: number | null;
  sec?: number | null;
  rpe?: number | null;
}

const q = (s: string): string => `"${s.replace(/"/g, '""')}"`;

function line(r: Row, lb: boolean): string {
  const w = r.kg == null ? '' : lb ? String(Math.round((r.kg / 0.45359237) * 100) / 100) : String(r.kg);
  const d = r.km == null ? '' : lb ? String(Math.round((r.km / 1.609344) * 100000) / 100000) : String(r.km);
  return [
    q(r.title),
    q(r.start),
    q(r.end),
    q(r.desc ?? ''),
    q(r.ex),
    r.ss ?? '',
    q(r.note ?? ''),
    r.i,
    q(r.type ?? 'normal'),
    w,
    r.reps == null ? '' : String(r.reps),
    d,
    r.sec == null ? '' : String(r.sec),
    r.rpe == null ? '' : String(r.rpe),
  ].join(',');
}

/** Workouts of the edge file. `withTimed: false` drops the rows without reps (an older import). */
export function edgeRows(): Row[] {
  const w = (title: string, start: string, end: string, desc: string, sets: Omit<Row, 'title' | 'start' | 'end' | 'desc'>[]): Row[] =>
    sets.map((s) => ({ title, start, end, desc, ...s }));
  return [
    ...w('Push 1', '6 Jan 2025, 18:00', '6 Jan 2025, 19:10', 'felt strong', [
      { ex: 'Bench Press (Barbell)', ss: '1', note: 'Pause "reps"', i: 0, type: 'warmup', kg: 40, reps: 10 },
      { ex: 'Bench Press (Barbell)', ss: '1', note: 'Pause "reps"', i: 1, kg: 80, reps: 8, rpe: 8 },
      { ex: 'Cable Fly Crossovers', ss: '1', i: 0, kg: 20, reps: 12, rpe: 7.5 },
      { ex: 'Cable Fly Crossovers', ss: '1', i: 1, type: 'dropset', kg: 15, reps: 10 },
      { ex: 'Bench Press (Barbell)', ss: '1', note: 'Pause "reps"', i: 2, kg: 85, reps: 5, rpe: 9 },
      // A second block of Bench (Hevy restarts set_index): its own card, its own note.
      { ex: 'Bench Press (Barbell)', note: 'Back-off', i: 0, kg: 70, reps: 10 },
      { ex: 'Bench Press (Barbell)', note: 'Back-off', i: 1, type: 'failure', kg: 60, reps: 12, rpe: 10 },
      { ex: 'Plank', i: 0, sec: 60 },
      { ex: 'Plank', i: 1, sec: 45 },
      { ex: 'Farmers Walk Home', i: 0, kg: 32, sec: 40 },
      // Nothing to log: skipped.
      { ex: 'Bench Press (Barbell)', i: 9, kg: 50 },
    ]),
    ...w('Pull 1', '8 Jan 2025, 7:30', '8 Jan 2025, 8:30', '', [
      { ex: 'Pull Up', i: 0, reps: 10 },
      { ex: 'Pull Up', i: 1, reps: 8 },
      { ex: 'Pull Up (Assisted)', i: 0, kg: 20, reps: 8 },
      { ex: 'Pull Up (Assisted)', i: 1, kg: 25, reps: 8 },
      { ex: 'Chin Up (Weighted)', i: 0, kg: 10, reps: 6 },
      { ex: 'Pendlay Row Home', i: 0, kg: 60, reps: 8 },
      { ex: 'Pendlay Row Home', i: 1, kg: 60, reps: 8 },
      { ex: 'Treadmill', i: 0, km: 2.5, sec: 900 },
    ]),
    ...w('Legs', '10 Jan 2025, 18:00', '10 Jan 2025, 19:00', '', [
      { ex: 'Squat (Barbell)', i: 0, kg: 100, reps: 5 },
      { ex: 'Squat (Barbell)', i: 1, kg: 105, reps: 3 },
      { ex: 'Squat (Barbell)', i: 2, kg: 110, reps: 1 },
      // Equal estimated maxes: the first stays the record.
      { ex: 'Leg Press (Machine)', i: 0, kg: 60, reps: 15 },
      { ex: 'Leg Press (Machine)', i: 1, kg: 75, reps: 6 },
      { ex: 'Leg Press (Machine)', i: 2, kg: 60, reps: 15 },
    ]),
    // Same title and start minute, another end: a second workout (one second later).
    ...w('Legs', '10 Jan 2025, 18:00', '10 Jan 2025, 18:30', '', [{ ex: 'Squat (Barbell)', i: 0, kg: 120, reps: 1 }]),
    ...w('Push 1', '13 Jan 2025, 18:00', '13 Jan 2025, 19:00', '', [
      { ex: 'Bench Press (Barbell)', i: 0, kg: 87.5, reps: 5 },
      { ex: 'Cable Fly Crossovers', i: 0, kg: 20, reps: 12 },
      { ex: 'Farmers Walk Home', i: 0, kg: 30, sec: 40 },
    ]),
    ...w('Morning workout ☀️', '15 Jan 2025, 6:00', '15 Jan 2025, 6:45', 'line one\nline "two"', [
      { ex: 'Overhead Press (Barbell)', note: 'Strict, no leg\ndrive', i: 0, kg: 50, reps: 5 },
      { ex: 'Overhead Press (Barbell)', i: 1, kg: 52.5, reps: 3 },
    ]),
    ...w('Push 2', '20 Jan 2025, 18:00', '20 Jan 2025, 19:00', '', [{ ex: 'Bench Press (Barbell)', i: 0, kg: 95, reps: 2 }]),
    ...w('Pull 2', '25 Jan 2025, 7:30', '25 Jan 2025, 8:20', '', [
      { ex: 'Pull Up (Assisted)', i: 0, kg: 15, reps: 10 },
      { ex: 'Plank', i: 0, sec: 75 },
    ]),
    ...w('Arms', '1 Feb 2025, 17:00', '1 Feb 2025, 17:40', '', [
      { ex: 'Bicep Curl (Dumbbell)', i: 0, kg: 15, reps: 12 },
      { ex: 'Hammer Curl (Dumbbell)', i: 0, kg: 25, reps: 10 },
      { ex: 'Hammer Curl (Dumbbell)', i: 1, kg: 12.5, reps: 12 },
    ]),
    ...w('Push 1', '3 Feb 2025, 18:00', '3 Feb 2025, 19:00', '', [
      { ex: 'Bench Press (Barbell)', i: 0, kg: 89, reps: 3 },
      { ex: 'Bench Press (Barbell)', i: 1, kg: 91, reps: 1 },
    ]),
  ];
}

/** The rows a later file adds (after the backfill test's first import). */
export function laterRows(): Row[] {
  return [
    // A new workout BEFORE the backfilled ones: records are being worked out when the backfill
    // adds the heavier carry, which must count for the later "Carry".
    { title: 'Carry', start: '2 Jan 2025, 18:00', end: '2 Jan 2025, 18:30', ex: 'Farmers Walk Home', i: 0, kg: 28, sec: 40 },
    { title: 'Carry', start: '10 Feb 2025, 18:00', end: '10 Feb 2025, 18:30', ex: 'Farmers Walk Home', i: 0, kg: 31, sec: 40 },
    { title: 'Carry', start: '10 Feb 2025, 18:00', end: '10 Feb 2025, 18:30', ex: 'Squat (Barbell)', i: 0, kg: 125, reps: 1 },
  ];
}

export function hevyCsv(rows: readonly Row[], opts: { lb?: boolean; withTimed?: boolean } = {}): string {
  const lb = opts.lb ?? false;
  const keep = opts.withTimed === false ? rows.filter((r) => r.reps != null) : rows;
  return `${[HEAD(lb), ...keep.map((r) => line(r, lb))].join('\n')}\n`;
}

export const toB64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

// ---------------------------------------------------------------- canonical dump

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Tables read first, in this order, so every id first appears at the same place in both. */
const FIRST = ['exercises', 'workout_plans', 'plan_days', 'plan_exercises', 'workout_sessions', 'set_entries'];

export interface Canon {
  tok: (v: unknown) => unknown;
}

export function canonicalizer(): Canon {
  const ids = new Map<string, string>();
  const tok = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return v.replace(UUID, (m) => {
        const k = m.toLowerCase();
        let t = ids.get(k);
        if (!t) {
          t = `#${ids.size + 1}`;
          ids.set(k, t);
        }
        return t;
      });
    }
    if (Array.isArray(v)) return v.map(tok);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, tok(x)]));
    return v;
  };
  return { tok };
}

/**
 * Every table, rows in rowid order (the order matters: sets are shown and exported in it), ids
 * canonical. `personal_records` is compared as a set (content-sorted) plus, per exercise, in the
 * order the records page reads them (date, then rowid) — the order ACROSS exercises inside one
 * workout follows SQLite's index choice, not the app.
 */
export function canonicalDump(db: RealDb, canon: Canon = canonicalizer()): Record<string, unknown> {
  const all = db.tables().filter((t) => !t.startsWith('sqlite_'));
  const order = [...FIRST.filter((t) => all.includes(t)), ...all.filter((t) => !FIRST.includes(t) && t !== 'personal_records').sort()];
  const out: Record<string, unknown> = {};
  const rowsOf = (t: string): Record<string, unknown>[] => {
    try {
      return db.all<Record<string, unknown>>(`SELECT * FROM ${t} ORDER BY rowid`);
    } catch {
      return db.all<Record<string, unknown>>(`SELECT * FROM ${t}`).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
    }
  };
  for (const t of order.filter((x) => FIRST.includes(x))) out[t] = rowsOf(t).map((r) => canon.tok(r));
  if (all.includes('personal_records')) {
    const prs = db
      .all<Record<string, unknown>>('SELECT exercise_id, kind, value, weight_kg, reps, date_iso, session_id FROM personal_records')
      .map((r) => canon.tok(r) as Record<string, unknown>)
      .map((r) => JSON.stringify(r))
      .sort();
    out.personal_records = prs;
    const byExercise: Record<string, unknown[]> = {};
    for (const ex of db.all<{ id: string }>('SELECT DISTINCT exercise_id AS id FROM personal_records')) {
      const key = String(canon.tok(ex.id));
      byExercise[key] = db
        .all<Record<string, unknown>>(
          'SELECT kind, value, weight_kg, reps, date_iso, session_id FROM personal_records WHERE exercise_id = ? ORDER BY date_iso, rowid',
          [ex.id],
        )
        .map((r) => canon.tok(r));
    }
    out.personal_records_by_exercise = Object.fromEntries(Object.entries(byExercise).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  for (const t of order.filter((x) => !FIRST.includes(x))) {
    if (t === 'training_changes') {
      // Tracker schema v13: a change COUNTER kept by triggers. The old path wrote each set twice
      // (INSERT, then UPDATE), so its number went up further; only WHAT changed is compared —
      // which exercises are marked (and '#version' / '#all').
      out[t] = db
        .all<{ id: string }>('SELECT id FROM training_changes')
        .map((r) => String(canon.tok(r.id)))
        .sort();
      continue;
    }
    out[t] = rowsOf(t).map((r) => canon.tok(r));
  }
  return out;
}

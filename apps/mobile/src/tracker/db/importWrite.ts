/**
 * Audit Phase 8 (fast import with years of data) — the history import's own write path.
 *
 * Before: every imported workout went through the frozen `createSession` + two UPDATEs +
 * `addSetsWithMeta` (one INSERT per set, then one UPDATE per set with metadata, then the frozen
 * record check, which asks SQLite for "the best before this workout" once per exercise per
 * workout — a query over every earlier set, so the cost grew with the square of the history).
 * Five years took ~68,000 statements.
 *
 * Now (`fastImportWriter`): rows are buffered and written with multi-row INSERTs (every column at
 * once, ~200 rows a statement, no follow-up UPDATE), and records are worked out in JavaScript
 * with a running best per exercise — the same rule as the frozen `checkAndRecordPrs`, applied in
 * the same order, so the database ends up IDENTICAL to the old path's (proven by
 * test/tracker/importWriteEquivalence.test.ts, which runs both on the same files).
 *
 * `legacyImportWriter` is the old path, kept as the reference that test compares against.
 *
 * Both run INSIDE the caller's queued transaction (`runImport`): no enqueueWrite here (nesting it
 * would deadlock), no BEGIN.
 */
import { getDb } from '@/db';
import { E1RM_SQL } from '@/db/repos/prRepo';
import { createSession, deleteSession, deleteSessions } from '@/db/repos/workoutRepo';
import { uuid } from '@/lib/uuid';
import type { DayType } from '@/types/models';

import { isLoadMode } from '../engine/logTypes';
import { addSetsWithMeta, type RichSet, type SetType } from './trackerSets';

type SqlValue = string | number | null;

/** One imported workout's own row. */
export interface ImportSessionInput {
  dateISO: string;
  dayType: DayType;
  notes: string | null;
  startedAt: number;
  endedAt: number | null;
  /** The workout's own name (tracker schema v9); null = none. */
  title: string | null;
  /** The routine of that name (tracker schema v11); null = none. */
  routineId: string | null;
}

export interface ImportWriter {
  /** Replace: delete these workouts (their records too; sets cascade). */
  deleteSessions(ids: readonly string[], onChunk?: (done: number, total: number) => void): Promise<void>;
  /** A new workout with its sets (in the order they are numbered). Returns its id. */
  addWorkout(session: ImportSessionInput, sets: RichSet[]): Promise<string>;
  /** Merge backfill: sets added to a workout that is already here. */
  backfill(sessionId: string, sets: RichSet[]): Promise<void>;
  /** Everything still buffered is written. Call once, inside the transaction. */
  finish(): Promise<void>;
  /** Statements this writer ran itself (for the perf lane). */
  readonly statements: number;
}

// ---------------------------------------------------------------- the old path (reference)

/** Today's calls before Phase 8, one by one. The equivalence test's reference. */
export function legacyImportWriter(): ImportWriter {
  return {
    statements: 0,
    async deleteSessions(ids, onChunk) {
      for (const id of ids) await deleteSession(id);
      onChunk?.(ids.length, ids.length);
    },
    async addWorkout(s, sets) {
      const session = await createSession({
        dateISO: s.dateISO,
        dayType: s.dayType,
        notes: s.notes,
        source: 'manual',
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      });
      if (s.title) await getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', [s.title, session.id]);
      if (s.routineId) await getDb().runAsync('UPDATE workout_sessions SET routine_id = ? WHERE id = ?', [s.routineId, session.id]);
      await addSetsWithMeta(session.id, sets);
      return session.id;
    },
    async backfill(sessionId, sets) {
      await addSetsWithMeta(sessionId, sets);
    },
    async finish() {
      // Nothing buffered.
    },
  };
}

// ---------------------------------------------------------------- set row (as addSetsWithMeta stores it)

export const SESSION_COLS = ['id', 'date_iso', 'started_at', 'ended_at', 'day_type', 'notes', 'source', 'title', 'routine_id'] as const;
export const SET_COLS = [
  'id', 'session_id', 'exercise_id', 'set_number', 'weight_kg', 'reps', 'is_warmup',
  'rpe', 'set_type', 'note', 'superset_group', 'duration_sec', 'distance_m', 'load_mode', 'card_index',
] as const;
export const RECORD_COLS = ['id', 'exercise_id', 'kind', 'value', 'weight_kg', 'reps', 'date_iso', 'session_id'] as const;

/**
 * The full `set_entries` row the frozen `addSets` INSERT + `addSetsWithMeta`'s UPDATE leave
 * behind for one set. A plain working set keeps every additive column NULL (that UPDATE is
 * skipped for it), so `set_type` is written only when the set has metadata. PURE.
 */
export function importSetRow(id: string, sessionId: string, setNumber: number, s: RichSet): SqlValue[] {
  const isWarmup = s.isWarmup ?? false;
  const setType: SetType = isWarmup ? 'warmup' : s.setType ?? 'normal';
  const durationSec = s.durationSec != null && s.durationSec > 0 ? s.durationSec : null;
  const distanceM = s.distanceM != null && s.distanceM > 0 ? s.distanceM : null;
  const loadMode = isLoadMode(s.loadMode) ? s.loadMode : null;
  const cardIndex = s.cardIndex != null && s.cardIndex > 0 ? Math.round(s.cardIndex) : null;
  const rpe = s.rpe ?? null;
  const note = s.note ?? null;
  const group = s.supersetGroup ?? null;
  const hasMeta =
    rpe !== null ||
    note !== null ||
    group !== null ||
    setType !== 'normal' ||
    durationSec !== null ||
    distanceM !== null ||
    loadMode !== null ||
    cardIndex !== null;
  return [
    id,
    sessionId,
    s.exerciseId,
    setNumber,
    s.weightKg,
    s.reps,
    isWarmup ? 1 : 0,
    rpe,
    hasMeta ? setType : null,
    note,
    group,
    durationSec,
    distanceM,
    loadMode,
    cardIndex,
  ];
}

// ---------------------------------------------------------------- records (the frozen rule, in JS)

/** prRepo's Epley (a true single IS the 1-rep max), written the same way so the doubles match. */
function e1rmOf(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

interface Contribution {
  /** The workout's started_at. */
  t: number;
  /** Its best working weight and best estimated 1-rep max for the exercise. */
  w: number;
  e: number;
}

/**
 * "The best before this workout" for one exercise — what the frozen check asks SQLite
 * (`MAX(weight)`, `MAX(e1rm)` over working sets of workouts with started_at < T). Questions come
 * in rising T (the file is in time order), so everything before the last T is folded into one
 * best and the rest waits, smallest start last; a question going back in time is answered by
 * reading every contribution (correct, only slower).
 */
export class BestBefore {
  private all: Contribution[] = [];
  /** Starts at or after `upTo`, sorted by start DESCENDING (the next to fold is last). */
  private pending: Contribution[] = [];
  private upTo = Number.NEGATIVE_INFINITY;
  private w: number | null = null;
  private e: number | null = null;

  private fold(c: Contribution): void {
    if (this.w === null || c.w > this.w) this.w = c.w;
    if (this.e === null || c.e > this.e) this.e = c.e;
  }

  add(c: Contribution): void {
    this.all.push(c);
    if (c.t < this.upTo) {
      this.fold(c);
      return;
    }
    // Binary search for its place in the descending list.
    let lo = 0;
    let hi = this.pending.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pending[mid].t > c.t) lo = mid + 1;
      else hi = mid;
    }
    this.pending.splice(lo, 0, c);
  }

  /** Bulk add (the history already here): one sort instead of one splice each. */
  addMany(cs: readonly Contribution[]): void {
    for (const c of cs) {
      this.all.push(c);
      if (c.t < this.upTo) this.fold(c);
      else this.pending.push(c);
    }
    this.pending.sort((a, b) => b.t - a.t);
  }

  /** MAX(weight), MAX(e1rm) over contributions strictly before `t` (null = none). */
  before(t: number): { w: number | null; e: number | null } {
    if (t < this.upTo) {
      let w: number | null = null;
      let e: number | null = null;
      for (const c of this.all) {
        if (!(c.t < t)) continue;
        if (w === null || c.w > w) w = c.w;
        if (e === null || c.e > e) e = c.e;
      }
      return { w, e };
    }
    this.upTo = t;
    while (this.pending.length > 0 && this.pending[this.pending.length - 1].t < t) this.fold(this.pending.pop() as Contribution);
    return { w: this.w, e: this.e };
  }
}

interface Tops {
  topWeight: { weightKg: number; reps: number };
  topE1rm: { weightKg: number; reps: number; e1rm: number };
}

/**
 * `checkAndRecordPrs`'s per-exercise tops for one new workout: its working sets in the order they
 * are written (= the order SQLite returns them), weight ties broken by reps, the first of equal
 * 1-rep maxes kept. Map order = each exercise's first working set. PURE.
 */
export function workoutTops(sets: readonly { exerciseId: string; weightKg: number; reps: number; isWarmup?: boolean }[]): Map<string, Tops> {
  const per = new Map<string, Tops>();
  for (const s of sets) {
    if (s.isWarmup) continue;
    const e1rm = e1rmOf(s.weightKg, s.reps);
    const cur = per.get(s.exerciseId);
    if (!cur) {
      per.set(s.exerciseId, { topWeight: { weightKg: s.weightKg, reps: s.reps }, topE1rm: { weightKg: s.weightKg, reps: s.reps, e1rm } });
      continue;
    }
    if (s.weightKg > cur.topWeight.weightKg || (s.weightKg === cur.topWeight.weightKg && s.reps > cur.topWeight.reps)) {
      cur.topWeight = { weightKg: s.weightKg, reps: s.reps };
    }
    if (e1rm > cur.topE1rm.e1rm) cur.topE1rm = { weightKg: s.weightKg, reps: s.reps, e1rm };
  }
  return per;
}

// ---------------------------------------------------------------- the fast path

/** Rows per multi-row INSERT (15 columns × 200 = 3,000 bound values; SQLite allows 32,766). */
export const IMPORT_CHUNK_ROWS = 200;

export function fastImportWriter(opts: { chunkRows?: number } = {}): ImportWriter {
  const chunk = Math.max(1, opts.chunkRows ?? IMPORT_CHUNK_ROWS);
  const sessions: SqlValue[][] = [];
  const sets: SqlValue[][] = [];
  const records: SqlValue[][] = [];
  let bests: Map<string, BestBefore> | null = null;
  const sqlCache = new Map<string, string>();
  const writer = { statements: 0 } as ImportWriter & { statements: number };

  const run = async (sql: string, params: SqlValue[]): Promise<void> => {
    writer.statements += 1;
    await getDb().runAsync(sql, params);
  };

  const insert = async (table: string, cols: readonly string[], rows: SqlValue[][]): Promise<void> => {
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const key = `${table}:${part.length}`;
      let sql = sqlCache.get(key);
      if (!sql) {
        const tuple = `(${cols.map(() => '?').join(', ')})`;
        sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${part.map(() => tuple).join(', ')}`;
        sqlCache.set(key, sql);
      }
      const params: SqlValue[] = [];
      for (const r of part) for (const v of r) params.push(v);
      await run(sql, params);
    }
    rows.length = 0;
  };

  /** Sessions before their sets (foreign key); records last, in the order they were earned. */
  const flush = async (withRecords: boolean): Promise<void> => {
    await insert('workout_sessions', SESSION_COLS, sessions);
    await insert('set_entries', SET_COLS, sets);
    if (withRecords) await insert('personal_records', RECORD_COLS, records);
  };

  const bestOf = (exerciseId: string): BestBefore => {
    let b = (bests as Map<string, BestBefore>).get(exerciseId);
    if (!b) {
      b = new BestBefore();
      (bests as Map<string, BestBefore>).set(exerciseId, b);
    }
    return b;
  };

  /** Each workout here, per exercise: its start, best working weight and best 1-rep max. */
  const readHere = async (sessionId?: string): Promise<{ exercise_id: string; t: number; w: number; e: number }[]> => {
    writer.statements += 1;
    return getDb().getAllAsync<{ exercise_id: string; t: number; w: number; e: number }>(
      `SELECT se.exercise_id AS exercise_id, ws.started_at AS t, MAX(se.weight_kg) AS w, MAX(${E1RM_SQL}) AS e
         FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE se.is_warmup = 0${sessionId ? ' AND se.session_id = ?' : ''}
        GROUP BY se.session_id, se.exercise_id`,
      sessionId ? [sessionId] : [],
    );
  };

  /** The history already here, read once (after Replace's delete, before the first new workout). */
  const ensureBests = async (): Promise<void> => {
    if (bests) return;
    bests = new Map();
    const byExercise = new Map<string, Contribution[]>();
    for (const r of await readHere()) {
      if (r.w == null || r.e == null) continue; // MAX over NULLs only: SQLite ignores them too
      const list = byExercise.get(r.exercise_id) ?? [];
      list.push({ t: Number(r.t), w: Number(r.w), e: Number(r.e) });
      byExercise.set(r.exercise_id, list);
    }
    for (const [id, list] of byExercise) bestOf(id).addMany(list);
  };

  writer.deleteSessions = async (ids, onChunk) => {
    // Two statements per chunk (was two per workout).
    await deleteSessions(ids, {
      chunk,
      onChunk: (d, t) => {
        writer.statements += 2;
        onChunk?.(d, t);
      },
    });
  };

  writer.addWorkout = async (s, rich) => {
    await ensureBests();
    const id = uuid();
    sessions.push([id, s.dateISO, s.startedAt, s.endedAt ?? null, s.dayType, s.notes ?? null, 'manual', s.title ? s.title : null, s.routineId ? s.routineId : null]);
    // Set numbers continue per exercise within the workout (a new workout: from 1).
    const counters = new Map<string, number>();
    for (const r of rich) {
      const n = (counters.get(r.exerciseId) ?? 0) + 1;
      counters.set(r.exerciseId, n);
      sets.push(importSetRow(uuid(), id, n, r));
    }
    // The frozen record check, for this workout, against everything before it.
    const tops = workoutTops(rich);
    for (const [exerciseId, t] of tops) {
      const prior = bests ? bestOf(exerciseId).before(s.startedAt) : { w: null, e: null };
      if (prior.w === null || t.topWeight.weightKg > prior.w) {
        records.push([uuid(), exerciseId, 'weight', t.topWeight.weightKg, t.topWeight.weightKg, t.topWeight.reps, s.dateISO, id]);
      }
      if (prior.e === null || t.topE1rm.e1rm > prior.e) {
        records.push([uuid(), exerciseId, 'e1rm', round1(t.topE1rm.e1rm), t.topE1rm.weightKg, t.topE1rm.reps, s.dateISO, id]);
      }
    }
    for (const [exerciseId, t] of tops) bestOf(exerciseId).add({ t: s.startedAt, w: t.topWeight.weightKg, e: t.topE1rm.e1rm });
    if (sets.length >= chunk) await flush(false);
    return id;
  };

  writer.backfill = async (sessionId, rich) => {
    // Rare (one Merge, once ever). Everything so far goes in first, then the old path runs on
    // the real tables exactly as before, and its new sets count for later workouts' records.
    await flush(true);
    await addSetsWithMeta(sessionId, rich);
    writer.statements += 1;
    if (bests) {
      for (const r of await readHere(sessionId)) {
        if (r.w == null || r.e == null) continue;
        bestOf(r.exercise_id).add({ t: Number(r.t), w: Number(r.w), e: Number(r.e) });
      }
    }
  };

  writer.finish = async () => {
    await flush(true);
  };

  return writer;
}

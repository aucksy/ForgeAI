/**
 * The cloud copy on the phone (tracker #50): its two small tables, reading everything the member
 * keeps as packed items, and writing a server copy back in. The decisions are in copyPlan.ts (pure);
 * this file only reads and writes SQLite.
 *
 * ADDITIVE ONLY. Two new tables, made by `initCloudCopySchema()` (idempotent, versioned in `meta`
 * like initTrackerSchema). No frozen table or repo changes:
 *   cloud_copy_state  what this phone last copied of each item (hash + edit time)
 *   cloud_copy_queue  writes waiting to be sent, ONE row per item (a newer edit replaces the
 *                     waiting one), with its tries and the time of the next try
 * Neither is in a Drive backup (snapshot.ts lists its tables by name) and "Erase all data" empties
 * both (eraseDevice.ts, step 'member-account').
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, getMeta, setMeta } from '@/db';
import { MERGE_PENDING_KEY } from './accountMeta';
import { enqueueWrite } from '@/db/writeQueue';
import { uuid } from '@/lib/uuid';
import { COARSE_OF } from '@/tracker/catalog/muscles';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';

import type { LocalItem, MergeApply, MergePlan, QueueOp, ScanPlan, StateRow } from './copyPlan';
import {
  exerciseRef,
  measurementId,
  packBodyWeight,
  packExercise,
  packFolder,
  packHash,
  packMeasurement,
  packPhotoRecord,
  packPrefs,
  packProfile,
  packWorkout,
  parseRef,
  splitMeasurementId,
  unpackBodyWeight,
  unpackExercise,
  unpackFolder,
  unpackPrefs,
  unpackProfile,
  unpackWorkout,
  type DayRow,
  type FolderRow,
  type ItemKind,
  type OwnExerciseRow,
  type PlanExerciseRow,
  type ProfileRow,
  type SetRow,
  type WorkoutRow,
} from './pack';

type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

export const CLOUD_COPY_SCHEMA_VERSION = 1;
const SCHEMA_KEY = 'cloud_copy_schema_version';

const made = new WeakSet<object>();

/** Make the two tables (once per open database). */
export async function initCloudCopySchema(): Promise<void> {
  const db = getDb();
  if (made.has(db)) return;
  if (Number((await getMeta(SCHEMA_KEY)) ?? '0') < CLOUD_COPY_SCHEMA_VERSION) {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS cloud_copy_state (
         kind TEXT NOT NULL, item_id TEXT NOT NULL, hash TEXT NOT NULL, edited_at INTEGER NOT NULL,
         PRIMARY KEY (kind, item_id)
       )`,
    );
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS cloud_copy_queue (
         kind TEXT NOT NULL, item_id TEXT NOT NULL, data TEXT, edited_at INTEGER NOT NULL,
         attempts INTEGER NOT NULL DEFAULT 0, next_try_at INTEGER NOT NULL DEFAULT 0, last_error TEXT,
         PRIMARY KEY (kind, item_id)
       )`,
    );
    await setMeta(SCHEMA_KEY, String(CLOUD_COPY_SCHEMA_VERSION));
  }
  made.add(db);
}

// ------------------------------------------------------------------ reading the phone

/** Every exercise's ref (library key, else its own id). */
async function refMap(db: Tx): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ id: string; catalog_key: string | null }>('SELECT id, catalog_key FROM exercises');
  return new Map(rows.map((r) => [r.id, exerciseRef(r.id, r.catalog_key)]));
}

function item(kind: ItemKind, id: string, data: string, guess = 0): LocalItem {
  return { kind, id, data, hash: packHash(data), guess };
}

/** Everything the member keeps, packed (pack.ts). Demo data is the caller's to refuse. */
export async function readLocalItems(db: Tx = getDb()): Promise<LocalItem[]> {
  const refs = await refMap(db);
  const refOf = (id: string): string => refs.get(id) ?? `x:${id}`;
  const out: LocalItem[] = [];

  const sessions = await db.getAllAsync<WorkoutRow>(
    'SELECT id, date_iso, started_at, ended_at, day_type, notes, source, easy_week, title, routine_id FROM workout_sessions',
  );
  const sets = await db.getAllAsync<SetRow & { session_id: string }>(
    `SELECT session_id, exercise_id, set_number, weight_kg, reps, is_warmup, rpe, set_type, note, superset_group,
            duration_sec, distance_m, load_mode, card_index
       FROM set_entries ORDER BY session_id, rowid`,
  );
  const bySession = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = bySession.get(s.session_id);
    if (list) list.push(s);
    else bySession.set(s.session_id, [s]);
  }
  for (const w of sessions) {
    out.push(item('w', w.id, packWorkout(w, bySession.get(w.id) ?? [], refOf), w.ended_at ?? w.started_at));
  }

  const folders = await db.getAllAsync<FolderRow>('SELECT id, name, is_active, folder_order, source, settings FROM workout_plans');
  const days = await db.getAllAsync<DayRow>('SELECT id, plan_id, day_type, day_order, name FROM plan_days ORDER BY plan_id, day_order, rowid');
  const exs = await db.getAllAsync<PlanExerciseRow>(
    `SELECT plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec, superset_group, note
       FROM plan_exercises ORDER BY plan_day_id, ex_order, rowid`,
  );
  for (const f of folders) {
    const mine = days.filter((d) => d.plan_id === f.id);
    const ids = new Set(mine.map((d) => d.id));
    out.push(item('r', f.id, packFolder(f, mine, exs.filter((e) => ids.has(e.plan_day_id)), refOf)));
  }

  const own = await db.getAllAsync<OwnExerciseRow & { id: string }>(
    `SELECT id, name, muscle_group, equipment, is_compound, increment_kg, aliases, secondary_muscles, log_type, load_mode,
            bw_share, muscles, dist_unit
       FROM exercises WHERE catalog_key IS NULL`,
  );
  for (const e of own) out.push(item('x', e.id, packExercise(e)));

  const prefs = await db.getAllAsync<{ exercise_id: string; rest_sec: number | null; records_from: string | null }>(
    'SELECT exercise_id, rest_sec, records_from FROM exercise_prefs',
  );
  const prefRows = prefs.filter((p) => refs.has(p.exercise_id) && (p.rest_sec != null || p.records_from != null));
  if (prefRows.length > 0) {
    out.push(item('p', 'all', packPrefs(prefRows.map((p) => ({ ref: refOf(p.exercise_id), rest_sec: p.rest_sec, records_from: p.records_from })))));
  }

  for (const b of await db.getAllAsync<{ date_iso: string; weight_kg: number }>('SELECT date_iso, weight_kg FROM body_weight')) {
    out.push(item('b', b.date_iso, packBodyWeight(b.weight_kg)));
  }
  for (const m of await db.getAllAsync<{ date_iso: string; kind: string; value: number }>('SELECT date_iso, kind, value FROM body_measurements')) {
    out.push(item('m', measurementId(m.date_iso, m.kind), packMeasurement(m.value)));
  }
  for (const p of await db.getAllAsync<{ id: string; date_iso: string; created_at: number }>('SELECT id, date_iso, created_at FROM progress_photos')) {
    out.push(item('f', p.id, packPhotoRecord(p.date_iso, p.created_at)));
  }
  const profile = await db.getFirstAsync<ProfileRow>(
    `SELECT name, age, height_cm, goal, experience, gym_name, member_since_iso, calorie_target, protein_target_g, carbs_target_g,
            fat_target_g, unit_system, language, bio, link
       FROM user_profile ORDER BY rowid LIMIT 1`,
  );
  if (profile) out.push(item('u', 'me', packProfile(profile)));
  return out;
}

// ------------------------------------------------------------------ state and queue

export async function readState(db: Tx = getDb()): Promise<StateRow[]> {
  const rows = await db.getAllAsync<{ kind: ItemKind; item_id: string; hash: string; edited_at: number }>(
    'SELECT kind, item_id, hash, edited_at FROM cloud_copy_state',
  );
  return rows.map((r) => ({ kind: r.kind, id: r.item_id, hash: r.hash, editedAt: r.edited_at }));
}

async function remember(db: Tx, rows: readonly StateRow[]): Promise<void> {
  for (const r of rows) {
    await db.runAsync(
      `INSERT INTO cloud_copy_state(kind, item_id, hash, edited_at) VALUES(?, ?, ?, ?)
       ON CONFLICT(kind, item_id) DO UPDATE SET hash = excluded.hash, edited_at = excluded.edited_at`,
      [r.kind, r.id, r.hash, r.editedAt],
    );
  }
}

async function forget(db: Tx, rows: readonly { kind: ItemKind; id: string }[]): Promise<void> {
  for (const r of rows) await db.runAsync('DELETE FROM cloud_copy_state WHERE kind = ? AND item_id = ?', [r.kind, r.id]);
}

/** Queue writes; a newer write of the same item replaces the waiting one (and its retry clock). */
export async function queueOps(db: Tx, ops: readonly QueueOp[]): Promise<void> {
  for (const o of ops) {
    await db.runAsync(
      `INSERT INTO cloud_copy_queue(kind, item_id, data, edited_at, attempts, next_try_at, last_error) VALUES(?, ?, ?, ?, 0, 0, NULL)
       ON CONFLICT(kind, item_id) DO UPDATE SET data = excluded.data, edited_at = excluded.edited_at, attempts = 0, next_try_at = 0, last_error = NULL
        WHERE excluded.edited_at >= cloud_copy_queue.edited_at`,
      [o.kind, o.id, o.data, o.editedAt],
    );
  }
}

/** A scan's result, in one transaction (the caller holds the app's write queue). */
export async function writeScan(db: Tx, plan: ScanPlan): Promise<void> {
  await queueOps(db, plan.ops);
  await remember(db, plan.remember);
  await forget(db, plan.forget);
}

export interface QueuedRow extends QueueOp {
  attempts: number;
}

export async function dueOps(now: number, limit: number, db: Tx = getDb()): Promise<QueuedRow[]> {
  const rows = await db.getAllAsync<{ kind: ItemKind; item_id: string; data: string | null; edited_at: number; attempts: number }>(
    'SELECT kind, item_id, data, edited_at, attempts FROM cloud_copy_queue WHERE next_try_at <= ? ORDER BY edited_at, kind, item_id LIMIT ?',
    [now, limit],
  );
  return rows.map((r) => ({ kind: r.kind, id: r.item_id, data: r.data, editedAt: r.edited_at, attempts: r.attempts }));
}

/** Sent: out of the queue — unless a newer edit of it was queued while it was on its way. */
export async function markSent(db: Tx, ops: readonly QueueOp[]): Promise<void> {
  for (const o of ops) {
    await db.runAsync('DELETE FROM cloud_copy_queue WHERE kind = ? AND item_id = ? AND edited_at = ?', [o.kind, o.id, o.editedAt]);
  }
}

/** Not sent: one more try, and when (copyPlan.nextTryAt). */
export async function markFailed(db: Tx, ops: readonly QueuedRow[], why: string, at: (attempts: number) => number): Promise<void> {
  for (const o of ops) {
    await db.runAsync(
      'UPDATE cloud_copy_queue SET attempts = attempts + 1, next_try_at = ?, last_error = ? WHERE kind = ? AND item_id = ? AND edited_at = ?',
      [at(o.attempts + 1), why.slice(0, 200), o.kind, o.id, o.editedAt],
    );
  }
}

export async function queueSize(db: Tx = getDb()): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM cloud_copy_queue');
  return r?.n ?? 0;
}

/**
 * Forget what this phone copied (not the queue) and ask for a bring-back before the next scan: after
 * a Drive restore, an undo or an import's undo replaced the data, or when the scan's safety rule
 * fired. Inside the caller's transaction. A database whose copy tables were never made is left alone.
 */
export async function forgetCopiedState(tx: Tx): Promise<void> {
  const t = await tx.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cloud_copy_state'");
  if (t) await tx.runAsync('DELETE FROM cloud_copy_state');
  await tx.runAsync("INSERT INTO meta(key, value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", [MERGE_PENDING_KEY]);
}

/** Forget every copy record on this phone (another account signs in, erase, delete account). Through the write queue. */
export async function clearCopyTables(): Promise<void> {
  await initCloudCopySchema();
  await enqueueWrite(async () => {
    await getDb().runAsync('DELETE FROM cloud_copy_queue');
    await getDb().runAsync('DELETE FROM cloud_copy_state');
  });
}

// ------------------------------------------------------------------ bringing a copy back

export interface ApplyResult {
  /** Workouts written in (new or newer). */
  workouts: number;
  /** Everything else written in. */
  other: number;
  removed: number;
  /** Exercises whose sets changed (their records are worked out again). */
  exerciseIds: string[];
  /** Items left out (damaged, or a kind the phone does not bring back), by key. */
  skipped: string[];
}

/** Kinds a phone writes back. 'f': the photo itself is not in the copy, so its row would show nothing. */
const ORDER: readonly ItemKind[] = ['x', 'r', 'w', 'p', 'b', 'm', 'u'];

/**
 * Write the merge into the phone in ONE exclusive transaction (through the app's write queue).
 * State rows are written for what really went in, so the next scan sends nothing back.
 */
export async function applyMerge(plan: MergePlan): Promise<ApplyResult> {
  await initCloudCopySchema();
  return enqueueWrite(() => applyExclusive(plan));
}

/** The same, for a caller already inside a queued job. */
export async function applyExclusive(plan: MergePlan): Promise<ApplyResult> {
  let result: ApplyResult | null = null;
  await getDb().withExclusiveTransactionAsync(async (tx) => {
    result = await applyInTransaction(tx, plan);
  });
  if (!result) throw new Error('bring-back transaction ended without a result');
  return result;
}

export async function applyInTransaction(tx: Tx, plan: MergePlan): Promise<ApplyResult> {
  const result: ApplyResult = { workouts: 0, other: 0, removed: 0, exerciseIds: [], skipped: [] };
  const touched = new Set<string>();
  /** A server exercise id that this phone already has under another id (same name). */
  const sameAs = new Map<string, string>();
  const notRemembered = new Set<string>();

  // R-123: a library exercise's row, once per ref (a 500-workout backup asks thousands of times).
  const libraryRow = new Map<string, string>();
  const resolve = async (ref: string): Promise<string> => {
    const r = parseRef(ref);
    if (r && r.library) {
      const known = libraryRow.get(r.key);
      if (known) return known;
      const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE catalog_key = ? ORDER BY rowid LIMIT 1', [r.key]);
      if (row) {
        libraryRow.set(r.key, row.id);
        return row.id;
      }
      const entry = catalogEntry(r.key);
      return ensureExercise(tx, entry?.name ?? r.key, {
        catalogKey: r.key,
        muscleGroup: entry ? COARSE_OF[entry.primary[0]] ?? 'core' : 'core',
        equipment: entry?.equipment ?? 'other',
      });
    }
    const id = r && !r.library ? r.id : ref;
    const mapped = sameAs.get(id);
    if (mapped) return mapped;
    const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [id]);
    if (row) return row.id;
    // Its own record was not in the copy: a plain row keeps the sets (renamed in the library later).
    return ensureExercise(tx, 'Exercise from your copy', { id });
  };

  for (const kind of ORDER) {
    for (const a of plan.apply.filter((x) => x.kind === kind)) {
      const ok = await applyOne(tx, a, resolve, sameAs, touched);
      if (ok === 'skip') {
        result.skipped.push(`${a.kind}:${a.id}`);
        notRemembered.add(`${a.kind}:${a.id}`);
        console.warn(`[cloud copy] left out ${a.kind}:${a.id} (damaged or not for this phone)`);
        continue;
      }
      if (ok === 'mapped') notRemembered.add(`${a.kind}:${a.id}`);
      if (kind === 'w') result.workouts++;
      else result.other++;
    }
  }
  for (const r of plan.remove) {
    if (await removeOne(tx, r.kind, r.id, touched)) result.removed++;
  }
  // 'f' never comes back as a row (see ORDER): nothing to remember for it either.
  for (const a of plan.apply) if (a.kind === 'f') notRemembered.add(`f:${a.id}`);
  await remember(tx, plan.remember.filter((s) => !notRemembered.has(`${s.kind}:${s.id}`)));
  await forget(tx, plan.remove);
  await queueOps(tx, plan.serverDeletes);
  result.exerciseIds = [...touched];
  return result;
}

async function ensureExercise(
  tx: Tx,
  name: string,
  o: { id?: string; catalogKey?: string; muscleGroup?: string; equipment?: string },
): Promise<string> {
  let shown = name;
  if (o.id) {
    // A row for ONE missing exercise of the member's: its own id, and a name no other row has, so two
    // missing exercises never end up as one.
    for (let n = 2; await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [shown]); n++) shown = `${name} ${n}`;
  } else {
    const same = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name]);
    if (same) return same.id;
  }
  const id = o.id ?? uuid();
  await tx.runAsync(
    `INSERT INTO exercises (id, name, aliases, muscle_group, secondary_muscles, equipment, is_compound, increment_kg, catalog_key)
     VALUES (?, ?, '[]', ?, '[]', ?, 0, 2.5, ?)`,
    [id, shown, o.muscleGroup ?? 'core', o.equipment ?? 'other', o.catalogKey ?? null],
  );
  return id;
}

async function deleteWorkout(tx: Tx, id: string, touched: Set<string>): Promise<void> {
  for (const r of await tx.getAllAsync<{ exercise_id: string }>('SELECT DISTINCT exercise_id FROM set_entries WHERE session_id = ?', [id])) {
    touched.add(r.exercise_id);
  }
  await tx.runAsync('DELETE FROM set_entries WHERE session_id = ?', [id]);
  await tx.runAsync('DELETE FROM personal_records WHERE session_id = ?', [id]);
  await tx.runAsync('DELETE FROM workout_sessions WHERE id = ?', [id]);
}

async function deleteFolder(tx: Tx, id: string): Promise<void> {
  await tx.runAsync('DELETE FROM plan_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id = ?)', [id]);
  await tx.runAsync('DELETE FROM plan_days WHERE plan_id = ?', [id]);
}

async function applyOne(
  tx: Tx,
  a: MergeApply,
  resolve: (ref: string) => Promise<string>,
  sameAs: Map<string, string>,
  touched: Set<string>,
): Promise<'ok' | 'skip' | 'mapped'> {
  switch (a.kind) {
    case 'w': {
      const w = unpackWorkout(a.data);
      if (!w) return 'skip';
      if (a.replaces) await deleteWorkout(tx, a.replaces, touched);
      const s = w.session;
      const exists = await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_sessions WHERE id = ?', [a.id]);
      if (exists) {
        await deleteWorkout(tx, a.id, touched);
      }
      await tx.runAsync(
        `INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, notes, source, easy_week, title, routine_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, s.date_iso, s.started_at, s.ended_at, s.day_type, s.notes, s.source, s.easy_week, s.title, s.routine_id],
      );
      for (const x of w.sets) {
        const exerciseId = await resolve(x.ref);
        touched.add(exerciseId);
        await tx.runAsync(
          `INSERT INTO set_entries (id, session_id, exercise_id, set_number, weight_kg, reps, is_warmup, rpe, set_type, note,
                                    superset_group, duration_sec, distance_m, load_mode, card_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), a.id, exerciseId, x.set_number, x.weight_kg, x.reps, x.is_warmup, x.rpe, x.set_type, x.note, x.superset_group,
            x.duration_sec, x.distance_m, x.load_mode, x.card_index],
        );
      }
      return 'ok';
    }
    case 'r': {
      const f = unpackFolder(a.data);
      if (!f) return 'skip';
      const exists = await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_plans WHERE id = ?', [a.id]);
      // The plan this phone follows never changes on a merge: a folder already here keeps its own
      // "followed" mark; a new one is followed only when this phone follows none.
      if (exists) {
        await deleteFolder(tx, a.id);
        await tx.runAsync('UPDATE workout_plans SET name = ?, folder_order = ?, source = ?, settings = ? WHERE id = ?', [
          f.folder.name, f.folder.folder_order, f.folder.source, f.folder.settings, a.id,
        ]);
      } else {
        const following = await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_plans WHERE is_active = 1 LIMIT 1');
        await tx.runAsync('INSERT INTO workout_plans (id, name, is_active, folder_order, source, settings) VALUES (?, ?, ?, ?, ?, ?)', [
          a.id, f.folder.name, following ? 0 : f.folder.is_active, f.folder.folder_order, f.folder.source, f.folder.settings,
        ]);
      }
      for (const d of f.days) {
        // A routine id used by another folder on this phone keeps that folder's routine: this one gets a new id.
        const taken = await tx.getFirstAsync<{ id: string }>('SELECT id FROM plan_days WHERE id = ?', [d.id]);
        const dayId = taken ? uuid() : d.id;
        await tx.runAsync('INSERT INTO plan_days (id, plan_id, day_type, day_order, name) VALUES (?, ?, ?, ?, ?)', [dayId, a.id, d.day_type, d.day_order, d.name]);
        for (const e of d.exercises) {
          await tx.runAsync(
            `INSERT INTO plan_exercises (id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec,
                                         superset_group, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), dayId, await resolve(e.ref), e.ex_order, e.target_sets, e.rep_range_min, e.rep_range_max, e.sets_json, e.rest_sec,
              e.superset_group, e.note],
          );
        }
      }
      return 'ok';
    }
    case 'x': {
      const e = unpackExercise(a.data);
      if (!e) return 'skip';
      const mine = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [a.id]);
      const named = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [e.name]);
      if (!mine && named) {
        // This phone already has an exercise of that name: the copy's sets go on it.
        sameAs.set(a.id, named.id);
        return 'mapped';
      }
      const name = named && named.id !== a.id ? (mine ? null : e.name) : e.name;
      if (mine) {
        await tx.runAsync(
          `UPDATE exercises SET name = COALESCE(?, name), muscle_group = ?, equipment = ?, is_compound = ?, increment_kg = ?, aliases = COALESCE(?, aliases),
                  secondary_muscles = COALESCE(?, secondary_muscles), log_type = ?, load_mode = ?, bw_share = ?, muscles = ?, dist_unit = ?
            WHERE id = ?`,
          [name, e.muscle_group, e.equipment, e.is_compound, e.increment_kg, e.aliases, e.secondary_muscles, e.log_type, e.load_mode, e.bw_share,
            e.muscles, e.dist_unit, a.id],
        );
        touched.add(a.id);
      } else {
        await tx.runAsync(
          `INSERT INTO exercises (id, name, aliases, muscle_group, secondary_muscles, equipment, is_compound, increment_kg, log_type, load_mode,
                                  bw_share, muscles, dist_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [a.id, e.name, e.aliases ?? '[]', e.muscle_group, e.secondary_muscles ?? '[]', e.equipment, e.is_compound, e.increment_kg, e.log_type,
            e.load_mode, e.bw_share, e.muscles, e.dist_unit],
        );
      }
      return 'ok';
    }
    case 'p': {
      const rows = unpackPrefs(a.data);
      if (!rows) return 'skip';
      for (const p of rows) {
        const id = await resolve(p.ref);
        await tx.runAsync(
          `INSERT INTO exercise_prefs (exercise_id, rest_sec, records_from) VALUES (?, ?, ?)
           ON CONFLICT(exercise_id) DO UPDATE SET rest_sec = excluded.rest_sec, records_from = excluded.records_from`,
          [id, p.rest_sec, p.records_from],
        );
        if (p.records_from != null) touched.add(id);
      }
      return 'ok';
    }
    case 'b': {
      const kg = unpackBodyWeight(a.data);
      if (kg == null || !/^\d{4}-\d{2}-\d{2}$/.test(a.id)) return 'skip';
      await tx.runAsync(
        `INSERT INTO body_weight (id, date_iso, weight_kg) VALUES (?, ?, ?)
         ON CONFLICT(date_iso) DO UPDATE SET weight_kg = excluded.weight_kg`,
        [uuid(), a.id, kg],
      );
      return 'ok';
    }
    case 'm': {
      const v = unpackBodyWeight(a.data);
      const at = splitMeasurementId(a.id);
      if (v == null || !at) return 'skip';
      await tx.runAsync(
        `INSERT INTO body_measurements (id, date_iso, kind, value) VALUES (?, ?, ?, ?)
         ON CONFLICT(date_iso, kind) DO UPDATE SET value = excluded.value`,
        [uuid(), at.dateISO, at.kind, v],
      );
      return 'ok';
    }
    case 'u': {
      const p = unpackProfile(a.data);
      if (!p) return 'skip';
      // A profile is made by the welcome screen's own path (account flow); here it is only updated.
      const r = await tx.runAsync(
        `UPDATE user_profile SET name = ?, age = ?, height_cm = ?, goal = ?, experience = ?, gym_name = ?, member_since_iso = ?, calorie_target = ?,
                protein_target_g = ?, carbs_target_g = ?, fat_target_g = ?, unit_system = COALESCE(?, unit_system), language = COALESCE(?, language),
                bio = ?, link = ?`,
        [p.name, p.age, p.height_cm, p.goal, p.experience, p.gym_name, p.member_since_iso, p.calorie_target, p.protein_target_g, p.carbs_target_g,
          p.fat_target_g, p.unit_system, p.language, p.bio, p.link],
      );
      return r.changes > 0 ? 'ok' : 'skip';
    }
    default:
      return 'skip';
  }
}

async function removeOne(tx: Tx, kind: ItemKind, id: string, touched: Set<string>): Promise<boolean> {
  switch (kind) {
    case 'w':
      await deleteWorkout(tx, id, touched);
      return true;
    case 'r':
      await deleteFolder(tx, id);
      await tx.runAsync('DELETE FROM workout_plans WHERE id = ?', [id]);
      return true;
    case 'x': {
      // Only an exercise nothing on this phone still uses.
      const used = await tx.getFirstAsync<{ n: number }>(
        'SELECT (SELECT COUNT(*) FROM set_entries WHERE exercise_id = ?) + (SELECT COUNT(*) FROM plan_exercises WHERE exercise_id = ?) AS n',
        [id, id],
      );
      if ((used?.n ?? 0) > 0) return false;
      await tx.runAsync('DELETE FROM exercise_prefs WHERE exercise_id = ?', [id]);
      await tx.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
      return true;
    }
    case 'b':
      await tx.runAsync('DELETE FROM body_weight WHERE date_iso = ?', [id]);
      return true;
    case 'm': {
      const at = splitMeasurementId(id);
      if (!at) return false;
      await tx.runAsync('DELETE FROM body_measurements WHERE date_iso = ? AND kind = ?', [at.dateISO, at.kind]);
      return true;
    }
    default:
      return false;
  }
}

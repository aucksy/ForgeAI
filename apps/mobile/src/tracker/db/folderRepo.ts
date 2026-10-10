/**
 * Routine folders — Phase 4. A folder is a `workout_plans` row and its routines are that
 * plan's days (`plan_days` / `plan_exercises`), so nothing in the frozen schema changes:
 *  - the folder the member FOLLOWS is the active plan, which the frozen rotation
 *    (`services/coach.getTodaysWorkout`) reads for "Today" exactly as before;
 *  - the other folders hold routines to start any day, from a ready program, the plan
 *    builder, a shared file, or the member's own.
 * Additive columns (tracker schema v7) keep a folder's place in the list, where it came
 * from, and its settings (easy weeks, start day, the builder's answers).
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { uuid } from '@/lib/uuid';
import type { DayType, Exercise, MuscleGroup, PlanExercise } from '@/types/models';

import { catalogEntry } from '../catalog/exerciseCatalog';
import { insertCatalogEntries } from '../catalog/catalogSync';
import type { CatalogEntry } from '../catalog/types';
import type { EasySchedule } from '../plans/easyWeek';

export type FolderSource = 'program' | 'builder' | 'import';

/** A folder's settings (JSON in `workout_plans.settings`). Every field is optional. */
export interface FolderSettings {
  /** The ready program it came from. */
  program?: string;
  /** The plan builder's answers, to build again. */
  builder?: Record<string, unknown>;
  /** Easy weeks while this folder is followed (null / absent = none). */
  easy?: EasySchedule | null;
  /** The day the member started following it: plan weeks count from here. */
  startISO?: string;
  /**
   * A one-off easy week (this plan week), taken early because several lifts stalled while the
   * easy-week rhythm is off (`plans/effort.offerEarlyEasy`).
   */
  easyOnce?: number;
  /**
   * v0.28.0: the routines rebuilt from this app's export ("From Hevy"). A later import of the
   * same app updates this folder instead of adding a second one.
   */
  fromApp?: ImportApp;
  /**
   * v0.29.0: the share link its routines were copied from (Import routines). Copying the same
   * link again updates this folder instead of adding a second one.
   */
  fromLink?: string;
}

/** The apps whose exports bring routines in. */
export type ImportApp = 'hevy' | 'strong';

export interface Folder {
  id: string;
  name: string;
  /** This is the plan "Today" follows. */
  following: boolean;
  source: FolderSource | null;
  settings: FolderSettings;
  routines: PlanDayFull[];
}

/** Settings from the stored JSON; anything unreadable is an empty object. PURE. */
export function parseFolderSettings(raw: string | null | undefined): FolderSettings {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const s = v as Record<string, unknown>;
    const out: FolderSettings = {};
    if (typeof s.program === 'string') out.program = s.program;
    if (s.builder && typeof s.builder === 'object' && !Array.isArray(s.builder)) out.builder = s.builder as Record<string, unknown>;
    if (typeof s.startISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.startISO)) out.startISO = s.startISO;
    if (typeof s.easyOnce === 'number' && Number.isInteger(s.easyOnce) && s.easyOnce >= 1) out.easyOnce = s.easyOnce;
    if (s.fromApp === 'hevy' || s.fromApp === 'strong') out.fromApp = s.fromApp;
    if (typeof s.fromLink === 'string' && /^https:\/\/hevy\.com\//.test(s.fromLink)) out.fromLink = s.fromLink;
    const e = s.easy as Partial<EasySchedule> | null | undefined;
    if (e && typeof e.every === 'number' && e.every >= 2 && typeof e.base === 'number' && Number.isFinite(e.base)) {
      out.easy = { every: Math.round(e.every), base: Math.round(e.base) };
    } else if (s.easy === null) {
      out.easy = null;
    }
    return out;
  } catch {
    return {};
  }
}

const isSource = (v: unknown): v is FolderSource => v === 'program' || v === 'builder' || v === 'import';

// ---------------------------------------------------------------- reading

interface PlanRow {
  id: string;
  name: string;
  is_active: number;
  folder_order: number | null;
  source: string | null;
  settings: string | null;
}
interface DayRow {
  id: string;
  plan_id: string;
  day_type: string;
  day_order: number;
  name: string;
}
interface PeRow {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  ex_order: number;
  target_sets: number;
  rep_range_min: number;
  rep_range_max: number;
}
interface ExRow {
  id: string;
  name: string;
  aliases: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  is_compound: number;
  increment_kg: number;
}

function jsonList(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Days with their exercises, in each day's own order (same shape as the frozen plan read). */
async function readDays(days: readonly DayRow[]): Promise<PlanDayFull[]> {
  if (days.length === 0) return [];
  const db = getDb();
  const pes: PeRow[] = [];
  for (let i = 0; i < days.length; i += 400) {
    const chunk = days.slice(i, i + 400).map((d) => d.id);
    pes.push(
      ...(await db.getAllAsync<PeRow>(
        `SELECT id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max
           FROM plan_exercises WHERE plan_day_id IN (${chunk.map(() => '?').join(', ')}) ORDER BY ex_order ASC`,
        chunk,
      )),
    );
  }
  const ids = [...new Set(pes.map((p) => p.exercise_id))];
  const exercises = new Map<string, Exercise>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await db.getAllAsync<ExRow>(
      `SELECT id, name, aliases, muscle_group, secondary_muscles, equipment, is_compound, increment_kg
         FROM exercises WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      chunk,
    );
    for (const r of rows) {
      exercises.set(r.id, {
        id: r.id,
        name: r.name,
        aliases: jsonList(r.aliases),
        muscleGroup: r.muscle_group as MuscleGroup,
        secondaryMuscles: jsonList(r.secondary_muscles) as MuscleGroup[],
        equipment: r.equipment as Exercise['equipment'],
        isCompound: r.is_compound === 1,
        incrementKg: r.increment_kg,
      });
    }
  }
  return days.map((d) => ({
    id: d.id,
    planId: d.plan_id,
    dayType: d.day_type as DayType,
    order: d.day_order,
    name: d.name,
    exercises: pes
      .filter((p) => p.plan_day_id === d.id)
      .flatMap((p) => {
        const exercise = exercises.get(p.exercise_id);
        const pe: PlanExercise = {
          id: p.id,
          planDayId: p.plan_day_id,
          exerciseId: p.exercise_id,
          order: p.ex_order,
          targetSets: p.target_sets,
          repRangeMin: p.rep_range_min,
          repRangeMax: p.rep_range_max,
        };
        return exercise ? [{ ...pe, exercise }] : [];
      }),
  }));
}

/** Every folder with its routines: the followed one first, then in the member's order. */
export async function listFolders(): Promise<Folder[]> {
  const db = getDb();
  const plans = await db.getAllAsync<PlanRow>(
    `SELECT id, name, is_active, folder_order, source, settings FROM workout_plans
      ORDER BY is_active DESC, COALESCE(folder_order, 1000000) ASC, rowid ASC`,
  );
  if (plans.length === 0) return [];
  const days = await db.getAllAsync<DayRow>('SELECT id, plan_id, day_type, day_order, name FROM plan_days ORDER BY day_order ASC, rowid ASC');
  const full = await readDays(days);
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    following: p.is_active === 1,
    source: isSource(p.source) ? p.source : null,
    settings: parseFolderSettings(p.settings),
    routines: full.filter((d) => d.planId === p.id),
  }));
}

/** One routine with its exercises, from ANY folder (not only the followed one). */
export async function getRoutineAnywhere(dayId: string): Promise<PlanDayFull | null> {
  const day = await getDb().getFirstAsync<DayRow>('SELECT id, plan_id, day_type, day_order, name FROM plan_days WHERE id = ?', [dayId]);
  if (!day) return null;
  const [full] = await readDays([day]);
  return full ?? null;
}

/** The folder a routine sits in, or null. */
export async function folderOfRoutine(dayId: string): Promise<Omit<Folder, 'routines'> | null> {
  const p = await getDb().getFirstAsync<PlanRow>(
    `SELECT wp.id, wp.name, wp.is_active, wp.folder_order, wp.source, wp.settings
       FROM plan_days pd JOIN workout_plans wp ON wp.id = pd.plan_id WHERE pd.id = ?`,
    [dayId],
  );
  return p ? { id: p.id, name: p.name, following: p.is_active === 1, source: isSource(p.source) ? p.source : null, settings: parseFolderSettings(p.settings) } : null;
}

/** The folder "Today" follows, without its routines, or null. */
export async function followedFolder(): Promise<Omit<Folder, 'routines'> | null> {
  const p = await getDb().getFirstAsync<PlanRow>(
    'SELECT id, name, is_active, folder_order, source, settings FROM workout_plans WHERE is_active = 1 LIMIT 1',
  );
  return p ? { id: p.id, name: p.name, following: true, source: isSource(p.source) ? p.source : null, settings: parseFolderSettings(p.settings) } : null;
}

// ---------------------------------------------------------------- writing

/**
 * Transaction-wrapped writes go through the ONE app-wide write queue (DS-04): overlapping
 * BEGINs on the shared connection fail, and an inner ROLLBACK would undo another module's
 * work. Never call a queued function from inside one of these jobs.
 */
const serial = enqueueWrite;

async function nextFolderOrder(): Promise<number> {
  const row = await getDb().getFirstAsync<{ m: number | null }>('SELECT MAX(folder_order) AS m FROM workout_plans');
  return (row?.m ?? 0) + 1;
}

/** A new, empty folder at the end of the list; returns its id. */
// Single statements are queued too: an unqueued write issued while an import's transaction is
// open runs INSIDE it and is rolled back with it.
export async function createFolder(name: string, opts: { source?: FolderSource | null; settings?: FolderSettings } = {}): Promise<string> {
  const id = uuid();
  await serial(async () =>
    getDb().runAsync(
      'INSERT INTO workout_plans(id, name, is_active, folder_order, source, settings) VALUES(?, ?, 0, ?, ?, ?)',
      [id, name.trim() || 'Folder', await nextFolderOrder(), opts.source ?? null, JSON.stringify(opts.settings ?? {})],
    ),
  );
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await serial(() => getDb().runAsync('UPDATE workout_plans SET name = ? WHERE id = ?', [name.trim() || 'Folder', id]));
}

export async function setFolderSettings(id: string, settings: FolderSettings): Promise<void> {
  await serial(() => getDb().runAsync('UPDATE workout_plans SET settings = ? WHERE id = ?', [JSON.stringify(settings), id]));
}

/**
 * Follow this folder: "Today" now comes from its routines. Its plan weeks start again from
 * today (an easy-week schedule counts from here).
 */
export async function followFolder(id: string, todayISO: string): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{ settings: string | null }>('SELECT settings FROM workout_plans WHERE id = ?', [id]);
  if (!row) return;
  const settings = { ...parseFolderSettings(row.settings), startISO: todayISO };
  if (settings.easy) settings.easy = { ...settings.easy, base: 0 };
  await serial(() =>
    db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE workout_plans SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [id]);
      await db.runAsync('UPDATE workout_plans SET settings = ? WHERE id = ?', [JSON.stringify(settings), id]);
    }),
  );
}

/** Delete a folder and its routines (their exercise lists cascade). Workout history stays. */
export async function deleteFolder(id: string): Promise<void> {
  const db = getDb();
  await serial(() =>
    db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM plan_days WHERE plan_id = ?', [id]);
      await db.runAsync('DELETE FROM workout_plans WHERE id = ?', [id]);
    }),
  );
}

/** Move a routine to the end of another folder. */
export async function moveRoutine(dayId: string, folderId: string): Promise<void> {
  const db = getDb();
  await serial(async () => {
    const row = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(day_order) AS m FROM plan_days WHERE plan_id = ?', [folderId]);
    await db.runAsync('UPDATE plan_days SET plan_id = ?, day_order = ? WHERE id = ?', [folderId, (row?.m ?? -1) + 1, dayId]);
  });
}

/** One routine to write: its exercises by library row id. */
export interface NewRoutine {
  name: string;
  dayType: DayType;
  exercises: { exerciseId: string; sets: number; repMin: number; repMax: number }[];
}

/** The folder an app's routines were brought into before, or null. */
export async function appFolder(app: ImportApp): Promise<Omit<Folder, 'routines'> | null> {
  const rows = await getDb().getAllAsync<PlanRow>(
    "SELECT id, name, is_active, folder_order, source, settings FROM workout_plans WHERE source = 'import' ORDER BY rowid ASC",
  );
  const p = rows.find((r) => parseFolderSettings(r.settings).fromApp === app);
  return p ? { id: p.id, name: p.name, following: p.is_active === 1, source: 'import', settings: parseFolderSettings(p.settings) } : null;
}

/**
 * v0.28.0: write an app's routines as its own folder ("From Hevy"), in one transaction. A folder
 * brought in from that app before is emptied and refilled in place — same name, same place in
 * the list, still followed if it was — so a second import never makes a second folder.
 * `follow` makes it the plan "Today" comes from. Returns the folder id.
 */
export async function saveAppFolder(
  app: ImportApp,
  name: string,
  routines: readonly NewRoutine[],
  opts: { follow: boolean; todayISO: string },
): Promise<string> {
  return refillOrCreate(await appFolder(app), name, routines, { fromApp: app }, opts);
}

/** v0.29.0: the folder a share link's routines were copied into before, or null. */
export async function linkFolder(url: string): Promise<Omit<Folder, 'routines'> | null> {
  const rows = await getDb().getAllAsync<PlanRow>(
    "SELECT id, name, is_active, folder_order, source, settings FROM workout_plans WHERE source = 'import' ORDER BY rowid ASC",
  );
  const p = rows.find((r) => parseFolderSettings(r.settings).fromLink === url);
  return p ? { id: p.id, name: p.name, following: p.is_active === 1, source: 'import', settings: parseFolderSettings(p.settings) } : null;
}

/**
 * v0.29.0: a share link's routines as their own folder (named as in Hevy, e.g. "Jaipur"). The
 * same link copied again refills that folder in place, like `saveAppFolder`.
 */
export async function saveLinkFolder(
  url: string,
  name: string,
  routines: readonly NewRoutine[],
  opts: { follow: boolean; todayISO: string },
): Promise<string> {
  return refillOrCreate(await linkFolder(url), name, routines, { fromLink: url }, opts);
}

async function refillOrCreate(
  before: Omit<Folder, 'routines'> | null,
  name: string,
  routines: readonly NewRoutine[],
  mark: FolderSettings,
  opts: { follow: boolean; todayISO: string },
): Promise<string> {
  if (!before) {
    return createFolderWithRoutines(name, routines, {
      source: 'import',
      settings: mark,
      follow: opts.follow,
      todayISO: opts.todayISO,
    });
  }
  const db = getDb();
  const settings: FolderSettings = { ...before.settings, ...mark };
  if (opts.follow && !before.following) {
    settings.startISO = opts.todayISO;
    if (settings.easy) settings.easy = { ...settings.easy, base: 0 };
  }
  await serial(() =>
    db.withTransactionAsync(async () => {
      if (opts.follow) await db.runAsync('UPDATE workout_plans SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [before.id]);
      await db.runAsync('UPDATE workout_plans SET settings = ? WHERE id = ?', [JSON.stringify(settings), before.id]);
      // Each routine brought in again keeps the id it had (matched by name, then by place):
      // the workouts saved from it point at that id, and "Today" is placed by it. New ids for
      // every routine (with the start day kept) sent Today back to the first routine.
      const old = await db.getAllAsync<{ id: string; name: string }>(
        'SELECT id, name FROM plan_days WHERE plan_id = ? ORDER BY day_order ASC, rowid ASC',
        [before.id],
      );
      const keep = keptRoutineIds(old, routines);
      const kept = keep.filter((id): id is string => id != null);
      await db.runAsync('DELETE FROM plan_exercises WHERE plan_day_id IN (SELECT id FROM plan_days WHERE plan_id = ?)', [before.id]);
      await db.runAsync(
        `DELETE FROM plan_days WHERE plan_id = ?${kept.length ? ` AND id NOT IN (${kept.map(() => '?').join(', ')})` : ''}`,
        [before.id, ...kept],
      );
      await insertRoutines(before.id, routines, keep);
    }),
  );
  return before.id;
}

/**
 * For each routine brought in again, the id of the folder's routine it replaces, or null for a
 * new one: the same name first (case and spaces ignored), then the same place. Each old id is
 * used once. PURE.
 */
export function keptRoutineIds(
  old: readonly { id: string; name: string }[],
  next: readonly { name: string }[],
): (string | null)[] {
  const key = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const used = new Set<string>();
  const out: (string | null)[] = next.map((r) => {
    const hit = old.find((o) => !used.has(o.id) && key(o.name) === key(r.name));
    if (!hit) return null;
    used.add(hit.id);
    return hit.id;
  });
  return out.map((id, i) => {
    if (id != null) return id;
    const o = old[i];
    // By place only when that old routine's name is not taken by another routine of the new list.
    if (!o || used.has(o.id) || next.some((r) => key(r.name) === key(o.name))) return null;
    used.add(o.id);
    return o.id;
  });
}

/** A whole folder with its routines in one transaction; returns the folder id. */
export async function createFolderWithRoutines(
  name: string,
  routines: readonly NewRoutine[],
  opts: { source?: FolderSource | null; settings?: FolderSettings; follow?: boolean; todayISO?: string } = {},
): Promise<string> {
  const db = getDb();
  const id = uuid();
  const order = await nextFolderOrder();
  const settings: FolderSettings = { ...(opts.settings ?? {}) };
  if (opts.follow && opts.todayISO) settings.startISO = opts.todayISO;
  await serial(() =>
    db.withTransactionAsync(async () => {
      if (opts.follow) await db.runAsync('UPDATE workout_plans SET is_active = 0');
      await db.runAsync(
        'INSERT INTO workout_plans(id, name, is_active, folder_order, source, settings) VALUES(?, ?, ?, ?, ?, ?)',
        [id, name.trim() || 'Folder', opts.follow ? 1 : 0, order, opts.source ?? null, JSON.stringify(settings)],
      );
      await insertRoutines(id, routines);
    }),
  );
  return id;
}

/**
 * The routines of a folder, in order (inside the caller's transaction). `keep[d]`: an existing
 * routine row to rewrite in place (its id kept) instead of a new one.
 */
async function insertRoutines(planId: string, routines: readonly NewRoutine[], keep: readonly (string | null)[] = []): Promise<void> {
  const db = getDb();
  for (let d = 0; d < routines.length; d++) {
    const r = routines[d];
    const kept = keep[d] ?? null;
    const dayId = kept ?? uuid();
    if (kept) {
      await db.runAsync('UPDATE plan_days SET plan_id = ?, day_type = ?, day_order = ?, name = ? WHERE id = ?', [
        planId,
        r.dayType,
        d,
        r.name.trim() || 'Routine',
        kept,
      ]);
    } else {
      await db.runAsync('INSERT INTO plan_days(id, plan_id, day_type, day_order, name) VALUES(?, ?, ?, ?, ?)', [
        dayId,
        planId,
        r.dayType,
        d,
        r.name.trim() || 'Routine',
      ]);
    }
    for (let i = 0; i < r.exercises.length; i++) {
      const x = r.exercises[i];
      const min = Math.max(1, Math.min(50, Math.round(x.repMin)));
      await db.runAsync(
        `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), dayId, x.exerciseId, i, Math.max(1, Math.min(12, Math.round(x.sets))), min, Math.max(min, Math.min(50, Math.round(x.repMax)))],
      );
    }
  }
}

/**
 * The member's library row for each catalogue key, adding any library exercise their list
 * does not have yet (a fresh install before the first sync, or a newer library). Keys the
 * library does not know are left out.
 */
export async function exerciseIdsForKeys(keys: readonly string[]): Promise<Map<string, string>> {
  const db = getDb();
  const unique = [...new Set(keys)];
  const found = await readIdsByKey(unique);
  const missing = unique.filter((k) => !found.has(k)).map((k) => catalogEntry(k)).filter((e): e is CatalogEntry => e != null);
  if (missing.length > 0) {
    await serial(() => db.withTransactionAsync(async () => void (await insertCatalogEntries(db, missing))));
    for (const [k, v] of await readIdsByKey(missing.map((e) => e.key))) found.set(k, v);
  }
  return found;
}

async function readIdsByKey(keys: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 400) {
    const chunk = keys.slice(i, i + 400);
    if (chunk.length === 0) continue;
    const rows = await getDb().getAllAsync<{ id: string; catalog_key: string }>(
      `SELECT id, catalog_key FROM exercises WHERE catalog_key IN (${chunk.map(() => '?').join(', ')}) ORDER BY rowid ASC`,
      chunk,
    );
    for (const r of rows) if (!out.has(r.catalog_key)) out.set(r.catalog_key, r.id);
  }
  return out;
}

/** Library rows by exact name (case and spaces ignored), for imports of own exercises. */
export async function exerciseIdsByName(names: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const rows = await getDb().getAllAsync<{ id: string; name: string }>('SELECT id, name FROM exercises ORDER BY rowid ASC');
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const byName = new Map<string, string>();
  for (const r of rows) if (!byName.has(norm(r.name))) byName.set(norm(r.name), r.id);
  for (const n of names) {
    const id = byName.get(norm(n));
    if (id) out.set(n, id);
  }
  return out;
}

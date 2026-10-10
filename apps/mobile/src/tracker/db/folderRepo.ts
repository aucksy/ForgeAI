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
import { MAX_ROUTINE_REPS, MAX_ROUTINE_SETS, parsePlanSets, planSetsJson, workingCount, type PlanSet } from '../plans/routineSets';

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
  /**
   * Audit Phase 4 (RP-04): the first day of an easy week taken with "Take an easy week now" —
   * seven easy days from that day, whatever day the plan's weeks start on.
   */
  easyFrom?: string;
  /** Audit Phase 4 (RP-06): the plan's training days a week (a program's, the builder's). */
  daysPerWeek?: number;
  /**
   * Audit Phase 4 (RP-18): the fingerprint of the routine file this folder came from, so the
   * same file imported again is recognised.
   */
  fromFile?: string;
  /**
   * Review fix (link folders): the routines' names in the order Hevy's page lists them, kept when
   * the folder is copied. The one-time repair only puts a folder in the member's rotation while
   * it is still in exactly this order (never one the member arranged).
   */
  pageOrder?: string[];
}

/** Audit Phase 4 (RP-19): what a routine row keeps besides sets and reps. */
export interface RoutineExerciseExtras {
  /** Each set's type and target; null/absent = `targetSets` normal sets. */
  sets?: PlanSet[] | null;
  /** This routine's rest for the exercise (seconds; 0 = no timer); null = the exercise's own. */
  restSec?: number | null;
  /** Superset: rows with the same number go together; null = none. */
  supersetGroup?: number | null;
  note?: string | null;
}
export type RoutineExercise = PlanDayFull['exercises'][number] & RoutineExerciseExtras;
/** A routine with everything its rows keep (a `PlanDayFull` with the extras). */
export type RoutineFull = Omit<PlanDayFull, 'exercises'> & { exercises: RoutineExercise[] };

/** The apps whose exports bring routines in. */
export type ImportApp = 'hevy' | 'strong';

export interface Folder {
  id: string;
  name: string;
  /** This is the plan "Today" follows. */
  following: boolean;
  source: FolderSource | null;
  settings: FolderSettings;
  routines: RoutineFull[];
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
    if (typeof s.easyFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.easyFrom)) out.easyFrom = s.easyFrom;
    if (typeof s.daysPerWeek === 'number' && Number.isInteger(s.daysPerWeek) && s.daysPerWeek >= 1 && s.daysPerWeek <= 7) out.daysPerWeek = s.daysPerWeek;
    if (typeof s.fromFile === 'string' && /^[a-z0-9]{1,40}$/.test(s.fromFile)) out.fromFile = s.fromFile;
    if (Array.isArray(s.pageOrder) && s.pageOrder.length <= 500 && s.pageOrder.every((n) => typeof n === 'string')) out.pageOrder = s.pageOrder as string[];
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
  sets_json: string | null;
  rest_sec: number | null;
  superset_group: number | null;
  note: string | null;
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
async function readDays(days: readonly DayRow[]): Promise<RoutineFull[]> {
  if (days.length === 0) return [];
  const db = getDb();
  const pes: PeRow[] = [];
  for (let i = 0; i < days.length; i += 400) {
    const chunk = days.slice(i, i + 400).map((d) => d.id);
    pes.push(
      ...(await db.getAllAsync<PeRow>(
        `SELECT id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max,
                sets_json, rest_sec, superset_group, note
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
        const sets = parsePlanSets(p.sets_json);
        const extras: RoutineExerciseExtras = {
          sets,
          restSec: p.rest_sec != null && p.rest_sec >= 0 ? p.rest_sec : null,
          supersetGroup: p.superset_group ?? null,
          note: p.note?.trim() ? p.note : null,
        };
        // A stored list is the truth for the set count (a hand-edited target_sets can't disagree).
        if (sets) pe.targetSets = Math.max(1, workingCount(sets));
        return exercise ? [{ ...pe, ...extras, exercise }] : [];
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
export async function getRoutineAnywhere(dayId: string): Promise<RoutineFull | null> {
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
  const settings = freshWeeks(parseFolderSettings(row.settings), todayISO);
  await serial(() =>
    db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE workout_plans SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [id]);
      await db.runAsync('UPDATE workout_plans SET settings = ? WHERE id = ?', [JSON.stringify(settings), id]);
    }),
  );
}

/**
 * RP-05: the plan's weeks start again from `todayISO` — the easy-week rhythm counts from here
 * and no one-off easy week (taken early, or "now") is left over from an earlier time. PURE.
 */
export function freshWeeks(s: FolderSettings, todayISO: string): FolderSettings {
  const out: FolderSettings = { ...s, startISO: todayISO };
  if (out.easy) out.easy = { ...out.easy, base: 0 };
  delete out.easyOnce;
  delete out.easyFrom;
  return out;
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

/**
 * RP-07: a new order for the folders (the full list of ids, top to bottom). The followed folder
 * still shows first; the order of the others is the member's.
 */
export async function reorderFolders(orderedIds: readonly string[]): Promise<void> {
  const db = getDb();
  await serial(() =>
    db.withTransactionAsync(async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.runAsync('UPDATE workout_plans SET folder_order = ? WHERE id = ?', [i + 1, orderedIds[i]]);
      }
    }),
  );
}

/** The name of the folder new routines go to when the member does not pick one. */
export const MY_ROUTINES = 'My routines';
const isMyRoutines = (name: string): boolean => name.trim().toLowerCase() === MY_ROUTINES.toLowerCase();

/**
 * RP-08: the folder a new routine lands in when the member did not choose one — a "My
 * routines" folder they do NOT follow, made when missing. Never the followed plan, and never
 * followed: a new routine must not change "Today" by itself. For a caller inside a queued job.
 */
export async function myRoutinesFolderIdUnqueued(): Promise<string> {
  const db = getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; is_active: number }>(
    'SELECT id, name, is_active FROM workout_plans ORDER BY COALESCE(folder_order, 1000000) ASC, rowid ASC',
  );
  const hit = rows.find((r) => r.is_active !== 1 && isMyRoutines(r.name));
  if (hit) return hit.id;
  // A plan made by an older "New routine" is itself called "My Routines": the new folder must
  // not look like the same one.
  const name = rows.some((r) => r.is_active === 1 && isMyRoutines(r.name)) ? 'Other routines' : MY_ROUTINES;
  const same = rows.find((r) => r.is_active !== 1 && r.name.trim().toLowerCase() === name.toLowerCase());
  if (same) return same.id;
  const id = uuid();
  await db.runAsync(
    'INSERT INTO workout_plans(id, name, is_active, folder_order, source, settings) VALUES(?, ?, 0, ?, NULL, ?)',
    [id, name, await nextFolderOrder(), '{}'],
  );
  return id;
}

/** `myRoutinesFolderIdUnqueued`, queued. */
export function myRoutinesFolderId(): Promise<string> {
  return serial(() => myRoutinesFolderIdUnqueued());
}

/** RP-18: the folder a ready program was added as before (the first one), or null. */
export async function programFolder(key: string): Promise<Omit<Folder, 'routines'> | null> {
  return folderWhere("source = 'program'", (s) => s.program === key);
}

/** RP-18: the folder a routine file with this fingerprint was imported into before, or null. */
export async function fileFolder(fingerprint: string): Promise<Omit<Folder, 'routines'> | null> {
  return folderWhere("source = 'import'", (s) => s.fromFile === fingerprint);
}

async function folderWhere(where: string, match: (s: FolderSettings) => boolean): Promise<Omit<Folder, 'routines'> | null> {
  const rows = await getDb().getAllAsync<PlanRow>(
    `SELECT id, name, is_active, folder_order, source, settings FROM workout_plans WHERE ${where} ORDER BY rowid ASC`,
  );
  const p = rows.find((r) => match(parseFolderSettings(r.settings)));
  return p
    ? { id: p.id, name: p.name, following: p.is_active === 1, source: isSource(p.source) ? p.source : null, settings: parseFolderSettings(p.settings) }
    : null;
}

/**
 * RP-18 "Update the existing folder": its routines are rewritten from `routines` in place (each
 * routine kept by name keeps its id, so its workouts and "Today" stay with it), its settings
 * take `mark`, and it is followed when asked. Returns the folder id.
 */
export async function refillFolder(
  folder: Omit<Folder, 'routines'>,
  name: string,
  routines: readonly NewRoutine[],
  mark: FolderSettings,
  opts: { follow: boolean; todayISO: string },
): Promise<string> {
  return refillOrCreate(folder, name, routines, mark, opts);
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
  exercises: ({ exerciseId: string; sets: number; repMin: number; repMax: number } & NewRoutineExtras)[];
}

/** RP-19: what a new routine row may also carry (set types and targets, rest, superset, note). */
export interface NewRoutineExtras {
  setList?: PlanSet[] | null;
  restSec?: number | null;
  supersetGroup?: number | null;
  note?: string | null;
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
  if (opts.follow && !before.following) Object.assign(settings, freshWeeks(settings, opts.todayISO));
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
    for (let i = 0; i < r.exercises.length; i++) await insertRoutineRow(dayId, r.exercises[i], i);
  }
}

/** One routine row as stored (the clamps and the set list's rules), for `insertRoutineRow`. PURE. */
export function routineRowValues(x: NewRoutine['exercises'][number]): {
  targetSets: number;
  repMin: number;
  repMax: number;
  setsJson: string | null;
  restSec: number | null;
  supersetGroup: number | null;
  note: string | null;
} {
  // RP-23: no 12-set / 50-rep caps — only a sanity bound far beyond any real routine.
  const min = Math.max(1, Math.min(MAX_ROUTINE_REPS, Math.round(x.repMin) || 1));
  const json = planSetsJson(x.setList ?? null);
  const sets = json && x.setList ? workingCount(x.setList) : Math.round(x.sets);
  return {
    targetSets: Math.max(1, Math.min(MAX_ROUTINE_SETS, sets || 1)),
    repMin: min,
    repMax: Math.max(min, Math.min(MAX_ROUTINE_REPS, Math.round(x.repMax) || min)),
    setsJson: json,
    restSec: x.restSec != null && x.restSec >= 0 ? Math.round(x.restSec) : null,
    supersetGroup: x.supersetGroup ?? null,
    note: x.note?.trim() ? x.note.trim() : null,
  };
}

/** One routine row (inside the caller's transaction / queued job). */
export async function insertRoutineRow(dayId: string, x: NewRoutine['exercises'][number], order: number): Promise<void> {
  const v = routineRowValues(x);
  await getDb().runAsync(
    `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max,
                                sets_json, rest_sec, superset_group, note)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), dayId, x.exerciseId, order, v.targetSets, v.repMin, v.repMax, v.setsJson, v.restSec, v.supersetGroup, v.note],
  );
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

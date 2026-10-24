/**
 * The cloud copy's compact format (tracker #50, owner 24 Oct 2026: "store the data in our own
 * database, like Hevy"). PURE: rows in, short JSON text out, and back.
 *
 * One server row per thing the member keeps (supabase/migrations/0032_member_cloud.sql,
 * public.member_items). Each record is a JSON ARRAY with no key names, in a fixed order, its
 * trailing empty (null) places dropped — a typical workout (4.4 exercises, 18 sets) is about 550
 * bytes (test/cloud/pack.test.ts). Format version `PACK_VERSION`; a newer app reads every older version.
 *
 * Exercises are named by a REF, never the phone's own row id for library exercises: the library
 * is inserted with a fresh id on every phone (catalogSync), so a set says `c:<catalog key>` for a
 * library exercise and `x:<id>` for one the member made (that one is copied as its own 'x' item
 * under the same id).
 *
 *   'w' workout       [groups, date, started, dayType, source, ended, title, notes, easyWeek, routineId]
 *                     group = [ref, sets, cardIndex, supersetGroup]
 *                     set   = [setNo, kg, reps, warmup, rpe, setType, note, seconds, metres, loadMode]
 *   'r' folder        [name, isActive, days, order, source, settings]
 *                     day   = [dayId, dayType, dayOrder, name, exercises]
 *                     ex    = [ref, exOrder, targetSets, repMin, repMax, setsJson, restSec, superset, note]
 *   'x' own exercise  [name, muscleGroup, equipment, isCompound, incrementKg, aliases, secondary,
 *                      logType, loadMode, bwShare, muscles, distUnit]
 *   'p' preferences   [[ref, restSec, recordsFrom], …] (one item, id 'all', sorted by ref)
 *   'b' body weight   [kg]                 id = the day
 *   'm' measurement   [value]              id = 'day|kind'
 *   'f' photo record  [day, createdAt]     id = the photo's id (the picture stays on the phone)
 *   'u' profile       [name, age, heightCm, goal, experience, gymName, memberSince, kcal, protein,
 *                      carbs, fat, unitSystem, language, bio, link]   id = 'me' (never the phone number)
 */

export const PACK_VERSION = 1;

/** The server refuses a row longer than this (0032's member_items_data_check). */
export const MAX_PACKED_CHARS = 32768;

export type ItemKind = 'w' | 'r' | 'x' | 'p' | 'b' | 'm' | 'f' | 'u';
export const ITEM_KINDS: readonly ItemKind[] = ['w', 'r', 'x', 'p', 'b', 'm', 'f', 'u'];

export type Cell = string | number | null;

// ------------------------------------------------------------------ helpers

/** Drop trailing nulls (and undefined) from a record. PURE. */
export function trimEnd<T>(a: readonly (T | null | undefined)[]): (T | null)[] {
  let n = a.length;
  while (n > 0 && (a[n - 1] === null || a[n - 1] === undefined)) n--;
  return a.slice(0, n).map((v) => (v === undefined ? null : v));
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const at = (a: readonly unknown[], i: number): unknown => (i < a.length ? a[i] : null);

/**
 * A 53-bit hash of the packed text (cyrb53), as base-36. Only for "has this changed since it was
 * last copied?" — never for security. PURE.
 */
export function packHash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The ref a record uses for an exercise: its library key, else its own id. PURE. */
export function exerciseRef(id: string, catalogKey: string | null | undefined): string {
  return catalogKey ? `c:${catalogKey}` : `x:${id}`;
}

export function parseRef(ref: string): { library: true; key: string } | { library: false; id: string } | null {
  if (ref.startsWith('c:') && ref.length > 2) return { library: true, key: ref.slice(2) };
  if (ref.startsWith('x:') && ref.length > 2) return { library: false, id: ref.slice(2) };
  return null;
}

function parseArray(json: string): unknown[] | null {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v : null;
  } catch {
    // quiet: a damaged record is skipped by the caller, which logs it with its id
    return null;
  }
}

// ------------------------------------------------------------------ 'w' workouts

export interface WorkoutRow {
  id: string;
  date_iso: string;
  started_at: number;
  ended_at: number | null;
  day_type: string;
  notes: string | null;
  source: string;
  easy_week: number | null;
  title: string | null;
  routine_id: string | null;
}

export interface SetRow {
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: number;
  rpe: number | null;
  set_type: string | null;
  note: string | null;
  superset_group: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  load_mode: string | null;
  card_index: number | null;
}

/** A set as unpacked: its exercise by ref (the restore turns it into this phone's row id). */
export type PackedSet = Omit<SetRow, 'exercise_id'> & { ref: string };

export interface UnpackedWorkout {
  session: Omit<WorkoutRow, 'id'>;
  sets: PackedSet[];
}

/**
 * Pack one workout. `sets` in the order they were saved; `refOf` gives each exercise's ref. Sets of
 * one exercise card (same exercise, card and superset) form one group, groups in the order their
 * first set was saved. PURE.
 */
export function packWorkout(s: WorkoutRow, sets: readonly SetRow[], refOf: (exerciseId: string) => string): string {
  const groups = new Map<string, { ref: string; card: number | null; ss: number | null; sets: Cell[][] }>();
  for (const x of sets) {
    const ref = refOf(x.exercise_id);
    const key = `${ref}\u0000${x.card_index ?? ''}\u0000${x.superset_group ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { ref, card: x.card_index ?? null, ss: x.superset_group ?? null, sets: [] };
      groups.set(key, g);
    }
    g.sets.push(trimEnd<Cell>([x.set_number, x.weight_kg, x.reps, x.is_warmup ? 1 : 0, x.rpe, x.set_type, x.note, x.duration_sec, x.distance_m, x.load_mode]));
  }
  const packedGroups = [...groups.values()].map((g) => trimEnd<unknown>([g.ref, g.sets, g.card, g.ss]));
  return JSON.stringify(
    trimEnd<unknown>([packedGroups, s.date_iso, s.started_at, s.day_type, s.source, s.ended_at, s.title, s.notes, s.easy_week, s.routine_id]),
  );
}

/** Null when the text is not a workout this app can read. PURE. */
export function unpackWorkout(json: string): UnpackedWorkout | null {
  const a = parseArray(json);
  if (!a || !Array.isArray(a[0])) return null;
  const date = text(at(a, 1));
  const started = num(at(a, 2));
  const dayType = text(at(a, 3));
  if (!date || started == null || !dayType) return null;
  const sets: PackedSet[] = [];
  for (const g of a[0] as unknown[]) {
    if (!Array.isArray(g) || typeof g[0] !== 'string' || !Array.isArray(g[1])) return null;
    for (const raw of g[1] as unknown[]) {
      if (!Array.isArray(raw)) return null;
      const setNo = num(at(raw, 0));
      if (setNo == null) return null;
      sets.push({
        ref: g[0],
        set_number: setNo,
        weight_kg: num(at(raw, 1)) ?? 0,
        reps: num(at(raw, 2)) ?? 0,
        is_warmup: num(at(raw, 3)) ? 1 : 0,
        rpe: num(at(raw, 4)),
        set_type: text(at(raw, 5)),
        note: text(at(raw, 6)),
        duration_sec: num(at(raw, 7)),
        distance_m: num(at(raw, 8)),
        load_mode: text(at(raw, 9)),
        card_index: num(at(g, 2)),
        superset_group: num(at(g, 3)),
      });
    }
  }
  return {
    session: {
      date_iso: date,
      started_at: started,
      day_type: dayType,
      source: text(at(a, 4)) ?? 'manual',
      ended_at: num(at(a, 5)),
      title: text(at(a, 6)),
      notes: text(at(a, 7)),
      easy_week: num(at(a, 8)),
      routine_id: text(at(a, 9)),
    },
    sets,
  };
}

// ------------------------------------------------------------------ 'r' routine folders

export interface FolderRow {
  id: string;
  name: string;
  is_active: number;
  folder_order: number | null;
  source: string | null;
  settings: string | null;
}
export interface DayRow {
  id: string;
  plan_id: string;
  day_type: string;
  day_order: number;
  name: string;
}
export interface PlanExerciseRow {
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

export interface UnpackedFolder {
  folder: Omit<FolderRow, 'id'>;
  days: (Omit<DayRow, 'plan_id'> & { exercises: (Omit<PlanExerciseRow, 'plan_day_id' | 'exercise_id'> & { ref: string })[] })[];
}

/** Pack a folder with its routines (days) and their exercises, each list in its saved order. PURE. */
export function packFolder(f: FolderRow, days: readonly DayRow[], exs: readonly PlanExerciseRow[], refOf: (exerciseId: string) => string): string {
  const packedDays = days.map((d) =>
    trimEnd<unknown>([
      d.id,
      d.day_type,
      d.day_order,
      d.name,
      exs
        .filter((e) => e.plan_day_id === d.id)
        .map((e) => trimEnd<Cell>([refOf(e.exercise_id), e.ex_order, e.target_sets, e.rep_range_min, e.rep_range_max, e.sets_json, e.rest_sec, e.superset_group, e.note])),
    ]),
  );
  return JSON.stringify(trimEnd<unknown>([f.name, f.is_active ? 1 : 0, packedDays, f.folder_order, f.source, f.settings]));
}

export function unpackFolder(json: string): UnpackedFolder | null {
  const a = parseArray(json);
  const name = a ? text(at(a, 0)) : null;
  if (!a || name == null) return null;
  const days: UnpackedFolder['days'] = [];
  for (const d of (Array.isArray(a[2]) ? a[2] : []) as unknown[]) {
    if (!Array.isArray(d) || typeof d[0] !== 'string') return null;
    const exercises: UnpackedFolder['days'][number]['exercises'] = [];
    for (const e of (Array.isArray(d[4]) ? d[4] : []) as unknown[]) {
      if (!Array.isArray(e) || typeof e[0] !== 'string') return null;
      exercises.push({
        ref: e[0],
        ex_order: num(at(e, 1)) ?? exercises.length,
        target_sets: num(at(e, 2)) ?? 3,
        rep_range_min: num(at(e, 3)) ?? 8,
        rep_range_max: num(at(e, 4)) ?? 12,
        sets_json: text(at(e, 5)),
        rest_sec: num(at(e, 6)),
        superset_group: num(at(e, 7)),
        note: text(at(e, 8)),
      });
    }
    days.push({ id: d[0], day_type: text(at(d, 1)) ?? 'full', day_order: num(at(d, 2)) ?? days.length, name: text(at(d, 3)) ?? '', exercises });
  }
  return {
    folder: { name, is_active: num(at(a, 1)) ? 1 : 0, folder_order: num(at(a, 3)), source: text(at(a, 4)), settings: text(at(a, 5)) },
    days,
  };
}

// ------------------------------------------------------------------ 'x' own exercises

export interface OwnExerciseRow {
  name: string;
  muscle_group: string;
  equipment: string;
  is_compound: number;
  increment_kg: number;
  aliases: string | null;
  secondary_muscles: string | null;
  log_type: string | null;
  load_mode: string | null;
  bw_share: number | null;
  muscles: string | null;
  dist_unit: string | null;
}

export function packExercise(e: OwnExerciseRow): string {
  return JSON.stringify(
    trimEnd<Cell>([e.name, e.muscle_group, e.equipment, e.is_compound ? 1 : 0, e.increment_kg, e.aliases, e.secondary_muscles, e.log_type, e.load_mode, e.bw_share, e.muscles, e.dist_unit]),
  );
}

export function unpackExercise(json: string): OwnExerciseRow | null {
  const a = parseArray(json);
  const name = a ? text(at(a, 0)) : null;
  if (!a || !name) return null;
  return {
    name,
    muscle_group: text(at(a, 1)) ?? 'core',
    equipment: text(at(a, 2)) ?? 'other',
    is_compound: num(at(a, 3)) ? 1 : 0,
    increment_kg: num(at(a, 4)) ?? 2.5,
    aliases: text(at(a, 5)),
    secondary_muscles: text(at(a, 6)),
    log_type: text(at(a, 7)),
    load_mode: text(at(a, 8)),
    bw_share: num(at(a, 9)),
    muscles: text(at(a, 10)),
    dist_unit: text(at(a, 11)),
  };
}

// ------------------------------------------------------------------ 'p' exercise preferences

export interface PrefRow {
  ref: string;
  rest_sec: number | null;
  records_from: string | null;
}

/** Sorted by ref, so the same preferences always pack to the same text. PURE. */
export function packPrefs(rows: readonly PrefRow[]): string {
  const sorted = [...rows].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  return JSON.stringify(sorted.map((r) => trimEnd<Cell>([r.ref, r.rest_sec, r.records_from])));
}

export function unpackPrefs(json: string): PrefRow[] | null {
  const a = parseArray(json);
  if (!a) return null;
  const out: PrefRow[] = [];
  for (const r of a) {
    if (!Array.isArray(r) || typeof r[0] !== 'string') return null;
    out.push({ ref: r[0], rest_sec: num(at(r, 1)), records_from: text(at(r, 2)) });
  }
  return out;
}

// ------------------------------------------------------------------ 'b' 'm' 'f' small records

export const packBodyWeight = (kg: number): string => JSON.stringify([kg]);
export function unpackBodyWeight(json: string): number | null {
  const a = parseArray(json);
  return a ? num(a[0]) : null;
}

export const measurementId = (dateISO: string, kind: string): string => `${dateISO}|${kind}`;
export function splitMeasurementId(id: string): { dateISO: string; kind: string } | null {
  const i = id.indexOf('|');
  if (i <= 0 || i === id.length - 1) return null;
  return { dateISO: id.slice(0, i), kind: id.slice(i + 1) };
}
export const packMeasurement = (value: number): string => JSON.stringify([value]);
export const unpackMeasurement = unpackBodyWeight;

export const packPhotoRecord = (dateISO: string, createdAt: number): string => JSON.stringify([dateISO, createdAt]);

// ------------------------------------------------------------------ 'u' profile

export interface ProfileRow {
  name: string;
  age: number;
  height_cm: number;
  goal: string;
  experience: string;
  gym_name: string;
  member_since_iso: string;
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  unit_system: string | null;
  language: string | null;
  bio: string | null;
  link: string | null;
}

/** Never the phone number or the photo's path: only what the app needs to open as theirs. PURE. */
export function packProfile(p: ProfileRow): string {
  return JSON.stringify(
    trimEnd<Cell>([p.name, p.age, p.height_cm, p.goal, p.experience, p.gym_name, p.member_since_iso, p.calorie_target, p.protein_target_g, p.carbs_target_g, p.fat_target_g, p.unit_system, p.language, p.bio, p.link]),
  );
}

export function unpackProfile(json: string): ProfileRow | null {
  const a = parseArray(json);
  const name = a ? text(at(a, 0)) : null;
  if (!a || !name) return null;
  return {
    name,
    age: num(at(a, 1)) ?? 0,
    height_cm: num(at(a, 2)) ?? 0,
    goal: text(at(a, 3)) ?? 'general',
    experience: text(at(a, 4)) ?? 'beginner',
    gym_name: text(at(a, 5)) ?? '',
    member_since_iso: text(at(a, 6)) ?? '',
    calorie_target: num(at(a, 7)) ?? 0,
    protein_target_g: num(at(a, 8)) ?? 0,
    carbs_target_g: num(at(a, 9)) ?? 0,
    fat_target_g: num(at(a, 10)) ?? 0,
    unit_system: text(at(a, 11)),
    language: text(at(a, 12)),
    bio: text(at(a, 13)),
    link: text(at(a, 14)),
  };
}

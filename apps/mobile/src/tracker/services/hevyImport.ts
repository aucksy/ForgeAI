/**
 * "Migrate from Hevy" — parse a Hevy CSV/Excel export (.xlsx) and write it into
 * ForgeAI's local history via the FROZEN workout repos. Fully offline: SheetJS
 * parses a base64 blob of a locally-picked file; no network, no upload.
 *
 * The Hevy export is one row per SET (14 columns), grouped into workouts by
 * `start_time` (unique per workout). We map: title -> dayType (+ keep the original
 * in notes), start/end -> timestamps + local day, exercise_title -> an exact-name
 * library match else a newly created custom exercise (muscle via a keyword
 * classifier, equipment from the "(...)" suffix), warmup -> isWarmup, (Phase 5b)
 * per-set rpe + dropset/failure set types, and (Phase 5c) superset_id -> per-workout
 * group + exercise_notes -> per-exercise note.
 *
 * Phase 2: timed and distance rows (Plank, Treadmill — no reps) are KEPT as time /
 * distance sets (duration_seconds, distance_km), where earlier versions dropped them.
 * "(Assisted)" titles are assisted moves (Hevy exports the help as a positive kg; it is
 * stored negative), "(Weighted)" titles carry the added weight, and a Hevy title that the
 * bundled library knows ("Bench Press (Barbell)", "Pull Up") lands on that library exercise
 * — with its picture, steps and type — instead of a new custom copy. A Merge re-run also
 * adds the timed and distance sets that earlier imports skipped to workouts already here.
 *
 * Writes reuse createSession + addSetsWithMeta (which wraps the frozen addSets — its
 * auto set-numbering AND PR detection — then persists rpe/set_type via the additive
 * columns), createExercise and deleteSession — no frozen file/signature edited.
 */
import * as XLSX from 'xlsx';

import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { createExercise } from '@/db/repos/exerciseRepo';
import { originalStarts } from '@/tracker/db/importKeys';
import { createSession, deleteSession, getSessionsBetween } from '@/db/repos/workoutRepo';
import { catalogEntry, catalogEntryByName } from '@/tracker/catalog/exerciseCatalog';
import { addSetsWithMeta } from '@/tracker/db/trackerSets';
import { isLoadMode, isLogType, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import type { DayType, Exercise, MuscleGroup } from '@/types/models';

import { csvObjects, normHead, num } from './csvText';
import { repairImportedClockTimes } from './importClockRepair';
import { localMoment, readWallClock, scanDateOrder, wallISO, type DateOrder } from './importDates';
import { isDefaultWorkoutName } from './routineRebuild';

type Equipment = Exercise['equipment'];

// date_iso is a 'YYYY-MM-DD' string, so these lexicographic bounds cover all rows.
const MIN_ISO = '0001-01-01';
const MAX_ISO = '9999-12-31';

// ---------------------------------------------------------------- types

export type ImportMode = 'replace' | 'merge';

/**
 * Set after the first Phase 2 import. The Merge backfill (timed / distance rows that
 * versions before Phase 2 dropped) runs only before it — once — so a later Merge never
 * brings back timed sets the member deleted on purpose.
 */
const TIMED_BACKFILL_KEY = 'hevy_timed_backfill_done';
/**
 * v0.29.1: exercises Import routines made from a link, whose type was GUESSED from the name (a
 * link shows no sets). The history import, when it brings that exercise's real sets and nothing
 * was logged on it yet, sets the type from those sets ("Cable Crunch" guessed as timed showed
 * no PREVIOUS). JSON list of exercise ids, in `meta`.
 */
export const GUESSED_TYPE_KEY = 'link_guessed_exercise_types';

function readIds(raw: string | null): string[] {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface ParsedSet {
  weightKg: number; // 0 for bodyweight (null in the file); as exported (help is positive)
  reps: number; // 0 on a timed / distance row
  isWarmup: boolean;
  /** Working-set variant from Hevy's set_type (dropset/failure); warm-up via isWarmup. */
  setType: 'normal' | 'drop' | 'failure';
  rpe: number | null;
  setIndex: number;
  /** Phase 2: seconds (duration_seconds), null when absent. */
  durationSec: number | null;
  /** Phase 2: metres (distance_km × 1000), null when absent. */
  distanceM: number | null;
  /**
   * Review fix #9: which block of this exercise in the workout the set came from (0 = the first).
   * Hevy writes the same exercise twice as two blocks; each becomes its own card (`card_index`).
   */
  card?: number;
  /** The set's row in the file, so the cards are written back in the file's order. */
  row?: number;
}

interface ParsedExercise {
  title: string; // original Hevy exercise_title, e.g. "Bench Press (Barbell)"
  sets: ParsedSet[];
  /** Raw Hevy superset_id (remapped to a per-workout group int in runImport). null = none. */
  supersetId: string | null;
  /** Hevy per-exercise note (exercise_notes column). */
  note: string | null;
  /** Review fix #9: the note of each later block (card) of this exercise, by block number. */
  blockNotes?: Record<number, string | null>;
}

interface ParsedWorkout {
  title: string; // sanitized original workout title (kept in notes)
  /**
   * The workout's notes when the file says them (`workoutNotes`: the title and Hevy's
   * `description`). Absent (another importer's shape) → the title is the notes, as before.
   */
  notes?: string | null;
  dayType: DayType;
  startedAt: number; // epoch ms (local)
  endedAt: number | null;
  dateISO: string;
  exercises: ParsedExercise[]; // first-appearance order
  /** Review fix #9: the workout's own name, from a title this app wrote ("Push · Morning workout"). */
  name?: string | null;
}

export interface ParsedHevy {
  workouts: ParsedWorkout[]; // chronological ascending (oldest first)
  distinctExerciseTitles: string[]; // only titles that have >= 1 valid set
  skippedRows: number; // rows with nothing to log (no reps, time or distance)
  totalSetRows: number;
  /** Phase 2: rows kept as time / distance sets (earlier versions dropped them). */
  timedRows: number;
  /**
   * Review fix: rows left out because their date could not be read — reported to the member
   * (with one of them), never dropped silently. Absent = none.
   */
  badDateRows?: number;
  badDateExample?: string | null;
  /**
   * Review fix: number-only dates that read two ways ("03/04/2026") with nothing in the whole
   * file to settle it. The member is asked; until then the file was read day-first. Null = no question.
   */
  dateQuestion?: string | null;
  /** The way round the number-only dates were read. */
  dateOrder?: DateOrder;
}

export interface ImportPreview {
  workouts: number;
  sets: number;
  distinctExercises: number;
  newExercises: string[]; // titles that will be created (no exact library match)
  matchedExercises: number;
  skippedRows: number;
  /** Review fix: rows whose date could not be read (left out, and said so). */
  badDateRows: number;
  badDateExample: string | null;
  /** Review fix (IM-15): how each new name's sets are logged, so "Same as …?" only offers a match logged the same way. */
  newExerciseTypes: Record<string, LogType>;
  existingWorkouts: number; // current sessions in the DB (for the Replace warning)
  dateRange: { fromISO: string; toISO: string } | null;
  /** Phase 2: timed / distance sets in the file. */
  timedSets: number;
  /** v0.27.0: workouts in the file already in ForgeAI (imported before, or logged here too) — Merge skips them. */
  alreadyHere: number;
  /**
   * Phase 4 (IM-15): file names that land on a ForgeAI exercise of another name — shown with both
   * names ("Chest Fly (Machine) → Pec Deck Fly").
   */
  renamed: { from: string; to: string }[];
}

export interface ImportResult {
  imported: number; // sessions created
  skippedExisting: number; // idempotent skip (startedAt already present)
  emptyWorkouts: number; // workouts with 0 valid sets, skipped
  setsInserted: number;
  createdExercises: number;
  /** Phase 2 (Merge): timed / distance sets added to workouts imported before they were supported. */
  backfilledSets: number;
  /** v0.27.0 (Merge): the same workout already logged in ForgeAI (same day, start within 30 min) — skipped. */
  skippedSameWorkout: number;
  /** v0.28.1 (Replace): the workouts deleted, so Health Connect can drop them too. */
  replacedSessionIds?: string[];
  /** The workouts this import wrote (Undo import takes exactly these away). */
  createdSessionIds?: string[];
  /**
   * Phase 6 review fix (Merge): workouts imported before that got sets added now (`backfilledSets`),
   * so their Health Connect copy (its length and calories) is sent again.
   */
  extendedSessionIds?: string[];
}

// ---------------------------------------------------------------- text utils

/** lowercase, trim, collapse internal whitespace (matches exerciseRepo). */
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Drop emoji and symbols (Hevy's "Morning workout ☀️") and control characters. v0.28.1: letters
 * of every language stay — "Día de pierna" was "D a de pierna", a Hindi title was emptied.
 */
export function sanitizeTitle(s: string): string {
  // An emoji with its joiners ("👨‍👩‍👧"); a joiner inside a word (Persian, Hindi) stays.
  return s
    .replace(/‍?[\uD800-\uDFFF←-⯿︀-️⃣]+(?:‍[\uD800-\uDFFF←-⯿︀-️⃣]+)*‍?/g, ' ')
    .replace(/[​\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * v0.28.1 — a .csv export is UTF-8 text with no marker at its start, which SheetJS reads as
 * Latin-1 ("búlgara" became "bÃºlgara", a new exercise). Decode base64 → UTF-8 here; null when
 * the bytes are not UTF-8 (a file Excel saved as Windows-1252 goes to SheetJS as before). PURE.
 */
export function base64Utf8(base64: string): string | null {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let n = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = ((buf << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (buf >> bits) & 0xff;
    }
  }
  let out = '';
  let chunk: number[] = [];
  const flush = (): void => {
    out += String.fromCharCode(...chunk);
    chunk = [];
  };
  for (let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0; i < n; i++) {
    const b = bytes[i];
    let cp = 0xfffd;
    let need = 0;
    if (b < 0x80) cp = b;
    else if (b >= 0xc2 && b < 0xe0) [cp, need] = [b & 0x1f, 1];
    else if (b >= 0xe0 && b < 0xf0) [cp, need] = [b & 0x0f, 2];
    else if (b >= 0xf0 && b < 0xf5) [cp, need] = [b & 0x07, 3];
    let ok = true;
    for (let k = 1; k <= need; k++) {
      const c = i + k < n ? bytes[i + k] : 0;
      if ((c & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (c & 0x3f);
    }
    if (need > 0 && ok) i += need;
    else if (b >= 0x80) return null; // not UTF-8
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else chunk.push(cp);
    if (chunk.length > 8000) flush();
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- date parsing

/**
 * A Hevy time ("7 Jul 2026, 14:24", or any form Excel rewrites it to — see `importDates`) → the
 * moment that clock time is on this phone. Audit IM-07: it used to be the clock time written as
 * UTC (so a re-import in another time zone matched exactly), which put every imported workout
 * hours off in the export, History and Health Connect. A re-import now also recognises a
 * workout by its day, name and length (`isAlreadyHere`), so a time-zone change still never
 * doubles one. Null when unreadable.
 */
export function parseHevyDate(input: unknown, order: DateOrder = 'dmy'): number | null {
  const c = readWallClock(input, order);
  return c ? localMoment(c) : null;
}

// ---------------------------------------------------------------- classifiers

/**
 * Map an exercise name to a primary muscle by keyword. Ordered most-specific
 * first so substrings don't steal (e.g. "leg curl" -> hamstrings before biceps
 * "curl"; "romanian deadlift" -> hamstrings before back "deadlift"; "face pull" ->
 * shoulders before back; "iso-lateral chest" -> chest before shoulders "lateral").
 * Tuned against the owner's real 95-exercise export.
 */
const MUSCLE_RULES: readonly [RegExp, MuscleGroup][] = [
  [/crunch|plank|oblique|\btwist\b|leg raise|knee raise|hanging|\bab\b|sit ?up/, 'core'],
  [/hip thrust|glute/, 'glutes'],
  [/romanian deadlift|\brdl\b|leg curl|nordic|good morning/, 'hamstrings'],
  [/calf|calves/, 'calves'],
  [/squat|leg press|leg extension|lunge|split squat|hack|step ?up/, 'quads'],
  [/wrist|forearm/, 'forearms'],
  [/\brow\b|pulldown|pull ?up|chin ?up|\blat\b|pullover|deadlift|t bar|t-bar|\bsumo\b|straight arm|shrug/, 'back'],
  [/shoulder|overhead press|lateral raise|lateral machine|lateral bent|lateral diagonal|\bdelt|face pull|reverse fly|reverse shoulder|arnold|military|upright/, 'shoulders'],
  [/bench|chest|\bfly\b|flyes|crossover|cross over|\bpec\b|push ?up|iso-lateral chest/, 'chest'],
  [/tricep|skullcrusher|skull crusher|pushdown|kickback|close grip|overhead extension/, 'triceps'],
  [/bicep|curl|preacher|concentration|spider|hammer/, 'biceps'],
];

export function classifyMuscle(title: string): MuscleGroup {
  const t = title.toLowerCase();
  for (const [re, muscle] of MUSCLE_RULES) if (re.test(t)) return muscle;
  return 'chest'; // neutral fallback for cryptic names (e.g. "Incline BB Jr")
}

/**
 * Equipment from the trailing "(...)" suffix (Barbell/Dumbbell/Machine/Cable/
 * Bodyweight/Smith Machine); non-equipment parens (Home, Gurgaon, Weighted) fall
 * through to name heuristics, else 'other'. Bodyweight for push/pull/chin-up/dip/plank.
 */
export function classifyEquipment(title: string): Equipment {
  const t = title.toLowerCase();
  const suffix = /\(([^)]*)\)[^(]*$/.exec(t)?.[1] ?? '';
  if (/smith|machine/.test(suffix)) return 'machine';
  if (/barbell/.test(suffix)) return 'barbell';
  if (/dumbbell/.test(suffix)) return 'dumbbell';
  if (/cable/.test(suffix)) return 'cable';
  if (/bodyweight/.test(suffix)) return 'bodyweight';
  // no recognized equipment suffix — infer from the whole name
  if (/\bsmith\b|machine/.test(t)) return 'machine';
  if (/barbell|\bbb\b|\bez\b/.test(t)) return 'barbell';
  if (/dumbbell|\bdb\b/.test(t)) return 'dumbbell';
  if (/cable/.test(t)) return 'cable';
  if (/push ?up|pull ?up|chin ?up|\bdip\b|plank|muscle ?up/.test(t)) return 'bodyweight';
  return 'other';
}

function guessCompound(title: string): boolean {
  return /press|bench|squat|deadlift|\brow\b|pulldown|pull ?up|chin ?up|lunge|\bdip\b|thrust|leg press|clean|snatch/.test(
    title.toLowerCase(),
  );
}

function defaultIncrement(eq: Equipment): number {
  if (eq === 'machine') return 5;
  if (eq === 'bodyweight') return 1;
  return 2.5;
}

/**
 * The plain day names "Save my history" writes as a workout's title (its notes go in
 * `description`). Each reads back as its own day through `inferDayType`.
 */
export const DAY_LABEL: Record<DayType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper body',
  lower: 'Lower body',
  full: 'Full body',
  rest: 'Rest',
};
const DAY_LABELS = new Set(Object.values(DAY_LABEL).map((l) => l.toLowerCase()));

/** Between the day and the workout's own name in a title "Save my history" writes. */
export const TITLE_SEP = ' · ';

/**
 * Review fix #9: a title this app wrote for a named workout — "Push · Morning workout" — split
 * into the day's name and the workout's own name (cleaned the way Finish stores it). Null for
 * any other title. PURE.
 */
export function ownTitle(rawTitle: string): { day: string; name: string } | null {
  const at = rawTitle.indexOf(TITLE_SEP);
  if (at <= 0) return null;
  const day = rawTitle.slice(0, at);
  if (!Object.values(DAY_LABEL).includes(day)) return null;
  const name = rawTitle.slice(at + TITLE_SEP.length).replace(/\s+/g, ' ').trim().slice(0, 60);
  return name ? { day, name } : null;
}

/**
 * A workout's notes from its file title and Hevy's `description` (the workout's own
 * description). PURE.
 *  - No description: the title, as before (a bare day name from our own export says nothing
 *    the day type does not, so it is no note).
 *  - Our own export (the title is a bare day name), or an older one of ours whose title was the
 *    notes themselves or "Push: notes": the description IS the notes, exactly.
 *  - A real Hevy workout ("Push Day A" + "felt strong"): the title, then the description.
 */
export function workoutNotes(title: string, description: string | null | undefined): string | null {
  const t = sanitizeTitle(title);
  const d = (description ?? '').replace(/\r\n?/g, '\n');
  const bare = DAY_LABELS.has(t.toLowerCase());
  if (d.trim() === '') return bare || t === '' ? null : t;
  const flat = sanitizeTitle(d).toLowerCase();
  const tl = t.toLowerCase();
  if (bare || t === '' || tl === flat || tl.endsWith(`: ${flat}`)) return d;
  return `${t}\n${d}`;
}

/**
 * Audit Phase 3 (HI-04): the name an imported workout keeps — our own "Push · Morning
 * workout" gives its name part; a real Hevy title ("Push 1", "Morning workout") is the name;
 * a bare day name from our own export ("Push") is none (the day type says it). PURE.
 */
export function importedWorkoutName(w: { title: string; name?: string | null }): string | null {
  if (w.name) return w.name;
  const t = sanitizeTitle(w.title).replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!t || DAY_LABELS.has(t.toLowerCase())) return null;
  return t;
}

/**
 * Audit Phase 3 (RP-02): the routine an imported workout was, by name — Hevy names a workout
 * after its routine ("Push 1"). A routine of the followed plan wins; otherwise only a name
 * that exactly one routine has. Null when nothing (or more than one) matches. PURE.
 */
export function routineIdForName(
  name: string | null,
  routines: readonly { id: string; name: string; followed: boolean }[],
): string | null {
  const key = (name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key) return null;
  const hits = routines.filter((r) => r.name.replace(/\s+/g, ' ').trim().toLowerCase() === key);
  const followed = hits.find((r) => r.followed);
  if (followed) return followed.id;
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Infer a ForgeAI DayType from a Hevy workout title. push/pull matched first, then
 * full/leg, then push- vs pull-muscle words, then generic upper/lower; else 'full'.
 */
export function inferDayType(rawTitle: string): DayType {
  const t = rawTitle.toLowerCase();
  if (/\bpush\b/.test(t)) return 'push';
  if (/\bpull\b/.test(t)) return 'pull';
  if (t.includes('full body') || /\bfull\b/.test(t)) return 'full';
  if (/\bleg|squat|quad|hamstring|glute|calf|calves|lunge/.test(t)) return 'legs';
  if (/chest|shoulder|tricep|\bdelt|bench|\bpec\b/.test(t)) return 'push';
  if (/back|bicep|\blat\b|\brow\b|deadlift|pull ?down/.test(t)) return 'pull';
  if (t.includes('lower')) return 'lower';
  if (t.includes('upper')) return 'upper';
  return 'full';
}

/** inferDayType, or null when the title says nothing it knows (another language, a nickname). PURE. */
export function inferDayTypeOrNull(rawTitle: string): DayType | null {
  const t = rawTitle.toLowerCase();
  if (/\bpush\b|\bpull\b|full body|\bfull\b|\bleg|squat|quad|hamstring|glute|calf|calves|lunge|chest|shoulder|tricep|\bdelt|bench|\bpec\b|back|bicep|\blat\b|\brow\b|deadlift|pull ?down|lower|upper/.test(t)) {
    return inferDayType(rawTitle);
  }
  return null;
}

/** The muscle a name's keywords say, or null (no guess). */
function muscleOrNull(title: string): MuscleGroup | null {
  const t = title.toLowerCase();
  for (const [re, muscle] of MUSCLE_RULES) if (re.test(t)) return muscle;
  return null;
}

/**
 * IM-14: a workout's day from its exercises — mostly legs → legs; no legs → push, pull or upper
 * body; a mix → full body. PURE.
 */
export function dayTypeFromExercises(titles: readonly string[]): DayType {
  let push = 0;
  let pull = 0;
  let legs = 0;
  for (const t of titles) {
    const m = muscleOrNull(t);
    if (m === 'chest' || m === 'shoulders' || m === 'triceps') push += 1;
    else if (m === 'back' || m === 'biceps' || m === 'forearms') pull += 1;
    else if (m === 'quads' || m === 'hamstrings' || m === 'glutes' || m === 'calves') legs += 1;
  }
  const all = push + pull + legs;
  if (all === 0) return 'full';
  if (legs / all >= 0.6) return 'legs';
  if (legs / all > 0.25) return 'full';
  if (push / all >= 0.7) return 'push';
  if (pull / all >= 0.7) return 'pull';
  return 'upper';
}

/**
 * The day of an imported workout: from its name when the name says (English); an app's own name
 * for an empty workout ("Morning workout", "Entrenamiento de mañana") stays full body, as
 * before; any other name (IM-14: "Día de pierna", "Тренировка ног") from its exercises. PURE.
 */
export function dayTypeOfWorkout(title: string, exerciseTitles: readonly string[]): DayType {
  const named = inferDayTypeOrNull(title);
  if (named) return named;
  return isDefaultWorkoutName(title) ? 'full' : dayTypeFromExercises(exerciseTitles);
}

function buildExerciseInput(title: string): Omit<Exercise, 'id'> {
  const equipment = classifyEquipment(title);
  return {
    name: title,
    aliases: [],
    muscleGroup: classifyMuscle(title),
    secondaryMuscles: [],
    equipment,
    isCompound: guessCompound(title),
    incrementKg: defaultIncrement(equipment),
  };
}

/**
 * How a NEW exercise from a Hevy title is logged (Phase 2), read from the title's
 * "(Assisted)" / "(Weighted)" suffix and from what its rows carry. PURE.
 */
export function inferLogType(title: string, sets: readonly Pick<ParsedSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>[]): LogType {
  const t = title.toLowerCase();
  if (/\(assisted\)|\bassisted\b|band assisted/.test(t)) return 'assisted';
  if (/\(weighted\)/.test(t)) return 'weighted';
  const withReps = sets.filter((s) => s.reps > 0);
  if (withReps.length > 0) {
    if (classifyEquipment(title) === 'bodyweight' && withReps.every((s) => s.weightKg === 0)) return 'reps';
    return 'weight_reps';
  }
  const anyDistance = sets.some((s) => (s.distanceM ?? 0) > 0);
  const anyTime = sets.some((s) => (s.durationSec ?? 0) > 0);
  if (anyDistance && anyTime) return 'time_distance';
  if (anyDistance) return 'distance';
  return 'time';
}

/**
 * What `weight_kg` stores for an imported set of this type: help is negative (Hevy exports
 * it positive). A carried weight on a timed or distance row (farmer's walk, sled push,
 * weighted hold) is kept: volume ignores it for those types, the export still shows it. PURE.
 */
export function importedWeight(logType: LogType, weightKg: number): number {
  if (logType === 'assisted') return -Math.abs(weightKg);
  if (logType === 'time' || logType === 'distance' || logType === 'time_distance') return Math.max(0, weightKg);
  return weightKg;
}

/**
 * How an exercise's imported Hevy weights are read. Hevy keeps one number per set, typed
 * however the member typed it - the owner's export has both dumbbells as one number
 * (Hammer Curl 25 kg next to 12.5 kg one-arm curls). So imported history reads "as typed":
 *  - an exercise nobody has logged yet takes "weight as typed" for good - the same as the
 *    launch sync gives a member's own history - so a file reads the same on a new phone
 *    as on an upgraded one;
 *  - an exercise already logged "each" in ForgeAI keeps that for its own sets; only the
 *    imported sets are marked "as typed".
 * PURE.
 */
export function importCounting(
  row: { loadMode: string | null; catalogKey: string | null },
  hadSets: boolean,
): { freeze: boolean; setMode: LoadMode | null } {
  const effective: LoadMode = isLoadMode(row.loadMode) ? row.loadMode : catalogEntry(row.catalogKey)?.loadMode ?? 'one';
  if (effective === 'one') return { freeze: false, setMode: null };
  if (row.loadMode == null && !hadSets) return { freeze: true, setMode: null };
  return { freeze: false, setMode: 'one' };
}

// ---------------------------------------------------------------- parsing

type RawRow = Record<string, unknown>;

const REQUIRED_COLUMNS = ['title', 'start_time', 'exercise_title', 'set_type'] as const;

function lbsToKg(v: number | null): number | null {
  return v == null ? null : v * 0.45359237; // unrounded, as a typed pound weight is stored
}

function milesToKm(v: number | null): number | null {
  return v == null ? null : v * 1.609344;
}

function asString(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Bytes that are not UTF-8 (Excel's "CSV" on Windows): one character per byte. PURE. */
function base64Latin1(base64: string): string {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  let buf = 0;
  let bits = 0;
  const chunk: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    buf = ((buf << 6) | B64.indexOf(clean[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      chunk.push((buf >> bits) & 0xff);
      if (chunk.length > 8000) out += String.fromCharCode(...chunk.splice(0));
    }
  }
  return out + String.fromCharCode(...chunk);
}

/**
 * The file's rows, each keyed by its (normalised) column name. IM-11: a .csv is read here, not by
 * the spreadsheet library — a file Excel saved again may use ";" or tabs, Excel's "sep=" line,
 * a byte-order mark, or Windows letters, and every value stays text exactly as written.
 */
function readRows(base64: string): { rows: RawRow[]; commaDecimal: boolean } {
  // A spreadsheet (.xlsx is a zip, "PK" = "UEsDB"; an old .xls starts "0M8R4") or UTF-16 text
  // ("//4", "/v8"): the spreadsheet library.
  const head = base64.trimStart().slice(0, 5);
  if (/^(UEsDB|0M8R4)/.test(head) || /^(\/\/4|\/v8)/.test(head)) {
    const wb = XLSX.read(base64, { type: 'base64', raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('empty');
    const raw = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
    const rows = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [normHead(k), v])));
    return { rows, commaDecimal: rows.some((r) => typeof r['weight_kg'] === 'string' && /^\s*-?\d+,\d+\s*$/.test(r['weight_kg'] as string)) };
  }
  const text = base64Utf8(base64) ?? base64Latin1(base64);
  const { rows, delimiter } = csvObjects(text);
  // A ";"-separated file comes from a decimal-comma Excel; "72,5" in a number column says so too.
  const numberCols = ['weight_kg', 'weight_lbs', 'reps', 'distance_km', 'distance_miles', 'duration_seconds', 'rpe'];
  const commaDecimal = delimiter === ';' || rows.slice(0, 2000).some((r) => numberCols.some((c) => /^\s*-?\d+,\d{1,2}\s*$/.test(r[c] ?? '')));
  return { rows, commaDecimal };
}

/**
 * Parse a base64 .xlsx (or .csv) Hevy export into grouped, chronological workouts.
 * Throws a user-safe Error if the file isn't a recognizable Hevy export.
 */
export function parseHevyBase64(base64: string, opts: { dateOrder?: DateOrder } = {}): ParsedHevy {
  let rows: RawRow[];
  let commaDecimal = false;
  try {
    ({ rows, commaDecimal } = readRows(base64));
  } catch {
    throw new Error('Could not read that file. Export your Hevy data and pick the .csv/.xlsx file.');
  }
  if (rows.length === 0) {
    throw new Error('That file has no rows to import.');
  }
  const first = rows[0];
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in first));
  if (missing.length > 0) {
    throw new Error(
      missing.length === REQUIRED_COLUMNS.length
        ? 'That doesn’t look like a Hevy export (unexpected columns).'
        : `That doesn’t look like a Hevy export: it has no ${missing.join(', ')} column${missing.length === 1 ? '' : 's'}.`,
    );
  }
  const n = (v: unknown): number | null => num(v as string | number | null | undefined, commaDecimal);
  // Review fix: the WHOLE column decides day-first / month-first; when nothing settles it the
  // member is asked (`dateQuestion`) and their answer comes back as `opts.dateOrder`.
  const scan = scanDateOrder(rows.map((r) => r['start_time']));
  const order: DateOrder = opts.dateOrder ?? scan.order ?? 'dmy';
  let badDateRows = 0;

  // One workout per (title, start_time, end_time). Hevy writes times to the minute, so two
  // workouts started in the same minute share a start_time; grouping by start alone merged them.
  const byStart = new Map<string, ParsedWorkout>();
  let skippedRows = 0;
  let totalSetRows = 0;
  let timedRows = 0;
  const unreadDates: string[] = [];
  const needsDay = new Set<ParsedWorkout>();
  const lastTitle = new Map<ParsedWorkout, string>();
  const blockOf = new Map<ParsedExercise, number>();
  const orderOf = new Map<ParsedSet, number>();

  for (const r of rows) {
    totalSetRows += 1;
    const startRaw = asString(r['start_time']);
    const clock = readWallClock(r['start_time'], order);
    const startedAt = clock ? localMoment(clock) : null;
    if (!clock && startRaw.trim() !== '' && unreadDates.length < 3) unreadDates.push(startRaw.trim());
    if (!clock) {
      // A row whose date can't be read is counted and shown, never dropped silently.
      badDateRows += 1;
      continue;
    }
    const exTitle = asString(r['exercise_title']).trim();
    const reps = n(r['reps']);
    const duration = n(r['duration_seconds']);
    // v0.27.0: a Hevy account set to pounds exports weight_lbs / distance_miles instead.
    const distanceKm = r['distance_km'] !== undefined ? n(r['distance_km']) : milesToKm(n(r['distance_miles']));
    const durationSec = duration != null && duration > 0 ? Math.round(duration) : null;
    const distanceM = distanceKm != null && distanceKm > 0 ? Math.round(distanceKm * 1000 * 10) / 10 : null;
    const hasReps = reps !== null && reps > 0;
    // A set needs reps, a time or a distance (Phase 2 keeps Plank / Treadmill rows).
    if (startedAt === null || clock === null || exTitle === '' || (!hasReps && durationSec === null && distanceM === null)) {
      skippedRows += 1;
      continue;
    }
    if (!hasReps) timedRows += 1;
    const weightKg = (r['weight_kg'] !== undefined ? n(r['weight_kg']) : lbsToKg(n(r['weight_lbs']))) ?? 0; // null weight = bodyweight
    const rawSetType = asString(r['set_type']).toLowerCase().trim();
    const isWarmup = rawSetType === 'warmup' || rawSetType === 'warm up' || rawSetType === 'warm-up';
    // Hevy working-set variants: dropset / failure. Everything else → normal.
    const setType: ParsedSet['setType'] =
      rawSetType === 'dropset' || rawSetType === 'drop set' || rawSetType === 'drop'
        ? 'drop'
        : rawSetType === 'failure'
          ? 'failure'
          : 'normal';
    const rpe = n(r['rpe']);
    const setIndex = n(r['set_index']) ?? 0;

    const rawTitle = asString(r['title']);
    const workoutKey = `${rawTitle}\u0000${startRaw}\u0000${asString(r['end_time'])}`;
    let workout = byStart.get(workoutKey);
    if (!workout) {
      const endClock = readWallClock(r['end_time'], order);
      const endedAt = endClock ? localMoment(endClock) : null;
      // #9: our own "Push · Morning workout" — the day from its first part, the name kept apart.
      const own = ownTitle(rawTitle);
      const dayTitle = own ? own.day : rawTitle;
      workout = {
        title: sanitizeTitle(rawTitle),
        notes: workoutNotes(dayTitle, r['description'] !== undefined ? asString(r['description']) : null),
        // From the title, else (IM-14) from the exercises once they are all read (below).
        dayType: inferDayTypeOrNull(dayTitle) ?? 'full',
        ...(own ? { name: own.name } : {}),
        startedAt,
        endedAt,
        dateISO: wallISO(clock),
        exercises: [],
      };
      if (inferDayTypeOrNull(dayTitle) == null) needsDay.add(workout);
      byStart.set(workoutKey, workout);
    }
    let exercise = workout.exercises.find((e) => e.title === exTitle);
    // v0.28.1: Hevy restarts set_index for a second block of the same exercise in one workout;
    // a new block starts when another exercise came in between. Its sets go after the first's.
    const prevTitle = lastTitle.get(workout);
    if (exercise && prevTitle !== exTitle) {
      const block = (blockOf.get(exercise) ?? 0) + 1;
      blockOf.set(exercise, block);
      // #9: a later block is its own card, with its own note.
      const blockNote = asString(r['exercise_notes']).replace(/[\u0000-\u0009\u000B-\u001F]+/g, ' ').trim();
      exercise.blockNotes = { ...(exercise.blockNotes ?? {}), [block]: blockNote !== '' ? blockNote : null };
    }
    lastTitle.set(workout, exTitle);
    if (!exercise) {
      // superset_id / exercise_notes are consistent per exercise — capture at first appearance.
      const supersetRaw = asString(r['superset_id']).trim();
      // v0.28.1: read as UTF-8 now, a note keeps its emoji (only control characters go).
      const noteRaw = asString(r['exercise_notes']).replace(/[\u0000-\u0009\u000B-\u001F]+/g, ' ').trim();
      exercise = {
        title: exTitle,
        sets: [],
        supersetId: supersetRaw !== '' ? supersetRaw : null,
        note: noteRaw !== '' ? noteRaw : null,
      };
      workout.exercises.push(exercise);
    }
    const set: ParsedSet = {
      weightKg,
      reps: hasReps ? Math.round(reps as number) : 0,
      isWarmup,
      setType,
      rpe,
      setIndex,
      durationSec,
      distanceM,
      card: blockOf.get(exercise) ?? 0,
      row: totalSetRows,
    };
    orderOf.set(set, (blockOf.get(exercise) ?? 0) * 100_000 + setIndex);
    exercise.sets.push(set);
  }

  // IM-11: nothing read because no date could be — say which column and show one.
  if (byStart.size === 0 && unreadDates.length > 0) {
    throw new Error(
      `The dates in its start_time column could not be read (for example “${unreadDates[0]}”). Export the file from Hevy again and pick it without opening it in Excel.`,
    );
  }

  const workouts = [...byStart.values()].sort((a, b) => a.startedAt - b.startedAt);
  for (const w of needsDay) w.dayType = dayTypeOfWorkout(w.title, w.exercises.map((e) => e.title));
  // Two workouts in the same minute: the later one in the file starts a second later, so each
  // keeps its own start (the import skips a start it has already written, and Merge keys on it).
  // Same file → same seconds, so a re-run still recognises both.
  for (let i = 1; i < workouts.length; i++) {
    if (workouts[i].startedAt <= workouts[i - 1].startedAt) {
      const shift = workouts[i - 1].startedAt + 1000 - workouts[i].startedAt;
      workouts[i].startedAt += shift;
      if (workouts[i].endedAt != null && (workouts[i].endedAt as number) < workouts[i].startedAt) workouts[i].endedAt = workouts[i].startedAt;
    }
  }
  // Sets ordered by Hevy's set_index within each exercise (stable, matches log order).
  for (const w of workouts) {
    for (const ex of w.exercises) ex.sets.sort((a, b) => (orderOf.get(a) ?? a.setIndex) - (orderOf.get(b) ?? b.setIndex));
  }
  const titles = new Set<string>();
  for (const w of workouts) for (const ex of w.exercises) titles.add(ex.title);

  return {
    workouts,
    distinctExerciseTitles: [...titles],
    skippedRows,
    totalSetRows,
    timedRows,
    badDateRows,
    badDateExample: unreadDates[0] ?? null,
    dateQuestion: scan.order == null && opts.dateOrder == null ? scan.ambiguous : null,
    dateOrder: order,
  };
}

// ---------------------------------------------------------------- preview

interface LibraryRow {
  id: string;
  name: string;
  catalogKey: string | null;
  logType: LogType;
  /** The row's own counting column (null = the catalogue's). */
  loadMode?: string | null;
}

async function readLibrary(): Promise<LibraryRow[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    name: string;
    catalog_key: string | null;
    log_type: string | null;
    load_mode: string | null;
  }>('SELECT id, name, catalog_key, log_type, load_mode FROM exercises');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    catalogKey: r.catalog_key,
    logType: isLogType(r.log_type) ? r.log_type : 'weight_reps',
    loadMode: r.load_mode,
  }));
}

/**
 * The library row a Hevy title lands on: an exact name match first, else the row linked to
 * the library entry that title means ("Bench Press (Barbell)" → Barbell Bench Press). PURE.
 */
export function matchTitle(title: string, library: readonly LibraryRow[]): LibraryRow | null {
  const key = norm(title);
  const exact = library.find((e) => norm(e.name) === key);
  if (exact) return exact;
  const entry = catalogEntryByName(title);
  if (!entry) return null;
  return library.find((e) => e.catalogKey === entry.key) ?? null;
}

/**
 * v0.28.0: the member's exercise for each app exercise name, the same way the history import
 * resolved it (an exact name, else the library exercise the name means). Run after the import,
 * so every name in the file has one; a name with none is left out.
 */
export async function exerciseIdsForTitles(titles: readonly string[]): Promise<Map<string, string>> {
  const library = await readLibrary();
  const out = new Map<string, string>();
  for (const t of titles) {
    const hit = matchTitle(t, library);
    if (hit) out.set(t, hit.id);
  }
  return out;
}

/**
 * Audit IM-15: names that land on an exercise ForgeAI calls something else — shown with both
 * names ("Chest Fly (Machine) → Pec Deck Fly"). Reads only.
 */
export async function renamedIn(titles: readonly string[]): Promise<{ from: string; to: string }[]> {
  const library = await readLibrary();
  const out: { from: string; to: string }[] = [];
  for (const t of new Set(titles)) {
    const hit = matchTitle(t, library);
    if (hit && norm(hit.name) !== norm(t)) out.push({ from: t, to: hit.name });
  }
  return out;
}

/**
 * v0.29.1: the names that match nothing in the member's exercises (each would be made as a
 * custom exercise), in the order given. Reads only.
 */
export async function titlesNotInLibrary(titles: readonly string[]): Promise<string[]> {
  const library = await readLibrary();
  return [...new Set(titles)].filter((t) => !matchTitle(t, library));
}

/**
 * How a NEW exercise from a link is logged. `timed` = the link shows no reps for it; that is a
 * hold or cardio only when its name says so (Hevy shows "3 sets" alone for a rep exercise with
 * blank reps, like "Pull Up"). A bodyweight name is logged by reps alone. PURE.
 */
export function linkLogType(title: string, timed: boolean): LogType {
  // Whole words: "run" must not find "Crunch", nor "hang" "Hanging Leg Raise".
  const held =
    timed &&
    /\b(plank|planks|hold|dead hang|wall sit|l-sit|stretch|run|running|walk|walking|jog|jogging|cycling|bike|treadmill|elliptical|swim|swimming|skipping|jump rope|rowing machine|stair climber|stairmaster|carry|farmers? walk|battle ropes?|sled push|sled drag)\b/i.test(title);
  return inferLogType(title, held ? [{ weightKg: 0, reps: 0, durationSec: 60, distanceM: null }] : [{ weightKg: 0, reps: 10, durationSec: null, distanceM: null }]);
}

/**
 * v0.29.0 (Import routines from a link): each exercise name → the member's exercise, made as a
 * custom exercise when nothing matches (as the history import does). `timed` = the link shows
 * no reps for it AND its name is a hold or cardio (Hevy also shows "3 sets" alone for a rep
 * exercise with blank reps, like "Pull Up").
 */
export async function exerciseIdsCreating(
  items: readonly { title: string; timed: boolean; logType?: LogType | null }[],
  matches?: ReadonlyMap<string, string>,
): Promise<{ ids: Map<string, string>; created: number }> {
  const library = await readLibrary();
  const ids = new Map<string, string>();
  const madeNow: string[] = [];
  let created = 0;
  for (const { title, timed, logType: known } of items) {
    if (ids.has(title)) continue;
    // IM-15: "Same as ForgeAI's …" — the member's pick for a name ForgeAI did not know.
    const picked = matches?.get(title);
    if (picked && library.some((e) => e.id === picked)) {
      ids.set(title, picked);
      continue;
    }
    const hit = matchTitle(title, library);
    if (hit) {
      ids.set(title, hit.id);
      continue;
    }
    // Hevy's own type when the link said it (its page data); else a guess from the name.
    const logType = known ?? linkLogType(title, timed);
    const entry = catalogEntryByName(title);
    const linkKey = entry && !library.some((e) => e.catalogKey === entry.key) ? entry.key : null;
    const made = await createExercise(buildExerciseInput(title));
    await getDb().runAsync('UPDATE exercises SET log_type = ?, catalog_key = ? WHERE id = ?', [logType, linkKey, made.id]);
    library.push({ id: made.id, name: made.name, catalogKey: linkKey, logType, loadMode: null });
    ids.set(title, made.id);
    if (!known) madeNow.push(made.id);
    created += 1;
  }
  if (madeNow.length > 0) {
    const before = readIds(await getMeta(GUESSED_TYPE_KEY).catch(() => null));
    await setMeta(GUESSED_TYPE_KEY, JSON.stringify([...new Set([...before, ...madeNow])])).catch(() => undefined);
  }
  return { ids, created };
}

// ---------------------------------------------------------------- the same workout twice

/** Two starts this close on the same day are one workout logged in two apps. */
export const SAME_WORKOUT_MS = 30 * 60 * 1000;

/**
 * A ForgeAI session's start read as wall clock written as UTC — the basis imports use
 * (`parseHevyDate`). A session logged live here keeps the real moment, so it is converted.
 */
export function wallClockAsUtc(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

/** A workout as the "already here?" check reads it. */
export interface KnownWorkout {
  dateISO: string;
  startedAt: number;
  endedAt?: number | null;
  /** The workout's own name (an imported one keeps its Hevy title, "Push 1"). */
  title?: string | null;
}

const sameName = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * v0.27.0: is this imported workout already in ForgeAI? Either imported before — the exact same
 * start, or (IM-07, a phone moved to another time zone since) the same day, name and length —
 * or the same workout logged here too: the member tracked it in both apps (same day, starts
 * within 30 minutes). PURE.
 */
export function isAlreadyHere(w: KnownWorkout, existing: readonly KnownWorkout[]): 'exact' | 'same' | null {
  let same = false;
  const len = w.endedAt != null ? w.endedAt - w.startedAt : null;
  for (const e of existing) {
    if (e.startedAt === w.startedAt) return 'exact';
    if (e.dateISO !== w.dateISO) continue;
    if (len != null && e.endedAt != null && sameName(e.title, w.title) && Math.abs(e.endedAt - e.startedAt - len) <= 60_000) return 'exact';
    if (Math.abs(e.startedAt - w.startedAt) <= SAME_WORKOUT_MS) same = true;
  }
  return same ? 'same' : null;
}

/**
 * Review fix: which workout already here each file workout IS (its id), or null. First every
 * exact start claims its workout; then the same day, name and length (a phone moved to another
 * time zone) may match only a workout NOT claimed already in this run — so two 30-minute
 * "Cardio" workouts on one day, one of them imported before, never make the new one look
 * imported. PURE.
 */
export function matchKnown(file: readonly KnownWorkout[], existing: readonly (KnownWorkout & { id: string })[]): (string | null)[] {
  const out: (string | null)[] = file.map(() => null);
  const claimed = new Set<string>();
  const byStart = new Map<number, string>();
  for (const e of existing) if (!byStart.has(e.startedAt)) byStart.set(e.startedAt, e.id);
  file.forEach((w, i) => {
    const id = byStart.get(w.startedAt);
    if (id) {
      out[i] = id;
      claimed.add(id);
    }
  });
  file.forEach((w, i) => {
    if (out[i]) return;
    for (const e of existing) {
      if (claimed.has(e.id)) continue;
      if (isAlreadyHere(w, [e]) === 'exact') {
        out[i] = e.id;
        claimed.add(e.id);
        break;
      }
    }
  });
  return out;
}

/** Every workout here, with its name and end, for `isAlreadyHere` (plus moved workouts' first starts). */
async function knownWorkouts(): Promise<(KnownWorkout & { id: string })[]> {
  const sessions = await getSessionsBetween(MIN_ISO, MAX_ISO);
  // The workout's own name is a tracker column (schema v9), not in the frozen session shape.
  const named = await getDb()
    .getAllAsync<{ id: string; title: string | null }>('SELECT id, title FROM workout_sessions WHERE title IS NOT NULL')
    .catch(() => [] as { id: string; title: string | null }[]);
  const titleOf = new Map((named ?? []).map((r) => [r.id, r.title]));
  const out: (KnownWorkout & { id: string })[] = sessions.map((r) => ({
    id: r.id,
    dateISO: r.dateISO,
    startedAt: r.startedAt,
    endedAt: r.endedAt ?? null,
    title: titleOf.get(r.id) ?? null,
  }));
  // HI-03: a workout moved to another day since it was imported is still "already here".
  for (const o of await originalStarts().catch(() => [])) out.push({ id: o.id, dateISO: o.dateISO, startedAt: o.startedAt });
  return out;
}

/** The workout as the check compares it: its start, end, day and the name it is saved under. */
const asKnown = (w: ParsedWorkout): KnownWorkout => ({ dateISO: w.dateISO, startedAt: w.startedAt, endedAt: w.endedAt, title: importedWorkoutName(w) });

/** Every set the file has for one exercise name. PURE. */
function setsOfTitle(parsed: ParsedHevy, title: string): ParsedSet[] {
  const out: ParsedSet[] = [];
  for (const w of parsed.workouts) for (const ex of w.exercises) if (ex.title === title) out.push(...ex.sets);
  return out;
}

/** Analyze a parse against the current library + history — no DB writes. */
export async function previewImport(parsed: ParsedHevy): Promise<ImportPreview> {
  // IM-07: workouts imported before are compared on the same footing (real moments).
  await repairImportedClockTimes().catch(() => 0);
  const library = await readLibrary();
  // Count how many exercises will actually be CREATED — dedupe by normalized name
  // so the "N new" figure matches runImport (which creates once per unique norm).
  const newExercises: string[] = [];
  const newSeen = new Set<string>();
  let matched = 0;
  const renamed: { from: string; to: string }[] = [];
  for (const title of parsed.distinctExerciseTitles) {
    const key = norm(title);
    const hit = matchTitle(title, library);
    if (hit) {
      matched += 1;
      if (norm(hit.name) !== key) renamed.push({ from: title, to: hit.name });
    } else if (!newSeen.has(key)) {
      newSeen.add(key);
      newExercises.push(title);
    }
  }
  let sets = 0;
  for (const w of parsed.workouts) for (const ex of w.exercises) sets += ex.sets.length;

  const existing = await getSessionsBetween(MIN_ISO, MAX_ISO);
  const existingWorkouts = existing.length;
  const known = await knownWorkouts();
  const fileKnown = parsed.workouts.map(asKnown);
  const matchedIds = matchKnown(fileKnown, known);
  let alreadyHere = 0;
  fileKnown.forEach((k, i) => {
    if (matchedIds[i] != null || isAlreadyHere(k, known) === 'same') alreadyHere += 1;
  });

  const dateRange =
    parsed.workouts.length > 0
      ? {
          fromISO: parsed.workouts[0].dateISO,
          toISO: parsed.workouts[parsed.workouts.length - 1].dateISO,
        }
      : null;

  return {
    workouts: parsed.workouts.length,
    sets,
    distinctExercises: parsed.distinctExerciseTitles.length,
    newExercises,
    matchedExercises: matched,
    skippedRows: parsed.skippedRows,
    badDateRows: parsed.badDateRows ?? 0,
    badDateExample: parsed.badDateExample ?? null,
    newExerciseTypes: Object.fromEntries(newExercises.map((t) => [t, inferLogType(t, setsOfTitle(parsed, t))])),
    existingWorkouts,
    dateRange,
    timedSets: parsed.timedRows,
    alreadyHere,
    renamed,
  };
}

// ---------------------------------------------------------------- import

/**
 * Write the parse into the DB inside ONE transaction (atomic + fast; on any error
 * the DB is left untouched). `replace` wipes every existing workout first; both
 * modes skip a workout whose startedAt already exists so a re-run never duplicates.
 * Uses the non-exclusive withTransactionAsync so the getDb()-based frozen repos
 * participate in the same BEGIN/COMMIT (an exclusive tx would deadlock them).
 */
export async function runImport(
  parsed: ParsedHevy,
  opts: {
    mode: ImportMode;
    onProgress?: (done: number, total: number) => void;
    /** IM-15: file names the member matched to one of their exercises ("Same as …"): title → exercise id. */
    matches?: ReadonlyMap<string, string>;
  },
): Promise<ImportResult> {
  const { mode, onProgress } = opts;
  // IM-07: the workouts here are on the real-moment footing before any is compared or added.
  await repairImportedClockTimes();
  const result: ImportResult = {
    imported: 0,
    skippedExisting: 0,
    emptyWorkouts: 0,
    setsInserted: 0,
    createdExercises: 0,
    backfilledSets: 0,
    skippedSameWorkout: 0,
    createdSessionIds: [],
    extendedSessionIds: [],
  };
  const total = parsed.workouts.length;
  const backfillDone = (await getMeta(TIMED_BACKFILL_KEY).catch(() => null)) === '1';
  const guessed = new Set(readIds(await getMeta(GUESSED_TYPE_KEY).catch(() => null)));
  const guessedBefore = guessed.size;

  // DS-04: the import runs in the ONE app-wide write queue, so a finish / edit / routine save
  // made while it runs (e.g. after Back) waits its turn instead of nesting a BEGIN on the
  // shared connection, whose ROLLBACK would undo the import half-way.
  await enqueueWrite(async () => {
  await getDb().withTransactionAsync(async () => {
    // 1. Replace mode: clear all existing workouts (PRs cascade via deleteSession).
    if (mode === 'replace') {
      const existing = await getSessionsBetween(MIN_ISO, MAX_ISO);
      for (const s of existing) await deleteSession(s.id);
      result.replacedSessionIds = existing.map((s) => s.id);
    }

    // 2. Idempotency guard — start times already in the DB (empty after a replace).
    // HI-03: plus the FIRST start of every workout an edit has moved since (its import key), so
    // a moved workout is never brought back as a duplicate. Read after a replace: none survive it.
    const remaining = await knownWorkouts();
    const seenStarts = new Set<number>(remaining.map((s) => s.startedAt));
    const sameDay: KnownWorkout[] = remaining.map((s) => ({ dateISO: s.dateISO, startedAt: s.startedAt, endedAt: s.endedAt, title: s.title }));
    const sessionByStart = new Map<number, string>(remaining.map((s) => [s.startedAt, s.id]));
    // IM-07: the same workout after a time-zone change (same day, name and length) — each
    // workout here matched by at most one in the file (review fix, `matchKnown`).
    const matchedHere = matchKnown(parsed.workouts.map(asKnown), remaining);

    // 3. Resolve every distinct exercise title once: an exact name or the library
    //    exercise the title means, else a new custom exercise logged the way its rows are.
    const library = await readLibrary();
    const setsByTitle = new Map<string, ParsedSet[]>();
    for (const w of parsed.workouts) {
      for (const ex of w.exercises) setsByTitle.set(ex.title, [...(setsByTitle.get(ex.title) ?? []), ...ex.sets]);
    }
    const byTitle = new Map<string, { id: string; logType: LogType; setMode?: LoadMode | null }>();
    for (const title of parsed.distinctExerciseTitles) {
      // IM-15: the member said "Same as ForgeAI's …" for this name.
      const pickedId = opts.matches?.get(title);
      const picked = pickedId ? library.find((e) => e.id === pickedId) ?? null : null;
      const hit = picked ?? matchTitle(title, library);
      if (hit) {
        let logType = hit.logType;
        if (guessed.has(hit.id)) {
          // Made from a link with a guessed type: the real sets decide, unless it was used already.
          const used = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM set_entries WHERE exercise_id = ?', [hit.id]);
          const real = inferLogType(title, setsByTitle.get(title) ?? []);
          if ((used?.n ?? 0) === 0 && real !== logType) {
            await getDb().runAsync('UPDATE exercises SET log_type = ? WHERE id = ?', [real, hit.id]);
            logType = real;
            hit.logType = real;
          }
          guessed.delete(hit.id);
        }
        byTitle.set(title, { id: hit.id, logType });
        continue;
      }
      const logType = inferLogType(title, setsByTitle.get(title) ?? []);
      const entry = catalogEntryByName(title);
      const linkKey = entry && !library.some((e) => e.catalogKey === entry.key) ? entry.key : null;
      const created = await createExercise(buildExerciseInput(title));
      await getDb().runAsync('UPDATE exercises SET log_type = ?, catalog_key = ? WHERE id = ?', [
        logType,
        linkKey,
        created.id,
      ]);
      library.push({ id: created.id, name: created.name, catalogKey: linkKey, logType, loadMode: null });
      byTitle.set(title, { id: created.id, logType });
      result.createdExercises += 1;
    }

    // 3b. How each target's imported weights count (see importCounting): read "as typed".
    const counts = await getDb().getAllAsync<{ exercise_id: string; n: number }>(
      'SELECT exercise_id, COUNT(*) AS n FROM set_entries GROUP BY exercise_id',
    );
    const hadSets = new Set(counts.filter((c) => c.n > 0).map((c) => c.exercise_id));
    const rowById = new Map(library.map((r) => [r.id, r]));
    const frozen = new Set<string>();
    for (const target of byTitle.values()) {
      const row = rowById.get(target.id);
      if (!row) continue;
      const how = importCounting({ loadMode: row.loadMode ?? null, catalogKey: row.catalogKey }, hadSets.has(target.id));
      if (how.freeze && !frozen.has(target.id)) {
        await getDb().runAsync("UPDATE exercises SET load_mode = 'one' WHERE id = ? AND load_mode IS NULL", [target.id]);
        frozen.add(target.id);
      }
      target.setMode = how.setMode;
    }

    const toRich = (ex: ParsedExercise, group: number | null) => {
      const target = byTitle.get(ex.title);
      if (!target) return [];
      return ex.sets.map((st, i) => ({
        exerciseId: target.id,
        // #9: a later block of the same exercise is its own card.
        ...(st.card != null && st.card > 0 ? { cardIndex: st.card } : {}),
        weightKg: importedWeight(target.logType, st.weightKg),
        reps: st.reps,
        isWarmup: st.isWarmup,
        rpe: st.isWarmup ? null : st.rpe,
        setType: st.isWarmup ? undefined : st.setType,
        supersetGroup: group,
        // Per-card note on the card's first set (the first card's becomes set_number 1).
        note: i === 0 ? ex.note : (st.card ?? 0) > 0 && ex.sets[i - 1].card !== st.card ? ex.blockNotes?.[st.card ?? 0] ?? null : null,
        durationSec: st.durationSec,
        distanceM: st.distanceM,
        loadMode: target.setMode ?? null,
      }));
    };

    // Audit Phase 3: every routine's name, to remember which routine a workout was.
    const routineRows = await getDb().getAllAsync<{ id: string; name: string; is_active: number }>(
      `SELECT pd.id, pd.name, wp.is_active FROM plan_days pd JOIN workout_plans wp ON wp.id = pd.plan_id
        ORDER BY wp.is_active DESC, COALESCE(wp.folder_order, 1000000) ASC, pd.day_order ASC`,
    );
    const routines = routineRows.map((r) => ({ id: r.id, name: r.name, followed: r.is_active === 1 }));

    // 4. One session per workout (chronological, so PRs accrue in real order).
    let done = 0;
    for (const [wi, w] of parsed.workouts.entries()) {
      done += 1;
      const elsewhere = seenStarts.has(w.startedAt) ? null : matchedHere[wi];
      if (seenStarts.has(w.startedAt) || elsewhere) {
        result.skippedExisting += 1;
        // Merge re-run: earlier versions dropped timed / distance rows. Add them to this
        // already-imported workout when that exercise has nothing in it yet.
        const sessionId = sessionByStart.get(w.startedAt) ?? elsewhere ?? undefined;
        // Audit Phase 3 (HI-04): a workout imported before names were kept gets its name and
        // routine now — only where none is saved (a name the member gave is never replaced).
        if (mode === 'merge' && sessionId) {
          const name = importedWorkoutName(w);
          const routineId = routineIdForName(name, routines);
          if (name || routineId) {
            await getDb().runAsync(
              'UPDATE workout_sessions SET title = COALESCE(title, ?), routine_id = COALESCE(routine_id, ?) WHERE id = ?',
              [name, routineId, sessionId],
            );
          }
        }
        if (mode === 'merge' && sessionId && !backfillDone) {
          const timedOnly = w.exercises.filter((ex) => ex.sets.length > 0 && ex.sets.every((st) => st.reps === 0));
          if (timedOnly.length > 0) {
            const present = await getDb().getAllAsync<{ exercise_id: string }>(
              'SELECT DISTINCT exercise_id FROM set_entries WHERE session_id = ?',
              [sessionId],
            );
            const have = new Set(present.map((p) => p.exercise_id));
            const add = timedOnly.flatMap((ex) => {
              const target = byTitle.get(ex.title);
              return target && !have.has(target.id) ? toRich(ex, null) : [];
            });
            if (add.length > 0) {
              await addSetsWithMeta(sessionId, add);
              result.backfilledSets += add.length;
              if (!result.extendedSessionIds?.includes(sessionId)) result.extendedSessionIds?.push(sessionId);
            }
          }
        }
        onProgress?.(done, total);
        continue;
      }
      // v0.27.0: the same workout already logged in ForgeAI (tracked in both apps) is not doubled.
      if (mode === 'merge' && isAlreadyHere(asKnown(w), sameDay) === 'same') {
        result.skippedSameWorkout += 1;
        onProgress?.(done, total);
        continue;
      }
      // Remap this workout's distinct Hevy superset_ids to small group ints (1,2,3…).
      let groupCounter = 0;
      const supersetMap = new Map<string, number>();
      for (const ex of w.exercises) {
        if (ex.supersetId && !supersetMap.has(ex.supersetId)) {
          supersetMap.set(ex.supersetId, ++groupCounter);
        }
      }
      // #9: each card (block) in the place it had in the file — heavy Bench, Fly, back-off Bench.
      // A file without repeated blocks keeps the exercises' first-appearance order, as before.
      const blocks: { first: number; sets: ReturnType<typeof toRich> }[] = [];
      for (const ex of w.exercises) {
        const rich = toRich(ex, ex.supersetId ? supersetMap.get(ex.supersetId) ?? null : null);
        const byCard = new Map<number, { first: number; sets: ReturnType<typeof toRich> }>();
        ex.sets.forEach((st, i) => {
          if (!rich[i]) return;
          const c = st.card ?? 0;
          let b = byCard.get(c);
          if (!b) {
            b = { first: Number.POSITIVE_INFINITY, sets: [] };
            byCard.set(c, b);
            blocks.push(b);
          }
          b.first = Math.min(b.first, st.row ?? Number.POSITIVE_INFINITY);
          b.sets.push(rich[i]);
        });
      }
      const ordered = blocks.every((b) => Number.isFinite(b.first)) ? [...blocks].sort((a, b) => a.first - b.first) : blocks;
      const sets = ordered.flatMap((b) => b.sets);
      if (sets.length === 0) {
        result.emptyWorkouts += 1;
        onProgress?.(done, total);
        continue;
      }
      const session = await createSession({
        dateISO: w.dateISO,
        dayType: w.dayType,
        notes: w.notes !== undefined ? w.notes : w.title.length > 0 ? w.title : null,
        source: 'manual',
        startedAt: w.startedAt,
        endedAt: w.endedAt,
      });
      // #9 / audit HI-04: the workout's own name (tracker schema v9) — our own "Push · name", or
      // a Hevy title such as "Push 1". Audit RP-02 (schema v11): the routine of that name, if any.
      const name = importedWorkoutName(w);
      if (name) await getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', [name, session.id]);
      const routineId = routineIdForName(name, routines);
      if (routineId) await getDb().runAsync('UPDATE workout_sessions SET routine_id = ? WHERE id = ?', [routineId, session.id]);
      await addSetsWithMeta(session.id, sets);
      result.createdSessionIds?.push(session.id);
      seenStarts.add(w.startedAt); // guard against duplicate start_times within the file
      result.imported += 1;
      result.setsInserted += sets.length;
      onProgress?.(done, total);
    }
  });

  await setMeta(TIMED_BACKFILL_KEY, '1').catch(() => undefined);
  if (guessed.size !== guessedBefore) await setMeta(GUESSED_TYPE_KEY, JSON.stringify([...guessed])).catch(() => undefined);
  });
  return result;
}

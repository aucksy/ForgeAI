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
import { createExercise } from '@/db/repos/exerciseRepo';
import { createSession, deleteSession, getSessionsBetween } from '@/db/repos/workoutRepo';
import { catalogEntry, catalogEntryByName } from '@/tracker/catalog/exerciseCatalog';
import { addSetsWithMeta } from '@/tracker/db/trackerSets';
import { isLoadMode, isLogType, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import type { DayType, Exercise, MuscleGroup } from '@/types/models';

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
}

interface ParsedExercise {
  title: string; // original Hevy exercise_title, e.g. "Bench Press (Barbell)"
  sets: ParsedSet[];
  /** Raw Hevy superset_id (remapped to a per-workout group int in runImport). null = none. */
  supersetId: string | null;
  /** Hevy per-exercise note (exercise_notes column). */
  note: string | null;
}

interface ParsedWorkout {
  title: string; // sanitized original workout title (kept in notes)
  dayType: DayType;
  startedAt: number; // epoch ms (local)
  endedAt: number | null;
  dateISO: string;
  exercises: ParsedExercise[]; // first-appearance order
}

export interface ParsedHevy {
  workouts: ParsedWorkout[]; // chronological ascending (oldest first)
  distinctExerciseTitles: string[]; // only titles that have >= 1 valid set
  skippedRows: number; // rows with nothing to log (no reps, time or distance)
  totalSetRows: number;
  /** Phase 2: rows kept as time / distance sets (earlier versions dropped them). */
  timedRows: number;
}

export interface ImportPreview {
  workouts: number;
  sets: number;
  distinctExercises: number;
  newExercises: string[]; // titles that will be created (no exact library match)
  matchedExercises: number;
  skippedRows: number;
  existingWorkouts: number; // current sessions in the DB (for the Replace warning)
  dateRange: { fromISO: string; toISO: string } | null;
  /** Phase 2: timed / distance sets in the file. */
  timedSets: number;
  /** v0.27.0: workouts in the file already in ForgeAI (imported before, or logged here too) — Merge skips them. */
  alreadyHere: number;
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

const MONTH_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  // v0.28.1: a phone set to German, French, Spanish, Italian, Portuguese or Dutch may write the
  // month in its language. Unknown months were skipped rows (every October in German).
  mär: 2, mrz: 2, mai: 4, okt: 9, dez: 11, // de
  janv: 0, fév: 1, févr: 1, avr: 3, juin: 5, juil: 6, aoû: 7, août: 7, déc: 11, // fr
  ene: 0, abr: 3, ago: 7, sept: 8, dic: 11, // es
  gen: 0, mag: 4, giu: 5, lug: 6, set: 8, ott: 9, // it
  fev: 1, out: 9, // pt
  mrt: 2, mei: 4, // nl
};

/** "Okt" / "févr." / "Sept" → its month, or undefined. */
function monthOf(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTH_IDX[w] ?? MONTH_IDX[w.slice(0, 4)] ?? MONTH_IDX[w.slice(0, 3)];
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Parse Hevy's "7 Jul 2026, 14:24" (1-2 digit day/hour) to a TIMEZONE-STABLE epoch:
 * the wall-clock is interpreted as UTC (Date.UTC, NOT local `new Date(...)`). This
 * keeps a workout's identity + calendar day identical no matter which timezone the
 * device is in when the file is (re-)imported — so Merge's "safe to re-run"
 * idempotency (keyed on startedAt) can't be broken by a device timezone change, and
 * the imported day never drifts. Derive the day with `utcDateISO` (UTC getters).
 */
export function parseHevyDate(input: unknown): number | null {
  // A real spreadsheet (.xlsx) may hold the time as a date number (days since 30 Dec 1899):
  // read it as the same wall clock written as UTC, to the minute (2000 onwards; a small number is not a date).
  if (typeof input === 'number' && Number.isFinite(input) && input >= 36526 && input < 2958466) {
    return Math.round(((input - 25569) * 86_400_000) / 60_000) * 60_000;
  }
  if (typeof input !== 'string') return null;
  const m = /^\s*(\d{1,2})\.?\s+([^\s\d,]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(input);
  if (!m) return null;
  const mon = monthOf(m[2]);
  if (mon === undefined) return null;
  const t = Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), 0, 0);
  return Number.isNaN(t) ? null : t;
}

/** Calendar day (YYYY-MM-DD) of a UTC-basis epoch from parseHevyDate. */
function utcDateISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
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

function asNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function lbsToKg(v: number | null): number | null {
  return v == null ? null : v * 0.45359237; // unrounded, as a typed pound weight is stored
}

function milesToKm(v: number | null): number | null {
  return v == null ? null : v * 1.609344;
}

function asString(v: unknown): string {
  return v == null ? '' : String(v);
}

/**
 * Parse a base64 .xlsx (or .csv) Hevy export into grouped, chronological workouts.
 * Throws a user-safe Error if the file isn't a recognizable Hevy export.
 */
export function parseHevyBase64(base64: string): ParsedHevy {
  let rows: RawRow[];
  try {
    // v0.28.0: `raw` keeps a CSV's text as text. Without it SheetJS turns Hevy's "5 Oct 2026,
    // 11:10" into a spreadsheet date number and no workout was found in a .csv export.
    // v0.28.1: plain UTF-8 text (a .csv) is read as such. A spreadsheet (.xlsx is a zip, "PK" =
    // "UEsDB"; an old .xls starts "0M8R4"), UTF-16 text ("//4", "/v8") or other text: SheetJS as before.
    const head = base64.trimStart().slice(0, 5);
    const spreadsheet = /^(UEsDB|0M8R4)/.test(head) || /^(\/\/4|\/v8)/.test(head);
    const text = spreadsheet ? null : base64Utf8(base64);
    const wb = text != null ? XLSX.read(text, { type: 'string', raw: true }) : XLSX.read(base64, { type: 'base64', raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('empty');
    rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
  } catch {
    throw new Error('Could not read that file. Export your Hevy data and pick the .csv/.xlsx file.');
  }
  if (rows.length === 0) {
    throw new Error('That file has no rows to import.');
  }
  const first = rows[0];
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in first));
  if (missing.length > 0) {
    throw new Error('That doesn’t look like a Hevy export (unexpected columns).');
  }

  // Group by start_time (unique per workout in the Hevy export).
  const byStart = new Map<string, ParsedWorkout>();
  let skippedRows = 0;
  let totalSetRows = 0;
  let timedRows = 0;
  const lastTitle = new Map<ParsedWorkout, string>();
  const blockOf = new Map<ParsedExercise, number>();
  const orderOf = new Map<ParsedSet, number>();

  for (const r of rows) {
    totalSetRows += 1;
    const startRaw = asString(r['start_time']);
    const startedAt = parseHevyDate(r['start_time']);
    const exTitle = asString(r['exercise_title']).trim();
    const reps = asNumber(r['reps']);
    const duration = asNumber(r['duration_seconds']);
    // v0.27.0: a Hevy account set to pounds exports weight_lbs / distance_miles instead.
    const distanceKm = r['distance_km'] !== undefined ? asNumber(r['distance_km']) : milesToKm(asNumber(r['distance_miles']));
    const durationSec = duration != null && duration > 0 ? Math.round(duration) : null;
    const distanceM = distanceKm != null && distanceKm > 0 ? Math.round(distanceKm * 1000 * 10) / 10 : null;
    const hasReps = reps !== null && reps > 0;
    // A set needs reps, a time or a distance (Phase 2 keeps Plank / Treadmill rows).
    if (startedAt === null || exTitle === '' || (!hasReps && durationSec === null && distanceM === null)) {
      skippedRows += 1;
      continue;
    }
    if (!hasReps) timedRows += 1;
    const weightKg = (r['weight_kg'] !== undefined ? asNumber(r['weight_kg']) : lbsToKg(asNumber(r['weight_lbs']))) ?? 0; // null weight = bodyweight
    const rawSetType = asString(r['set_type']).toLowerCase().trim();
    const isWarmup = rawSetType === 'warmup';
    // Hevy working-set variants: dropset / failure. Everything else → normal.
    const setType: ParsedSet['setType'] =
      rawSetType === 'dropset' || rawSetType === 'drop set' || rawSetType === 'drop'
        ? 'drop'
        : rawSetType === 'failure'
          ? 'failure'
          : 'normal';
    const rpe = asNumber(r['rpe']);
    const setIndex = asNumber(r['set_index']) ?? 0;

    let workout = byStart.get(startRaw);
    if (!workout) {
      const rawTitle = asString(r['title']);
      const endedAt = parseHevyDate(r['end_time']);
      workout = {
        title: sanitizeTitle(rawTitle),
        dayType: inferDayType(rawTitle),
        startedAt,
        endedAt,
        dateISO: utcDateISO(startedAt),
        exercises: [],
      };
      byStart.set(startRaw, workout);
    }
    let exercise = workout.exercises.find((e) => e.title === exTitle);
    // v0.28.1: Hevy restarts set_index for a second block of the same exercise in one workout;
    // a new block starts when another exercise came in between. Its sets go after the first's.
    const prevTitle = lastTitle.get(workout);
    if (exercise && prevTitle !== exTitle) blockOf.set(exercise, (blockOf.get(exercise) ?? 0) + 1);
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
    };
    orderOf.set(set, (blockOf.get(exercise) ?? 0) * 100_000 + setIndex);
    exercise.sets.push(set);
  }

  const workouts = [...byStart.values()].sort((a, b) => a.startedAt - b.startedAt);
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

/**
 * v0.27.0: is this imported workout already in ForgeAI? Either imported before (the exact same
 * start) or the same workout logged here too — the member tracked it in both apps (same day,
 * starts within 30 minutes on the clock). PURE.
 */
export function isAlreadyHere(
  w: { dateISO: string; startedAt: number },
  existing: readonly { dateISO: string; startedAt: number }[],
): 'exact' | 'same' | null {
  let same = false;
  for (const e of existing) {
    if (e.startedAt === w.startedAt) return 'exact';
    if (e.dateISO !== w.dateISO) continue;
    if (Math.abs(e.startedAt - w.startedAt) <= SAME_WORKOUT_MS || Math.abs(wallClockAsUtc(e.startedAt) - w.startedAt) <= SAME_WORKOUT_MS) same = true;
  }
  return same ? 'same' : null;
}

/** Analyze a parse against the current library + history — no DB writes. */
export async function previewImport(parsed: ParsedHevy): Promise<ImportPreview> {
  const library = await readLibrary();
  // Count how many exercises will actually be CREATED — dedupe by normalized name
  // so the "N new" figure matches runImport (which creates once per unique norm).
  const newExercises: string[] = [];
  const newSeen = new Set<string>();
  let matched = 0;
  for (const title of parsed.distinctExerciseTitles) {
    const key = norm(title);
    if (matchTitle(title, library)) {
      matched += 1;
    } else if (!newSeen.has(key)) {
      newSeen.add(key);
      newExercises.push(title);
    }
  }
  let sets = 0;
  for (const w of parsed.workouts) for (const ex of w.exercises) sets += ex.sets.length;

  const existing = await getSessionsBetween(MIN_ISO, MAX_ISO);
  const existingWorkouts = existing.length;
  let alreadyHere = 0;
  for (const w of parsed.workouts) if (isAlreadyHere(w, existing)) alreadyHere += 1;

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
    existingWorkouts,
    dateRange,
    timedSets: parsed.timedRows,
    alreadyHere,
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
  opts: { mode: ImportMode; onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> {
  const { mode, onProgress } = opts;
  const result: ImportResult = {
    imported: 0,
    skippedExisting: 0,
    emptyWorkouts: 0,
    setsInserted: 0,
    createdExercises: 0,
    backfilledSets: 0,
    skippedSameWorkout: 0,
  };
  const total = parsed.workouts.length;
  const backfillDone = (await getMeta(TIMED_BACKFILL_KEY).catch(() => null)) === '1';

  await getDb().withTransactionAsync(async () => {
    // 1. Replace mode: clear all existing workouts (PRs cascade via deleteSession).
    if (mode === 'replace') {
      const existing = await getSessionsBetween(MIN_ISO, MAX_ISO);
      for (const s of existing) await deleteSession(s.id);
      result.replacedSessionIds = existing.map((s) => s.id);
    }

    // 2. Idempotency guard — start times already in the DB (empty after a replace).
    const remaining = await getSessionsBetween(MIN_ISO, MAX_ISO);
    const seenStarts = new Set<number>(remaining.map((s) => s.startedAt));
    const sameDay = remaining.map((s) => ({ dateISO: s.dateISO, startedAt: s.startedAt }));
    const sessionByStart = new Map<number, string>(remaining.map((s) => [s.startedAt, s.id]));

    // 3. Resolve every distinct exercise title once: an exact name or the library
    //    exercise the title means, else a new custom exercise logged the way its rows are.
    const library = await readLibrary();
    const setsByTitle = new Map<string, ParsedSet[]>();
    for (const w of parsed.workouts) {
      for (const ex of w.exercises) setsByTitle.set(ex.title, [...(setsByTitle.get(ex.title) ?? []), ...ex.sets]);
    }
    const byTitle = new Map<string, { id: string; logType: LogType; setMode?: LoadMode | null }>();
    for (const title of parsed.distinctExerciseTitles) {
      const hit = matchTitle(title, library);
      if (hit) {
        byTitle.set(title, { id: hit.id, logType: hit.logType });
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
        weightKg: importedWeight(target.logType, st.weightKg),
        reps: st.reps,
        isWarmup: st.isWarmup,
        rpe: st.isWarmup ? null : st.rpe,
        setType: st.isWarmup ? undefined : st.setType,
        supersetGroup: group,
        // Per-exercise note on the first set (becomes set_number 1).
        note: i === 0 ? ex.note : null,
        durationSec: st.durationSec,
        distanceM: st.distanceM,
        loadMode: target.setMode ?? null,
      }));
    };

    // 4. One session per workout (chronological, so PRs accrue in real order).
    let done = 0;
    for (const w of parsed.workouts) {
      done += 1;
      if (seenStarts.has(w.startedAt)) {
        result.skippedExisting += 1;
        // Merge re-run: earlier versions dropped timed / distance rows. Add them to this
        // already-imported workout when that exercise has nothing in it yet.
        const sessionId = sessionByStart.get(w.startedAt);
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
            }
          }
        }
        onProgress?.(done, total);
        continue;
      }
      // v0.27.0: the same workout already logged in ForgeAI (tracked in both apps) is not doubled.
      if (mode === 'merge' && isAlreadyHere(w, sameDay) === 'same') {
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
      const sets = w.exercises.flatMap((ex) =>
        toRich(ex, ex.supersetId ? supersetMap.get(ex.supersetId) ?? null : null),
      );
      if (sets.length === 0) {
        result.emptyWorkouts += 1;
        onProgress?.(done, total);
        continue;
      }
      const session = await createSession({
        dateISO: w.dateISO,
        dayType: w.dayType,
        notes: w.title.length > 0 ? w.title : null,
        source: 'manual',
        startedAt: w.startedAt,
        endedAt: w.endedAt,
      });
      await addSetsWithMeta(session.id, sets);
      seenStarts.add(w.startedAt); // guard against duplicate start_times within the file
      result.imported += 1;
      result.setsInserted += sets.length;
      onProgress?.(done, total);
    }
  });

  await setMeta(TIMED_BACKFILL_KEY, '1').catch(() => undefined);
  return result;
}

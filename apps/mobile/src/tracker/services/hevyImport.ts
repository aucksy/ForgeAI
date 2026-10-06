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
}

export interface ImportResult {
  imported: number; // sessions created
  skippedExisting: number; // idempotent skip (startedAt already present)
  emptyWorkouts: number; // workouts with 0 valid sets, skipped
  setsInserted: number;
  createdExercises: number;
  /** Phase 2 (Merge): timed / distance sets added to workouts imported before they were supported. */
  backfilledSets: number;
}

// ---------------------------------------------------------------- text utils

/** lowercase, trim, collapse internal whitespace (matches exerciseRepo). */
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Drop non-printable-ASCII (mangled emoji from the export) so notes read clean. */
function sanitizeTitle(s: string): string {
  return s.replace(/[^\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- date parsing

const MONTH_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

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
  if (typeof input !== 'string') return null;
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(input);
  if (!m) return null;
  const mon = MONTH_IDX[m[2].slice(0, 3).toLowerCase()];
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
    const wb = XLSX.read(base64, { type: 'base64' });
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

  for (const r of rows) {
    totalSetRows += 1;
    const startRaw = asString(r['start_time']);
    const startedAt = parseHevyDate(startRaw);
    const exTitle = asString(r['exercise_title']).trim();
    const reps = asNumber(r['reps']);
    const duration = asNumber(r['duration_seconds']);
    const distanceKm = asNumber(r['distance_km']);
    const durationSec = duration != null && duration > 0 ? Math.round(duration) : null;
    const distanceM = distanceKm != null && distanceKm > 0 ? Math.round(distanceKm * 1000 * 10) / 10 : null;
    const hasReps = reps !== null && reps > 0;
    // A set needs reps, a time or a distance (Phase 2 keeps Plank / Treadmill rows).
    if (startedAt === null || exTitle === '' || (!hasReps && durationSec === null && distanceM === null)) {
      skippedRows += 1;
      continue;
    }
    if (!hasReps) timedRows += 1;
    const weightKg = asNumber(r['weight_kg']) ?? 0; // null weight = bodyweight
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
      const endedAt = parseHevyDate(asString(r['end_time']));
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
    if (!exercise) {
      // superset_id / exercise_notes are consistent per exercise — capture at first appearance.
      const supersetRaw = asString(r['superset_id']).trim();
      const noteRaw = sanitizeTitle(asString(r['exercise_notes']));
      exercise = {
        title: exTitle,
        sets: [],
        supersetId: supersetRaw !== '' ? supersetRaw : null,
        note: noteRaw !== '' ? noteRaw : null,
      };
      workout.exercises.push(exercise);
    }
    exercise.sets.push({
      weightKg,
      reps: hasReps ? Math.round(reps as number) : 0,
      isWarmup,
      setType,
      rpe,
      setIndex,
      durationSec,
      distanceM,
    });
  }

  const workouts = [...byStart.values()].sort((a, b) => a.startedAt - b.startedAt);
  // Sets ordered by Hevy's set_index within each exercise (stable, matches log order).
  for (const w of workouts) {
    for (const ex of w.exercises) ex.sets.sort((a, b) => a.setIndex - b.setIndex);
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

  const existingWorkouts = (await getSessionsBetween(MIN_ISO, MAX_ISO)).length;

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
  };
  const total = parsed.workouts.length;
  const backfillDone = (await getMeta(TIMED_BACKFILL_KEY).catch(() => null)) === '1';

  await getDb().withTransactionAsync(async () => {
    // 1. Replace mode: clear all existing workouts (PRs cascade via deleteSession).
    if (mode === 'replace') {
      const existing = await getSessionsBetween(MIN_ISO, MAX_ISO);
      for (const s of existing) await deleteSession(s.id);
    }

    // 2. Idempotency guard — start times already in the DB (empty after a replace).
    const remaining = await getSessionsBetween(MIN_ISO, MAX_ISO);
    const seenStarts = new Set<number>(remaining.map((s) => s.startedAt));
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

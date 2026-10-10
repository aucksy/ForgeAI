/**
 * "Import from Strong" (v0.27.0, tracker plan Phase 5) — read a Strong CSV export into the same
 * shape the Hevy import already writes (`ParsedHevy`), so preview, Replace / Merge, exercise
 * matching, new custom exercises and the one-transaction write are the Hevy import's, unchanged.
 * PURE: the screen reads the file; this only turns its text into workouts.
 *
 * Strong's export is one row per set. Two layouts are in use (checked 8 Oct 2026 against
 * importers on GitHub that read real exports):
 *  - older, comma-separated: Date, Workout Name, Duration ("1h 5m"), Exercise Name, Set Order,
 *    Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE — weight and distance in the
 *    member's Strong units, which the file does not say;
 *  - Strong 6, semicolon-separated: "Workout #", Date, Workout Name, "Duration (sec)", Exercise
 *    Name, Set Order, "Weight (kg)" or "Weight (lbs)", Reps, RPE, "Distance (meters)", Seconds,
 *    Notes, Workout Notes — units in the column names.
 * Set Order is a number for a working set, "W" warm-up, "D" drop set, "F" to failure; Strong 6
 * also writes "Rest Timer" rows, which are not sets.
 *
 * Audit Phase 4: the workout's own notes ("Workout Notes", IM-04) are kept; dates in any form a
 * phone or Excel writes them are read (IM-11, `importDates`), as the clock time the member saw
 * (IM-07); a workout name in another language gets its day from its exercises (IM-14).
 */
import { csvObjects, delimiterOf, normHead, num, parseCsv, withoutSepLine } from './csvText';
import { dayTypeOfWorkout, workoutNotes, type ParsedHevy } from './hevyImport';
import { localMoment, readWallClock, scanDateOrder, wallISO, type DateOrder } from './importDates';

export { num, parseCsv } from './csvText';

type ParsedWorkout = ParsedHevy['workouts'][number];
type ParsedExercise = ParsedWorkout['exercises'][number];
type ParsedSet = ParsedExercise['sets'][number];

export type FileUnits = 'metric' | 'imperial';

const KG_PER_LB = 0.45359237;
const M_PER_MILE = 1609.344;

export interface StrongFile {
  /** True when the column names say the units (Strong 6); false = the member must say. */
  unitsKnown: boolean;
  /** The units the column names say, when they do. */
  fileUnits: FileUnits | null;
}

// ---------------------------------------------------------------- CSV

/** True when the text's header row is a Strong export. */
export function looksLikeStrong(text: string): boolean {
  const rows = parseCsv(withoutSepLine(text.slice(0, 4000)), delimiterOf(text));
  const head = (rows[0] ?? []).map(normHead);
  return head.includes('exercise name') && head.includes('set order') && head.includes('workout name');
}

// ---------------------------------------------------------------- values

/**
 * Strong's "2023-08-15 18:30:12" (or any form Excel rewrites it to) → the moment that clock time
 * is on this phone (IM-07: the time the member saw, stored as it was). Null when unreadable.
 */
export function parseStrongDate(raw: string, order: DateOrder = 'dmy'): number | null {
  const c = readWallClock(raw, order);
  return c ? localMoment(c) : null;
}

/** "1h 5m", "45m", "30s", "1:05:00", or plain seconds → seconds. */
export function parseStrongDuration(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (s === '') return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (clock) {
    return clock[3] != null
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
  }
  let total = 0;
  let any = false;
  for (const part of s.matchAll(/(\d+(?:\.\d+)?)\s*([hms])/g)) {
    any = true;
    const v = Number(part[1]);
    total += part[2] === 'h' ? v * 3600 : part[2] === 'm' ? v * 60 : v;
  }
  return any ? Math.round(total) : null;
}

function clean(s: string): string {
  // Control characters only: "Día de pierna" keeps its accent.
  return s.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- read

/** What the header says about units (before the member is asked). */
export function strongFileInfo(text: string): StrongFile {
  const rows = parseCsv(withoutSepLine(text.slice(0, 4000)), delimiterOf(text));
  const head = (rows[0] ?? []).map(normHead);
  const w = head.find((h) => h.startsWith('weight'));
  if (w && /\(kg/.test(w)) return { unitsKnown: true, fileUnits: 'metric' };
  if (w && /\(lb/.test(w)) return { unitsKnown: true, fileUnits: 'imperial' };
  return { unitsKnown: false, fileUnits: null };
}

/**
 * Read a Strong export. `units` is used only where the column names do not say (the older
 * layout): kg + km, or lb + miles. Throws a plain-words Error on a file that is not Strong's.
 */
export function parseStrongText(text: string, units: FileUnits, dateOrder?: DateOrder): ParsedHevy {
  const delimiter = delimiterOf(text);
  const rows = parseCsv(withoutSepLine(text), delimiter);
  if (rows.length < 2) throw new Error('That file has no rows to import.');
  const head = rows[0].map(normHead);
  const col = (pred: (h: string) => boolean): number => head.findIndex(pred);
  const iDate = col((h) => h === 'date');
  const iName = col((h) => h === 'workout name');
  const iDur = col((h) => h.startsWith('duration'));
  const iEx = col((h) => h === 'exercise name');
  const iOrder = col((h) => h === 'set order');
  const iWeight = col((h) => h.startsWith('weight'));
  const iReps = col((h) => h === 'reps');
  const iDist = col((h) => h.startsWith('distance'));
  const iSecs = col((h) => h === 'seconds');
  const iNotes = col((h) => h === 'notes');
  const iWorkoutNotes = col((h) => h === 'workout notes');
  const iRpe = col((h) => h === 'rpe');
  const iNum = col((h) => h === 'workout #');
  if (iDate < 0 || iEx < 0 || iOrder < 0 || iName < 0) {
    throw new Error('That doesn’t look like a Strong export (unexpected columns).');
  }
  const weightHead = iWeight >= 0 ? head[iWeight] : '';
  const kgPer = /\(lb/.test(weightHead) ? KG_PER_LB : /\(kg/.test(weightHead) ? 1 : units === 'imperial' ? KG_PER_LB : 1;
  const distHead = iDist >= 0 ? head[iDist] : '';
  const mPer = /\(m(eters|etres)?\)/.test(distHead)
    ? 1
    : /\(km/.test(distHead)
      ? 1000
      : /\(mi/.test(distHead)
        ? M_PER_MILE
        : units === 'imperial'
          ? M_PER_MILE
          : 1000;
  // v0.28.1: a comma-decimal phone may write "72,5" in a comma-separated file too; one such
  // weight or distance means "1,234" there is 1.234, not 1234.
  const commaDecimal =
    delimiter === ';' || rows.slice(1).some((r) => [iWeight, iDist].some((i) => i >= 0 && /^-?\d+,\d{1,2}$/.test((r[i] ?? '').trim())));

  // Review fix: the WHOLE Date column decides day-first / month-first; when nothing settles it
  // the member is asked (`dateQuestion`) and their answer comes back as `dateOrder`.
  const scan = scanDateOrder(rows.slice(1).map((r) => r[iDate]));
  const readOrder: DateOrder = dateOrder ?? scan.order ?? 'dmy';
  let badDateRows = 0;
  const byKey = new Map<string, ParsedWorkout>();
  const unreadDates: string[] = [];
  let skippedRows = 0;
  let totalSetRows = 0;
  let timedRows = 0;
  const orderCounter = new Map<ParsedExercise, number>();

  for (const r of rows.slice(1)) {
    const order = (r[iOrder] ?? '').trim();
    // A rest-timer row (Strong 6) is not a set — not counted at all.
    if (/rest/i.test(order)) continue;
    totalSetRows += 1;
    const clock = readWallClock(r[iDate] ?? '', readOrder);
    const startedAt = clock ? localMoment(clock) : null;
    if (!clock && (r[iDate] ?? '').trim() !== '' && unreadDates.length < 3) unreadDates.push((r[iDate] ?? '').trim());
    if (!clock) {
      // A row whose date can't be read is counted and shown, never dropped silently.
      badDateRows += 1;
      continue;
    }
    const exTitle = (r[iEx] ?? '').trim();
    const reps = iReps >= 0 ? num(r[iReps], commaDecimal) : null;
    const secs = iSecs >= 0 ? num(r[iSecs], commaDecimal) : null;
    const dist = iDist >= 0 ? num(r[iDist], commaDecimal) : null;
    const durationSec = secs != null && secs > 0 ? Math.round(secs) : null;
    const distanceM = dist != null && dist > 0 ? Math.round(dist * mPer * 10) / 10 : null;
    const hasReps = reps != null && reps > 0;
    if (startedAt == null || exTitle === '' || (!hasReps && durationSec == null && distanceM == null)) {
      skippedRows += 1;
      continue;
    }
    if (!hasReps) timedRows += 1;
    const weight = iWeight >= 0 ? num(r[iWeight], commaDecimal) : null;
    // Unrounded, exactly as a typed pound weight is stored (a rounded 135 lb would read as a new record later).
    const weightKg = weight == null ? 0 : weight * kgPer;
    const code = order.toUpperCase();
    const isWarmup = code === 'W';
    const setType: ParsedSet['setType'] = code === 'D' ? 'drop' : code === 'F' ? 'failure' : 'normal';
    const rpeRaw = iRpe >= 0 ? num(r[iRpe], commaDecimal) : null;
    const rpe = rpeRaw != null && rpeRaw > 0 ? rpeRaw : null;

    const name = clean(r[iName] ?? '');
    const key = iNum >= 0 && (r[iNum] ?? '').trim() !== '' ? `#${r[iNum].trim()}` : `${startedAt}|${name}`;
    let w = byKey.get(key);
    if (!w) {
      const dur = parseStrongDuration(iDur >= 0 ? r[iDur] : undefined);
      w = {
        title: name,
        // The day comes from the name, else (another language) from its exercises, once read.
        dayType: 'full',
        startedAt,
        endedAt: dur != null && dur > 0 ? startedAt + dur * 1000 : null,
        dateISO: wallISO(clock as NonNullable<typeof clock>),
        exercises: [],
      };
      byKey.set(key, w);
    }
    // IM-04: the workout's own notes (on each of its rows; the first one written wins).
    const wn = iWorkoutNotes >= 0 ? (r[iWorkoutNotes] ?? '').replace(/\r\n?/g, '\n').trim() : '';
    if (wn !== '' && w.notes === undefined) w.notes = workoutNotes(w.title, wn);
    let ex = w.exercises.find((e) => e.title === exTitle);
    if (!ex) {
      ex = { title: exTitle, sets: [], supersetId: null, note: null };
      w.exercises.push(ex);
    }
    const note = iNotes >= 0 ? clean(r[iNotes] ?? '') : '';
    if (note !== '' && ex.note == null) ex.note = note;
    const idx = (orderCounter.get(ex) ?? 0) + 1;
    orderCounter.set(ex, idx);
    ex.sets.push({
      weightKg,
      reps: hasReps ? Math.round(reps as number) : 0,
      isWarmup,
      setType,
      rpe,
      setIndex: idx, // file order (Strong numbers warm-ups "W", so its numbers have gaps)
      durationSec,
      distanceM,
    });
  }

  const workouts = [...byKey.values()].sort((a, b) => a.startedAt - b.startedAt);
  if (workouts.length === 0 && totalSetRows === 0) throw new Error('That file has no rows to import.');
  if (workouts.length === 0 && unreadDates.length > 0) {
    throw new Error(`The dates in its Date column could not be read (for example “${unreadDates[0]}”). Export the file from Strong again and pick it without opening it in Excel.`);
  }
  for (const w of workouts) w.dayType = dayTypeOfWorkout(w.title, w.exercises.map((e) => e.title));
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
    dateQuestion: scan.order == null && dateOrder == null ? scan.ambiguous : null,
    dateOrder: readOrder,
  };
}

/**
 * IM-06: one real set from an older file (no units in it), to ask about: the heaviest working
 * weight as written ("Bench Press 100 — kg or lb?"). Null when the file has no weights. PURE.
 */
export function unitsExample(text: string): { exercise: string; value: number } | null {
  const { rows, head, delimiter } = csvObjects(text);
  const w = head.find((h) => h.startsWith('weight'));
  if (!w) return null;
  let best: { exercise: string; value: number } | null = null;
  for (const r of rows) {
    if (/^(w|rest)/i.test((r['set order'] ?? '').trim())) continue;
    const v = num(r[w], delimiter === ';');
    const ex = (r['exercise name'] ?? '').trim();
    if (v != null && v > 0 && ex && (!best || v > best.value)) best = { exercise: ex, value: Math.round(v * 100) / 100 };
  }
  return best;
}

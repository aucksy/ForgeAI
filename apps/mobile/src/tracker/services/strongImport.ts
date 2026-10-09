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
 */
import { inferDayType, type ParsedHevy } from './hevyImport';

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

/** Split CSV text into rows of fields: quotes, doubled quotes, CRLF, a BOM. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** The first line decides: Strong 6 uses ";", older exports ",". */
function delimiterOf(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const semi = (first.match(/;/g) ?? []).length;
  const comma = (first.match(/,/g) ?? []).length;
  return semi > comma ? ';' : ',';
}

const normHead = (h: string): string => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** True when the text's header row is a Strong export. */
export function looksLikeStrong(text: string): boolean {
  const rows = parseCsv(text.slice(0, 4000), delimiterOf(text));
  const head = (rows[0] ?? []).map(normHead);
  return head.includes('exercise name') && head.includes('set order') && head.includes('workout name');
}

// ---------------------------------------------------------------- values

/**
 * A number as Strong wrote it. v0.28.1: a comma-decimal phone can write "72,5" (quoted) even in a
 * comma-separated file — it was read as nothing, so the set imported at 0 kg. Thousands marks too:
 * "1.072,5" and "1,072.5". Exported for tests.
 */
export function num(raw: string | undefined, commaDecimal: boolean): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/\s/g, '');
  if (s === '') return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // Both: the last one is the decimal mark.
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma >= 0) {
    // Only a comma: a decimal mark ("72,5", or any in a ;-file), else thousands ("1,072").
    s = commaDecimal || /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Strong's "2023-08-15 18:30:12" (or "18:30") as a TIMEZONE-STABLE epoch — the wall clock read
 * as UTC, exactly like the Hevy import (`parseHevyDate`), so a re-import on a phone in another
 * timezone finds the same workouts and Merge never doubles them.
 */
export function parseStrongDate(raw: string): number | null {
  const m = /^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(t) ? null : t;
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

const pad = (n: number): string => String(n).padStart(2, '0');
function utcDateISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function clean(s: string): string {
  // Control characters only: "Día de pierna" keeps its accent.
  return s.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- read

/** What the header says about units (before the member is asked). */
export function strongFileInfo(text: string): StrongFile {
  const rows = parseCsv(text.slice(0, 4000), delimiterOf(text));
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
export function parseStrongText(text: string, units: FileUnits): ParsedHevy {
  const delimiter = delimiterOf(text);
  const rows = parseCsv(text, delimiter);
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

  const byKey = new Map<string, ParsedWorkout>();
  let skippedRows = 0;
  let totalSetRows = 0;
  let timedRows = 0;
  const orderCounter = new Map<ParsedExercise, number>();

  for (const r of rows.slice(1)) {
    const order = (r[iOrder] ?? '').trim();
    // A rest-timer row (Strong 6) is not a set — not counted at all.
    if (/rest/i.test(order)) continue;
    totalSetRows += 1;
    const startedAt = parseStrongDate(r[iDate] ?? '');
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
        dayType: inferDayType(name),
        startedAt,
        endedAt: dur != null && dur > 0 ? startedAt + dur * 1000 : null,
        dateISO: utcDateISO(startedAt),
        exercises: [],
      };
      byKey.set(key, w);
    }
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
  const titles = new Set<string>();
  for (const w of workouts) for (const ex of w.exercises) titles.add(ex.title);
  return { workouts, distinctExerciseTitles: [...titles], skippedRows, totalSetRows, timedRows };
}

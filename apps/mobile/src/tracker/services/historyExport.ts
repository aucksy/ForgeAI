/**
 * "Save my history" (audit DS-01 / DS-12) — the whole workout history as a CSV in Hevy's own
 * export format, so it comes straight back through Settings → "Import from Hevy" (and also
 * goes into Hevy or Strong). One row per set, the 14 columns `hevyImport.ts` reads:
 *
 *   title, start_time, end_time, description, exercise_title, superset_id, exercise_notes,
 *   set_index, set_type, weight_kg | weight_lbs, reps, distance_km | distance_miles,
 *   duration_seconds, rpe
 *
 * Units: like Hevy, a "lb, miles" member gets `weight_lbs` / `distance_miles` (the importer
 * reads both); everyone else `weight_kg` / `distance_km`.
 *
 * Times (DS-12, audit IM-07): every workout keeps the real moment it started — an imported one
 * too, since Phase 4 (older imports were moved once, `importClockRepair`) — and is written as the
 * clock time the member saw, so a 6:00 pm Hevy workout stays "18:00" and comes back exactly.
 *
 * Reads only (a page of workouts per SELECT since audit Phase 8), so no write queue is needed. The file goes to the cache folder (never
 * backed up, cleared by Android when space is short); the previous export is removed first, and
 * so are the old Excel exports earlier versions left in the app's documents.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db';
import { todayISO } from '@/lib/date';
import { DAY_LABEL, TITLE_SEP } from '@/tracker/services/hevyImport';
import type { DayType, UnitSystem } from '@/types/models';

const KG_PER_LB = 0.45359237;
const M_PER_MILE = 1609.344;

/** Hevy's column order. `weight` / `distance` depend on the member's units. */
export function hevyColumns(units: UnitSystem): string[] {
  const imperial = units === 'imperial';
  return [
    'title',
    'start_time',
    'end_time',
    'description',
    'exercise_title',
    'superset_id',
    'exercise_notes',
    'set_index',
    'set_type',
    imperial ? 'weight_lbs' : 'weight_kg',
    'reps',
    imperial ? 'distance_miles' : 'distance_km',
    'duration_seconds',
    'rpe',
  ];
}

/** One set as read from the database (the export's input). */
export interface HistorySetRow {
  session_id: string;
  date_iso: string;
  started_at: number;
  ended_at: number | null;
  day_type: string;
  notes: string | null;
  exercise_id: string;
  exercise_name: string;
  log_type: string | null;
  weight_kg: number;
  reps: number;
  is_warmup: number;
  rpe: number | null;
  set_type: string | null;
  note: string | null;
  superset_group: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  /** LW-10: the workout's own name (tracker schema v9); null = none. Absent in older callers. */
  title?: string | null;
  /** LW-28: the set's card among the workout's cards of this exercise (NULL / 0 = the first). */
  card_index?: number | null;
}

/**
 * The real moment of a workout's start. Audit IM-07: every stored start is the real moment now
 * (imports store it; older imports were moved once at start-up, `importClockRepair`), so this is
 * the start itself. Kept, with Health Connect's `realStart`, so callers read one rule. PURE.
 */
export function realStartOf(startedAt: number, _dateISO?: string): number {
  return startedAt;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** Hevy's "7 Jul 2026, 14:24" from a LOCAL clock reading of `ms`. PURE (uses the phone's zone). */
export function hevyStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The Hevy `title` for a workout: the day's plain name ("Push", "Upper body"), and — review fix
 * #9 — the workout's own name after it when it has one ("Push · Morning workout"; before, the
 * name was dropped). The importer reads the day from the part before " · " and the name from
 * the rest (`ownTitle` in hevyImport), and — seeing our day name — takes the notes from
 * `description` exactly as written (`workoutNotes`), so all three survive the round trip. PURE.
 */
export function workoutTitle(dayType: string, name?: string | null): string {
  const day = DAY_LABEL[dayType as DayType] ?? 'Workout';
  const own = (name ?? '').replace(/\s+/g, ' ').trim();
  return own ? `${day}${TITLE_SEP}${own}` : day;
}

/** The minute after a Hevy stamp's minute ("7 Jul 2026, 14:24" → "…, 14:25"). PURE. */
function nextMinute(ms: number): number {
  return ms + 60_000;
}

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '""';
  const s = typeof v === 'number' ? String(v) : v;
  return `"${s.replace(/"/g, '""')}"`;
}

const round = (v: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

function hevySetType(r: HistorySetRow): string {
  if (r.is_warmup === 1 || r.set_type === 'warmup') return 'warmup';
  if (r.set_type === 'drop') return 'dropset';
  if (r.set_type === 'failure') return 'failure';
  return 'normal';
}

/**
 * Audit Phase 8: the CSV written a few workouts at a time. `header` is the first line; each
 * `encode(rows)` call turns WHOLE workouts (every row of each, in logged order) into their lines,
 * each ending in "\n" ('' for no rows). Two workouts the same on title, start and end stay apart
 * across calls (the shown-start set lives in the encoder), so header + "\n" + the calls' texts in
 * order is byte for byte `hevyCsvFromRows` of all the rows. PURE (apart from the phone's zone).
 */
export function hevyCsvEncoder(units: UnitSystem): { header: string; encode(rows: readonly HistorySetRow[]): string } {
  const imperial = units === 'imperial';
  // The importer tells workouts apart by title + start + end. Two workouts the same on all three
  // (same day name, started and ended in the same minute) would come back as one; the later one
  // is written a minute later (Hevy's times have no seconds), so both come back.
  const written = new Set<string>();
  const encode = (rows: readonly HistorySetRow[]): string => {
    const lines: string[] = [];
    // Group: workout → card of an exercise (first-logged order) → sets.
    const workouts = new Map<string, { head: HistorySetRow; exercises: Map<string, HistorySetRow[]> }>();
    for (const r of rows) {
      let w = workouts.get(r.session_id);
      if (!w) {
        w = { head: r, exercises: new Map() };
        workouts.set(r.session_id, w);
      }
      const block = `${r.exercise_id}\u0000${r.card_index ?? 0}`;
      const list = w.exercises.get(block) ?? [];
      list.push(r);
      w.exercises.set(block, list);
    }
    for (const { head, exercises } of workouts.values()) {
      const start = realStartOf(head.started_at, head.date_iso);
      const shift = start - head.started_at;
      const title = workoutTitle(head.day_type, head.title);
      const endText = head.ended_at != null ? hevyStamp(head.ended_at + shift) : '';
      let shown = start;
      while (written.has(`${title}\u0000${hevyStamp(shown)}\u0000${endText}`)) shown = nextMinute(shown);
      const startText = hevyStamp(shown);
      written.add(`${title}\u0000${startText}\u0000${endText}`);
      for (const sets of exercises.values()) {
        const exNote = sets.find((s) => (s.note ?? '').trim() !== '')?.note ?? '';
        sets.forEach((s, i) => {
          const assisted = s.log_type === 'assisted';
          const kg = assisted ? Math.abs(s.weight_kg) : s.weight_kg;
          const weight = kg === 0 ? '' : imperial ? round(kg / KG_PER_LB, 2) : kg;
          const distance =
            s.distance_m != null && s.distance_m > 0
              ? imperial
                ? round(s.distance_m / M_PER_MILE, 5)
                : s.distance_m / 1000
              : '';
          const warm = hevySetType(s) === 'warmup';
          lines.push(
            [
              title,
              startText,
              endText,
              head.notes ?? '',
              s.exercise_name,
              s.superset_group != null ? s.superset_group : '',
              exNote,
              i,
              hevySetType(s),
              weight,
              s.reps > 0 ? s.reps : '',
              distance,
              s.duration_sec != null && s.duration_sec > 0 ? Math.round(s.duration_sec) : '',
              !warm && s.rpe != null ? s.rpe : '',
            ]
              .map(csvCell)
              .join(','),
          );
        });
      }
    }
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  };
  return { header: hevyColumns(units).map(csvCell).join(','), encode };
}

/**
 * Rows (ordered by workout, then the order the sets were logged) → Hevy CSV text. Each CARD's
 * sets are written as one block, in the order its first set was logged — review fix #9: heavy
 * and back-off Bench are two blocks (Hevy's own way to write the same exercise twice), which the
 * importer reads back as two cards in their places. PURE (apart from the phone's time zone,
 * which decides the clock times written).
 */
export function hevyCsvFromRows(rows: readonly HistorySetRow[], units: UnitSystem): string {
  const enc = hevyCsvEncoder(units);
  return `${enc.header}\n${enc.encode(rows)}`;
}

/** Every logged set, oldest workout first, sets in the order they were logged. Reads only. */
export async function readHistoryRows(): Promise<HistorySetRow[]> {
  return getDb().getAllAsync<HistorySetRow>(
    `SELECT s.id AS session_id, s.date_iso, s.started_at, s.ended_at, s.day_type, s.notes, s.title,
            se.exercise_id, e.name AS exercise_name, e.log_type,
            se.weight_kg, se.reps, se.is_warmup, se.rpe, se.set_type, se.note, se.superset_group,
            se.duration_sec, se.distance_m, se.card_index
       FROM workout_sessions s
       JOIN set_entries se ON se.session_id = s.id
       JOIN exercises e ON e.id = se.exercise_id
      ORDER BY s.started_at, s.id, se.set_number, se.rowid`,
  );
}

const HISTORY_SELECT = `SELECT s.id AS session_id, s.date_iso, s.started_at, s.ended_at, s.day_type, s.notes, s.title,
            se.exercise_id, e.name AS exercise_name, e.log_type,
            se.weight_kg, se.reps, se.is_warmup, se.rpe, se.set_type, se.note, se.superset_group,
            se.duration_sec, se.distance_m, se.card_index
       FROM workout_sessions s
       JOIN set_entries se ON se.session_id = s.id
       JOIN exercises e ON e.id = se.exercise_id`;

/** Workouts the export holds (at least one set of a known exercise), in its order. Reads only. */
async function exportedSessionIds(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ id: string }>(
    `SELECT s.id FROM workout_sessions s
      WHERE EXISTS (SELECT 1 FROM set_entries se JOIN exercises e ON e.id = se.exercise_id WHERE se.session_id = s.id)
      ORDER BY s.started_at, s.id`,
  );
  return rows.map((r) => r.id);
}

/** The rows of these workouts, in `readHistoryRows`' order. Reads only. */
async function historyRowsOf(ids: readonly string[]): Promise<HistorySetRow[]> {
  if (ids.length === 0) return [];
  return getDb().getAllAsync<HistorySetRow>(
    `${HISTORY_SELECT}
      WHERE s.id IN (${ids.map(() => '?').join(', ')})
      ORDER BY s.started_at, s.id, se.set_number, se.rowid`,
    [...ids],
  );
}

/**
 * Audit Phase 8: the whole history as Hevy CSV text, handed to `write` a page of workouts at a
 * time (the header with the first page) — the same bytes as `hevyCsvFromRows(readHistoryRows())`,
 * without the whole history's rows and text in memory at once. Nothing is written when nothing
 * is logged. Reads only.
 */
export async function writeHistoryCsv(
  units: UnitSystem,
  write: (chunk: string, first: boolean) => Promise<void>,
  opts: { workoutsPerPage?: number } = {},
): Promise<{ workouts: number; sets: number }> {
  const ids = await exportedSessionIds();
  if (ids.length === 0) return { workouts: 0, sets: 0 };
  const per = Math.max(1, opts.workoutsPerPage ?? 100);
  const enc = hevyCsvEncoder(units);
  let sets = 0;
  let workouts = 0;
  let first = true;
  for (let i = 0; i < ids.length; i += per) {
    const rows = await historyRowsOf(ids.slice(i, i + per));
    if (rows.length === 0) continue; // deleted since the list was read
    sets += rows.length;
    workouts += new Set(rows.map((r) => r.session_id)).size;
    const text = enc.encode(rows);
    await write(first ? `${enc.header}\n${text}` : text, first);
    first = false;
  }
  return { workouts, sets };
}

/** How many workouts are on this phone (the Backup section's first line). */
export async function countWorkouts(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions');
  return row?.n ?? 0;
}

export interface SaveHistoryResult {
  /** false when nothing is logged yet (no file written). */
  written: boolean;
  shared: boolean;
  workouts: number;
  sets: number;
  uri: string;
}

/** Remove the previous history file and the Excel exports older versions left behind. */
async function clearOldExports(): Promise<void> {
  const sweep = async (dir: string | null, match: RegExp): Promise<void> => {
    if (!dir) return;
    const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
    for (const n of names) {
      if (match.test(n)) await FileSystem.deleteAsync(`${dir}${n}`, { idempotent: true }).catch(() => undefined);
    }
  };
  await sweep(FileSystem.cacheDirectory, /^forgeai-history-.*\.csv$/);
  await sweep(FileSystem.documentDirectory, /^forgeai-workouts-.*\.xlsx$/);
}

/** Write the whole history as a Hevy CSV and open Android's share sheet. */
export async function saveMyHistory(units: UnitSystem): Promise<SaveHistoryResult> {
  // Audit Phase 8: written a page of workouts at a time, each page appended to the file (was one
  // 4 MB text for 5 years, built from every row at once). Same bytes. The old files go just
  // before the first page is written (never when nothing is logged).
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const uri = `${dir}forgeai-history-${todayISO()}.csv`;
  let started = false;
  let counts: { workouts: number; sets: number };
  try {
    counts = await writeHistoryCsv(units, async (chunk, first) => {
      if (first) await clearOldExports();
      started = true;
      await FileSystem.writeAsStringAsync(uri, chunk, first ? { encoding: FileSystem.EncodingType.UTF8 } : { encoding: FileSystem.EncodingType.UTF8, append: true });
    });
  } catch (e) {
    // A page that failed to read or append: never leave half a history behind to be shared later.
    if (started) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw e;
  }
  const { workouts, sets } = counts;
  if (sets === 0) return { written: false, shared: false, workouts: 0, sets: 0, uri: '' };

  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Save my history',
    });
    shared = true;
  }
  return { written: true, shared, workouts, sets, uri };
}

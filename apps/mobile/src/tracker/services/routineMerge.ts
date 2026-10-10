/**
 * Audit Phase 4 — routines copied from Hevy (a link, or rebuilt from an export) saved WITHOUT
 * losing the member's own changes (IM-22), and read against the member's own history (IM-02,
 * IM-03).
 *
 * "Edited by the member" is known per routine row: when routines are copied in, what was copied
 * is remembered as a fingerprint of each row (exercise, sets and their types, reps, rest,
 * superset, note) in `meta` (`ROUTINE_MARKS_KEY`, by routine). Copying again later:
 *  - a row still exactly as copied takes Hevy's new values;
 *  - a row the member changed (sets, reps, rest, note…) keeps the member's version;
 *  - a row the member deleted stays deleted; a row the member added stays;
 *  - an exercise new in Hevy is added; one Hevy dropped goes, unless the member changed it;
 *  - the member's own ORDER of the exercises stays when they moved them (the fingerprints are
 *    remembered in the copied order, so a different order now is the member's).
 * Review fix: a routine with NO remembered fingerprints (built by hand, or copied before they
 * were remembered) is entirely the member's: every row stays exactly as it is, in their order,
 * and only Hevy's exercises it does not have yet are added.
 */
import { getDb, getMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { uuid } from '@/lib/uuid';

import {
  freshWeeks,
  insertRoutineRow,
  keptRoutineIds,
  parseFolderSettings,
  routineRowValues,
  type Folder,
  type FolderSettings,
  type NewRoutine,
} from '../db/folderRepo';
import type { PlanSetType } from '../plans/routineSets';

export const ROUTINE_MARKS_KEY = 'routine_import_marks';

type Marks = Record<string, string[]>;

export function readMarks(raw: string | null | undefined): Marks {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Marks = {};
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

/** A stored routine row, as the fingerprint reads it. */
export interface RowFacts {
  exerciseId: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  setsJson: string | null;
  restSec: number | null;
  supersetGroup: number | null;
  note: string | null;
}

/** A row's fingerprint: everything the member can change on it. PURE. */
export function rowPrint(r: RowFacts): string {
  return [r.exerciseId, r.targetSets, r.repMin, r.repMax, r.setsJson ?? '', r.restSec ?? '', r.supersetGroup ?? '', r.note ?? ''].join('|');
}

/** The fingerprint of a row as it would be written. PURE. */
export function newRowPrint(x: NewRoutine['exercises'][number]): string {
  const v = routineRowValues(x);
  return rowPrint({ exerciseId: x.exerciseId, ...v });
}

/**
 * Did the member change this row since it was copied? With nothing remembered (a routine they
 * built, or one copied before copies were remembered) every row is theirs. PURE.
 */
export function editedByMember(row: RowFacts, marks: readonly string[] | undefined): boolean {
  if (marks) return !marks.includes(rowPrint(row));
  return true;
}

/**
 * Did the member put the copied exercises in another order since? Compares the copied order
 * (the remembered fingerprints' order) with the current one, over the exercises both still
 * have. With nothing remembered the order is the member's. PURE.
 */
export function reorderedByMember(current: readonly RowFacts[], marks: readonly string[] | undefined): boolean {
  if (!marks) return true;
  const copied = marks.map((m) => m.split('|')[0]);
  const both = new Set(current.map((c) => c.exerciseId).filter((id) => copied.includes(id)));
  const was = copied.filter((id) => both.has(id));
  const now = current.map((c) => c.exerciseId).filter((id) => both.has(id));
  return was.join('\u0000') !== now.join('\u0000');
}

/** A row in the merge: either the member's (kept as it is) or one to write. */
export type MergedRow = { keep: RowFacts } | { write: NewRoutine['exercises'][number] };

/**
 * One routine copied again: Hevy's rows (`next`) over the member's current rows (`current`),
 * given what was copied last time (`marks`; undefined = not remembered). Returns the rows in
 * order and whether any change of the member's was kept. The order is Hevy's (then the member's
 * own extra rows) — unless the member moved the exercises since the copy (or nothing was
 * remembered): then it is the member's, with Hevy's new exercises after the one they follow in
 * Hevy. PURE.
 */
export function mergeRows(
  current: readonly RowFacts[],
  next: readonly NewRoutine['exercises'][number][],
  marks: readonly string[] | undefined,
): { rows: MergedRow[]; keptEdits: boolean } {
  const used = new Set<number>();
  let keptEdits = false;
  const markedIds = new Set((marks ?? []).map((m) => m.split('|')[0]));
  // Each Hevy row: the current row it is (by exercise), and what to write for it.
  const forCurrent = new Map<number, MergedRow>();
  const hevyOrder: { row: MergedRow; current: number | null }[] = [];
  for (const x of next) {
    const i = current.findIndex((c, k) => !used.has(k) && c.exerciseId === x.exerciseId);
    if (i < 0) {
      // Copied before and deleted by the member since: it stays deleted.
      if (marks && markedIds.has(x.exerciseId) && !current.some((c) => c.exerciseId === x.exerciseId)) {
        keptEdits = true;
        continue;
      }
      hevyOrder.push({ row: { write: x }, current: null });
      continue;
    }
    used.add(i);
    let row: MergedRow;
    if (editedByMember(current[i], marks)) {
      row = { keep: current[i] };
      keptEdits = true;
    } else row = { write: x };
    forCurrent.set(i, row);
    hevyOrder.push({ row, current: i });
  }
  // The member's own additions (or changes) stay; a copied row Hevy no longer has goes.
  const extras: { row: MergedRow; current: number }[] = [];
  current.forEach((c, k) => {
    if (used.has(k)) return;
    if (editedByMember(c, marks)) {
      const row: MergedRow = { keep: c };
      forCurrent.set(k, row);
      extras.push({ row, current: k });
      keptEdits = true;
    }
  });
  if (!reorderedByMember(current, marks)) {
    return { rows: [...hevyOrder.map((h) => h.row), ...extras.map((e) => e.row)], keptEdits };
  }
  // The member's order: their rows as they are now; each Hevy row new to them goes after the
  // row it follows in Hevy (first, when nothing before it is here).
  const out: MergedRow[] = [];
  current.forEach((_, k) => {
    const row = forCurrent.get(k);
    if (row) out.push(row);
  });
  let after: MergedRow | null = null;
  for (const h of hevyOrder) {
    if (h.current != null) {
      after = h.row;
      continue;
    }
    const at = after ? out.indexOf(after) + 1 : 0;
    out.splice(at, 0, h.row);
    after = h.row;
  }
  return { rows: out, keptEdits };
}

interface PeRow {
  plan_day_id: string;
  exercise_id: string;
  target_sets: number;
  rep_range_min: number;
  rep_range_max: number;
  sets_json: string | null;
  rest_sec: number | null;
  superset_group: number | null;
  note: string | null;
}
const factsOf = (r: PeRow): RowFacts => ({
  exerciseId: r.exercise_id,
  targetSets: r.target_sets,
  repMin: r.rep_range_min,
  repMax: r.rep_range_max,
  setsJson: r.sets_json,
  restSec: r.rest_sec,
  supersetGroup: r.superset_group,
  note: r.note,
});

export async function rowsOfDay(dayId: string): Promise<RowFacts[]> {
  const rows = await getDb().getAllAsync<PeRow>(
    `SELECT plan_day_id, exercise_id, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec, superset_group, note
       FROM plan_exercises WHERE plan_day_id = ? ORDER BY ex_order ASC, rowid ASC`,
    [dayId],
  );
  return rows.map(factsOf);
}

async function writeKeptRow(dayId: string, r: RowFacts, order: number): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO plan_exercises(id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max,
                                sets_json, rest_sec, superset_group, note)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), dayId, r.exerciseId, order, r.targetSets, r.repMin, r.repMax, r.setsJson, r.restSec, r.supersetGroup, r.note],
  );
}

async function setMarksIn(update: (m: Marks) => void): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [ROUTINE_MARKS_KEY]);
  const m = readMarks(row?.value);
  update(m);
  await db.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [ROUTINE_MARKS_KEY, JSON.stringify(m)]);
}

export interface ImportSaveResult {
  folderId: string;
  /** Routines whose own changes were kept (the member's edits survived the copy). */
  keptEdits: string[];
}

/**
 * Save copied routines into a folder in one transaction, merging with what the member changed.
 *  - `before` null: a new folder (`source` import, settings `mark`).
 *  - `addOnly`: the routines join the folder — any of the same name are merged, the folder's
 *    other routines stay (a single routine copied into a folder the member chose, IM-21);
 *    otherwise the folder is the copy: routines no longer in it go (unless the member changed them).
 * Self-queued (never call from inside a queued job).
 */
export async function saveImportedFolder(
  before: Omit<Folder, 'routines'> | null,
  name: string,
  routines: readonly NewRoutine[],
  mark: FolderSettings,
  opts: {
    follow: boolean;
    todayISO: string;
    addOnly?: boolean;
    /**
     * IM-03: the day the followed plan counts workouts from, when it continues the member's own
     * rotation (their newest workout of one of these routines) — Today then shows the routine
     * after the one they did last, not the folder's first. Default: today.
     */
    startISO?: string | null;
  },
): Promise<ImportSaveResult> {
  const db = getDb();
  const marks = readMarks(await getMeta(ROUTINE_MARKS_KEY).catch(() => null));
  const keptEdits: string[] = [];
  let folderId = before?.id ?? uuid();
  await enqueueWrite(() =>
    db.withTransactionAsync(async () => {
      keptEdits.length = 0;
      if (!before) {
        const settings: FolderSettings = { ...mark };
        if (opts.follow) settings.startISO = opts.startISO ?? opts.todayISO;
        const order = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(folder_order) AS m FROM workout_plans');
        if (opts.follow) await db.runAsync('UPDATE workout_plans SET is_active = 0');
        await db.runAsync('INSERT INTO workout_plans(id, name, is_active, folder_order, source, settings) VALUES(?, ?, ?, ?, ?, ?)', [
          folderId,
          name.trim() || 'Folder',
          opts.follow ? 1 : 0,
          (order?.m ?? 0) + 1,
          'import',
          JSON.stringify(settings),
        ]);
      } else {
        folderId = before.id;
        const now = await db.getFirstAsync<{ settings: string | null }>('SELECT settings FROM workout_plans WHERE id = ?', [before.id]);
        const settings: FolderSettings = { ...parseFolderSettings(now?.settings ?? null), ...mark };
        if (opts.follow && !before.following) Object.assign(settings, freshWeeks(settings, opts.startISO ?? opts.todayISO));
        else if (opts.follow && opts.startISO) settings.startISO = opts.startISO;
        if (opts.follow) await db.runAsync('UPDATE workout_plans SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [before.id]);
        await db.runAsync('UPDATE workout_plans SET settings = ? WHERE id = ?', [JSON.stringify(settings), before.id]);
      }
      const old = before
        ? await db.getAllAsync<{ id: string; name: string; day_order: number }>(
            'SELECT id, name, day_order FROM plan_days WHERE plan_id = ? ORDER BY day_order ASC, rowid ASC',
            [folderId],
          )
        : [];
      // Each routine copied again keeps its id (by name, then by place — never by place when
      // only adding), so its workouts and "Today" stay with it.
      const keep = opts.addOnly
        ? routines.map((r) => old.find((o) => o.name.replace(/\s+/g, ' ').trim().toLowerCase() === r.name.replace(/\s+/g, ' ').trim().toLowerCase())?.id ?? null)
        : keptRoutineIds(old, routines);
      const keptIds = new Set(keep.filter((id): id is string => id != null));
      let nextOrder = opts.addOnly ? old.reduce((m, o) => Math.max(m, o.day_order), -1) + 1 : 0;
      const written = new Map<string, string[]>();
      for (let d = 0; d < routines.length; d++) {
        const r = routines[d];
        const dayId = keep[d] ?? uuid();
        const order = opts.addOnly ? (keep[d] ? old.find((o) => o.id === keep[d])?.day_order ?? nextOrder++ : nextOrder++) : d;
        let rows: MergedRow[] = r.exercises.map((x) => ({ write: x }));
        if (keep[d]) {
          const merged = mergeRows(await rowsOfDay(dayId), r.exercises, marks[dayId]);
          rows = merged.rows;
          if (merged.keptEdits) keptEdits.push(r.name);
          await db.runAsync('UPDATE plan_days SET plan_id = ?, day_type = ?, day_order = ?, name = ? WHERE id = ?', [folderId, r.dayType, order, r.name.trim() || 'Routine', dayId]);
          await db.runAsync('DELETE FROM plan_exercises WHERE plan_day_id = ?', [dayId]);
        } else {
          await db.runAsync('INSERT INTO plan_days(id, plan_id, day_type, day_order, name) VALUES(?, ?, ?, ?, ?)', [dayId, folderId, r.dayType, order, r.name.trim() || 'Routine']);
        }
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if ('keep' in row) await writeKeptRow(dayId, row.keep, i);
          else await insertRoutineRow(dayId, row.write, i);
        }
        written.set(dayId, r.exercises.map(newRowPrint));
      }
      if (!opts.addOnly) {
        // Routines no longer in the copy go — unless the member changed them (then they stay, at the end).
        let end = routines.length;
        for (const o of old) {
          if (keptIds.has(o.id)) continue;
          const rows = await rowsOfDay(o.id);
          if (rows.some((r) => editedByMember(r, marks[o.id]))) {
            keptEdits.push(o.name);
            await db.runAsync('UPDATE plan_days SET day_order = ? WHERE id = ?', [end++, o.id]);
          } else {
            await db.runAsync('DELETE FROM plan_exercises WHERE plan_day_id = ?', [o.id]);
            await db.runAsync('DELETE FROM plan_days WHERE id = ?', [o.id]);
          }
        }
      }
      await setMarksIn((m) => {
        for (const [dayId, prints] of written) m[dayId] = prints;
      });
    }),
  );
  return { folderId, keptEdits };
}

// ---------------------------------------------------------------- the member's own history

/** A workout's name and day, oldest first: the routine it was ("Push 1"). */
export async function routineHistory(): Promise<{ title: string; dateISO: string }[]> {
  const rows = await getDb().getAllAsync<{ title: string | null; notes: string | null; date_iso: string }>(
    "SELECT title, notes, date_iso FROM workout_sessions WHERE source != 'seed' ORDER BY started_at ASC",
  );
  // Imports before names were kept saved the Hevy title as the notes' first line.
  return rows.map((r) => ({ title: (r.title ?? r.notes ?? '').split('\n')[0].trim(), dateISO: r.date_iso })).filter((r) => r.title !== '');
}

/**
 * IM-03: the day of the member's newest workout of one of `names` (the rotation continues from
 * it), or null when they never did one. PURE.
 */
export function continueFrom(names: readonly string[], history: readonly { title: string; dateISO: string }[]): string | null {
  const keys = new Set(names.map((n) => n.replace(/\s+/g, ' ').trim().toLowerCase()));
  let newest: string | null = null;
  for (const h of history) if (keys.has(h.title.replace(/\s+/g, ' ').trim().toLowerCase()) && (!newest || h.dateISO > newest)) newest = h.dateISO;
  return newest;
}

/**
 * IM-02 (fallback): each exercise's set types the last time the member did `routine`, by
 * exercise id — "warm-up, warm-up, set, set, set". From the newest workout of that name that
 * had the exercise. Reads only.
 */
export async function lastSetTypes(routine: string, exerciseIds: readonly string[]): Promise<Map<string, PlanSetType[]>> {
  const out = new Map<string, PlanSetType[]>();
  if (exerciseIds.length === 0) return out;
  const key = routine.replace(/\s+/g, ' ').trim().toLowerCase();
  const sessions = await getDb().getAllAsync<{ id: string; title: string | null; notes: string | null }>(
    "SELECT id, title, notes FROM workout_sessions WHERE source != 'seed' ORDER BY started_at DESC LIMIT 400",
  );
  const ids = sessions
    .filter((s) => (s.title ?? (s.notes ?? '').split('\n')[0]).replace(/\s+/g, ' ').trim().toLowerCase() === key)
    .map((s) => s.id);
  for (const sid of ids) {
    const left = exerciseIds.filter((e) => !out.has(e));
    if (left.length === 0) break;
    const sets = await getDb().getAllAsync<{ exercise_id: string; is_warmup: number; set_type: string | null }>(
      `SELECT exercise_id, is_warmup, set_type FROM set_entries WHERE session_id = ? AND exercise_id IN (${left.map(() => '?').join(', ')})
        ORDER BY set_number ASC, rowid ASC`,
      [sid, ...left],
    );
    for (const s of sets) {
      const t: PlanSetType = s.is_warmup === 1 || s.set_type === 'warmup' ? 'warmup' : s.set_type === 'drop' ? 'drop' : s.set_type === 'failure' ? 'failure' : 'normal';
      out.set(s.exercise_id, [...(out.get(s.exercise_id) ?? []), t]);
    }
  }
  return out;
}

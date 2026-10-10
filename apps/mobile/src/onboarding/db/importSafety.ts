/**
 * A way back from an import (Phase 1 — IM-05, DS-05).
 *
 * "Replace" deletes every workout in ForgeAI before importing, and an import over the demo
 * removes the demo. Before either runs, the import screen:
 *   1. asks, naming how many workouts go and how many of those exist ONLY in ForgeAI
 *      (`replaceImpact`), and
 *   2. keeps a copy of the whole database in memory (`takeSafetyCopy`, the same snapshot the
 *      Drive backup uses) so "Undo import" puts everything back (`restoreSafetyCopy`) for as
 *      long as the member stays on that screen.
 *
 * A workout FINISHED while the import ran (or after it, before Undo) is not in the copy. Putting
 * the copy back must never take it: the restore carries every workout that is neither in the
 * copy nor written by the import itself forward into the restored data — with its sets, any
 * exercise it uses that the copy lacks, and its records worked out again.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, getMeta } from '@/db';
import { exportSnapshot, parseSnapshot, replaceAllInTransaction } from '@/cloud/snapshot';
import { enqueueWrite } from '@/db/writeQueue';
import { isAlreadyHere } from '@/tracker/services/hevyImport';
import { reconcilePrsForExercises } from '@/tracker/services/prRebuild';

import { demoSessionIds } from './dataActions';

/** The snapshot leaves `meta` out; these keys say whether the data is the demo. */
export const DEMO_META_KEYS = ['demo_data', 'seeded', 'demo_until', 'demo_legacy_checked'] as const;

export interface SafetyCopy {
  json: string;
  meta: Record<string, string | null>;
  /** The workouts in the copy (absent on a copy made by an older version: nothing is carried). */
  sessionIds?: string[];
}

type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;
type Row = Record<string, string | number | null>;

/** The demo flags as they are now (the snapshot leaves `meta` out). */
export async function readDemoMeta(): Promise<Record<string, string | null>> {
  const meta: Record<string, string | null> = {};
  for (const key of DEMO_META_KEYS) meta[key] = await getMeta(key);
  return meta;
}

/** Put the demo flags back as saved, inside the caller's transaction. */
export async function writeDemoMeta(tx: Pick<SQLiteDatabase, 'runAsync'>, meta: Record<string, string | null | undefined>): Promise<void> {
  for (const key of DEMO_META_KEYS) {
    const value = meta[key];
    if (value === null || value === undefined) await tx.runAsync('DELETE FROM meta WHERE key = ?', [key]);
    else
      await tx.runAsync(
        'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
  }
}

export async function takeSafetyCopy(): Promise<SafetyCopy> {
  const json = await exportSnapshot();
  return { json, meta: await readDemoMeta(), sessionIds: snapshotSessionIds(json) };
}

/** Index of the `]` or `}` closing the array/object opened at `open`, or -1. Skips strings. PURE. */
function closingBracket(json: string, open: number): number {
  let depth = 0;
  for (let i = open; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (c === 34) {
      // A string: to its closing quote, past every escaped character.
      for (i++; i < json.length; i++) {
        const d = json.charCodeAt(i);
        if (d === 92) i++;
        else if (d === 34) break;
      }
    } else if (c === 91 || c === 123) depth++;
    else if (c === 93 || c === 125) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Audit Phase 8: the workouts in a snapshot (`tables.workout_sessions[].id`) read from just that
 * part of the text — parsing the whole copy (12.5 MB for 5 years) only for the ids built every
 * row of every table a second time. `"workout_sessions":` can only be that key: inside a JSON
 * string every quote is escaped, and no column has that name. Anything unexpected → the whole
 * text is parsed, as before. PURE.
 */
export function snapshotSessionIds(json: string): string[] {
  const key = '"workout_sessions":';
  const at = json.indexOf(key);
  if (at >= 0 && json.charCodeAt(at + key.length) === 91 /* [ */) {
    const start = at + key.length;
    const end = closingBracket(json, start);
    if (end > start) {
      try {
        const rows = JSON.parse(json.slice(start, end + 1)) as unknown;
        if (Array.isArray(rows)) return (rows as { id?: unknown }[]).map((s) => String(s.id));
      } catch {
        // fall through to the full parse
      }
    }
  }
  const sessions = (JSON.parse(json) as { tables?: Record<string, { id?: unknown }[]> }).tables?.workout_sessions ?? [];
  return sessions.map((s) => String(s.id));
}

/** Workouts to keep through a restore: the sessions, their sets and the exercises they use. */
interface Carried {
  sessions: Row[];
  sets: Row[];
  exercises: Row[];
}

function placeholders(ids: readonly string[]): string {
  return ids.map(() => '?').join(', ');
}

async function readWorkouts(tx: Tx, ids: readonly string[]): Promise<Carried> {
  if (ids.length === 0) return { sessions: [], sets: [], exercises: [] };
  const q = placeholders(ids);
  const sessions = await tx.getAllAsync<Row>(`SELECT * FROM workout_sessions WHERE id IN (${q})`, [...ids]);
  const sets = await tx.getAllAsync<Row>(`SELECT * FROM set_entries WHERE session_id IN (${q}) ORDER BY rowid`, [...ids]);
  const exIds = [...new Set(sets.map((s) => String(s.exercise_id)))];
  const exercises = exIds.length
    ? await tx.getAllAsync<Row>(`SELECT * FROM exercises WHERE id IN (${placeholders(exIds)})`, exIds)
    : [];
  return { sessions, sets, exercises };
}

async function insertRow(tx: Tx, table: string, row: Row): Promise<void> {
  const cols = Object.keys(row);
  await tx.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols)})`,
    cols.map((c) => row[c]),
  );
}

/** Write carried workouts into the restored data. Returns the exercises they use (for records). */
async function writeWorkouts(tx: Tx, c: Carried): Promise<string[]> {
  // An exercise the restored library lacks comes along; one it has under another id (same name)
  // is used as it is there.
  const exerciseId = new Map<string, string>();
  for (const ex of c.exercises) {
    const id = String(ex.id);
    const same = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [id]);
    if (same) {
      exerciseId.set(id, id);
      continue;
    }
    const byName = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [ex.name]);
    if (byName) {
      exerciseId.set(id, byName.id);
      continue;
    }
    await insertRow(tx, 'exercises', ex);
    exerciseId.set(id, id);
  }
  for (const s of c.sessions) await insertRow(tx, 'workout_sessions', s);
  for (const set of c.sets) {
    await insertRow(tx, 'set_entries', { ...set, exercise_id: exerciseId.get(String(set.exercise_id)) ?? set.exercise_id });
  }
  return [...new Set(exerciseId.values())];
}

/**
 * Put the database back as the copy saw it (the import's rows go) — keeping every workout saved
 * since the copy that the import did not write. `importedSessionIds`: the workouts the import
 * wrote (an import that failed rolled back and wrote none). Returns how many workouts were kept.
 */
export async function restoreSafetyCopy(
  copy: SafetyCopy,
  opts: { importedSessionIds?: readonly string[] } = {},
): Promise<{ keptNewer: number }> {
  const env = parseSnapshot(copy.json);
  const inCopy = new Set(copy.sessionIds ?? []);
  const imported = new Set(opts.importedSessionIds ?? []);
  let touched: string[] = [];
  let keptNewer = 0;
  // ONE queued job: read what is newer, replace, write it back, flags — nothing can be saved
  // in between and lost.
  await enqueueWrite(() =>
    getDb().withExclusiveTransactionAsync(async (tx) => {
      let newer: string[] = [];
      if (copy.sessionIds) {
        const now = await tx.getAllAsync<{ id: string }>('SELECT id FROM workout_sessions');
        newer = now.map((r) => r.id).filter((id) => !inCopy.has(id) && !imported.has(id));
      }
      const carried = await readWorkouts(tx, newer);
      await replaceAllInTransaction(tx, env);
      touched = await writeWorkouts(tx, carried);
      await writeDemoMeta(tx, copy.meta);
      keptNewer = carried.sessions.length;
    }),
  );
  if (keptNewer > 0 && touched.length > 0) {
    // Their records were not in the copy: worked out again (best effort — they catch up on the next edit).
    await enqueueWrite(() => reconcilePrsForExercises(touched)).catch(() => undefined);
  }
  return { keptNewer };
}

type Start = { dateISO: string; startedAt: number };

/** The ForgeAI workouts that match no workout in the file (deleted for good by Replace). PURE. */
export function onlyInForgeAI<T extends Start>(existing: readonly T[], file: readonly Start[]): T[] {
  return existing.filter((e) => !file.some((w) => isAlreadyHere(w, [e]) !== null));
}

/**
 * What Replace would delete: the member's workouts (the demo's go with the demo and are not
 * counted), and how many of them the file does not have.
 */
export async function replaceImpact(file: readonly Start[]): Promise<{ removed: number; onlyHere: number }> {
  const rows = await getDb().getAllAsync<{ id: string; date_iso: string; started_at: number }>(
    'SELECT id, date_iso, started_at FROM workout_sessions',
  );
  const demo = await demoSessionIds().catch(() => new Set<string>());
  const own = rows
    .filter((r) => !demo.has(r.id))
    .map((r) => ({ id: r.id, dateISO: r.date_iso, startedAt: Number(r.started_at) }));
  return { removed: own.length, onlyHere: onlyInForgeAI(own, file).length };
}

/** The Replace confirm's line: how many of the deleted workouts are only in ForgeAI. PURE. */
export function replaceConfirmBody(onlyHere: number): string {
  const back = 'A copy is kept while you stay on this screen, so you can undo.';
  if (onlyHere <= 0) return `Every one of them is in this file too. ${back}`;
  return `${onlyHere} of them ${onlyHere === 1 ? 'is' : 'are'} only in ForgeAI, not in this file. ${back}`;
}

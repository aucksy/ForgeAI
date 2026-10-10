/**
 * Audit Phase 4 (EX-02): merge the member's own exercise into another, and hide library
 * exercises they never use.
 *
 * MERGE ("Bicep curls" made by mistake → Dumbbell Curl): in ONE transaction every logged set,
 * routine row, record and setting of the duplicate moves to the kept exercise, then the
 * duplicate is removed. History reads the same afterwards:
 *  - sets keep the counting they were logged with (a duplicate typed "as one" stays "as one"
 *    inside a "kg each" exercise — the same stamp `setExerciseLoadMode` uses);
 *  - a workout that had BOTH keeps them as two cards (card_index moves past the kept one's);
 *  - every table with an `exercise_id` column is re-pointed — found by looking, not from a
 *    list, so a table added later (routines, plans) moves too;
 *  - the record log (`personal_records` weight / 1-rep max) is rebuilt for the kept exercise
 *    from its merged history, so a record is a record of the whole history;
 *  - rest time: the kept exercise's own wins, else the duplicate's;
 *  - the duplicate's photo or video moves when the kept one has none;
 *  - the duplicate's name becomes a search word of the kept exercise (EX-01: old names still find it).
 *
 * HIDE: a library exercise with no logged set can be hidden from every exercise list
 * (reversible from "Hidden exercises"). Kept in `meta` (no schema change).
 *
 * Writes go through the one app-wide write queue (DS-04); never call these from inside a
 * queued job.
 */
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { uuid } from '@/lib/uuid';

import { exerciseHasSets, getTrackerExercise } from './exerciseInfo';

const HIDDEN_KEY = 'hidden_exercises';
const DRAFT_KEY = 'activeWorkoutDraft';

function parseIds(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The exercises the member hid from the lists. */
export async function getHiddenExerciseIds(): Promise<Set<string>> {
  return new Set(parseIds(await getMeta(HIDDEN_KEY)));
}

export type HideRefusal = 'not-found' | 'own' | 'used';

/**
 * Why this exercise can't be hidden, or null when it can: only a library exercise the member
 * never logged (their own exercises are merged instead; a used one holds history).
 */
export async function hideRefusal(id: string): Promise<HideRefusal | null> {
  const ex = await getTrackerExercise(id);
  if (!ex) return 'not-found';
  if (!ex.catalogKey) return 'own';
  if (await exerciseHasSets(id)) return 'used';
  return null;
}

/** Hide (or show again) one exercise in every list. */
export async function setExerciseHidden(id: string, hidden: boolean): Promise<void> {
  if (hidden) {
    const why = await hideRefusal(id);
    if (why) throw new Error(`cannot-hide:${why}`);
  }
  await enqueueWrite(async () => {
    const ids = new Set(parseIds(await getMeta(HIDDEN_KEY)));
    if (hidden) ids.add(id);
    else ids.delete(id);
    await setMeta(HIDDEN_KEY, JSON.stringify([...ids]));
  });
}

export type MergeRefusal = 'same' | 'not-found' | 'library' | 'in-workout';

export interface MergeResult {
  movedSets: number;
  /** The duplicate's own photo / video file, no longer used by anything — the caller deletes it. */
  orphanMedia: string | null;
}

/** Tables (other than `exercises`) with an `exercise_id` column. */
async function tablesWithExerciseId(): Promise<string[]> {
  const db = getDb();
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'exercises'",
  );
  const out: string[] = [];
  for (const t of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.name)) continue;
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t.name})`);
    if (cols.some((c) => c.name === 'exercise_id')) out.push(t.name);
  }
  return out;
}

/**
 * The record log of one exercise, rebuilt from its history: a 'weight' and a '1-rep max' row
 * for each workout that beat everything before it (the frozen rule: working sets, a true single
 * is its own 1-rep max). Review fix — the same rule as the app's record detection: an easy-week
 * workout never SETS a record (its rows are removed when it is saved), but its sets DO count as
 * what a later workout has to beat (the frozen detector's "before" includes them). Inside the
 * caller's transaction.
 */
async function rebuildRecordLog(exerciseId: string): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM personal_records WHERE exercise_id = ? AND kind IN ('weight', 'e1rm')", [exerciseId]);
  const rows = await db.getAllAsync<{ session_id: string; date_iso: string; weight_kg: number; reps: number; easy: number }>(
    `SELECT se.session_id, ws.date_iso, se.weight_kg, se.reps, COALESCE(ws.easy_week, 0) AS easy
       FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE se.exercise_id = ? AND se.is_warmup = 0
      ORDER BY ws.started_at ASC, ws.id ASC`,
    [exerciseId],
  );
  const e1 = (w: number, r: number): number => (r === 1 ? w : w * (1 + r / 30));
  let bestW: number | null = null;
  let bestE: number | null = null;
  let i = 0;
  while (i < rows.length) {
    const sid = rows[i].session_id;
    const day = rows[i].date_iso;
    const easy = rows[i].easy === 1;
    let topW: { w: number; r: number } | null = null;
    let topE: { w: number; r: number; e: number } | null = null;
    for (; i < rows.length && rows[i].session_id === sid; i++) {
      const { weight_kg: w, reps: r } = rows[i];
      if (!topW || w > topW.w || (w === topW.w && r > topW.r)) topW = { w, r };
      const e = e1(w, r);
      if (!topE || e > topE.e) topE = { w, r, e };
    }
    const add = (kind: 'weight' | 'e1rm', value: number, w: number, r: number) =>
      db.runAsync(
        'INSERT INTO personal_records (id, exercise_id, kind, value, weight_kg, reps, date_iso, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), exerciseId, kind, value, w, r, day, sid],
      );
    if (!easy && topW && (bestW === null || topW.w > bestW)) await add('weight', topW.w, topW.w, topW.r);
    if (!easy && topE && (bestE === null || topE.e > bestE)) await add('e1rm', Math.round(topE.e * 10) / 10, topE.w, topE.r);
    if (topW) bestW = Math.max(bestW ?? -Infinity, topW.w);
    if (topE) bestE = Math.max(bestE ?? -Infinity, topE.e);
  }
}

/** Why `fromId` can't be merged into `intoId`, or null when it can. */
export async function mergeRefusal(fromId: string, intoId: string): Promise<MergeRefusal | null> {
  if (fromId === intoId) return 'same';
  const [from, into] = await Promise.all([getTrackerExercise(fromId), getTrackerExercise(intoId)]);
  if (!from || !into) return 'not-found';
  if (from.catalogKey) return 'library';
  // A running workout holds the duplicate in its draft: finish it first.
  const draft = await getMeta(DRAFT_KEY);
  if (draft && draft.includes(fromId)) return 'in-workout';
  return null;
}

/** Merge the member's own exercise `fromId` into `intoId` (see the file header). */
export async function mergeExercise(fromId: string, intoId: string): Promise<MergeResult> {
  const why = await mergeRefusal(fromId, intoId);
  if (why) throw new Error(`cannot-merge:${why}`);
  const db = getDb();
  return enqueueWrite(async () => {
    let result: MergeResult = { movedSets: 0, orphanMedia: null };
    await db.withTransactionAsync(async () => {
      const from = await getTrackerExercise(fromId);
      const into = await getTrackerExercise(intoId);
      if (!from || !into) throw new Error('cannot-merge:not-found');
      const moved = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM set_entries WHERE exercise_id = ?', [fromId]);

      // Sets keep the counting they were logged with.
      if (from.loadMode !== into.loadMode) {
        await db.runAsync('UPDATE set_entries SET load_mode = ? WHERE exercise_id = ? AND load_mode IS NULL', [from.loadMode, fromId]);
      }
      // A workout that had both keeps two cards.
      await db.runAsync(
        `UPDATE set_entries
            SET card_index = COALESCE(card_index, 0) + 1 + (
                  SELECT MAX(COALESCE(t.card_index, 0)) FROM set_entries t
                   WHERE t.session_id = set_entries.session_id AND t.exercise_id = ?)
          WHERE exercise_id = ?
            AND session_id IN (SELECT session_id FROM set_entries WHERE exercise_id = ?)`,
        [intoId, fromId, intoId],
      );
      // Rest time: the kept exercise's own wins.
      await db.runAsync(
        `INSERT INTO exercise_prefs (exercise_id, rest_sec)
           SELECT ?, rest_sec FROM exercise_prefs WHERE exercise_id = ?
         ON CONFLICT(exercise_id) DO UPDATE SET rest_sec = COALESCE(exercise_prefs.rest_sec, excluded.rest_sec)`,
        [intoId, fromId],
      );
      await db.runAsync('DELETE FROM exercise_prefs WHERE exercise_id = ?', [fromId]);
      // Everything else that points at the duplicate.
      for (const t of await tablesWithExerciseId()) {
        if (t === 'exercise_prefs') continue;
        await db.runAsync(`UPDATE ${t} SET exercise_id = ? WHERE exercise_id = ?`, [intoId, fromId]);
      }
      await rebuildRecordLog(intoId);
      // Photo / video and the old name.
      let orphan: string | null = null;
      if (from.mediaUri && !into.mediaUri) {
        await db.runAsync('UPDATE exercises SET media_uri = ?, media_type = ? WHERE id = ?', [from.mediaUri, from.mediaType, intoId]);
      } else orphan = from.mediaUri;
      const words = into.aliases.some((a) => a.toLowerCase() === from.name.toLowerCase())
        ? into.aliases
        : [...into.aliases, from.name.toLowerCase()];
      await db.runAsync('UPDATE exercises SET aliases = ? WHERE id = ?', [JSON.stringify(words), intoId]);
      await db.runAsync('DELETE FROM exercises WHERE id = ?', [fromId]);
      result = { movedSets: moved?.n ?? 0, orphanMedia: orphan };
    });
    // Not hidden any more (it no longer exists).
    const ids = new Set(parseIds(await getMeta(HIDDEN_KEY)));
    if (ids.delete(fromId)) await setMeta(HIDDEN_KEY, JSON.stringify([...ids]));
    return result;
  });
}

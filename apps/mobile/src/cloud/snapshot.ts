import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/db';
import { SCHEMA_VERSION } from '@/db/schema';
import { enqueueWrite } from '@/db/writeQueue';
import { MEMBER_SCHEMA_VERSION } from '@/onboarding/db/memberSchema';
import { TRACKER_SCHEMA_VERSION } from '@/tracker/db/trackerSchema';

import { MERGE_PENDING_KEY } from './accountMeta';
import { backupVersionWords, PlainError } from './backupWords';

/**
 * Full-history snapshot of the member's local SQLite ↔ a portable JSON envelope,
 * used by the Google Drive backup/restore path (src/cloud/drive.ts). This is ONE-WAY
 * to the member's OWN Drive and a one-time hydrate on restore — NOT two-way sync,
 * no conflict resolution.
 *
 * We snapshot only the DOMAIN tables — never `sync_outbox`, `meta` or the cloud copy's own
 * `cloud_copy_state` / `cloud_copy_queue` (copyLocal.ts: what this phone sent, not member data). Identity, the
 * cloud session, the `seeded` flag and the last-backup time are device-local and are
 * re-established on their own, so keeping `meta` out means a restore can't clobber the
 * gym link, re-trigger the demo seed, or wipe the backup timestamp.
 *
 * One exception, by name (`META_KEYS`): `importOriginalStarts` — the first start of each
 * imported workout an edit moved (HI-03). It belongs to the workouts, not the device: without
 * it, a restored phone re-importing the same Hevy file brings every moved workout back twice.
 */

type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;
type TxLike = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync'>;

/**
 * Domain tables in FK-safe INSERT order (parents before children). Restore DELETEs
 * in the exact reverse (children before parents). Mirrors src/db/seed +
 * onboarding/db/dataActions (WIPE_TABLES_IN_ORDER), whose orderings are the proven
 * source of truth.
 */
const TABLES: readonly { name: string; cols: readonly string[]; keepWhenAbsent?: boolean }[] = [
  {
    name: 'user_profile',
    // `phone` is the additive Phase-O2 column (initMemberSchema). Included so the
    // Drive backup stays lossless; older backups lack the key and restore it as
    // NULL via batchInsert's `row[c] ?? null` — no SCHEMA_VERSION bump needed,
    // exactly as with the 5b/5c set_entries columns below.
    // + redesign R2 (member schema v2): the Profile's photo path, bio and link. The photo FILE
    // stays on the phone (like a custom exercise's picture); restored elsewhere, the Profile
    // shows the first letter until a new photo is picked. Older backups lack them → NULL.
    cols: ['id', 'name', 'phone', 'age', 'height_cm', 'goal', 'experience', 'gym_name', 'member_since_iso', 'calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g', 'unit_system', 'language',
      'photo_uri', 'bio', 'link'],
  },
  {
    name: 'exercises',
    // + the additive Phase 2 columns (tracker schema v4): catalogue link, how it is logged
    // and counted, finer muscles, the member's own photo/video path (the file itself stays
    // on the phone). Older backups lack them → NULL, exactly like the 5b/5c set columns.
    cols: ['id', 'name', 'aliases', 'muscle_group', 'secondary_muscles', 'equipment', 'is_compound', 'increment_kg',
      'catalog_key', 'log_type', 'load_mode', 'bw_share', 'muscles', 'media_uri', 'media_type',
      // v0.28.0 (tracker schema v8): an own distance exercise in km or metres (NULL = the library's).
      'dist_unit'],
  },
  // v0.28.1: each exercise's own rest length (tracker schema v3) was not backed up. A backup
  // made before this has no such table: the phone's own rest lengths are kept, not emptied.
  // + `records_from` (tracker schema v14, "Start records fresh"): the day an exercise's records
  // count from. Older backups lack it → NULL (every workout counts), like the columns above.
  { name: 'exercise_prefs', cols: ['exercise_id', 'rest_sec', 'records_from'], keepWhenAbsent: true },
  // + the additive Phase 4 columns (tracker schema v7): a folder's place, where it came from,
  // its settings (easy weeks). Older backups lack them → NULL, like the columns above.
  { name: 'workout_plans', cols: ['id', 'name', 'is_active', 'folder_order', 'source', 'settings'] },
  { name: 'plan_days', cols: ['id', 'plan_id', 'day_type', 'day_order', 'name'] },
  {
    name: 'plan_exercises',
    // + tracker schema v12 (RP-19): set types and targets, the routine's own rest, superset and
    // note. Older backups lack them → NULL (a plain routine), like the columns above.
    cols: ['id', 'plan_day_id', 'exercise_id', 'ex_order', 'target_sets', 'rep_range_min', 'rep_range_max',
      'sets_json', 'rest_sec', 'superset_group', 'note'],
  },
  {
    name: 'workout_sessions',
    // + `easy_week` (Phase 4, tracker schema v7): a workout of a plan's easy week.
    // + `title` (tracker schema v9): the workout's own name. Older backups → NULL.
    // + `routine_id` (tracker schema v11): the routine it was started from. Older backups → NULL.
    cols: ['id', 'date_iso', 'started_at', 'ended_at', 'day_type', 'notes', 'source', 'easy_week', 'title', 'routine_id'],
  },
  {
    name: 'set_entries',
    // Includes the additive Phase-5b/5c columns (rpe/set_type/note/superset_group).
    // They exist at runtime via initTrackerSchema; SELECTing/INSERTing them keeps the
    // Drive backup lossless. Old backups lack these keys → batchInsert's `row[c] ?? null`
    // restores them as NULL (backward-compatible; no SCHEMA_VERSION bump needed).
    // + `card_index` (tracker schema v10, LW-28): heavy and back-off cards of one lift stay two.
    cols: ['id', 'session_id', 'exercise_id', 'set_number', 'weight_kg', 'reps', 'is_warmup',
      'rpe', 'set_type', 'note', 'superset_group', 'duration_sec', 'distance_m', 'load_mode', 'card_index'],
  },
  {
    name: 'personal_records',
    cols: ['id', 'exercise_id', 'kind', 'value', 'weight_kg', 'reps', 'date_iso', 'session_id'],
  },
  { name: 'body_weight', cols: ['id', 'date_iso', 'weight_kg'] },
  // Phase 3 (tracker schema v6). Older backups lack it → restored empty, like any table.
  // `progress_photos` is deliberately NOT here: the pictures stay on this phone, and a
  // restore must neither drop the member's photos nor bring back rows whose files are gone.
  // `workout_photos` (photos on a workout, 15 Oct 2026) is left out for the same reason.
  { name: 'body_measurements', cols: ['id', 'date_iso', 'kind', 'value'] },
  {
    name: 'meals',
    cols: ['id', 'date_iso', 'logged_at', 'description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'source', 'photo_uri'],
  },
  {
    name: 'chat_messages',
    cols: ['id', 'role', 'kind', 'text', 'payload', 'image_uri', 'created_at'],
  },
] as const;

const APP_TAG = 'forgeai';

/** The only `meta` keys a backup carries (see the file note). */
// + audit IM-07: whether imported workouts' times were moved to the real moment. A backup from
// before that has no mark, so restoring it repairs its workouts again on the next start.
// + review fix (Phase 4): what each copied routine row was (`routine_import_marks` — without it a
// restored phone treats every copied routine as the member's own) and the exercises the member
// hid (`hidden_exercises`).
const META_KEYS: readonly string[] = ['importOriginalStarts', 'import_clock_real_v1', 'routine_import_marks', 'hidden_exercises'];

/**
 * 16 Oct 2026 backup review: the one-time repairs' "done" marks. A backup does not carry them, and
 * the data it brings back may be from before a repair (an older version's 85 kg x 12 lighter-set
 * 1-rep-max record), so every restore clears them: each repair runs again (straight after a Drive
 * restore, else on the next start). Each repair only touches what is still wrong, so a second run
 * on repaired data changes nothing. A test holds this list to the repairs' own keys.
 */
export const RERUN_AFTER_RESTORE: readonly string[] = [
  'pr_single_e1rm_fix',
  'pr_long_set_e1rm_fix',
  'pr_lighter_set_e1rm_fix',
  'link_folder_repair_v1',
];

export interface BackupEnvelope {
  app: string;
  schema_version: number;
  /**
   * The tracker and member table versions of the app that made it (16 Oct 2026 review). A newer
   * app's backup may hold columns this app would silently drop, so it is refused. Absent in
   * backups made before (they restore as always).
   */
  tracker_schema_version?: number;
  member_schema_version?: number;
  exported_at: string; // ISO timestamp
  tables: Record<string, Row[]>;
  /** `META_KEYS` present at export. Absent in backups made before it existed. */
  meta?: Record<string, string>;
}

export interface BackupInfo {
  exportedAt: string;
  workouts: number;
  meals: number;
}

/** Rows read and turned into text at a time by `exportSnapshot`. */
const EXPORT_PAGE_ROWS = 2000;

/**
 * Serialize every domain table to a portable JSON string.
 *
 * Audit Phase 8 follow-up: the rows are read a page at a time (by rowid, in table order) and each
 * page is turned into text at once, so at most one page of row objects is held next to the text.
 * Before, every row of every table was held as an object AND as text at the end — for 5 years of
 * history several times the size of the text, at the moment Replace or a restore keeps its copy.
 * The text is exactly what `JSON.stringify` of the whole envelope gives (a test holds it to that).
 */
export async function exportSnapshot(pageRows: number = EXPORT_PAGE_ROWS): Promise<string> {
  // 0, a negative or a fraction would never end the paging (or make SQLite refuse the LIMIT).
  const perPage = Math.max(1, Math.floor(pageRows) || EXPORT_PAGE_ROWS);
  const parts: string[] = [];
  const meta: Record<string, string> = {};
  // Read every table inside ONE exclusive transaction so the snapshot is a
  // consistent point-in-time view: a concurrent write can't straddle two reads
  // and capture a child row whose parent was already read (which would make the
  // backup fail FK checks on restore). Mirrors the atomicity of the import side.
  // Through the app-wide write queue (DS-04): never inside another open transaction.
  await enqueueWrite(() =>
    getDb().withExclusiveTransactionAsync(async (tx) => {
      for (const [i, t] of TABLES.entries()) {
        parts.push(`${i === 0 ? '' : ','}${JSON.stringify(t.name)}:[`);
        // OFFSET pages are safe here: nothing can write between them (one exclusive transaction).
        for (let offset = 0; ; offset += perPage) {
          const page = await tx.getAllAsync<Row>(
            `SELECT ${t.cols.join(', ')} FROM ${t.name} ORDER BY rowid LIMIT ? OFFSET ?`,
            [perPage, offset],
          );
          // One stringify per page; its "[" and "]" dropped so the pages join into one list.
          if (page.length > 0) parts.push(`${offset === 0 ? '' : ','}${JSON.stringify(page).slice(1, -1)}`);
          if (page.length < perPage) break;
        }
        parts.push(']');
      }
      const rows = await tx.getAllAsync<{ key: string; value: string }>(
        `SELECT key, value FROM meta WHERE key IN (${META_KEYS.map(() => '?').join(', ')})`,
        [...META_KEYS],
      );
      for (const r of rows) if (typeof r.value === 'string') meta[r.key] = r.value;
    }),
  );
  // The envelope's keys in the order `BackupEnvelope` has always been written in.
  const head = `{"app":${JSON.stringify(APP_TAG)},"schema_version":${JSON.stringify(SCHEMA_VERSION)},"tracker_schema_version":${JSON.stringify(TRACKER_SCHEMA_VERSION)},"member_schema_version":${JSON.stringify(MEMBER_SCHEMA_VERSION)},"exported_at":${JSON.stringify(new Date().toISOString())},"tables":{`;
  return `${head}${parts.join('')}},"meta":${JSON.stringify(meta)}}`;
}

/** Parse + validate an envelope. Throws a user-safe Error on anything unusable. */
export function parseSnapshot(json: string): BackupEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new PlainError('That backup file is damaged, so it can’t be restored. Make a new backup with Back up now.');
  }
  const env = raw as Partial<BackupEnvelope> | null;
  if (!env || env.app !== APP_TAG || typeof env.tables !== 'object' || env.tables === null) {
    throw new PlainError('That file isn’t a ForgeAI backup, so nothing was changed.');
  }
  // C9-14: an OLDER backup restores (every column added since comes back empty, as the table
  // notes above say). Only a backup from a NEWER app is refused, with what to do about it.
  const versionProblem = backupVersionWords(env.schema_version, SCHEMA_VERSION);
  if (versionProblem) throw new PlainError(versionProblem);
  // 16 Oct 2026 review: `schema_version` never moved (always 1), so the tracker and member versions
  // decide too. A backup made before they were written has neither and restores as always.
  for (const [backup, app] of [
    [env.tracker_schema_version, TRACKER_SCHEMA_VERSION],
    [env.member_schema_version, MEMBER_SCHEMA_VERSION],
  ] as const) {
    if (backup === undefined) continue;
    const problem = backupVersionWords(backup, app);
    if (problem) throw new PlainError(problem);
  }
  return env as BackupEnvelope;
}

/** Peek at a parsed backup for the confirm prompt (no DB writes). */
export function describeSnapshot(env: BackupEnvelope): BackupInfo {
  return {
    exportedAt: env.exported_at,
    workouts: env.tables['workout_sessions']?.length ?? 0,
    meals: env.tables['meals']?.length ?? 0,
  };
}

/** Multi-row INSERT in chunks that stay under SQLite's bind-variable limit. */
async function batchInsert(tx: TxLike, table: string, cols: readonly string[], rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const perChunk = Math.max(1, Math.floor(800 / cols.length));
  const tuple = `(${cols.map(() => '?').join(', ')})`;
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const values: SqlValue[] = [];
    for (const row of chunk) for (const c of cols) values.push(row[c] ?? null);
    await tx.runAsync(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')}`,
      values,
    );
  }
}

/**
 * Replace all local domain data with the snapshot's, atomically. DELETE-first
 * (children → parents) then INSERT (parents → children) inside one exclusive
 * transaction, exactly like the seed — so a mid-restore crash leaves the DB clean
 * and re-runnable. Never touches `meta` (identity / seeded / last-backup survive) beyond `META_KEYS`.
 */
export async function importSnapshot(env: BackupEnvelope): Promise<void> {
  // Through the app-wide write queue (DS-04): a workout save can't land half-way through.
  await enqueueWrite(() => getDb().withExclusiveTransactionAsync((tx) => replaceAllInTransaction(tx, env)));
}

/**
 * `importSnapshot`'s work inside the CALLER's transaction (a caller already running in a queued
 * job, which must also read or write around the replace atomically — the import's safety copy).
 */
export async function replaceAllInTransaction(tx: TxLike, env: BackupEnvelope): Promise<void> {
  const kept = (t: (typeof TABLES)[number]): boolean => t.keepWhenAbsent === true && env.tables[t.name] === undefined;
  for (let i = TABLES.length - 1; i >= 0; i--) {
    if (!kept(TABLES[i])) await tx.runAsync(`DELETE FROM ${TABLES[i].name}`);
  }
  for (const t of TABLES) {
    if (!kept(t)) await batchInsert(tx, t.name, t.cols, env.tables[t.name] ?? []);
  }
  // The few meta keys a backup carries. An older backup has none: this phone's stay as they are.
  if (env.meta && typeof env.meta === 'object') {
    for (const key of META_KEYS) {
      const v = env.meta[key];
      if (typeof v === 'string') {
        await tx.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, v]);
      } else {
        await tx.runAsync('DELETE FROM meta WHERE key = ?', [key]);
      }
    }
  } else {
    // A backup older than the keys above predates the IM-07 repair: its imports need it again.
    await tx.runAsync('DELETE FROM meta WHERE key = ?', ['import_clock_real_v1']);
  }
  // The restored data may be from before the one-time repairs: they run again.
  await tx.runAsync(`DELETE FROM meta WHERE key IN (${RERUN_AFTER_RESTORE.map(() => '?').join(', ')})`, [...RERUN_AFTER_RESTORE]);
  // #50: what this phone last copied to ForgeAI no longer describes it. Forget it and bring the
  // server's copy back first, so the restored (older) rows never delete or overwrite newer ones there.
  const copied = await tx.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cloud_copy_state'");
  if (copied) await tx.runAsync('DELETE FROM cloud_copy_state');
  await tx.runAsync("INSERT INTO meta(key, value) VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'", [MERGE_PENDING_KEY]);
}

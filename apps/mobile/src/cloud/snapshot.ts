import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/db';
import { SCHEMA_VERSION } from '@/db/schema';

/**
 * Full-history snapshot of the member's local SQLite ↔ a portable JSON envelope,
 * used by the Google Drive backup/restore path (src/cloud/drive.ts). This is ONE-WAY
 * to the member's OWN Drive and a one-time hydrate on restore — NOT two-way sync,
 * no conflict resolution.
 *
 * We snapshot only the DOMAIN tables — never `sync_outbox` or `meta`. Identity, the
 * cloud session, the `seeded` flag and the last-backup time are device-local and are
 * re-established on their own, so keeping `meta` out means a restore can't clobber the
 * gym link, re-trigger the demo seed, or wipe the backup timestamp.
 */

type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;
type TxLike = Pick<SQLiteDatabase, 'runAsync'>;

/**
 * Domain tables in FK-safe INSERT order (parents before children). Restore DELETEs
 * in the exact reverse (children before parents). Mirrors src/db/seed +
 * components/settings/resetDemo, whose orderings are the proven source of truth.
 */
const TABLES: readonly { name: string; cols: readonly string[] }[] = [
  {
    name: 'user_profile',
    cols: ['id', 'name', 'age', 'height_cm', 'goal', 'experience', 'gym_name', 'member_since_iso', 'calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g', 'unit_system', 'language'],
  },
  {
    name: 'exercises',
    cols: ['id', 'name', 'aliases', 'muscle_group', 'secondary_muscles', 'equipment', 'is_compound', 'increment_kg'],
  },
  { name: 'workout_plans', cols: ['id', 'name', 'is_active'] },
  { name: 'plan_days', cols: ['id', 'plan_id', 'day_type', 'day_order', 'name'] },
  {
    name: 'plan_exercises',
    cols: ['id', 'plan_day_id', 'exercise_id', 'ex_order', 'target_sets', 'rep_range_min', 'rep_range_max'],
  },
  {
    name: 'workout_sessions',
    cols: ['id', 'date_iso', 'started_at', 'ended_at', 'day_type', 'notes', 'source'],
  },
  {
    name: 'set_entries',
    cols: ['id', 'session_id', 'exercise_id', 'set_number', 'weight_kg', 'reps', 'is_warmup'],
  },
  {
    name: 'personal_records',
    cols: ['id', 'exercise_id', 'kind', 'value', 'weight_kg', 'reps', 'date_iso', 'session_id'],
  },
  { name: 'body_weight', cols: ['id', 'date_iso', 'weight_kg'] },
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

export interface BackupEnvelope {
  app: string;
  schema_version: number;
  exported_at: string; // ISO timestamp
  tables: Record<string, Row[]>;
}

export interface BackupInfo {
  exportedAt: string;
  workouts: number;
  meals: number;
}

/** Serialize every domain table to a portable JSON string. */
export async function exportSnapshot(): Promise<string> {
  const tables: Record<string, Row[]> = {};
  // Read every table inside ONE exclusive transaction so the snapshot is a
  // consistent point-in-time view: a concurrent write can't straddle two reads
  // and capture a child row whose parent was already read (which would make the
  // backup fail FK checks on restore). Mirrors the atomicity of the import side.
  await getDb().withExclusiveTransactionAsync(async (tx) => {
    for (const t of TABLES) {
      tables[t.name] = await tx.getAllAsync<Row>(`SELECT ${t.cols.join(', ')} FROM ${t.name}`);
    }
  });
  const envelope: BackupEnvelope = {
    app: APP_TAG,
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  };
  return JSON.stringify(envelope);
}

/** Parse + validate an envelope. Throws a user-safe Error on anything unusable. */
export function parseSnapshot(json: string): BackupEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('That backup file is unreadable.');
  }
  const env = raw as Partial<BackupEnvelope> | null;
  if (!env || env.app !== APP_TAG || typeof env.tables !== 'object' || env.tables === null) {
    throw new Error('That doesn’t look like a ForgeAI backup.');
  }
  if (env.schema_version !== SCHEMA_VERSION) {
    throw new Error('This backup is from a different app version and can’t be restored.');
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
 * and re-runnable. Never touches `meta` (identity / seeded / last-backup survive).
 */
export async function importSnapshot(env: BackupEnvelope): Promise<void> {
  await getDb().withExclusiveTransactionAsync(async (tx) => {
    for (let i = TABLES.length - 1; i >= 0; i--) {
      await tx.runAsync(`DELETE FROM ${TABLES[i].name}`);
    }
    for (const t of TABLES) {
      await batchInsert(tx, t.name, t.cols, env.tables[t.name] ?? []);
    }
  });
}

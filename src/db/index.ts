import * as SQLite from 'expo-sqlite';

import { DDL, SCHEMA_VERSION } from '@/db/schema';

/**
 * Single shared database handle. `getDb()` is safe to call from anywhere;
 * `initDb()` must complete once (root layout awaits it) before screens render.
 * The demo seed runs on first launch only (meta.seeded flag) — see db/seed.
 */

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('DB not initialised — initDb() must be awaited first');
  return db;
}

export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const handle = await SQLite.openDatabaseAsync('forgeai.db');
    await handle.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await handle.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(DDL);
      await tx.runAsync(
        `INSERT INTO meta(key, value) VALUES('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(SCHEMA_VERSION)],
      );
    });
    db = handle;
    return handle;
  })();
  return initPromise;
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO meta(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

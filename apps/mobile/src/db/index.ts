import * as SQLite from 'expo-sqlite';

import { DDL, SCHEMA_VERSION } from '@/db/schema';
import { startupStep } from '@/db/startupError';

/** The database file's name. expo-sqlite keeps it in `<documentDirectory>SQLite/` on Android. */
export const DB_NAME = 'forgeai.db';

/**
 * Single shared database handle. `getDb()` is safe to call from anywhere;
 * `initDb()` must complete once (root layout awaits it) before screens render.
 * Nothing is seeded automatically (Phase O2 / W1): a real member starts EMPTY via
 * src/onboarding, and the demo seed runs only on an explicit "Load demo data".
 */

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('DB not initialised — initDb() must be awaited first');
  return db;
}

export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;
  let attempt: Promise<SQLite.SQLiteDatabase> | null = null;
  attempt = (async () => {
    let handle: SQLite.SQLiteDatabase | null = null;
    try {
      // DS-08: each failure comes out tagged with its step, so the error screen can tell
      // "could not open" from "an upgrade step failed".
      handle = await startupStep('open', async () => {
        const h = await SQLite.openDatabaseAsync(DB_NAME);
        // If the pragmas fail, this handle is already open — close it below.
        handle = h;
        await h.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
        return h;
      });
      const opened = handle;
      await startupStep('upgrade', () =>
        opened.withExclusiveTransactionAsync(async (tx) => {
          await tx.execAsync(DDL);
          await tx.runAsync(
            `INSERT INTO meta(key, value) VALUES('schema_version', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [String(SCHEMA_VERSION)],
          );
        }),
      );
      db = opened;
      return opened;
    } catch (e) {
      // DS-08 / SH-11: never remember a FAILED open — the next initDb() (the error screen's
      // "Try again") must really try again, not hand back the same rejection forever.
      if (initPromise === attempt) initPromise = null;
      const h = handle as SQLite.SQLiteDatabase | null;
      if (h) await h.closeAsync().catch(() => undefined);
      throw e;
    }
  })();
  initPromise = attempt;
  return initPromise;
}

/**
 * Forget the shared handle so the next `initDb()` opens the database afresh (the start-up
 * error screen's "Try again"). Closes the old handle if there is one; a close that fails is
 * ignored — the handle is being thrown away either way. Never call this while screens that
 * use `getDb()` are mounted: it is for the start-up error screen only.
 */
export async function resetDb(): Promise<void> {
  const old = db;
  const pending = initPromise;
  db = null;
  initPromise = null;
  const handle = old ?? (pending ? await pending.catch(() => null) : null);
  if (handle) await handle.closeAsync().catch(() => undefined);
}

/** The open handle, or null when the database is not open (never throws). */
export function getDbIfOpen(): SQLite.SQLiteDatabase | null {
  return db;
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

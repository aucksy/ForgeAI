/**
 * REAL SQLite for unit tests (audit QA-13 / harness H8).
 *
 * The app talks to the database only through a small slice of expo-sqlite's async API
 * (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`,
 * `withExclusiveTransactionAsync`). `RealDb` implements that slice on top of sql.js — the
 * real SQLite engine compiled to WebAssembly, in memory — so the app's own SQL (schema,
 * migrations, repos, stores) runs unchanged inside vitest.
 *
 * Typical use:
 *
 *   let db: RealDb;
 *   let repo: typeof import('@/db/repos/workoutRepo');
 *   beforeEach(async () => {
 *     db = await bootRealApp();                         // fresh DB + the app's start-up
 *     repo = await import('@/db/repos/workoutRepo');    // import AFTER boot (see below)
 *   });
 *
 * Why the dynamic import: `@/db` keeps its handle in module state and `initDb()` runs once
 * per module instance. `bootRealApp` calls `vi.resetModules()` so every test gets a fresh
 * `@/db` bound to a fresh database. A module imported statically at the top of a test file
 * belongs to the OLD instance and would read the previous test's database (or none).
 *
 * Where this differs from a phone (keep in mind when a test passes here):
 *  - One connection. On a phone `withExclusiveTransactionAsync` runs on a SEPARATE
 *    connection, so a call on the main `getDb()` handle inside it would wait or see
 *    uncommitted data differently. Here `tx` and `getDb()` are the same connection.
 *  - In-memory: `PRAGMA journal_mode = WAL` answers "memory"; nothing touches disk.
 *  - sql.js binds whole numbers that fit in 32 bits as INTEGER and larger ones (epoch ms) as
 *    REAL; a column with INTEGER affinity stores them as INTEGER either way, as on a phone.
 *  - `undefined` parameters are bound as NULL.
 */
import initSqlJs, { type BindParams, type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import { vi } from 'vitest';

type BindValue = string | number | boolean | null | undefined | Uint8Array;
type Params = BindValue[] | Record<string, BindValue>;

let sqlPromise: Promise<SqlJsStatic> | null = null;
function sqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

function toSql(v: BindValue): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

/** expo-sqlite accepts `(sql, [a, b])`, `(sql, { $a: 1 })` and `(sql, a, b)`. */
function normalize(params: unknown[]): BindParams {
  if (params.length === 0) return null;
  const first = params.length === 1 ? params[0] : params;
  if (first === undefined || first === null) return params.length === 1 ? null : [null];
  if (Array.isArray(first)) return first.map((v) => toSql(v as BindValue));
  if (typeof first === 'object' && !(first instanceof Uint8Array)) {
    const out: Record<string, SqlValue> = {};
    for (const [k, v] of Object.entries(first as Record<string, BindValue>)) out[k] = toSql(v);
    return out;
  }
  return [toSql(first as BindValue)];
}

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

export class RealDb {
  /** The raw sql.js handle, for test set-up and assertions. */
  readonly raw: Database;
  private closed = false;

  constructor(raw: Database) {
    this.raw = raw;
  }

  // ------------------------------------------------ expo-sqlite API slice used by the app

  async execAsync(source: string): Promise<void> {
    this.raw.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]): Promise<RunResult> {
    this.raw.run(source, normalize(params));
    const changes = this.raw.getRowsModified();
    const id = this.raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
    return { changes, lastInsertRowId: Number(id ?? 0) };
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.all<T>(source, normalize(params));
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.raw.prepare(source);
    try {
      const p = normalize(params);
      if (p) stmt.bind(p);
      return stmt.step() ? (stmt.getAsObject() as T) : null;
    } finally {
      stmt.free();
    }
  }

  /** expo-sqlite: BEGIN … COMMIT on this connection; ROLLBACK and rethrow on error. */
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.raw.exec('BEGIN');
    try {
      await task();
      this.raw.exec('COMMIT');
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  /** expo-sqlite: BEGIN EXCLUSIVE; the task gets a transaction handle (here: this connection). */
  async withExclusiveTransactionAsync(task: (tx: RealDb) => Promise<void>): Promise<void> {
    this.raw.exec('BEGIN EXCLUSIVE');
    try {
      await task(this);
      this.raw.exec('COMMIT');
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  async closeAsync(): Promise<void> {
    if (!this.closed) this.raw.close();
    this.closed = true;
  }

  // Not used by the app today; fail loudly rather than pretend.
  async prepareAsync(): Promise<never> {
    throw new Error('RealDb.prepareAsync is not implemented — add it to test/helpers/realDb.ts when the app starts using it.');
  }

  // ------------------------------------------------ test conveniences (synchronous)

  all<T = Record<string, SqlValue>>(source: string, params: BindParams = null): T[] {
    const stmt = this.raw.prepare(source);
    try {
      if (params) stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  count(table: string, where = '1=1'): number {
    return Number(this.raw.exec(`SELECT COUNT(*) FROM ${table} WHERE ${where}`)[0].values[0][0]);
  }

  tables(): string[] {
    return this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).map((r) => r.name);
  }

  columns(table: string): { name: string; type: string; notnull: number; dflt_value: SqlValue }[] {
    return this.all(`PRAGMA table_info(${table})`);
  }
}

/** A fresh, empty in-memory database. */
export async function openRealDb(): Promise<RealDb> {
  const SQL = await sqlJs();
  return new RealDb(new SQL.Database());
}

/** Make the app's `initDb()` (via the expo-sqlite stub) open `db`. */
export function installRealDb(db: RealDb): void {
  (globalThis as Record<string, unknown>).__forgeaiOpenDatabase = async () => db;
}

export function uninstallRealDb(): void {
  delete (globalThis as Record<string, unknown>).__forgeaiOpenDatabase;
}

/**
 * Exactly what the app runs at start-up (src/app/_layout.tsx), minus the swallowing of
 * errors — a failed migration must fail the test, not hide.
 */
export async function runStartup(): Promise<void> {
  const { initDb } = await import('@/db');
  const { initTrackerSchema } = await import('@/tracker/db/trackerSchema');
  const { initMemberSchema } = await import('@/onboarding/db/memberSchema');
  const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
  const { syncExerciseCatalog } = await import('@/tracker/catalog/catalogSync');
  await initDb();
  await initTrackerSchema();
  await initMemberSchema();
  const { ensureHistoryIndexes } = await import('@/tracker/db/historyIndexes');
  await ensureHistoryIndexes();
  if (await hasMemberProfile()) await syncExerciseCatalog();
}

/**
 * Fresh modules + a fresh database (optionally pre-filled by `before`, e.g. an old-version
 * snapshot), then the app's real start-up. Import app modules AFTER this (see header).
 */
export async function bootRealApp(
  opts: {
    /** Re-launch on this existing database (an app restart) instead of a fresh one. */
    db?: RealDb;
    before?: (db: RealDb) => void | Promise<void>;
    startup?: boolean;
  } = {},
): Promise<RealDb> {
  vi.resetModules();
  const db = opts.db ?? (await openRealDb());
  if (opts.before) await opts.before(db);
  installRealDb(db);
  if (opts.startup !== false) await runStartup();
  return db;
}

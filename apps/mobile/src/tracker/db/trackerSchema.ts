/**
 * Additive tracker schema — Phase 5b onward.
 *
 * The base schema (`src/db/schema.ts`) is FROZEN. Any new column/table the tracker
 * needs is added here, purely ADDITIVELY (nullable column / new table), by an
 * idempotent `initTrackerSchema()` run once from `app/_layout.tsx` AFTER `initDb()`.
 * `schema.ts` and every frozen repo signature stay untouched.
 *
 * Why this is safe against the frozen layer:
 *  - New columns are nullable with no default → existing rows (incl. the seed's) get
 *    NULL; the frozen explicit-column INSERTs (addSets, seed) are unaffected.
 *  - Frozen readers use `SELECT *` + a hand-written row mapper that reads only named
 *    fields → extra columns are silently ignored.
 *  - `set_entries.is_warmup` stays AUTHORITATIVE: every frozen "working set" query
 *    filters `is_warmup = 0`. `set_type` is a decoration only — 'warmup' rows also
 *    carry `is_warmup = 1`; 'drop'/'failure' are WORKING sets (`is_warmup = 0`) and
 *    correctly count toward volume/PRs. So no frozen query changes.
 */
import { getDb, getMeta, setMeta } from '@/db';

export const TRACKER_SCHEMA_VERSION = 2;
const META_KEY = 'tracker_schema_version';

/** SQLite has no `ADD COLUMN IF NOT EXISTS` — introspect so re-runs are idempotent. */
async function ensureColumn(table: string, column: string, decl: string): Promise<void> {
  const cols = await getDb().getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await getDb().runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/**
 * Bring the DB up to TRACKER_SCHEMA_VERSION. Idempotent: fast-paths on a stored
 * version, and each ensureColumn is a no-op when the column already exists (so a
 * kill mid-migration self-heals on the next launch — the version flag is only
 * stamped after all columns are present).
 */
export async function initTrackerSchema(): Promise<void> {
  const stored = Number((await getMeta(META_KEY)) ?? '0');
  if (stored >= TRACKER_SCHEMA_VERSION) return;

  // v1 (Phase 5b): per-set RPE, set type, and per-set / per-exercise note.
  await ensureColumn('set_entries', 'rpe', 'REAL');
  await ensureColumn('set_entries', 'set_type', 'TEXT');
  await ensureColumn('set_entries', 'note', 'TEXT');
  // v2 (Phase 5c): superset grouping (per-workout small integer; NULL = ungrouped).
  await ensureColumn('set_entries', 'superset_group', 'INTEGER');

  await setMeta(META_KEY, String(TRACKER_SCHEMA_VERSION));
}

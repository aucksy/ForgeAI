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

export const TRACKER_SCHEMA_VERSION = 7;
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
  // v3 (Phase 1 workout screen): per-exercise settings that outlive one workout.
  // rest_sec: NULL = use the default rest, 0 = no timer, >0 = seconds.
  await getDb().execAsync(
    `CREATE TABLE IF NOT EXISTS exercise_prefs (
       exercise_id TEXT PRIMARY KEY,
       rest_sec INTEGER
     )`,
  );
  // v4 (Phase 2 exercises). On `exercises`: the catalogue link, how the exercise is logged
  // (NULL = weight × reps), how its weight counts (NULL = the catalogue's, else as typed),
  // the share of body weight its reps lift (NULL = the catalogue's, else none), finer
  // muscles (NULL = the catalogue's, else classified from the name), and the member's own
  // photo or video. On `set_entries`: time and distance (NULL on weight × reps rows; those
  // rows keep weight_kg/reps, time/distance rows store 0 there).
  await ensureColumn('exercises', 'catalog_key', 'TEXT');
  await ensureColumn('exercises', 'log_type', 'TEXT');
  await ensureColumn('exercises', 'load_mode', 'TEXT');
  await ensureColumn('exercises', 'bw_share', 'REAL');
  await ensureColumn('exercises', 'muscles', 'TEXT');
  await ensureColumn('exercises', 'media_uri', 'TEXT');
  await ensureColumn('exercises', 'media_type', 'TEXT');
  await ensureColumn('set_entries', 'duration_sec', 'REAL');
  await ensureColumn('set_entries', 'distance_m', 'REAL');
  await getDb().execAsync('CREATE INDEX IF NOT EXISTS idx_exercises_catalog_key ON exercises(catalog_key)');
  // v5 (Phase 2 review): how THIS set's weight was counted, when it differs from the
  // exercise's current counting (NULL = follow the exercise). Written when the member
  // changes an exercise's counting (its older sets keep the old reading) and on a Hevy
  // import into an exercise that already counts "each" (Hevy numbers are as typed).
  await ensureColumn('set_entries', 'load_mode', 'TEXT');
  // v6 (Phase 3 progress): body measurements (one value per kind per day, like body weight)
  // and progress photos (the picture lives in the app's own storage on this phone; the row
  // keeps its path and day).
  await getDb().execAsync(
    `CREATE TABLE IF NOT EXISTS body_measurements (
       id TEXT PRIMARY KEY,
       date_iso TEXT NOT NULL,
       kind TEXT NOT NULL,
       value REAL NOT NULL
     )`,
  );
  await getDb().execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_body_measurements_day_kind ON body_measurements(date_iso, kind)',
  );
  await getDb().execAsync(
    `CREATE TABLE IF NOT EXISTS progress_photos (
       id TEXT PRIMARY KEY,
       date_iso TEXT NOT NULL,
       uri TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`,
  );
  await getDb().execAsync('CREATE INDEX IF NOT EXISTS idx_progress_photos_date ON progress_photos(date_iso)');
  // v7 (Phase 4 routines and plans). A routine FOLDER is a `workout_plans` row (the plan the
  // member follows is the active one — the frozen rotation reads it as before); its place in
  // the list, where it came from ('program' / 'builder' / 'import'; NULL = the member's own)
  // and its settings (JSON: easy-week schedule, start day, the builder's answers). A workout
  // done in an easy week is marked, so records and the Target leave it out.
  await ensureColumn('workout_plans', 'folder_order', 'INTEGER');
  await ensureColumn('workout_plans', 'source', 'TEXT');
  await ensureColumn('workout_plans', 'settings', 'TEXT');
  await ensureColumn('workout_sessions', 'easy_week', 'INTEGER');

  await setMeta(META_KEY, String(TRACKER_SCHEMA_VERSION));
}

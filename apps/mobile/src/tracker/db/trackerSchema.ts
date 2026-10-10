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

export const TRACKER_SCHEMA_VERSION = 13;
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
  // v8 (v0.28.0): the member's own distance exercise is kept in km or metres ('km' / 'm';
  // NULL = the library's unit, else km). Display only — distances are stored in metres.
  await ensureColumn('exercises', 'dist_unit', 'TEXT');
  // v9 (Phase 2, the calm Finish — LW-10): a workout's own name ("Push Day A", "Evening
  // workout"; NULL = older workouts, which keep showing their day type).
  await ensureColumn('workout_sessions', 'title', 'TEXT');
  // v10 (Phase 2, packet B — LW-05 / LW-28 / TG-05): a set's card among the workout's cards of
  // the SAME exercise (Bench heavy = 0, Bench back-off = 1). NULL = the first card (every older
  // set), so a workout logging a lift once is unchanged; the two cards stay two after saving,
  // and each reads its own last time and Target.
  await ensureColumn('set_entries', 'card_index', 'INTEGER');
  // v11 (audit Phase 3 — RP-01 / RP-02): the routine a workout was started from (a
  // `plan_days.id`), saved at Finish, so "Today" knows Push 1 from Push 2 instead of guessing.
  // NULL = not known (older workouts; imports with no routine of that name), '' = known to
  // have none (an empty workout — it never moves "Today").
  await ensureColumn('workout_sessions', 'routine_id', 'TEXT');
  // v12 (audit Phase 4 — RP-19): a routine keeps its sets as Hevy does. On `plan_exercises`:
  // each set's type and optional target (JSON list; NULL = `target_sets` normal sets, so every
  // older row reads as before), the exercise's own rest in THIS routine (NULL = the exercise's
  // rest, 0 = no timer), its superset (small integer, NULL = none) and a note (NULL = none).
  await ensureColumn('plan_exercises', 'sets_json', 'TEXT');
  await ensureColumn('plan_exercises', 'rest_sec', 'INTEGER');
  await ensureColumn('plan_exercises', 'superset_group', 'INTEGER');
  await ensureColumn('plan_exercises', 'note', 'TEXT');
  // v13 (audit Phase 8 — speed with years of data): a change counter for the training data.
  await ensureTrainingChanges();

  await setMeta(META_KEY, String(TRACKER_SCHEMA_VERSION));
}

/**
 * v13: `training_changes` — what changed in the training data, kept by SQLite itself.
 *
 * Records and Targets are worked out from every set the member ever logged (28,000+ rows after
 * five years). They are kept in memory until the data they were made from changes. The old
 * "has it changed?" check counted writes of ANY kind, so a draft save or a settings write threw
 * the kept records away. Now triggers on the tables records and Targets read keep:
 *  - `#version`: a number that goes up with every change that can alter a record or a Target
 *    (a set added, edited or deleted; a workout deleted or moved; an exercise added, renamed,
 *    re-typed or merged; a body weight). A draft save, a set's or workout's note, a superset,
 *    a workout's name, a meta row, a meal, a routine never move it.
 *  - one row per exercise touched, holding the `#version` of its last change, so after a
 *    Finish or an edit only those exercises are worked out again;
 *  - `#all`: a change that touches every exercise (body weight: the share of body weight a
 *    pull-up lifts) — the next read rebuilds everything.
 * The table holds one row per exercise at most. It is never backed up or erased: the number
 * only ever goes up on this phone, and every erase, restore or import moves it like any write.
 *
 * Triggers fire for every connection (a Drive restore on its own connection too), which is why
 * this replaces SQLite's per-connection write counters. Every statement in a trigger body is
 * conflict-free (UPDATE by key, INSERT … WHERE NOT EXISTS), so an outer `INSERT OR IGNORE`
 * can never skip a mark.
 *
 * CHANGING THESE TRIGGERS — read before editing. They are created with CREATE TRIGGER IF NOT
 * EXISTS, so on every phone that already ran v13 an edited body below is silently IGNORED (the
 * old trigger stays). To change one: add a NEW schema version whose migration runs
 * `DROP TRIGGER IF EXISTS <name>` and then creates the new body. And any migration that
 * rebuilds `set_entries`, `exercises`, `workout_sessions` or `body_weight` (create a new table,
 * copy, drop the old, rename) drops that table's triggers with it: it must run
 * `ensureTrainingChanges()` again afterwards, or records and Targets stop seeing changes.
 */
const V = "COALESCE((SELECT seq FROM training_changes WHERE id = '#version'), 0)";
const BUMP = "UPDATE training_changes SET seq = seq + 1 WHERE id = '#version';";

/** Mark the exercise ids `idsSql` (a SELECT of one column named `id`) as changed at the current version. */
function markIds(idsSql: string): string {
  return `UPDATE training_changes SET seq = ${V} WHERE id IN (SELECT id FROM (${idsSql}));
          INSERT INTO training_changes(id, seq)
            SELECT DISTINCT x.id, ${V} FROM (${idsSql}) AS x
             WHERE x.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM training_changes t WHERE t.id = x.id);`;
}

/** Mark ONE exercise id (`expr`, e.g. NEW.exercise_id): by key, so a set insert stays cheap. */
function markOne(expr: string): string {
  return `UPDATE training_changes SET seq = ${V} WHERE id = ${expr};
          INSERT INTO training_changes(id, seq) SELECT ${expr}, ${V}
           WHERE ${expr} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM training_changes WHERE id = ${expr});`;
}

const MARK_ALL = `UPDATE training_changes SET seq = ${V} WHERE id = '#all';
                  INSERT INTO training_changes(id, seq) SELECT '#all', ${V}
                   WHERE NOT EXISTS (SELECT 1 FROM training_changes WHERE id = '#all');`;

/** Columns of a set that records or Targets read (not its note or superset). */
const SET_COLS = ['session_id', 'exercise_id', 'set_number', 'weight_kg', 'reps', 'is_warmup', 'duration_sec', 'distance_m', 'load_mode', 'rpe', 'set_type', 'card_index'];
const changed = (cols: readonly string[]): string => cols.map((c) => `OLD.${c} IS NOT NEW.${c}`).join(' OR ');

export const TRAINING_CHANGE_TRIGGERS: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS tc_sets_ins AFTER INSERT ON set_entries BEGIN
     ${BUMP} ${markOne('NEW.exercise_id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS tc_sets_del AFTER DELETE ON set_entries BEGIN
     ${BUMP} ${markOne('OLD.exercise_id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS tc_sets_upd AFTER UPDATE ON set_entries WHEN ${changed(SET_COLS)} BEGIN
     ${BUMP} ${markOne('OLD.exercise_id')} ${markOne('NEW.exercise_id')}
   END`,
  // BEFORE: the workout's sets are still there to say which exercises it touched.
  `CREATE TRIGGER IF NOT EXISTS tc_sessions_del BEFORE DELETE ON workout_sessions BEGIN
     ${BUMP} ${markIds('SELECT exercise_id AS id FROM set_entries WHERE session_id = OLD.id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS tc_sessions_upd AFTER UPDATE ON workout_sessions
     WHEN ${changed(['id', 'date_iso', 'started_at', 'easy_week'])} BEGIN
     ${BUMP} ${markIds('SELECT exercise_id AS id FROM set_entries WHERE session_id IN (OLD.id, NEW.id)')}
   END`,
  // Any real change to an exercise row (its name, type, counting, share of body weight, library link…).
  `CREATE TRIGGER IF NOT EXISTS tc_exercises_upd AFTER UPDATE ON exercises
     WHEN ${changed(['id', 'name', 'aliases', 'muscle_group', 'secondary_muscles', 'equipment', 'is_compound', 'increment_kg', 'catalog_key', 'log_type', 'load_mode', 'bw_share', 'muscles', 'media_uri', 'media_type', 'dist_unit'])} BEGIN
     ${BUMP} ${markOne('OLD.id')} ${markOne('NEW.id')}
   END`,
  // A new exercise has no sets (no record), but it can be the easier / harder version a Target links to.
  `CREATE TRIGGER IF NOT EXISTS tc_exercises_ins AFTER INSERT ON exercises BEGIN ${BUMP} END`,
  `CREATE TRIGGER IF NOT EXISTS tc_exercises_del AFTER DELETE ON exercises BEGIN
     ${BUMP} ${markOne('OLD.id')}
   END`,
  `CREATE TRIGGER IF NOT EXISTS tc_bw_ins AFTER INSERT ON body_weight BEGIN ${BUMP} ${MARK_ALL} END`,
  `CREATE TRIGGER IF NOT EXISTS tc_bw_upd AFTER UPDATE ON body_weight WHEN ${changed(['date_iso', 'weight_kg'])} BEGIN ${BUMP} ${MARK_ALL} END`,
  `CREATE TRIGGER IF NOT EXISTS tc_bw_del AFTER DELETE ON body_weight BEGIN ${BUMP} ${MARK_ALL} END`,
];

async function ensureTrainingChanges(): Promise<void> {
  const db = getDb();
  await db.execAsync('CREATE TABLE IF NOT EXISTS training_changes (id TEXT PRIMARY KEY, seq INTEGER NOT NULL)');
  await db.runAsync("INSERT INTO training_changes(id, seq) SELECT '#version', 0 WHERE NOT EXISTS (SELECT 1 FROM training_changes WHERE id = '#version')");
  for (const sql of TRAINING_CHANGE_TRIGGERS) await db.execAsync(sql);
}

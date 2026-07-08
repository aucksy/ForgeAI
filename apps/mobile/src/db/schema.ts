/**
 * SQLite DDL — schema v1. Executed inside one transaction by db/index.ts.
 * Conventions: TEXT ids (uuid), kg for all weights, dateISO = 'YYYY-MM-DD'
 * (local day), *_at = epoch ms. Booleans are INTEGER 0/1.
 */

export const SCHEMA_VERSION = 1;

export const DDL = `
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  height_cm REAL NOT NULL,
  goal TEXT NOT NULL,
  experience TEXT NOT NULL,
  gym_name TEXT NOT NULL,
  member_since_iso TEXT NOT NULL,
  calorie_target INTEGER NOT NULL,
  protein_target_g INTEGER NOT NULL,
  carbs_target_g INTEGER NOT NULL,
  fat_target_g INTEGER NOT NULL,
  unit_system TEXT NOT NULL DEFAULT 'metric',
  language TEXT NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS body_weight (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  weight_kg REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_body_weight_date ON body_weight(date_iso);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases TEXT NOT NULL DEFAULT '[]',
  muscle_group TEXT NOT NULL,
  secondary_muscles TEXT NOT NULL DEFAULT '[]',
  equipment TEXT NOT NULL,
  is_compound INTEGER NOT NULL DEFAULT 0,
  increment_kg REAL NOT NULL DEFAULT 2.5
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  day_type TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'chat'
);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON workout_sessions(date_iso);

CREATE TABLE IF NOT EXISTS set_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  reps INTEGER NOT NULL,
  is_warmup INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sets_session ON set_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON set_entries(exercise_id);

CREATE TABLE IF NOT EXISTS personal_records (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  kind TEXT NOT NULL,
  value REAL NOT NULL,
  weight_kg REAL NOT NULL,
  reps INTEGER NOT NULL,
  date_iso TEXT NOT NULL,
  session_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pr_exercise ON personal_records(exercise_id);

CREATE TABLE IF NOT EXISTS workout_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_days (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL,
  day_order INTEGER NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_exercises (
  id TEXT PRIMARY KEY,
  plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  ex_order INTEGER NOT NULL,
  target_sets INTEGER NOT NULL DEFAULT 3,
  rep_range_min INTEGER NOT NULL DEFAULT 8,
  rep_range_max INTEGER NOT NULL DEFAULT 12
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  logged_at INTEGER NOT NULL,
  description TEXT NOT NULL,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'text',
  photo_uri TEXT
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date_iso);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL,
  payload TEXT,
  image_uri TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Cloud one-way push outbox (B2B2C). NOT a domain table: no user_id, identity is
-- attached at drain time from the cloud session. Holds at most one pending
-- member-summary snapshot; drained by src/cloud when online + a gym is linked.
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'member_summary',
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  client_version INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(status);
`;

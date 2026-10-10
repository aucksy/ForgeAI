/**
 * UPDATE / MIGRATION test (audit QA-04 / harness H8): a member's database from an OLDER
 * release, opened by THIS release's start-up, keeps every row.
 *
 * The fixtures in test/fixtures/db/schema-<tag>.sql are the exact schema each past release
 * left on a phone — rebuilt from that release's own source in git by
 * test/fixtures/db/make-schema-fixtures.mjs. Each test:
 *   1. loads one old schema into a real in-memory SQLite and fills it with representative
 *      rows (warm-ups, drop sets, RPE, notes, supersets, records, a routine, meals, chat,
 *      body weight, measurements… whichever columns that release had);
 *   2. runs the CURRENT start-up (initDb → tracker schema → member schema → library sync);
 *   3. asserts every old row is still there with every old value unchanged, new columns
 *      read NULL (their "not set" value), the schema now matches a fresh install, and the
 *      app's own reads see the old history;
 *   4. restarts the app on the same database and asserts nothing changes (idempotent).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

const FIXTURES = join(__dirname, '../fixtures/db');
const TAGS = ['v0.2.0', 'v0.9.0', 'v0.21.0', 'v0.24.0', 'v0.27.0', 'v0.29.1'] as const;

type Row = Record<string, string | number | null>;

const T0 = Date.UTC(2026, 2, 1, 4, 30); // 1 Mar 2026, 10:00 IST

/** A superset of every column any release had; each row is inserted with the columns that exist. */
const ROWS: Record<string, Row[]> = {
  user_profile: [{
    id: 'p1', name: 'Old Member', age: 31, height_cm: 176.5, goal: 'muscle', experience: 'intermediate',
    gym_name: 'Iron Temple', member_since_iso: '2025-11-02', calorie_target: 2600, protein_target_g: 150,
    carbs_target_g: 300, fat_target_g: 70, unit_system: 'metric', language: 'en', phone: '+919800000001',
  }],
  body_weight: [
    { id: 'bw1', date_iso: '2026-02-28', weight_kg: 78.4 },
    { id: 'bw2', date_iso: '2026-03-02', weight_kg: 78.1 },
  ],
  exercises: [
    // A library name: the sync must LINK it (catalog_key) without touching its history.
    { id: 'ex-bench', name: 'Barbell Bench Press', aliases: '["bench"]', muscle_group: 'chest', secondary_muscles: '["triceps"]', equipment: 'barbell', is_compound: 1, increment_kg: 2.5 },
    { id: 'ex-curl', name: 'Dumbbell Curl', aliases: '[]', muscle_group: 'biceps', secondary_muscles: '[]', equipment: 'dumbbell', is_compound: 0, increment_kg: 1 },
    // The member's own exercise: never renamed, never linked.
    { id: 'ex-own', name: 'Grandpa Farm Carry', aliases: '[]', muscle_group: 'core', secondary_muscles: '[]', equipment: 'other', is_compound: 1, increment_kg: 5, log_type: 'weight_reps', media_uri: 'file:///own.jpg', media_type: 'image', dist_unit: null },
  ],
  workout_sessions: [
    { id: 's1', date_iso: '2026-03-01', started_at: T0, ended_at: T0 + 3_900_000, day_type: 'push', notes: 'good day', source: 'manual', easy_week: null },
    { id: 's2', date_iso: '2026-03-03', started_at: T0 + 2 * 86_400_000, ended_at: null, day_type: 'pull', notes: null, source: 'chat' },
  ],
  set_entries: [
    { id: 'se1', session_id: 's1', exercise_id: 'ex-bench', set_number: 1, weight_kg: 40, reps: 10, is_warmup: 1, set_type: 'warmup' },
    { id: 'se2', session_id: 's1', exercise_id: 'ex-bench', set_number: 2, weight_kg: 80, reps: 6, is_warmup: 0, rpe: 8.5, note: 'pause reps', superset_group: 1 },
    { id: 'se3', session_id: 's1', exercise_id: 'ex-bench', set_number: 3, weight_kg: 60, reps: 9, is_warmup: 0, set_type: 'drop', superset_group: 1 },
    { id: 'se4', session_id: 's1', exercise_id: 'ex-curl', set_number: 1, weight_kg: 12.5, reps: 12, is_warmup: 0, superset_group: 1, load_mode: 'each' },
    { id: 'se5', session_id: 's2', exercise_id: 'ex-own', set_number: 1, weight_kg: 50, reps: 1, is_warmup: 0, duration_sec: null, distance_m: null },
  ],
  personal_records: [
    { id: 'pr1', exercise_id: 'ex-bench', kind: 'weight', value: 80, weight_kg: 80, reps: 6, date_iso: '2026-03-01', session_id: 's1' },
    { id: 'pr2', exercise_id: 'ex-bench', kind: 'e1rm', value: 96, weight_kg: 80, reps: 6, date_iso: '2026-03-01', session_id: 's1' },
  ],
  workout_plans: [{ id: 'plan1', name: 'PPL', is_active: 1, folder_order: 0, source: null, settings: null }],
  plan_days: [{ id: 'day1', plan_id: 'plan1', day_type: 'push', day_order: 0, name: 'Push A' }],
  plan_exercises: [
    { id: 'pe1', plan_day_id: 'day1', exercise_id: 'ex-bench', ex_order: 0, target_sets: 4, rep_range_min: 5, rep_range_max: 8 },
    { id: 'pe2', plan_day_id: 'day1', exercise_id: 'ex-curl', ex_order: 1, target_sets: 3, rep_range_min: 10, rep_range_max: 15 },
  ],
  meals: [{ id: 'm1', date_iso: '2026-03-01', logged_at: T0 + 1000, description: '2 rotis, dal', calories: 420, protein_g: 18, carbs_g: 60, fat_g: 10, source: 'text', photo_uri: null }],
  chat_messages: [{ id: 'c1', role: 'user', kind: 'text', text: 'bench 80 for 6', payload: null, image_uri: null, created_at: T0 + 2000 }],
  sync_outbox: [{ id: 'o1', kind: 'member_summary', payload: '{}', status: 'pending', client_version: 3, attempts: 0, last_error: null, updated_at: T0 }],
  exercise_prefs: [{ exercise_id: 'ex-bench', rest_sec: 150 }],
  body_measurements: [{ id: 'bm1', date_iso: '2026-03-01', kind: 'waist', value: 84.5 }],
  progress_photos: [{ id: 'ph1', date_iso: '2026-03-01', uri: 'file:///p1.jpg', created_at: T0 }],
  meta: [
    { key: 'seeded', value: '1' },
    { key: 'restTimerDefaultSec', value: '120' },
  ],
};

/** Keys whose value the CURRENT start-up is allowed (and expected) to write. */
const VERSION_KEYS = new Set(['schema_version', 'tracker_schema_version', 'member_schema_version', 'exercise_catalog_version']);
/** Columns the library sync fills on a linked exercise. */
const LINK_COLUMNS = new Set(['catalog_key', 'log_type', 'load_mode']);

function loadOld(db: RealDb, tag: string): void {
  db.raw.exec(readFileSync(join(FIXTURES, `schema-${tag}.sql`), 'utf8'));
  for (const [table, rows] of Object.entries(ROWS)) {
    if (!db.tables().includes(table)) continue; // the table came later
    const have = new Set(db.columns(table).map((c) => c.name));
    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => have.has(c));
      db.raw.run(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => row[c]),
      );
    }
  }
}

function pk(table: string): string {
  return table === 'meta' ? 'key' : table === 'exercise_prefs' ? 'exercise_id' : 'id';
}

/** Every row of every table, keyed by table then primary key. */
function snapshot(db: RealDb): Record<string, Record<string, Row>> {
  const out: Record<string, Record<string, Row>> = {};
  for (const t of db.tables()) {
    out[t] = {};
    for (const r of db.all<Row>(`SELECT * FROM ${t}`)) out[t][String(r[pk(t)])] = r;
  }
  return out;
}

function schemaOf(db: RealDb): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of db.tables()) out[t] = db.columns(t).map((c) => `${c.name} ${c.type}`);
  const idx = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name");
  out['(indexes)'] = idx.map((i) => i.name);
  return out;
}

describe('fixtures are what the generator produces from git', () => {
  it('every fixture names its tag and stamps the schema version', () => {
    for (const tag of TAGS) {
      const sql = readFileSync(join(FIXTURES, `schema-${tag}.sql`), 'utf8');
      expect(sql).toContain(`from git tag ${tag}`);
      expect(sql).toContain("VALUES('schema_version', '1')");
    }
  });
});

describe.each(TAGS)('upgrade from %s keeps every row', (tag) => {
  it('every old row survives the current start-up unchanged; new columns read NULL; app reads see it', async () => {
    let before: Record<string, Record<string, Row>> = {};
    const db = await bootRealApp({
      before: (d) => {
        loadOld(d, tag);
        before = snapshot(d);
      },
    });
    const after = snapshot(db);

    // 1. Every old row is still there and every OLD column holds the same value.
    for (const [table, rows] of Object.entries(before)) {
      for (const [id, row] of Object.entries(rows)) {
        const now = after[table]?.[id];
        expect(now, `${tag}: ${table}.${id} still exists`).toBeTruthy();
        for (const [col, val] of Object.entries(row)) {
          if (table === 'meta' && VERSION_KEYS.has(id)) continue;
          if (table === 'exercises' && LINK_COLUMNS.has(col) && val === null) continue;
          expect(now![col], `${tag}: ${table}.${id}.${col}`).toEqual(val);
        }
        // 2. Columns this release did not have read NULL ("not set") on old rows.
        for (const col of Object.keys(now!)) {
          if (col in row) continue;
          if (table === 'exercises' && LINK_COLUMNS.has(col)) continue;
          expect(now![col], `${tag}: new column ${table}.${col} on old row ${id}`).toBeNull();
        }
      }
    }
    // Nothing old was deleted, and no training was invented.
    for (const t of ['workout_sessions', 'set_entries', 'personal_records', 'plan_days', 'plan_exercises', 'meals', 'chat_messages', 'body_weight']) {
      expect(Object.keys(after[t] ?? {}).length, `${tag}: ${t} count`).toBe(Object.keys(before[t] ?? {}).length);
    }

    // 3. Versions are current.
    const meta = (k: string) => after.meta[k]?.value;
    expect(meta('schema_version')).toBe('1');
    expect(meta('tracker_schema_version')).toBe('10');
    expect(meta('member_schema_version')).toBe('1');

    // 4. The library sync linked the library-named exercise and left the member's own alone.
    expect(after.exercises['ex-bench'].catalog_key).toBeTruthy();
    expect(after.exercises['ex-bench'].name).toBe('Barbell Bench Press');
    expect(after.exercises['ex-own'].catalog_key).toBeNull();
    expect(after.exercises['ex-own'].name).toBe('Grandpa Farm Carry');

    // 5. The app's own reads see the old history.
    const { getSessionDetail } = await import('@/db/repos/workoutRepo');
    const s1 = await getSessionDetail('s1');
    expect(s1?.exercises.map((g) => [g.exercise.name, g.sets.length])).toEqual([
      ['Barbell Bench Press', 3],
      ['Dumbbell Curl', 1],
    ]);
    const { getAllPrs } = await import('@/db/repos/prRepo');
    expect((await getAllPrs()).map((p) => [p.kind, p.value]).sort()).toEqual([['e1rm', 96], ['weight', 80]]);
    const { getProfile } = await import('@/db/repos/userRepo');
    expect((await getProfile()).name).toBe('Old Member');
    const { hasMemberProfile } = await import('@/onboarding/db/dataActions');
    expect(await hasMemberProfile()).toBe(true); // straight into the app, no welcome screen
    const { listRoutines } = await import('@/tracker/db/routineRepo');
    expect((await listRoutines()).map((r) => [r.name, r.exercises.length])).toEqual([['Push A', 2]]);
  });

  it('the upgraded schema matches a fresh install of this release', async () => {
    const upgraded = await bootRealApp({ before: (d) => loadOld(d, tag) });
    const upgradedSchema = schemaOf(upgraded);
    const fresh = await bootRealApp();
    expect(upgradedSchema).toEqual(schemaOf(fresh));
  });

  it('a second start-up on the upgraded database changes nothing (idempotent)', async () => {
    const db = await bootRealApp({ before: (d) => loadOld(d, tag) });
    const first = snapshot(db);
    const firstSql = db.all('SELECT type, name, sql FROM sqlite_master ORDER BY name');
    await bootRealApp({ db }); // app restart on the same file
    expect(snapshot(db)).toEqual(first);
    expect(db.all('SELECT type, name, sql FROM sqlite_master ORDER BY name')).toEqual(firstSql);
  });
});

describe('a start-up killed half-way through a migration converges on the next launch', () => {
  it('v0.21.0 database with the first v4 column already added (but no version stamp) upgrades cleanly', async () => {
    const db = await bootRealApp({
      before: (d) => {
        loadOld(d, 'v0.21.0');
        // The phone died right after this ALTER: column present, tracker version still 2.
        d.raw.exec('ALTER TABLE exercises ADD COLUMN catalog_key TEXT');
      },
    });
    const fresh = await bootRealApp();
    expect(schemaOf(db)).toEqual(schemaOf(fresh));
    expect(db.count('set_entries')).toBe(5);
    expect(db.all("SELECT value FROM meta WHERE key = 'tracker_schema_version'")).toEqual([{ value: '10' }]);
  });
});

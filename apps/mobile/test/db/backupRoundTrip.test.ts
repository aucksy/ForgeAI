/**
 * Drive backup round trip on a REAL database (behavioural replacement for two source-text
 * checks: v0280 "the Drive backup keeps every column the tracker adds" and v0281 "every table
 * the tracker adds is backed up" — audit QA-12 / QA-22).
 *
 * Every column of every table is filled with a non-NULL value. The list of tables and columns
 * comes from the real schema (`sqlite_master`), not a hand-written list, so a column or table
 * added later fails this test until the backup carries it (or it is listed below as left out
 * on purpose). Then: export → erase → restore → every row and every value is back.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

type Row = Record<string, string | number>;

/** Tables the backup leaves out ON PURPOSE (see src/cloud/snapshot.ts header). */
// + `training_changes` (tracker schema v13): this phone's change counter, kept by triggers — not member data.
const NOT_BACKED_UP = ['meta', 'progress_photos', 'sync_outbox', 'training_changes'];

/** One row per table, every column non-NULL. FK-safe insert order. */
const FULL_ROWS: [string, Row][] = [
  ['user_profile', {
    id: 'p1', name: 'Member', phone: '+919800000001', age: 31, height_cm: 176.5, goal: 'muscle', experience: 'intermediate',
    gym_name: 'Iron Temple', member_since_iso: '2025-11-02', calorie_target: 2600, protein_target_g: 150, carbs_target_g: 300,
    fat_target_g: 70, unit_system: 'imperial', language: 'hi',
  }],
  ['exercises', {
    id: 'ex1', name: 'Own Sled Push', aliases: '["sled"]', muscle_group: 'legs', secondary_muscles: '["glutes"]', equipment: 'other',
    is_compound: 1, increment_kg: 5, catalog_key: 'own-key', log_type: 'distance', load_mode: 'each', bw_share: 0.5,
    muscles: '{"primary":["quads"]}', media_uri: 'file:///m.jpg', media_type: 'image', dist_unit: 'm',
  }],
  ['exercise_prefs', { exercise_id: 'ex1', rest_sec: 150 }],
  ['workout_plans', { id: 'plan1', name: 'PPL', is_active: 1, folder_order: 2, source: 'builder', settings: '{"every":6}' }],
  ['plan_days', { id: 'day1', plan_id: 'plan1', day_type: 'push', day_order: 0, name: 'Push A' }],
  ['plan_exercises', { id: 'pe1', plan_day_id: 'day1', exercise_id: 'ex1', ex_order: 0, target_sets: 4, rep_range_min: 5, rep_range_max: 8,
    sets_json: '[{"type":"warmup"},{"type":"normal","reps":8}]', rest_sec: 120, superset_group: 1, note: 'pause at the bottom' }],
  ['workout_sessions', { id: 's1', date_iso: '2026-03-01', started_at: 1772339400000, ended_at: 1772343300000, day_type: 'push', notes: 'n', source: 'manual', easy_week: 1, title: 'Push A', routine_id: 'day1' }],
  ['set_entries', {
    id: 'se1', session_id: 's1', exercise_id: 'ex1', set_number: 1, weight_kg: 80, reps: 6, is_warmup: 0, rpe: 8.5, set_type: 'drop',
    note: 'slow', superset_group: 1, duration_sec: 61, distance_m: 25, load_mode: 'one', card_index: 1,
  }],
  ['personal_records', { id: 'pr1', exercise_id: 'ex1', kind: 'weight', value: 80, weight_kg: 80, reps: 6, date_iso: '2026-03-01', session_id: 's1' }],
  ['body_weight', { id: 'bw1', date_iso: '2026-03-01', weight_kg: 78.4 }],
  ['body_measurements', { id: 'bm1', date_iso: '2026-03-01', kind: 'waist', value: 84.5 }],
  ['meals', { id: 'm1', date_iso: '2026-03-01', logged_at: 1772339401000, description: 'dal', calories: 420, protein_g: 18, carbs_g: 60, fat_g: 10, source: 'photo', photo_uri: 'file:///meal.jpg' }],
  ['chat_messages', { id: 'c1', role: 'user', kind: 'text', text: 'hi', payload: '{}', image_uri: 'file:///c.jpg', created_at: 1772339402000 }],
];

let db: RealDb;

function rowsOf(table: string): Row[] {
  return db.all<Row>(`SELECT * FROM ${table} ORDER BY rowid`);
}

beforeEach(async () => {
  db = await bootRealApp();
  db.raw.exec('DELETE FROM meta');
  for (const [table, row] of FULL_ROWS) {
    const cols = Object.keys(row);
    db.raw.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]));
  }
});

describe('the Drive backup round trip keeps every table and column of the real schema', () => {
  it('the test row covers every column of every backed-up table (derived from sqlite_master)', () => {
    const missing: string[] = [];
    for (const t of db.tables().filter((x) => !NOT_BACKED_UP.includes(x))) {
      const row = FULL_ROWS.find(([name]) => name === t)?.[1];
      for (const c of db.columns(t)) if (!row || !(c.name in row)) missing.push(`${t}.${c.name}`);
    }
    // A new table or column: add it to FULL_ROWS above (and to the backup, or to NOT_BACKED_UP).
    expect(missing).toEqual([]);
  });

  it('export → erase → restore brings back every row and every value', async () => {
    const before = Object.fromEntries(db.tables().map((t) => [t, rowsOf(t)]));
    const { exportSnapshot, parseSnapshot, importSnapshot } = await import('@/cloud/snapshot');
    const json = await exportSnapshot();
    const { eraseAllData } = await import('@/onboarding/db/dataActions');
    await eraseAllData();
    expect(db.count('workout_sessions')).toBe(0);
    await importSnapshot(parseSnapshot(json));

    const lost: string[] = [];
    for (const t of db.tables().filter((x) => !NOT_BACKED_UP.includes(x))) {
      const after = rowsOf(t);
      if (JSON.stringify(after) !== JSON.stringify(before[t])) lost.push(`${t}: ${JSON.stringify(before[t])} → ${JSON.stringify(after)}`);
    }
    expect(lost).toEqual([]);
  });

  it('only meta, progress photos, the push outbox and the change counter stay out of the backup (by design)', async () => {
    const { exportSnapshot } = await import('@/cloud/snapshot');
    const env = JSON.parse(await exportSnapshot()) as { tables: Record<string, unknown[]> };
    const out = db.tables().filter((t) => !(t in env.tables));
    expect(out).toEqual(NOT_BACKED_UP);
  });
});

describe('review: a moved imported workout stays recognised after a Drive restore (HI-03)', () => {
  it('the remembered first starts (importOriginalStarts) go with the backup and come back', async () => {
    const value = JSON.stringify({ 'w-moved': { startedAt: 1735722000000, dateISO: '2025-01-01' } });
    db.raw.run("INSERT INTO meta(key, value) VALUES('importOriginalStarts', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [value]);
    const { exportSnapshot, parseSnapshot, importSnapshot } = await import('@/cloud/snapshot');
    const json = await exportSnapshot();
    const { eraseAllData } = await import('@/onboarding/db/dataActions');
    await eraseAllData();
    db.raw.run("DELETE FROM meta WHERE key = 'importOriginalStarts'");
    await importSnapshot(parseSnapshot(json));
    expect(db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'importOriginalStarts'")[0]?.value).toBe(value);
    // Nothing else of meta travels (identity, the seeded flag, the last-backup time stay local).
    expect(Object.keys((JSON.parse(json) as { meta?: Record<string, string> }).meta ?? {})).toEqual(['importOriginalStarts']);
  });
});

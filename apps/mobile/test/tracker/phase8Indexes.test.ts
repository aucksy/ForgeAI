/**
 * Audit Phase 8, packet A — the indexes added for five years of data, checked with SQLite's own
 * EXPLAIN QUERY PLAN on the app's real schema (sql.js). Timings on the 5-year history are in
 * test/perf/phase8a.perf.ts; these pin that each index is really the one SQLite picks.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

let db: RealDb;

const plan = (sql: string, params: (string | number)[] = []): string =>
  db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params).map((r) => r.detail).join(' | ');

const indexes = (d: RealDb): string[] =>
  d.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name").map((r) => r.name);

describe('Phase 8 indexes', () => {
  beforeEach(async () => {
    db = await bootRealApp();
  });

  it('start-up adds them on a fresh install and on an upgraded phone (no duplicates of the frozen ones)', async () => {
    for (const name of ['idx_sets_ex_work', 'idx_sets_load_mode', 'idx_pr_session', 'idx_sessions_date_start_id']) expect(indexes(db)).toContain(name);
    // Not added: SQLite never picks it for these reads (they find sets by exercise first).
    expect(db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND sql LIKE '%workout_sessions%(started_at)%'")).toEqual([]);
    const old = await bootRealApp({
      before: (d) => {
        d.raw.exec(readFileSync(join(__dirname, '../fixtures/db/schema-v0.29.1.sql'), 'utf8'));
      },
    });
    expect(indexes(old)).toEqual(indexes(db));
  });

  it('the record check each saved set runs (every row of an import) reads the covering index only', () => {
    expect(
      plan(
        `SELECT MAX(se.weight_kg) AS best_weight FROM set_entries se JOIN workout_sessions ws ON ws.id = se.session_id
          WHERE se.exercise_id = ? AND se.is_warmup = 0 AND ws.started_at < ? AND ws.id <> ?`,
        ['x', 1, 'y'],
      ),
    ).toContain('USING COVERING INDEX idx_sets_ex_work (exercise_id=? AND is_warmup=?)');
  });

  it('"sets with their own counting" use the partial index (before: every set of the lifts)', () => {
    expect(plan('SELECT id, load_mode FROM set_entries WHERE load_mode IS NOT NULL AND exercise_id IN (?, ?)', ['a', 'b'])).toContain(
      'USING INDEX idx_sets_load_mode (exercise_id=?)',
    );
  });

  it("a workout's records are found by workout (before: every record scanned)", () => {
    expect(plan('DELETE FROM personal_records WHERE session_id = ?', ['s'])).toContain('idx_pr_session (session_id=?)');
    expect(plan('SELECT * FROM personal_records WHERE session_id = ? AND exercise_id = ? AND kind = ?', ['s', 'e', 'k'])).toMatch(
      /idx_pr_session|idx_pr_exercise/,
    );
  });

  it("the Targets' and Start's batched history reads find each lift's workouts in the covering index", () => {
    const sql = `WITH g AS (SELECT s2.exercise_id AS ex, s2.session_id AS sid FROM set_entries s2
                  WHERE s2.exercise_id IN (?, ?) AND s2.is_warmup = 0 GROUP BY s2.exercise_id, s2.session_id)
                 SELECT g.ex, ROW_NUMBER() OVER (PARTITION BY g.ex ORDER BY w2.started_at DESC) FROM g JOIN workout_sessions w2 ON w2.id = g.sid`;
    expect(plan(sql, ['a', 'b'])).toContain('USING COVERING INDEX idx_sets_ex_work (exercise_id=? AND is_warmup=?)');
  });
});

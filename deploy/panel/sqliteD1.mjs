// A stand-in for Cloudflare D1 `forgeai-web` in tests (25 Oct 2026): a real SQLite database in
// memory (node:sqlite, Node 22+) built from the real migrations in ./migrations, behind the small
// part of D1's API the Workers use: prepare(sql).bind(...).first() / .all() / .run(). The SQL the
// Workers send runs for real, so a column or a WHERE that is wrong fails here as it would live.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = new URL('./migrations/', import.meta.url);

/** `skip`: migration file names to leave out (a test of the Worker before that migration is applied live). */
export function sqliteD1({ skip = [] } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && !skip.includes(n)).sort()) {
    db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
  }
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  const d1 = { sqlite: db, prepare: (sql) => statement(sql) };
  // D1's batch (review round 3, R-550): the statements run in order inside ONE transaction; when one fails, none of
  // them is kept (https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). The statements go through
  // d1.prepare, so a test that swaps prepare to make one fail sees the whole batch undone, as it would live.
  d1.batch = async (statements) => {
    db.exec('BEGIN');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return d1;
}

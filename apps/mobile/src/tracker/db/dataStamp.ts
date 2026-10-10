/**
 * Audit Phase 8 (packet C) — "has anything been saved since?", in one tiny read.
 *
 * Home, History and the volume rule's context used to read everything again on every visit or
 * page, even when nothing had changed. They now keep what they read together with this stamp
 * and read again only when it moves.
 *
 * The stamp is SQLite's own write counters, so no table can be forgotten:
 *  - `total_changes()` moves with every row THIS connection inserts, updates or deletes (an
 *    edited workout that deletes and re-inserts its sets with the same row numbers still moves
 *    it — the trap that counts and MAX(rowid) fall into);
 *  - `PRAGMA data_version` moves with every commit from ANOTHER connection (expo-sqlite runs
 *    `withExclusiveTransactionAsync` — imports, demo data, erase, restore — on its own);
 *  - the handle's own number: a re-opened database (restore, a test's fresh database) starts
 *    its counters again from zero, so the same counts on a new handle never match.
 *
 * It errs one way only: ANY write (a draft save mid-workout, a setting) moves it, so a reader
 * sometimes reads again when it did not need to — never the other way round.
 *
 * Audit Phase 8 review — a write that rolls back: while a queued write (an import, a Finish, an
 * edit, a merge) is open on the shared connection, a read sees its uncommitted rows, and a
 * rollback takes the rows away but NOT the counters. A stamp taken then would mark the rows
 * that vanished as "already shown". So while a write runs there is no stamp (null: read again,
 * keep nothing). A stamp taken BEFORE a write began still moves with the write's own rows, so
 * whatever was read under it is read again afterwards.
 */
import { getDb } from '@/db';
import { inWriteQueue } from '@/db/writeQueue';

const handleIds = new WeakMap<object, number>();
let nextHandle = 1;

/** A string that changes whenever anything is written to the database; null = can't tell. */
export async function dataStamp(): Promise<string | null> {
  if (inWriteQueue()) return null;
  const db = getDb();
  let handle = handleIds.get(db);
  if (handle == null) {
    handle = nextHandle;
    nextHandle += 1;
    handleIds.set(db, handle);
  }
  let changes: unknown = null;
  let version: unknown = null;
  try {
    const r = await db.getFirstAsync<{ c: number; v: number }>(
      'SELECT total_changes() AS c, (SELECT data_version FROM pragma_data_version) AS v',
    );
    changes = r?.c;
    version = r?.v;
  } catch {
    // An SQLite built without the pragma functions: the same two numbers in two reads.
    const c = await db.getFirstAsync<{ c: number }>('SELECT total_changes() AS c');
    const v = await db.getFirstAsync<{ data_version: number }>('PRAGMA data_version');
    changes = c?.c;
    version = v?.data_version;
  }
  // A write that began during the read: its rows may yet roll back.
  if (changes == null || version == null || inWriteQueue()) return null;
  return `${handle}:${String(changes)}:${String(version)}`;
}

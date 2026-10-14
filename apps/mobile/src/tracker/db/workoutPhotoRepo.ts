/**
 * Photos on a workout — the table and its reads/writes (15 Oct 2026).
 *
 * ADDITIVE ONLY, like `initTrackerSchema()` / `initMemberSchema()`: `schema.ts` stays frozen and
 * this new table is created by its own idempotent `initWorkoutPhotoSchema()`, run at start-up in
 * the same 'upgrade' step (`onboardingStore.openAndUpgrade`, and `test/helpers/realDb.runStartup`).
 * It needs no version flag: CREATE … IF NOT EXISTS is a no-op once the table is there, so an
 * erase (which keeps no flag for it) or a killed start-up simply creates it again.
 *
 * One row per photo: the workout it belongs to (`session_id`), the picture's path in the app's
 * own `workout-photos/` folder, its place in the workout's row of photos (`position`, 0 first)
 * and when it was added. No foreign key on purpose: a Drive restore or an import rebuilds
 * `workout_sessions`, and a row whose workout is gone is swept with its FILE
 * (`orphanWorkoutPhotos` → `sweepOrphanWorkoutPhotos`) — a cascade would drop the row and leave
 * the picture on the phone.
 *
 * Backup: NOT in the ForgeAI Drive backup (`src/cloud/snapshot.ts` lists the tables it carries;
 * this one is left out exactly like `progress_photos` — the pictures stay on this phone, and a
 * restore must neither drop them nor bring back rows whose files are gone). Not in the opt-in
 * Android `photo-backup/` copy either (that is for progress photos only).
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

/** Hevy allows 3 pictures (or 2 + a video) per workout; the owner chose 4 photos for ForgeAI. */
export const WORKOUT_PHOTO_LIMIT = 4;

export interface WorkoutPhoto {
  id: string;
  sessionId: string;
  uri: string;
  position: number;
  createdAt: number;
}

interface Row {
  id: string;
  session_id: string;
  uri: string;
  position: number;
  created_at: number;
}

const toPhoto = (r: Row): WorkoutPhoto => ({ id: r.id, sessionId: r.session_id, uri: r.uri, position: Number(r.position), createdAt: Number(r.created_at) });

/** Create the table and its index (idempotent; run at every start-up). */
export async function initWorkoutPhotoSchema(): Promise<void> {
  await getDb().execAsync(
    `CREATE TABLE IF NOT EXISTS workout_photos (
       id TEXT PRIMARY KEY,
       session_id TEXT NOT NULL,
       uri TEXT NOT NULL,
       position INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`,
  );
  await getDb().execAsync('CREATE INDEX IF NOT EXISTS idx_workout_photos_session ON workout_photos(session_id, position)');
}

/** One workout's photos, in their order. */
export async function getWorkoutPhotos(sessionId: string): Promise<WorkoutPhoto[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT id, session_id, uri, position, created_at FROM workout_photos WHERE session_id = ? ORDER BY position, created_at',
    [sessionId],
  );
  return rows.map(toPhoto);
}

/** Many workouts' photo paths at once (the Profile feed's strips): session id → paths in order. */
export async function getWorkoutPhotoUris(sessionIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = [...new Set(sessionIds)];
  // SQLite's default limit is 999 parameters; a feed page is 30–200 workouts.
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const rows = await getDb().getAllAsync<Row>(
      `SELECT id, session_id, uri, position, created_at FROM workout_photos
        WHERE session_id IN (${part.map(() => '?').join(', ')}) ORDER BY session_id, position, created_at`,
      part,
    );
    for (const r of rows) {
      const list = out.get(r.session_id) ?? [];
      list.push(r.uri);
      out.set(r.session_id, list);
    }
  }
  return out;
}

/** Why a photo row was not written. */
export class WorkoutPhotoRefused extends Error {
  constructor(readonly why: 'limit' | 'gone') {
    super(why === 'limit' ? 'workout-photo-limit' : 'workout-photo-gone');
    this.name = 'WorkoutPhotoRefused';
  }
}

/**
 * Add one photo row at the end of the workout's row — in ONE statement, so two quick adds can
 * never make five, and a workout deleted meanwhile gets no row. Throws `WorkoutPhotoRefused`.
 */
export async function insertWorkoutPhoto(p: { id: string; sessionId: string; uri: string; createdAt: number }): Promise<WorkoutPhoto> {
  let position = 0;
  await enqueueWrite(async () => {
    const res = await getDb().runAsync(
      `INSERT INTO workout_photos(id, session_id, uri, position, created_at)
       SELECT ?, ?, ?, COALESCE(c.mx + 1, 0), ?
         FROM (SELECT COUNT(*) AS n, MAX(position) AS mx FROM workout_photos WHERE session_id = ?) AS c
        WHERE c.n < ? AND EXISTS (SELECT 1 FROM workout_sessions WHERE id = ?)`,
      [p.id, p.sessionId, p.uri, p.createdAt, p.sessionId, WORKOUT_PHOTO_LIMIT, p.sessionId],
    );
    if (res.changes === 0) {
      const there = await getDb().getFirstAsync<{ id: string }>('SELECT id FROM workout_sessions WHERE id = ?', [p.sessionId]);
      throw new WorkoutPhotoRefused(there ? 'limit' : 'gone');
    }
    const row = await getDb().getFirstAsync<{ position: number }>('SELECT position FROM workout_photos WHERE id = ?', [p.id]);
    position = Number(row?.position ?? 0);
  });
  return { id: p.id, sessionId: p.sessionId, uri: p.uri, position, createdAt: p.createdAt };
}

/** Remove one photo's row. */
export async function deleteWorkoutPhotoRow(id: string): Promise<void> {
  await enqueueWrite(() => getDb().runAsync('DELETE FROM workout_photos WHERE id = ?', [id]));
}

/** Remove every photo row of one workout; returns the paths, so the files can go too. */
export async function deleteWorkoutPhotoRows(sessionId: string): Promise<string[]> {
  let uris: string[] = [];
  await enqueueWrite(async () => {
    const rows = await getDb().getAllAsync<{ uri: string }>('SELECT uri FROM workout_photos WHERE session_id = ?', [sessionId]);
    uris = rows.map((r) => r.uri);
    if (uris.length > 0) await getDb().runAsync('DELETE FROM workout_photos WHERE session_id = ?', [sessionId]);
  });
  return uris;
}

/**
 * Rows whose workout no longer exists (an import's Replace, "Remove demo data", a restore from an
 * older backup) are removed; returns their paths, so the files can go too.
 */
export async function deleteOrphanWorkoutPhotoRows(): Promise<string[]> {
  let uris: string[] = [];
  await enqueueWrite(async () => {
    const rows = await getDb().getAllAsync<{ id: string; uri: string }>(
      'SELECT p.id, p.uri FROM workout_photos p WHERE NOT EXISTS (SELECT 1 FROM workout_sessions s WHERE s.id = p.session_id)',
    );
    uris = rows.map((r) => r.uri);
    for (const r of rows) await getDb().runAsync('DELETE FROM workout_photos WHERE id = ?', [r.id]);
  });
  return uris;
}

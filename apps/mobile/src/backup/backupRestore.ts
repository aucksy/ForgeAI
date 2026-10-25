/**
 * "Restore from a backup", step 2 (R-123): put a backup on this phone.
 *
 *  REPLACE ("Replace everything on this phone"): the phone's workouts, routines and folders, own
 *    exercises, rest times, body weight, measurements, food log and coach chat go, and the backup's
 *    come in — the SAME ids, so routines keep their order and workouts keep their routine. The
 *    backup's settings and profile (never the phone number) replace the phone's. Photos already on
 *    the phone stay; the backup's are added. A folder sent by the gym stays (the gym sends it), and
 *    nothing about the gym link, sign-in or membership is touched.
 *  ADD ("Add to what's here"): only what the phone does not have. A workout is already here when it
 *    has the same id, the same content, or the same day and start (within 30 minutes, the import's
 *    own rule, `isAlreadyHere`), so a history already imported from a Hevy file never comes twice.
 *    The phone's profile and settings stay.
 *
 * Exercises are matched by the backup's refs (pack.ts): a library exercise by its library key, the
 * member's own by its id (or an own exercise of the same name already here). Records are worked
 * out again from the sets, as an import does. Before anything changes, a copy of the database is
 * kept in memory (importSafety's safety copy): `undoRestore` puts the phone back for as long as
 * the member stays on the screen. Photos are copied out of the ZIP first, a chunk at a time; a
 * restore that fails deletes them again and changes nothing in the database.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { applyInTransaction, forgetCopiedState, readLocalItems } from '@/cloud/copyLocal';
import type { LocalItem, MergeApply, MergePlan } from '@/cloud/copyPlan';
import { packHash, parseRef, unpackPrefs, unpackProfile, unpackWorkout } from '@/cloud/pack';
import { RERUN_AFTER_RESTORE } from '@/cloud/snapshot';
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { uuid } from '@/lib/uuid';
import { completeOnboarding, countOwnWorkouts, hasMemberProfile } from '@/onboarding/db/dataActions';
import { restoreSafetyCopy, takeSafetyCopy, type SafetyCopy } from '@/onboarding/db/importSafety';
import { isAlreadyHere, type KnownWorkout } from '@/tracker/services/hevyImport';
import { reconcilePrsForExercises } from '@/tracker/services/prRebuild';

import { itemData, photoExt, safeId, type BackupFile, type BackupItem, type BackupPhoto, type SettingsBlob } from './backupFormat';
import { BACKUP_META_KEYS, BACKUP_ROW_TABLES } from './backupCollect';
import type { BackupIo } from './backupIo';
import type { OpenedBackup } from './backupOpen';
import type { SettingsIo } from './backupSettings';
import { copyEntry, type ZipSource } from './zipStore';

type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

export type RestoreMode = 'replace' | 'add';

// ------------------------------------------------------------------ the plan (PURE)

export interface AddPlan {
  apply: BackupItem[];
  /** Workouts left out because the phone already has them. */
  alreadyHere: number;
}

function knownOf(data: string): KnownWorkout | null {
  const w = unpackWorkout(data);
  return w ? { dateISO: w.session.date_iso, startedAt: w.session.started_at, endedAt: w.session.ended_at, title: w.session.title, dayType: w.session.day_type } : null;
}

/** What "Add to what's here" brings in (see the file note). PURE. */
export function planAdd(items: readonly BackupItem[], local: readonly LocalItem[]): AddPlan {
  const here = new Set(local.map((l) => `${l.kind}:${l.id}`));
  const contents = new Set(local.filter((l) => l.kind === 'w').map((l) => l.hash));
  const starts = local.filter((l) => l.kind === 'w').map((l) => knownOf(l.data)).filter((k): k is KnownWorkout => k != null);
  const localPrefs = new Set<string>();
  for (const l of local) if (l.kind === 'p') for (const p of unpackPrefs(l.data) ?? []) localPrefs.add(p.ref);
  const out: AddPlan = { apply: [], alreadyHere: 0 };
  for (const it of items) {
    const [kind, id] = it;
    if (kind === 'u') continue; // the phone's own profile stays
    if (kind === 'p') {
      // Only the rest times and record starts of exercises the phone has none for.
      const rows = (it[2] as unknown[]).filter((r) => Array.isArray(r) && typeof r[0] === 'string' && !localPrefs.has(r[0]));
      if (rows.length > 0) out.apply.push(['p', id, rows]);
      continue;
    }
    if (here.has(`${kind}:${id}`)) {
      if (kind === 'w') out.alreadyHere++;
      continue;
    }
    if (kind === 'w') {
      const data = itemData(it);
      const known = knownOf(data);
      if (contents.has(packHash(data)) || (known && isAlreadyHere(known, starts) !== null)) {
        out.alreadyHere++;
        continue;
      }
      if (known) starts.push(known);
    }
    out.apply.push(it);
  }
  return out;
}

/** The workouts' starts in a backup, for "how many of this phone's workouts are not in it". PURE. */
export function backupStarts(file: Pick<BackupFile, 'items'>): { dateISO: string; startedAt: number }[] {
  const out: { dateISO: string; startedAt: number }[] = [];
  for (const it of file.items) {
    if (it[0] !== 'w') continue;
    const k = knownOf(itemData(it));
    if (k) out.push({ dateISO: k.dateISO, startedAt: k.startedAt });
  }
  return out;
}

const toApply = (items: readonly BackupItem[]): MergeApply[] => items.map((it) => ({ kind: it[0], id: it[1], data: itemData(it), editedAt: 0 }));

// ------------------------------------------------------------------ the database part

export interface PlacedPhoto {
  photo: BackupPhoto;
  uri: string;
}

export interface DbOutcome {
  workouts: number;
  folders: number;
  routines: number;
  measurements: number;
  alreadyHere: number;
  skipped: number;
  sessionIds: string[];
  exerciseIds: string[];
  /** Rows the restore wrote a picture onto (exercise: the exercise ids whose picture it set). */
  photoRows: { progress: string[]; workout: string[]; exercise: string[] };
  profilePhoto: string | null;
  /** Placed photo files no row points at (their workout is not here): deleted after. */
  unused: string[];
}

const GYM_FOLDER = `settings LIKE '%"fromGym"%'`;

/** This phone's row for a backup's exercise ref (library key, else own id), or null. */
async function exerciseIdOf(tx: Tx, ref: string): Promise<string | null> {
  const r = parseRef(ref);
  if (!r) return null;
  const row = r.library
    ? await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE catalog_key = ? ORDER BY rowid LIMIT 1', [r.key])
    : await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [r.id]);
  return row?.id ?? null;
}

async function hasTable(tx: Tx, name: string): Promise<boolean> {
  return (await tx.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name])) != null;
}

async function setMetaTx(tx: Tx, key: string, value: string | null): Promise<void> {
  if (value == null) await tx.runAsync('DELETE FROM meta WHERE key = ?', [key]);
  else await tx.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

/** Empty what Replace replaces (gym folders, photos, library and the gym link stay). */
async function wipeForReplace(tx: Tx, keepOwnIds: ReadonlySet<string>): Promise<void> {
  await tx.runAsync('DELETE FROM set_entries');
  await tx.runAsync('DELETE FROM personal_records');
  await tx.runAsync('DELETE FROM workout_sessions');
  await tx.runAsync(`DELETE FROM plan_exercises WHERE plan_day_id IN (SELECT d.id FROM plan_days d JOIN workout_plans p ON p.id = d.plan_id WHERE NOT (p.${GYM_FOLDER}) OR p.settings IS NULL)`);
  await tx.runAsync(`DELETE FROM plan_days WHERE plan_id IN (SELECT id FROM workout_plans WHERE NOT (${GYM_FOLDER}) OR settings IS NULL)`);
  await tx.runAsync(`DELETE FROM workout_plans WHERE NOT (${GYM_FOLDER}) OR settings IS NULL`);
  await tx.runAsync('DELETE FROM exercise_prefs');
  await tx.runAsync('DELETE FROM body_weight');
  await tx.runAsync('DELETE FROM body_measurements');
  for (const t of Object.keys(BACKUP_ROW_TABLES)) if (await hasTable(tx, t)) await tx.runAsync(`DELETE FROM ${t}`);
  // The member's own exercises the backup does not have and nothing kept still uses.
  const own = await tx.getAllAsync<{ id: string }>(
    'SELECT id FROM exercises WHERE catalog_key IS NULL AND id NOT IN (SELECT exercise_id FROM plan_exercises)',
  );
  for (const e of own) if (!keepOwnIds.has(e.id)) await tx.runAsync('DELETE FROM exercises WHERE id = ?', [e.id]);
  // Not the sample member any more.
  await tx.runAsync("DELETE FROM meta WHERE key = 'demo_data'");
}

/**
 * The whole database part, inside the caller's transaction. `placed`: the photos already copied out
 * of the ZIP (rows are written for them here).
 */
export async function restoreInTransaction(tx: Tx, file: BackupFile, mode: RestoreMode, placed: readonly PlacedPhoto[]): Promise<DbOutcome> {
  const local = mode === 'add' ? await readLocalItems(tx) : [];
  let items: BackupItem[];
  let alreadyHere = 0;
  if (mode === 'replace') {
    await wipeForReplace(tx, new Set(file.items.filter((i) => i[0] === 'x').map((i) => i[1])));
    items = file.items;
  } else {
    const plan = planAdd(file.items, local);
    items = plan.apply;
    alreadyHere = plan.alreadyHere;
  }

  const merge: MergePlan = { apply: toApply(items), remove: [], remember: [], serverDeletes: [], keptLocal: 0 };
  const applied = await applyInTransaction(tx, merge);

  // Food log and coach chat: as they were (an id already here stays as it is).
  for (const [table, cols] of Object.entries(BACKUP_ROW_TABLES)) {
    const rows = file.rows[table];
    if (!rows || rows.length === 0 || !(await hasTable(tx, table))) continue;
    for (const r of rows) {
      if (typeof r.id !== 'string') continue;
      await tx.runAsync(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => r[c] ?? null));
    }
  }

  // Photos copied in: their rows (a workout photo only when its workout is here).
  const out: DbOutcome['photoRows'] = { progress: [], workout: [], exercise: [] };
  const unused: string[] = [];
  let profilePhoto: string | null = null;
  for (const p of placed) {
    if (p.photo.kind === 'progress') {
      const r = await tx.runAsync('INSERT OR IGNORE INTO progress_photos (id, date_iso, uri, created_at) VALUES (?, ?, ?, ?)', [
        p.photo.id,
        p.photo.date ?? new Date().toISOString().slice(0, 10),
        p.uri,
        p.photo.createdAt ?? Date.now(),
      ]);
      if (r.changes > 0) out.progress.push(p.photo.id);
      else unused.push(p.uri);
    } else if (p.photo.kind === 'workout') {
      const session = p.photo.sessionId ? await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_sessions WHERE id = ?', [p.photo.sessionId]) : null;
      if (!session || !(await hasTable(tx, 'workout_photos'))) {
        unused.push(p.uri);
        continue;
      }
      const r = await tx.runAsync('INSERT OR IGNORE INTO workout_photos (id, session_id, uri, position, created_at) VALUES (?, ?, ?, ?, ?)', [
        p.photo.id,
        session.id,
        p.uri,
        p.photo.position ?? 0,
        p.photo.createdAt ?? Date.now(),
      ]);
      if (r.changes > 0) out.workout.push(p.photo.id);
      else unused.push(p.uri);
    } else if (p.photo.kind === 'exercise') {
      const id = p.photo.ref ? await exerciseIdOf(tx, p.photo.ref) : null;
      if (!id) {
        unused.push(p.uri);
        continue;
      }
      // Add keeps a picture the phone already has for that exercise.
      const r = await tx.runAsync(
        `UPDATE exercises SET media_uri = ?, media_type = ? WHERE id = ?${mode === 'add' ? ' AND media_uri IS NULL' : ''}`,
        [p.uri, p.photo.mediaType === 'video' ? 'video' : 'image', id],
      );
      if (r.changes > 0) out.exercise.push(id);
      else unused.push(p.uri);
    } else {
      await tx.runAsync('UPDATE user_profile SET photo_uri = ?', [p.uri]);
      profilePhoto = p.uri;
    }
  }

  // What the member changed on library exercises (Add: only where the phone has nothing of its own).
  for (const [ref, logType, loadMode] of file.libraryEdits) {
    const r = parseRef(ref);
    if (!r || !r.library) continue;
    const keepMine = mode === 'add';
    await tx.runAsync(
      keepMine
        ? 'UPDATE exercises SET log_type = COALESCE(log_type, ?), load_mode = COALESCE(load_mode, ?) WHERE catalog_key = ?'
        : 'UPDATE exercises SET log_type = COALESCE(?, log_type), load_mode = COALESCE(?, load_mode) WHERE catalog_key = ?',
      [logType, loadMode, r.key],
    );
  }

  // Hidden library exercises, by key → this phone's rows.
  const hidden: string[] = [];
  for (const ref of file.hiddenExercises) {
    const r = parseRef(ref);
    if (!r || !r.library) continue;
    const row = await tx.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE catalog_key = ? ORDER BY rowid LIMIT 1', [r.key]);
    if (row) hidden.push(row.id);
  }
  const hiddenNow = await tx.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'hidden_exercises'");
  let keep: string[] = [];
  if (mode === 'add' && hiddenNow?.value) {
    try {
      const v: unknown = JSON.parse(hiddenNow.value);
      if (Array.isArray(v)) keep = v.filter((x): x is string => typeof x === 'string');
    } catch {
      keep = [];
    }
  }
  const allHidden = [...new Set([...keep, ...hidden])];
  if (mode === 'replace' || hidden.length > 0) await setMetaTx(tx, 'hidden_exercises', allHidden.length > 0 ? JSON.stringify(allHidden) : null);

  // The import marks that belong to the workouts.
  for (const key of BACKUP_META_KEYS) {
    const v = file.meta[key];
    if (mode === 'replace') await setMetaTx(tx, key, typeof v === 'string' ? v : null);
    else if (typeof v === 'string' && (await tx.getFirstAsync<{ key: string }>('SELECT key FROM meta WHERE key = ?', [key])) == null) await setMetaTx(tx, key, v);
  }
  if (mode === 'replace') {
    // The restored data may be from before a one-time repair: they run again at the next start.
    await tx.runAsync(`DELETE FROM meta WHERE key IN (${RERUN_AFTER_RESTORE.map(() => '?').join(', ')})`, [...RERUN_AFTER_RESTORE]);
    // The cloud copy's memory no longer describes this phone (snapshot.ts does the same).
    await forgetCopiedState(tx);
  }

  const kinds = (k: string): BackupItem[] => items.filter((i) => i[0] === k);
  return {
    workouts: applied.workouts,
    folders: kinds('r').length,
    routines: kinds('r').reduce((s, r) => s + (Array.isArray(r[2][2]) ? (r[2][2] as unknown[]).length : 0), 0),
    measurements: kinds('m').length + kinds('b').length,
    alreadyHere,
    skipped: applied.skipped.length,
    sessionIds: kinds('w').map((w) => w[1]),
    exerciseIds: applied.exerciseIds,
    photoRows: out,
    profilePhoto,
    unused,
  };
}

// ------------------------------------------------------------------ the whole restore

export interface RestoreProgress {
  step: 'photos' | 'data' | 'records';
  done: number;
  total: number;
}

export interface UndoToken {
  mode: RestoreMode;
  copy: SafetyCopy;
  sessionIds: string[];
  photoRows: { progress: string[]; workout: string[]; exercise: string[] };
  files: string[];
  settings: SettingsBlob | null;
}

export type RestoreResult =
  | { kind: 'restored'; outcome: DbOutcome; photos: number; photosFailed: number; healthConnectWasOn: boolean; undo: UndoToken }
  | { kind: 'no-space'; needBytes: number; freeBytes: number };

export const RESTORE_SPARE_BYTES = 30 * 1024 * 1024;

const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** What this phone holds now, for the choices (the sample member's workouts not counted). */
export async function phoneContents(): Promise<{ workouts: number; folders: number; measurements: number }> {
  const db = getDb();
  const r = await db.getFirstAsync<{ f: number; m: number }>(
    'SELECT (SELECT COUNT(*) FROM workout_plans) AS f, (SELECT COUNT(*) FROM body_weight) + (SELECT COUNT(*) FROM body_measurements) AS m',
  );
  return { workouts: await countOwnWorkouts().catch(() => 0), folders: r?.f ?? 0, measurements: r?.m ?? 0 };
}

/** The photos a restore copies in: what the phone does not have yet. */
async function photosToBring(file: BackupFile, mode: RestoreMode): Promise<BackupPhoto[]> {
  const db = getDb();
  const progress = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM progress_photos')).map((r) => r.id));
  const workout = new Set(
    (await db.getAllAsync<{ id: string }>('SELECT id FROM workout_photos').catch(() => [] as { id: string }[])).map((r) => r.id),
  );
  const profile = await db.getFirstAsync<{ photo_uri: string | null }>('SELECT photo_uri FROM user_profile LIMIT 1').catch((e: unknown) => {
    console.warn('[backup] the profile photo could not be read', e);
    return null;
  });
  const withMedia = new Set<string>();
  for (const e of await db.getAllAsync<{ id: string; catalog_key: string | null }>('SELECT id, catalog_key FROM exercises WHERE media_uri IS NOT NULL')) {
    withMedia.add(e.catalog_key ? `c:${e.catalog_key}` : `x:${e.id}`);
  }
  return file.photos.filter((p) => {
    if (p.kind === 'progress') return !progress.has(p.id);
    if (p.kind === 'workout') return !workout.has(p.id);
    if (p.kind === 'exercise') return p.ref != null && (mode === 'replace' || !withMedia.has(p.ref));
    return mode === 'replace' || !profile?.photo_uri;
  });
}

function destFor(io: BackupIo, p: BackupPhoto): string {
  const ext = photoExt(p.file);
  if (p.kind === 'progress') return `${io.docDir}progress-photos/${safeId(p.id) ?? uuid()}.${ext}`;
  if (p.kind === 'workout') return `${io.docDir}workout-photos/${safeId(p.id) ?? uuid()}.${ext}`;
  if (p.kind === 'exercise') return `${io.docDir}exercise-media/${uuid()}.${photoExt(p.file, p.mediaType === 'video')}`;
  return `${io.docDir}profile-photo/${uuid()}.${ext}`;
}

/**
 * A new phone on the welcome screen has no profile yet: make it from the backup's (the welcome's
 * own path: the profile row and the exercise library), so the restore has a member to restore into.
 */
export async function ensureProfileFor(file: BackupFile): Promise<void> {
  if (await hasMemberProfile()) return;
  const u = file.items.find((i) => i[0] === 'u');
  const p = u ? unpackProfile(itemData(u)) : null;
  const goal = p && ['muscle', 'fat_loss', 'strength', 'general'].includes(p.goal) ? (p.goal as 'muscle') : 'general';
  const experience = p && ['beginner', 'intermediate', 'advanced'].includes(p.experience) ? (p.experience as 'beginner') : 'beginner';
  await completeOnboarding({
    name: p?.name?.trim() || 'Member',
    phoneE164: null,
    goal,
    experience,
    age: p?.age ?? 0,
    heightCm: p?.height_cm ?? 0,
    gymName: '',
    bodyWeightKg: null,
    targets: { calorieTarget: p?.calorie_target ?? 0, proteinTargetG: p?.protein_target_g ?? 0, carbsTargetG: p?.carbs_target_g ?? 0, fatTargetG: p?.fat_target_g ?? 0 },
  });
}

export async function restoreBackup(
  io: BackupIo,
  opened: OpenedBackup,
  mode: RestoreMode,
  o: { settings: SettingsIo; onProgress?: (p: RestoreProgress) => void },
): Promise<RestoreResult> {
  const { file } = opened;
  // Room first: nothing is written (not even a new phone's profile) when the photos would not fit.
  const bring = await photosToBring(file, mode);
  const needBytes = bring.reduce((s, p) => s + (opened.entries.get(p.file)?.size ?? 0), 0);
  const free = io.freeBytes();
  if (free != null && needBytes + RESTORE_SPARE_BYTES > free) return { kind: 'no-space', needBytes: needBytes + RESTORE_SPARE_BYTES, freeBytes: free };
  await ensureProfileFor(file);

  const copy = await takeSafetyCopy();
  const oldSettings = mode === 'replace' ? await o.settings.read() : null;

  // 1. The pictures, out of the ZIP, a chunk at a time.
  const placed: PlacedPhoto[] = [];
  let failed = 0;
  if (bring.length > 0) {
    const h = io.openRead(opened.uri);
    try {
      const src: ZipSource = { size: h.size, readAt: (off, n) => h.readAt(off, n) };
      for (const [i, p] of bring.entries()) {
        o.onProgress?.({ step: 'photos', done: i, total: bring.length });
        const entry = opened.entries.get(p.file);
        if (!entry) {
          failed++;
          continue;
        }
        const dest = destFor(io, p);
        try {
          io.mkdir(dest.slice(0, dest.lastIndexOf('/') + 1));
          const w = io.openWrite(dest);
          try {
            await copyEntry(src, entry, (chunk) => w.write(chunk));
          } finally {
            w.close();
          }
          placed.push({ photo: p, uri: dest });
        } catch (e) {
          console.warn('[backup] a photo could not be put back', e);
          io.remove(dest);
          failed++;
        }
        await pause();
      }
    } finally {
      h.close();
    }
  }

  // 2. The database, in one go.
  o.onProgress?.({ step: 'data', done: 0, total: 1 });
  let outcome: DbOutcome;
  try {
    outcome = await enqueueWrite(async () => {
      let r: DbOutcome | null = null;
      await getDb().withExclusiveTransactionAsync(async (tx) => {
        r = await restoreInTransaction(tx, file, mode, placed);
      });
      if (!r) throw new Error('restore transaction ended without a result');
      return r as DbOutcome;
    });
  } catch (e) {
    for (const p of placed) io.remove(p.uri);
    throw e;
  }
  for (const u of outcome.unused) io.remove(u);
  const usedFiles = placed.map((p) => p.uri).filter((u) => !outcome.unused.includes(u));

  // 3. Records from the sets (Replace: every exercise, as all records went).
  o.onProgress?.({ step: 'records', done: 0, total: 1 });
  let ids = outcome.exerciseIds;
  if (mode === 'replace') {
    const all = await getDb().getAllAsync<{ exercise_id: string }>('SELECT DISTINCT exercise_id FROM set_entries');
    ids = [...new Set([...ids, ...all.map((r) => r.exercise_id)])];
  }
  if (ids.length > 0) {
    await enqueueWrite(() => reconcilePrsForExercises(ids)).catch((e: unknown) =>
      console.warn('[backup] records after the restore failed; they catch up on the next edit', e),
    );
  }

  // 4. Settings (Replace only: Add keeps the phone's own).
  let healthConnectWasOn = false;
  if (mode === 'replace') {
    healthConnectWasOn = await o.settings
      .apply(file.settings, { fromBackup: true })
      .then((r) => r.healthConnectWasOn)
      .catch((e: unknown) => {
        console.warn('[backup] settings not all put back', e);
        return false;
      });
  }

  return {
    kind: 'restored',
    outcome,
    photos: usedFiles.length,
    photosFailed: failed,
    healthConnectWasOn,
    undo: { mode, copy, sessionIds: outcome.sessionIds, photoRows: outcome.photoRows, files: usedFiles, settings: oldSettings },
  };
}

/** Put the phone back as it was before the restore (while the member is still on the screen). */
export async function undoRestore(io: BackupIo, t: UndoToken, settings: SettingsIo): Promise<{ keptNewer: number }> {
  const r = await restoreSafetyCopy(t.copy, { importedSessionIds: t.sessionIds });
  await enqueueWrite(async () => {
    const db = getDb();
    for (const id of t.photoRows.progress) await db.runAsync('DELETE FROM progress_photos WHERE id = ?', [id]);
    for (const id of t.photoRows.workout) await db.runAsync('DELETE FROM workout_photos WHERE id = ?', [id]);
    // Exercise pictures: the safety copy put each exercise row back with its own picture already.
  });
  for (const f of t.files) io.remove(f);
  if (t.settings) await settings.apply(t.settings).catch((e: unknown) => console.warn('[backup] settings not all put back on undo', e));
  return r;
}

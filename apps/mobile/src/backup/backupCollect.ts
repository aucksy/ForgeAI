/**
 * Read everything a backup carries from the phone's database (R-123). No files are touched here:
 * the photos come back as a list of what to copy (`PhotoSource`), and backupRun.ts writes the ZIP.
 *
 * Shared, unchanged, by MettleUp and the old ForgeAI app (0.55.2), so both write the same file.
 */
import { getDb } from '@/db';
import { exerciseRef, packHash, PACK_VERSION } from '@/cloud/pack';

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  countItems,
  photoEntryName,
  type BackupFile,
  type BackupItem,
  type BackupMaker,
  type BackupPhoto,
  type LibraryEdit,
  type SettingsBlob,
} from './backupFormat';
import { readLocalItems } from './readItems';

/** The `meta` keys that belong to the workouts (as the Drive backup carries them, snapshot.ts). */
export const BACKUP_META_KEYS: readonly string[] = ['importOriginalStarts', 'import_clock_real_v1', 'routine_import_marks'];

/** Coach chat and the food log: their columns, as the Drive backup lists them. */
export const BACKUP_ROW_TABLES: Readonly<Record<string, readonly string[]>> = {
  meals: ['id', 'date_iso', 'logged_at', 'description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'source'],
  chat_messages: ['id', 'role', 'kind', 'text', 'payload', 'created_at'],
};

/** A photo to copy into the ZIP: where it is on this phone, and its record in backup.json. */
export interface PhotoSource {
  uri: string;
  entry: BackupPhoto;
}

export interface Collected {
  file: BackupFile;
  photos: PhotoSource[];
}

type Db = ReturnType<typeof getDb>;

async function tableExists(db: Db, name: string): Promise<boolean> {
  const r = await db.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
  return r != null;
}

/**
 * The whole backup except the picture bytes. `exists(uri)` says whether a photo's file is really
 * there (a photo whose file is gone is left out: its record alone would show nothing).
 */
export async function collectBackup(o: {
  app: BackupMaker;
  appVersion: string;
  units: 'metric' | 'imperial';
  settings: SettingsBlob;
  now?: Date;
  exists: (uri: string) => boolean;
  db?: Db;
}): Promise<Collected> {
  const db = o.db ?? getDb();
  const local = await readLocalItems(db);
  const items: BackupItem[] = [];
  for (const l of local) {
    if (l.kind === 'f') continue; // in `photos`, with the picture
    items.push([l.kind, l.id, JSON.parse(l.data) as unknown[]]);
  }

  // Hidden library exercises, by library key (row ids differ on every phone).
  const hiddenExercises: string[] = [];
  const hiddenRow = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'hidden_exercises'");
  if (hiddenRow?.value) {
    let ids: unknown = [];
    try {
      ids = JSON.parse(hiddenRow.value);
    } catch {
      ids = [];
    }
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id !== 'string') continue;
        const ex = await db.getFirstAsync<{ catalog_key: string | null }>('SELECT catalog_key FROM exercises WHERE id = ?', [id]);
        if (ex?.catalog_key) hiddenExercises.push(`c:${ex.catalog_key}`);
      }
    }
  }

  // What the member changed on a library exercise (how it is logged, how its weight counts).
  const libraryEdits: LibraryEdit[] = (
    await db.getAllAsync<{ catalog_key: string; log_type: string | null; load_mode: string | null }>(
      'SELECT catalog_key, log_type, load_mode FROM exercises WHERE catalog_key IS NOT NULL AND (log_type IS NOT NULL OR load_mode IS NOT NULL) ORDER BY catalog_key',
    )
  ).map((r) => [`c:${r.catalog_key}`, r.log_type, r.load_mode]);

  const meta: Record<string, string> = {};
  const metaRows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM meta WHERE key IN (${BACKUP_META_KEYS.map(() => '?').join(', ')})`,
    [...BACKUP_META_KEYS],
  );
  for (const r of metaRows) if (typeof r.value === 'string') meta[r.key] = r.value;

  const rows: BackupFile['rows'] = {};
  for (const [table, cols] of Object.entries(BACKUP_ROW_TABLES)) {
    if (!(await tableExists(db, table))) continue;
    rows[table] = await db.getAllAsync<Record<string, string | number | null>>(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY rowid`);
  }

  const photos: PhotoSource[] = [];
  if (await tableExists(db, 'progress_photos')) {
    for (const p of await db.getAllAsync<{ id: string; date_iso: string; uri: string; created_at: number }>(
      'SELECT id, date_iso, uri, created_at FROM progress_photos ORDER BY date_iso, created_at',
    )) {
      if (!o.exists(p.uri)) continue;
      photos.push({ uri: p.uri, entry: { kind: 'progress', id: p.id, file: photoEntryName('progress', p.id, p.uri), date: p.date_iso, createdAt: p.created_at } });
    }
  }
  if (await tableExists(db, 'workout_photos')) {
    for (const p of await db.getAllAsync<{ id: string; session_id: string; uri: string; position: number; created_at: number }>(
      'SELECT id, session_id, uri, position, created_at FROM workout_photos ORDER BY session_id, position',
    )) {
      if (!o.exists(p.uri)) continue;
      photos.push({
        uri: p.uri,
        entry: { kind: 'workout', id: p.id, file: photoEntryName('workout', p.id, p.uri), sessionId: p.session_id, position: p.position, createdAt: p.created_at },
      });
    }
  }
  // An exercise's own photo or video (the member's, on a library or an own exercise).
  for (const e of await db.getAllAsync<{ id: string; catalog_key: string | null; media_uri: string; media_type: string | null }>(
    'SELECT id, catalog_key, media_uri, media_type FROM exercises WHERE media_uri IS NOT NULL ORDER BY rowid',
  )) {
    if (!o.exists(e.media_uri)) continue;
    const ref = exerciseRef(e.id, e.catalog_key);
    const video = e.media_type === 'video';
    const id = packHash(ref);
    photos.push({ uri: e.media_uri, entry: { kind: 'exercise', id, ref, mediaType: video ? 'video' : 'image', file: photoEntryName('exercise', id, e.media_uri, video) } });
  }
  const profile = await db.getFirstAsync<{ photo_uri: string | null }>('SELECT photo_uri FROM user_profile ORDER BY rowid LIMIT 1').catch(() => null);
  if (profile?.photo_uri && o.exists(profile.photo_uri)) {
    photos.push({ uri: profile.photo_uri, entry: { kind: 'profile', id: 'me', file: photoEntryName('profile', 'me', profile.photo_uri) } });
  }

  const now = o.now ?? new Date();
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: o.app,
    appVersion: o.appVersion,
    packVersion: PACK_VERSION,
    createdAt: now.toISOString(),
    units: o.units,
    counts: countItems(items, photos.length),
    items,
    hiddenExercises,
    libraryEdits,
    meta,
    rows,
    settings: o.settings,
    photos: photos.map((p) => p.entry),
  };
  return { file, photos };
}

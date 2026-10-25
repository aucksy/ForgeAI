/**
 * "Save a backup" (R-123): read everything, then write ONE ZIP into the app's cache — photos first,
 * a chunk at a time, then backup.json (which lists only the photos really written) — ready for the
 * share sheet. Before writing it checks the phone has room. Shared by MettleUp and ForgeAI 0.55.2.
 */
import { backupFileName, BACKUP_JSON_NAME, type BackupCounts, type BackupMaker, type BackupPhoto, type SettingsBlob } from './backupFormat';
import { collectBackup } from './backupCollect';
import type { BackupIo } from './backupIo';
import { MAX_ZIP_BYTES, utf8Encode, ZipWriter } from './zipStore';

export interface SaveProgress {
  /** Photos copied so far, of `total`. */
  done: number;
  total: number;
}

export type SaveResult =
  | { kind: 'saved'; uri: string; name: string; counts: BackupCounts; bytes: number; photosLeftOut: number }
  | { kind: 'empty' }
  | { kind: 'no-space'; needBytes: number; freeBytes: number }
  | { kind: 'too-big'; needBytes: number };

/** Room kept free beyond the file itself, so the phone never runs completely full. */
export const SPARE_BYTES = 50 * 1024 * 1024;
const CHUNK = 1 << 20;

/** "2026-10-25" on the phone's own clock. PURE. */
export function localDay(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "120 MB" / "1.4 GB". PURE. */
export function sizeWords(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(mb))} MB`;
}

const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function saveBackupZip(
  io: BackupIo,
  o: {
    app: BackupMaker;
    appVersion: string;
    units: 'metric' | 'imperial';
    settings: SettingsBlob;
    now?: Date;
    onProgress?: (p: SaveProgress) => void;
    /** False: the database and settings only (Drive's fallback on a phone short of space). */
    includePhotos?: boolean;
    /** Where the file goes (default the cache). Each caller its own folder, so one never deletes another's file. */
    outDir?: string;
  },
): Promise<SaveResult> {
  const now = o.now ?? new Date();
  const collected = await collectBackup({ app: o.app, appVersion: o.appVersion, units: o.units, settings: o.settings, now, exists: (u) => io.fileSize(u) != null });
  const { file } = collected;
  const photos = o.includePhotos === false ? [] : collected.photos;
  if (o.includePhotos === false) file.photos = [];
  const c = file.counts;
  if (c.workouts + c.folders + c.ownExercises + c.bodyWeights + c.measurements + c.photos === 0) return { kind: 'empty' };

  const photoBytes = photos.reduce((s, p) => s + (io.fileSize(p.uri) ?? 0), 0);
  // backup.json grows by the photos' records; a rough top for it, plus each photo's headers.
  const needBytes = photoBytes + JSON.stringify(file).length * 3 + photos.length * 200 + 1024;
  if (needBytes > MAX_ZIP_BYTES) return { kind: 'too-big', needBytes };
  const free = io.freeBytes();
  if (free != null && needBytes + SPARE_BYTES > free) return { kind: 'no-space', needBytes: needBytes + SPARE_BYTES, freeBytes: free };

  // One backup in its folder at a time: an older one goes before the new one is written.
  const dir = o.outDir ?? io.cacheDir;
  if (dir !== io.cacheDir) io.mkdir(dir);
  for (const n of io.list(dir)) if (/^mettleup-backup-.*\.zip$/.test(n)) io.remove(`${dir}${n}`);

  const name = backupFileName(localDay(now));
  const uri = `${dir}${name}`;
  const out = io.openWrite(uri);
  let closed = false;
  try {
    const zip = new ZipWriter({ write: (b) => out.write(b) }, now);
    const written: BackupPhoto[] = [];
    let leftOut = 0;
    o.onProgress?.({ done: 0, total: photos.length });
    for (const [i, p] of photos.entries()) {
      let src: ReturnType<BackupIo['openRead']> | null = null;
      try {
        src = io.openRead(p.uri);
      } catch (e) {
        // Gone since it was listed: left out, said on screen.
        console.warn('[backup] a photo could not be opened, left out', e);
        leftOut++;
        continue;
      }
      try {
        const entry = await zip.begin(p.entry.file);
        for (let off = 0; off < src.size; off += CHUNK) {
          await entry.write(src.readAt(off, Math.min(CHUNK, src.size - off)));
          await pause(); // a long video never freezes the screen
        }
        await entry.end();
        written.push({ ...p.entry, bytes: src.size });
      } finally {
        src.close();
      }
      o.onProgress?.({ done: i + 1, total: photos.length });
      await pause();
    }
    file.photos = written;
    file.counts = { ...file.counts, photos: written.length };
    await zip.addBytes(BACKUP_JSON_NAME, utf8Encode(JSON.stringify(file)));
    await zip.finish();
    out.close();
    closed = true;
    return { kind: 'saved', uri, name, counts: file.counts, bytes: zip.size, photosLeftOut: leftOut };
  } catch (e) {
    if (!closed) {
      try {
        out.close();
      } catch (closeErr) {
        console.warn('[backup] the half-written file could not be closed (it is deleted next)', closeErr);
      }
    }
    io.remove(uri);
    throw e;
  }
}

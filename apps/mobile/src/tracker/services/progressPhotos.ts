/**
 * Progress photos — Phase 3 (free; private; compare two side by side).
 *
 * A photo is taken with the camera or picked from the gallery, then COPIED into the app's
 * own storage (`progress-photos/`), so deleting it from the gallery later does not lose it.
 *
 * Private by design, said plainly on the screen:
 *  - the files stay on this phone unless the member turns on "Include photos in my backup"
 *    (audit PG-17 / D11, default off): then the newest that fit are copied into
 *    `photo-backup/`, the one photo folder Android's own backup includes (`photoBackup.ts`).
 *    The ForgeAI Drive backup leaves the photos out, rows and files both;
 *  - the screens show them with `cachePolicy="memory"`, so the image library never writes a
 *    copy to its disk cache;
 *  - "Erase all data" deletes the rows and the files, and empties the image caches.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { todayISO } from '@/lib/date';
import { launchFor, takePendingPick } from '@/lib/pendingPick';
import { tempPictureDirs } from '@/lib/tempPictures';
import { uuid } from '@/lib/uuid';

import { backupNames } from './photoBackupPlan';

export interface ProgressPhoto {
  id: string;
  dateISO: string;
  uri: string;
  createdAt: number;
  /**
   * Audit PG-16: set only by `keepPhoto` — the picture carried no date of its own, so it was
   * dated today and the screen asks for the real day.
   */
  undated?: boolean;
}

interface Row {
  id: string;
  date_iso: string;
  uri: string;
  created_at: number;
}

const DIR = `${FileSystem.documentDirectory ?? ''}progress-photos/`;

/** Is this path one of ours? Never delete anything outside the folder. PURE. */
export function isOwnPhotoPath(uri: string | null | undefined, dir: string = DIR): boolean {
  return typeof uri === 'string' && dir.length > 'progress-photos/'.length && uri.startsWith(dir) && !uri.slice(dir.length).includes('/');
}

/** File extension of a picked picture. PURE. */
export function photoExtension(uri: string): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(uri);
  const ext = m ? m[1].toLowerCase() : 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
}

/** Newest first (by day, then by when it was added). */
export async function getProgressPhotos(): Promise<ProgressPhoto[]> {
  const rows = await getDb().getAllAsync<Row>(
    'SELECT id, date_iso, uri, created_at FROM progress_photos ORDER BY date_iso DESC, created_at DESC',
  );
  return rows.map((r) => ({ id: r.id, dateISO: r.date_iso, uri: r.uri, createdAt: r.created_at }));
}

export async function countProgressPhotos(): Promise<number> {
  const row = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM progress_photos');
  return row?.n ?? 0;
}

/**
 * The day a picture was taken, from its EXIF "DateTimeOriginal" ("2026:01:15 07:42:10"),
 * else "DateTime" / "DateTimeDigitized"; today when it has none. A date after today (a
 * camera with a wrong clock) counts as today. PURE.
 *
 * Phase 3 review: gallery photos were all dated the day they were added, so a January and a
 * September photo compared as "Same day".
 */
export function photoDateISO(exif: Record<string, unknown> | null | undefined, today: string): string {
  return exifDateISO(exif, today) ?? today;
}

/** The picture's own day from its EXIF, or null when it has none (PG-16). PURE. */
export function exifDateISO(exif: Record<string, unknown> | null | undefined, today: string): string | null {
  if (exif) {
    for (const key of ['DateTimeOriginal', 'DateTime', 'DateTimeDigitized']) {
      const v = exif[key];
      if (typeof v !== 'string') continue;
      const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})/.exec(v.trim());
      if (!m) continue;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      const iso = `${m[1]}-${m[2]}-${m[3]}`;
      return iso > today ? today : iso;
    }
  }
  return null;
}

/** What keeping a photo touches — the files and the row — so the order can be tested. */
export interface KeepDeps {
  dir: string;
  cacheDir: string | null;
  mkdir: (dir: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  remove: (uri: string) => Promise<void>;
  insert: (photo: ProgressPhoto) => Promise<void>;
  newId: () => string;
  today: string;
  now: number;
}

/**
 * Copy the picked picture into the app, then save its row. The picker's own copy in the
 * cache is removed only once the row is saved (Phase 3 review: removing it first left
 * nothing at all when the save then failed); a failed save removes the app's copy.
 */
export async function keepPhoto(asset: { uri: string; exif?: Record<string, unknown> | null }, d: KeepDeps): Promise<ProgressPhoto> {
  await d.mkdir(d.dir).catch(() => undefined);
  const id = d.newId();
  const dest = `${d.dir}${id}.${photoExtension(asset.uri)}`;
  await d.copy(asset.uri, dest);
  const own = exifDateISO(asset.exif, d.today);
  const photo: ProgressPhoto = { id, dateISO: own ?? d.today, uri: dest, createdAt: d.now, undated: own == null };
  try {
    await d.insert(photo);
  } catch (e) {
    await d.remove(dest).catch(() => undefined);
    throw e;
  }
  if (d.cacheDir && asset.uri.startsWith(d.cacheDir)) await d.remove(asset.uri).catch(() => undefined);
  return photo;
}

function keep(asset: ImagePicker.ImagePickerAsset): Promise<ProgressPhoto> {
  return keepPhoto(asset, {
    dir: DIR,
    cacheDir: FileSystem.cacheDirectory,
    mkdir: (dir) => FileSystem.makeDirectoryAsync(dir, { intermediates: true }),
    copy: (from, to) => FileSystem.copyAsync({ from, to }),
    remove: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
    insert: async (p) => {
      await enqueueWrite(() =>
        getDb().runAsync('INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES(?, ?, ?, ?)', [p.id, p.dateISO, p.uri, p.createdAt]),
      );
    },
    newId: uuid,
    today: todayISO(),
    now: Date.now(),
  });
}

/** Gallery pick, dated by the picture's own EXIF date when it has one. null when cancelled. */
export async function addPhotoFromGallery(): Promise<ProgressPhoto | null> {
  const res = await launchFor('progress-photo', () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, exif: true }));
  if (res.canceled || res.assets.length === 0) return null;
  return keep(res.assets[0]);
}

/** Camera. null when cancelled; throws 'camera-denied' when refused. */
export async function addPhotoFromCamera(): Promise<ProgressPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera-denied');
  const res = await launchFor('progress-photo', () => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }));
  if (res.canceled || res.assets.length === 0) return null;
  return keep(res.assets[0]);
}

/**
 * The photo Android's restart left behind (it closed ForgeAI behind the camera), saved like
 * any other — or null. Phase 3 review: before, that photo was simply lost.
 */
export async function keepPendingPhoto(): Promise<ProgressPhoto | null> {
  const asset = await takePendingPick('progress-photo');
  return asset ? keep(asset) : null;
}

/**
 * Delete one photo: the row, then its file, then its backup copy (PG-17) if it has one — under
 * either name (a shrunk copy is "id.jpg" whatever the photo's own type; an older copy kept it).
 */
export async function deleteProgressPhoto(photo: Pick<ProgressPhoto, 'id' | 'uri'>): Promise<void> {
  await enqueueWrite(() => getDb().runAsync('DELETE FROM progress_photos WHERE id = ?', [photo.id]));
  if (isOwnPhotoPath(photo.uri)) await FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => undefined);
  if (FileSystem.documentDirectory) {
    for (const name of backupNames(photo.id, photo.uri)) {
      await FileSystem.deleteAsync(`${FileSystem.documentDirectory}photo-backup/${name}`, { idempotent: true }).catch(() => undefined);
    }
  }
}

/**
 * Remove the photo folder and the temporary pictures, then empty the image caches — each
 * step tried even when one before it fails, so nothing private outlives an erase.
 */
export async function wipePhotoStorage(steps: {
  removeFolder: () => Promise<unknown>;
  /** Third review: the picker's temporary copies and the share pictures (`lib/tempPictures`). */
  removeTemp?: readonly (() => Promise<unknown>)[];
  clearDisk: () => Promise<unknown>;
  clearMemory: () => Promise<unknown>;
}): Promise<void> {
  for (const step of [steps.removeFolder, ...(steps.removeTemp ?? []), steps.clearDisk, steps.clearMemory]) {
    try {
      await step();
    } catch {
      // Nothing there, or a cache already empty.
    }
  }
}

/**
 * What an erase deletes, in these folders (the real ones on the phone; stand-ins in tests).
 * Phase 3 review: the picture viewer keeps photos in memory only (`cachePolicy="memory"`),
 * but the image caches are emptied too, belt and braces.
 */
export function photoEraseSteps(
  files: { documentDirectory: string | null; cacheDirectory: string | null; deleteAsync: (uri: string, options: { idempotent: boolean }) => Promise<void> },
  images: { clearDiskCache: () => Promise<unknown>; clearMemoryCache: () => Promise<unknown> },
): Parameters<typeof wipePhotoStorage>[0] {
  return {
    removeFolder: async () => {
      if (typeof files.documentDirectory === 'string' && files.documentDirectory.length > 0) {
        await files.deleteAsync(`${files.documentDirectory}progress-photos/`, { idempotent: true });
        // PG-17: the opt-in backup copies go too.
        await files.deleteAsync(`${files.documentDirectory}photo-backup/`, { idempotent: true });
      }
    },
    removeTemp: tempPictureDirs(files.cacheDirectory).map((dir) => () => files.deleteAsync(dir, { idempotent: true })),
    clearDisk: () => images.clearDiskCache(),
    clearMemory: () => images.clearMemoryCache(),
  };
}

/** "Erase all data": every photo file goes with the rows (the rows go in the erase itself). */
export async function deleteAllProgressPhotoFiles(): Promise<void> {
  await wipePhotoStorage(photoEraseSteps(FileSystem, Image));
}

/** Does the file behind a row still exist on this phone? */
export async function photoFileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
  return info.exists;
}

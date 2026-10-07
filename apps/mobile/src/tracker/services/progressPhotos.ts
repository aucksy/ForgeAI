/**
 * Progress photos — Phase 3 (free; private; compare two side by side).
 *
 * A photo is taken with the camera or picked from the gallery, then COPIED into the app's
 * own storage (`progress-photos/`), so deleting it from the gallery later does not lose it.
 *
 * Private by design, said plainly on the screen:
 *  - the files stay on this phone. Android's own backup copies only small settings (the app's
 *    backup rules include shared preferences only), and the ForgeAI Drive backup leaves the
 *    photos out, rows and files both — restoring a backup never touches them;
 *  - "Erase all data" deletes the rows and the files.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { getDb } from '@/db';
import { todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';

export interface ProgressPhoto {
  id: string;
  dateISO: string;
  uri: string;
  createdAt: number;
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

async function keep(asset: ImagePicker.ImagePickerAsset): Promise<ProgressPhoto> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  const id = uuid();
  const dest = `${DIR}${id}.${photoExtension(asset.uri)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  // The picker's own copy in the cache is not needed any more.
  const cache = FileSystem.cacheDirectory;
  if (cache && asset.uri.startsWith(cache)) await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  const photo: ProgressPhoto = { id, dateISO: todayISO(), uri: dest, createdAt: Date.now() };
  try {
    await getDb().runAsync('INSERT INTO progress_photos(id, date_iso, uri, created_at) VALUES(?, ?, ?, ?)', [
      photo.id,
      photo.dateISO,
      photo.uri,
      photo.createdAt,
    ]);
  } catch (e) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw e;
  }
  return photo;
}

/** Gallery pick. null when cancelled. */
export async function addPhotoFromGallery(): Promise<ProgressPhoto | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled || res.assets.length === 0) return null;
  return keep(res.assets[0]);
}

/** Camera. null when cancelled; throws 'camera-denied' when refused. */
export async function addPhotoFromCamera(): Promise<ProgressPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera-denied');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled || res.assets.length === 0) return null;
  return keep(res.assets[0]);
}

/** Delete one photo: the row, then its file. */
export async function deleteProgressPhoto(photo: Pick<ProgressPhoto, 'id' | 'uri'>): Promise<void> {
  await getDb().runAsync('DELETE FROM progress_photos WHERE id = ?', [photo.id]);
  if (isOwnPhotoPath(photo.uri)) await FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => undefined);
}

/** "Erase all data": every photo file goes with the rows (the rows go in the erase itself). */
export async function deleteAllProgressPhotoFiles(): Promise<void> {
  try {
    if (typeof FileSystem.documentDirectory !== 'string' || FileSystem.documentDirectory.length === 0) return;
    await FileSystem.deleteAsync(DIR, { idempotent: true });
  } catch {
    // Nothing to delete, or the folder is already gone.
  }
}

/** Does the file behind a row still exist on this phone? */
export async function photoFileExists(uri: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
  return info.exists;
}

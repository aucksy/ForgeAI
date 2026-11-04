/**
 * F146: share-sized copies of two progress photos for the before/after picture — long side at most
 * 1080 px (the picture's photo boxes are 456 px wide), so drawing two of them never holds two full
 * camera photos in memory. They live in the app's cache share folder, which "Erase all data" empties
 * (lib/tempPictures.ts), and are deleted again when the share sheet closes: a progress photo
 * deleted later leaves no copy behind. Nothing here leaves the phone.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { SHARE_FOLDER } from '@/lib/tempPictures';

import { shrinkPhoto } from './photoBackup';

/** The folder of the copies. */
export function beforeAfterDir(cacheDir: string | null | undefined): string | null {
  return cacheDir ? `${cacheDir}${SHARE_FOLDER}before-after/` : null;
}

/** A copy's file name: the photo's id, letters, digits and dashes only. PURE. */
export function copyName(photoId: string): string {
  const clean = photoId.replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 64);
  return `${clean || 'photo'}.jpg`;
}

/** The share-sized copy of one photo (made once per sheet). */
export async function beforeAfterCopy(photo: { id: string; uri: string }): Promise<string> {
  const dir = beforeAfterDir(FileSystem.cacheDirectory);
  if (!dir) throw new Error('no cache folder');
  const to = `${dir}${copyName(photo.id)}`;
  const info = await FileSystem.getInfoAsync(to);
  if (info.exists) return to;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  await shrinkPhoto(photo.uri, to);
  return to;
}

/** Delete every copy (the sheet closed). Quiet: an erase also empties the folder. */
export async function clearBeforeAfterCopies(): Promise<void> {
  const dir = beforeAfterDir(FileSystem.cacheDirectory);
  if (!dir) return;
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch((e: unknown) => console.warn('[ForgeErr] before/after copies not deleted', e));
}

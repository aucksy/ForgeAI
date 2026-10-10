/**
 * The member's own photo or video for an exercise (Phase 2). Picked from the gallery or
 * taken with the camera, then COPIED into the app's own storage — a gallery item can be
 * deleted or moved later, and the exercise must keep its picture offline.
 *
 * Limit, said plainly: these files live on this phone. The Drive backup keeps the
 * exercise but not the file, as with meal photos; after a restore, paths whose file isn't
 * on this phone are cleared (`clearMissingExerciseMedia`).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { launchFor, takePendingPick } from '@/lib/pendingPick';

export interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
}

const DIR = `${FileSystem.documentDirectory ?? ''}exercise-media/`;

/** A demo clip, not a film: the camera stops at 30 s, and a gallery clip must fit too. */
export const MAX_VIDEO_SEC = 30;
/** Above this a clip is too heavy to copy and loop (a 30 s phone clip is ~20–60 MB). */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/** File extension for a picked asset. PURE (exported for tests). */
export function extensionOf(uri: string, type: 'image' | 'video'): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(uri);
  if (m) return m[1].toLowerCase();
  return type === 'video' ? 'mp4' : 'jpg';
}

/**
 * Why a picked asset can't be kept, or null. The camera honours its 30 s limit; the
 * gallery has none, so a long 4K film would be copied whole. PURE (exported for tests).
 */
export function mediaProblem(asset: {
  type?: string | null;
  duration?: number | null;
  fileSize?: number | null;
}): 'video-too-long' | 'video-too-big' | null {
  if (asset.type !== 'video') return null;
  // `duration` is in milliseconds; a second of grace for rounding.
  if (asset.duration != null && asset.duration > (MAX_VIDEO_SEC + 1) * 1000) return 'video-too-long';
  if (asset.fileSize != null && asset.fileSize > MAX_VIDEO_BYTES) return 'video-too-big';
  return null;
}

async function keep(asset: ImagePicker.ImagePickerAsset): Promise<PickedMedia> {
  const problem = mediaProblem(asset);
  if (problem) throw new Error(problem);
  const type: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  const dest = `${DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(asset.uri, type)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  // The picker's own copy in the app's cache is not needed any more.
  const cache = FileSystem.cacheDirectory;
  if (cache && asset.uri.startsWith(cache)) await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
  return { uri: dest, type };
}

/**
 * Gallery pick (photo or video). null when cancelled; throws 'video-too-long' / 'video-too-big'.
 * `forExercise`: the exercise id it is for, or "new" (EX-13: a restart returns it to that form).
 */
export async function pickFromGallery(forExercise?: string): Promise<PickedMedia | null> {
  const res = await launchFor('exercise-media', () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 }), undefined, forExercise);
  if (res.canceled || res.assets.length === 0) return null;
  return keep(res.assets[0]);
}

/**
 * Camera: a photo, or a short video. Android's camera takes one or the other per launch
 * (asking for both opens the photo camera), so the form offers them as two buttons.
 * null when cancelled; throws 'camera-denied' when refused.
 */
export async function takeWithCamera(kind: 'image' | 'video', forExercise?: string): Promise<PickedMedia | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera-denied');
  const res = await launchFor('exercise-media', () =>
    ImagePicker.launchCameraAsync(
      kind === 'video'
        ? { mediaTypes: ['videos'], videoMaxDuration: MAX_VIDEO_SEC, quality: 0.8 }
        : { mediaTypes: ['images'], quality: 0.8 },
    ),
    undefined,
    forExercise,
  );
  if (res.canceled || res.assets.length === 0) return null;
  return keep(res.assets[0]);
}

/**
 * The photo or video Android's restart left behind (it closed ForgeAI behind the camera or
 * the gallery), copied in — or null. Phase 3 review: before, it was simply lost. Throws like
 * a gallery pick when the clip is too long or too big.
 */
export async function keepPendingMedia(forExercise?: string): Promise<PickedMedia | null> {
  const asset = await takePendingPick('exercise-media', undefined, forExercise);
  return asset ? keep(asset) : null;
}

/** Remove a file this module copied in (never anything outside its own folder). */
export async function deleteKeptMedia(uri: string | null | undefined): Promise<void> {
  if (!uri || !uri.startsWith(DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/**
 * After a Drive restore: the backup carries each exercise's photo/video PATH but not the
 * file. Clear paths whose file isn't on this phone, so the library drawing (or the plain
 * mark) shows instead of a blank square. Returns how many were cleared.
 */
export async function clearMissingExerciseMedia(): Promise<number> {
  const rows = await getDb().getAllAsync<{ id: string; media_uri: string }>(
    'SELECT id, media_uri FROM exercises WHERE media_uri IS NOT NULL',
  );
  let cleared = 0;
  for (const r of rows) {
    const info = await FileSystem.getInfoAsync(r.media_uri).catch(() => ({ exists: false }));
    if (info.exists) continue;
    await enqueueWrite(() => getDb().runAsync('UPDATE exercises SET media_uri = NULL, media_type = NULL WHERE id = ?', [r.id]));
    cleared += 1;
  }
  return cleared;
}

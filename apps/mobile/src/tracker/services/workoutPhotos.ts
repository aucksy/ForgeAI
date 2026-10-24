/**
 * Photos on a workout (15 Oct 2026) — copying Hevy, photos only.
 *
 * What Hevy does (researched 15 Oct 2026, https://www.hevyapp.com/features/gym-selfie-footage/):
 * on Finish, "Add a photo / video" picks from the library or takes a new one, and Save keeps it
 * with the workout on the member's profile; a saved workout's media can be changed later through
 * Edit Workout (Profile → the workout's ⋯ → Edit Workout); the pictures show on the workout in the
 * feed, in the order the member arranged them. Hevy allows three images (or two and a video, video
 * for Pro) per workout, and shares them with followers.
 *
 * ForgeAI's scope (owner, 15 Oct 2026): PHOTOS ONLY, up to 4 per workout, added on the "Workout
 * complete" summary (after the workout is saved) and on the workout's own page; private and kept on
 * this phone like progress photos — no upload, no followers. The picture is COPIED into the app's
 * own `workout-photos/` folder (deleting it from the gallery later does not lose it), shown with
 * `cachePolicy="memory"` so the image library never writes a copy to its disk cache.
 *
 * Deleting a workout deletes its photos, rows and files (`removeWorkoutPhotos`, from
 * `workoutDelete.ts`); a row whose workout went another way (import Replace, Remove demo data, an
 * older restore) is swept at start-up (`sweepOrphanWorkoutPhotos`). "Erase all data" wipes the
 * table with every other table and deletes the folder (an erase step, `eraseDevice.ts`).
 * Backup: left out of the ForgeAI Drive backup, like progress photos (see `workoutPhotoRepo.ts`).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { launchFor, takePendingPick } from '@/lib/pendingPick';
import { isPermissionRefusal } from '@/lib/permissionRefusal';
import { uuid } from '@/lib/uuid';
import {
  deleteOrphanWorkoutPhotoRows,
  deleteWorkoutPhotoRow,
  deleteWorkoutPhotoRows,
  insertWorkoutPhoto,
  WORKOUT_PHOTO_LIMIT,
  WorkoutPhotoRefused,
  type WorkoutPhoto,
} from '@/tracker/db/workoutPhotoRepo';

import { photoExtension } from './progressPhotos';

export { WORKOUT_PHOTO_LIMIT, type WorkoutPhoto };

export const WORKOUT_PHOTO_FOLDER = 'workout-photos/';

/** The app's own folder for workout photos, or null when the documents folder is unknown. PURE. */
export function workoutPhotoDir(documentDirectory: unknown): string | null {
  return typeof documentDirectory === 'string' && documentDirectory.length > 0 ? `${documentDirectory}${WORKOUT_PHOTO_FOLDER}` : null;
}

/** Is this path one of ours (directly inside the folder)? Never delete anything else. PURE. */
export function isOwnWorkoutPhotoPath(uri: string | null | undefined, dir: string | null): boolean {
  return typeof uri === 'string' && dir != null && dir.length > WORKOUT_PHOTO_FOLDER.length && uri.startsWith(dir) && uri.length > dir.length && !uri.slice(dir.length).includes('/');
}

/** How many more photos this workout can take (0 to 4). PURE. */
export function photoSlotsLeft(count: number): number {
  return Math.max(0, WORKOUT_PHOTO_LIMIT - Math.max(0, Math.floor(count)));
}

/** "2 of 4" — the count beside the Photos heading. PURE. */
export function workoutPhotoCountText(count: number): string {
  return `${Math.min(count, WORKOUT_PHOTO_LIMIT)} of ${WORKOUT_PHOTO_LIMIT}`;
}

/** What went wrong, in one word the screen can act on. PURE. */
export type WorkoutPhotoProblem = 'camera-denied' | 'limit' | 'gone' | 'other';
export function workoutPhotoProblem(e: unknown): WorkoutPhotoProblem {
  if (e instanceof WorkoutPhotoRefused) return e.why;
  // Our own 'camera-denied' AND the camera picker rejecting with "User rejected permissions".
  if (isPermissionRefusal(e)) return 'camera-denied';
  return 'other';
}

/**
 * Log a failed add and say what it was. A refused camera is the member's answer, so it is an
 * info line (never '[ForgeErr]'); every real failure is still logged as '[ForgeErr] workout photo'.
 */
export function reportWorkoutPhotoProblem(
  e: unknown,
  log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void } = { info: console.log, warn: console.warn },
): WorkoutPhotoProblem {
  const problem = workoutPhotoProblem(e);
  if (problem === 'camera-denied') log.info('[ForgeInfo] workout photo: camera not allowed by the member');
  else log.warn('[ForgeErr] workout photo', e);
  return problem;
}

/** The same words progress photos use when the camera is refused. */
export const CAMERA_DENIED_TEXT = 'Camera not allowed. Allow the camera for MettleUp in your phone settings, or choose a photo from the gallery.';

/** Plain words for a failed add. PURE. */
export function addPhotoErrorText(problem: WorkoutPhotoProblem): string {
  switch (problem) {
    case 'camera-denied':
      return CAMERA_DENIED_TEXT;
    case 'limit':
      return `This workout already has ${WORKOUT_PHOTO_LIMIT} photos. Remove one to add another.`;
    case 'gone':
      return 'This workout was deleted, so the photo wasn’t added.';
    default:
      return 'Couldn’t add the photo. Please try again.';
  }
}

/** What keeping a picked photo touches, so the order can be tested. */
export interface KeepWorkoutPhotoDeps {
  dir: string | null;
  cacheDir: string | null;
  mkdir: (dir: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  remove: (uri: string) => Promise<void>;
  insert: (p: { id: string; sessionId: string; uri: string; createdAt: number }) => Promise<WorkoutPhoto>;
  newId: () => string;
  now: number;
  warn: (e: unknown) => void;
}

/**
 * Copy the picked picture into the app, then save its row (refused past 4 or for a deleted
 * workout). A refused or failed save removes the app's copy; the picker's own copy in the cache
 * goes only once the row is saved (as progress photos).
 */
export async function keepWorkoutPhoto(sessionId: string, asset: { uri: string }, d: KeepWorkoutPhotoDeps): Promise<WorkoutPhoto> {
  if (!d.dir) throw new Error('no-documents-folder');
  try {
    await d.mkdir(d.dir);
  } catch (e) {
    // quiet: the folder is usually already there; a real problem fails the copy next and is reported.
    void e;
  }
  const id = d.newId();
  const dest = `${d.dir}${id}.${photoExtension(asset.uri)}`;
  await d.copy(asset.uri, dest);
  let photo: WorkoutPhoto;
  try {
    photo = await d.insert({ id, sessionId, uri: dest, createdAt: d.now });
  } catch (e) {
    await d.remove(dest).catch(d.warn);
    throw e;
  }
  if (d.cacheDir && asset.uri.startsWith(d.cacheDir)) await d.remove(asset.uri).catch(d.warn);
  return photo;
}

const warn = (e: unknown): void => console.warn('[ForgeErr] workout photo', e);

function keep(sessionId: string, asset: { uri: string }): Promise<WorkoutPhoto> {
  return keepWorkoutPhoto(sessionId, asset, {
    dir: workoutPhotoDir(FileSystem.documentDirectory),
    cacheDir: FileSystem.cacheDirectory,
    mkdir: (dir) => FileSystem.makeDirectoryAsync(dir, { intermediates: true }),
    copy: (from, to) => FileSystem.copyAsync({ from, to }),
    remove: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
    insert: insertWorkoutPhoto,
    newId: uuid,
    now: Date.now(),
    warn,
  });
}

/** Gallery pick for this workout. null when the member cancels (not an error). */
export async function addWorkoutPhotoFromGallery(sessionId: string): Promise<WorkoutPhoto | null> {
  const res = await launchFor('workout-photo', () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }), undefined, sessionId);
  if (res.canceled || res.assets.length === 0) return null;
  return keep(sessionId, res.assets[0]);
}

/** Camera for this workout. null when cancelled; throws 'camera-denied' when refused. */
export async function addWorkoutPhotoFromCamera(sessionId: string): Promise<WorkoutPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera-denied');
  const res = await launchFor('workout-photo', () => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }), undefined, sessionId);
  if (res.canceled || res.assets.length === 0) return null;
  return keep(sessionId, res.assets[0]);
}

/** The photo Android's restart left behind for THIS workout (it closed ForgeAI behind the camera), or null. */
export async function keepPendingWorkoutPhoto(sessionId: string): Promise<WorkoutPhoto | null> {
  const asset = await takePendingPick('workout-photo', undefined, sessionId);
  return asset ? keep(sessionId, asset) : null;
}

/** Delete one photo: its row, then its file. */
export async function deleteWorkoutPhoto(photo: Pick<WorkoutPhoto, 'id' | 'uri'>): Promise<void> {
  await deleteWorkoutPhotoRow(photo.id);
  await deleteFiles([photo.uri]);
}

async function deleteFiles(uris: readonly string[]): Promise<void> {
  const dir = workoutPhotoDir(FileSystem.documentDirectory);
  for (const uri of uris) {
    if (isOwnWorkoutPhotoPath(uri, dir)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(warn);
  }
}

/** A workout was deleted: its photos go too, rows and files. Never throws (the start-up sweep retries). */
export async function removeWorkoutPhotos(sessionId: string): Promise<void> {
  try {
    await deleteFiles(await deleteWorkoutPhotoRows(sessionId));
  } catch (e) {
    warn(e);
  }
}

/** Start-up: photos whose workout is gone are deleted, rows and files. Never throws. */
export async function sweepOrphanWorkoutPhotos(): Promise<void> {
  try {
    await deleteFiles(await deleteOrphanWorkoutPhotoRows());
  } catch (e) {
    warn(e);
  }
}

/** "Erase all data" / loading the demo: the whole folder goes (the rows go in the wipe). */
export async function deleteAllWorkoutPhotoFiles(): Promise<void> {
  const dir = workoutPhotoDir(FileSystem.documentDirectory);
  if (dir) await FileSystem.deleteAsync(dir, { idempotent: true });
}

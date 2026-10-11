/**
 * Redesign R2 — the Profile photo (Edit profile: camera / gallery / remove), kept like the
 * progress photos are (`progressPhotos.ts`): the picked picture is COPIED into the app's own
 * `profile-photo/` folder, so deleting it from the gallery later does not lose it. One photo:
 * a new one replaces the old file. It stays on this phone — the Drive backup keeps only its
 * path, and "Erase all data" deletes the folder (`photoEraseSteps`).
 *
 * Not in the opt-in photo backup (`photoBackup.ts` copies progress photos only): after a fresh
 * install the Profile shows the first letter until a photo is picked again.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { launchFor, takePendingPick } from '@/lib/pendingPick';
import { uuid } from '@/lib/uuid';

import { getProfileExtras, setProfileExtras } from '../db/profileExtras';
import { photoExtension } from './progressPhotos';

export const PROFILE_PHOTO_FOLDER = 'profile-photo/';
const DIR = `${FileSystem.documentDirectory ?? ''}${PROFILE_PHOTO_FOLDER}`;

/** Is this path one of ours (never delete anything outside the folder)? PURE. */
export function isOwnProfilePhoto(uri: string | null | undefined, dir: string = DIR): boolean {
  return typeof uri === 'string' && dir.length > PROFILE_PHOTO_FOLDER.length && uri.startsWith(dir) && !uri.slice(dir.length).includes('/');
}

/** What keeping a photo touches, so the order can be tested. */
export interface ProfilePhotoDeps {
  dir: string;
  cacheDir: string | null;
  mkdir: (dir: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  remove: (uri: string) => Promise<void>;
  previous: () => Promise<string | null>;
  save: (uri: string | null) => Promise<void>;
  newId: () => string;
}

/**
 * Copy the picture in, save its path, THEN remove the old photo and the picker's cache copy. A
 * failed save removes the new copy and keeps the old photo as it was.
 */
export async function keepProfilePhoto(asset: { uri: string }, d: ProfilePhotoDeps): Promise<string> {
  await d.mkdir(d.dir).catch(() => undefined);
  const dest = `${d.dir}${d.newId()}.${photoExtension(asset.uri)}`;
  const before = await d.previous().catch(() => null);
  await d.copy(asset.uri, dest);
  try {
    await d.save(dest);
  } catch (e) {
    await d.remove(dest).catch(() => undefined);
    throw e;
  }
  if (before && before !== dest && isOwnProfilePhoto(before, d.dir)) await d.remove(before).catch(() => undefined);
  if (d.cacheDir && asset.uri.startsWith(d.cacheDir)) await d.remove(asset.uri).catch(() => undefined);
  return dest;
}

function deps(): ProfilePhotoDeps {
  return {
    dir: DIR,
    cacheDir: FileSystem.cacheDirectory,
    mkdir: (dir) => FileSystem.makeDirectoryAsync(dir, { intermediates: true }),
    copy: (from, to) => FileSystem.copyAsync({ from, to }),
    remove: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
    previous: async () => (await getProfileExtras()).photoUri,
    save: (uri) => setProfileExtras({ photoUri: uri }),
    newId: uuid,
  };
}

/** Gallery pick (square crop). null when cancelled. */
export async function pickProfilePhoto(): Promise<string | null> {
  const res = await launchFor('profile-photo', () =>
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] }),
  );
  if (res.canceled || res.assets.length === 0) return null;
  return keepProfilePhoto(res.assets[0], deps());
}

/** Camera (square crop). null when cancelled; throws 'camera-denied' when refused. */
export async function takeProfilePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera-denied');
  const res = await launchFor('profile-photo', () =>
    ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] }),
  );
  if (res.canceled || res.assets.length === 0) return null;
  return keepProfilePhoto(res.assets[0], deps());
}

/** The photo Android's restart left behind (it closed ForgeAI behind the camera), or null. */
export async function keepPendingProfilePhoto(): Promise<string | null> {
  const asset = await takePendingPick('profile-photo');
  return asset ? keepProfilePhoto(asset, deps()) : null;
}

/** Remove the photo: the path first, then the file. */
export async function removeProfilePhoto(): Promise<void> {
  const before = (await getProfileExtras()).photoUri;
  await setProfileExtras({ photoUri: null });
  if (before && isOwnProfilePhoto(before)) await FileSystem.deleteAsync(before, { idempotent: true }).catch(() => undefined);
}

/**
 * R-170: the phone's file system for the exercise clips (clipCache.ts holds the rules).
 * Device-only: the tests use an in-memory stand-in instead.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { createClipCache, type ClipCache, type ClipFs } from './clipCache';

const phoneFs: ClipFs = {
  dir: `${FileSystem.documentDirectory ?? ''}exercise-clips/`,
  async exists(path) {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists && !info.isDirectory && (info.size ?? 0) > 0;
  },
  async makeDir(path) {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  },
  async download(url, path) {
    const res = await FileSystem.downloadAsync(url, path);
    if (res.status !== 200) throw new Error(`download answered ${res.status}`);
  },
  move: (from, to) => FileSystem.moveAsync({ from, to }),
  remove: (path) => FileSystem.deleteAsync(path, { idempotent: true }),
  async list(dir) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return [];
    return FileSystem.readDirectoryAsync(dir);
  },
};

let shared: ClipCache | null = null;

/** The one clip cache of the app (one download per file, however many screens ask). */
export function clipCache(): ClipCache {
  if (!shared) {
    shared = createClipCache(phoneFs, (message, error) => console.warn(`[ForgeErr] ${message}`, error ?? ''));
  }
  return shared;
}

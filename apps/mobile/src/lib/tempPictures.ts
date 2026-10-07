/**
 * Folders of temporary pictures in the app's cache (Phase 3, third review). PURE.
 *
 *  - `ImagePicker/` is expo-image-picker's own folder (its CACHE_DIR_NAME): a camera photo is
 *    written there before ForgeAI keeps a copy, and stays there when Android closed the app
 *    in between — a progress photo is a picture of the member's body.
 *  - `share/` holds the share pictures (a workout, a month, a year).
 *
 * "Erase all data" deletes both, so nothing private outlives an erase.
 */
export const SHARE_FOLDER = 'share/';
const PICKER_FOLDER = 'ImagePicker/';

/** The folders to empty on an erase; none when the cache folder is unknown. */
export function tempPictureDirs(cacheDir: string | null | undefined): string[] {
  return typeof cacheDir === 'string' && cacheDir.length > 0 ? [`${cacheDir}${PICKER_FOLDER}`, `${cacheDir}${SHARE_FOLDER}`] : [];
}

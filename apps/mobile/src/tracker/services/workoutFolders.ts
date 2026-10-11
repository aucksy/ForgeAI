/**
 * Redesign R4 — the Workout tab's folders and routines in ONE batched read (`listFolders`: the
 * folders, every routine, every routine row and the exercises' names — four queries however
 * many folders), kept in memory with the database stamp (`dataStamp`, audit Phase 8). Coming
 * back to the tab with nothing saved since gives the same list back without reading again.
 *
 * The stamp is taken before the read and checked after it: a write that ran meanwhile (or a
 * queued write still open, which gives no stamp) means the list is not kept — read again next
 * time, never show a list that may have missed a change.
 */
import { dataStamp } from '../db/dataStamp';
import { listFolders, type Folder } from '../db/folderRepo';

let cache: { stamp: string; folders: Folder[] } | null = null;

/** Keep what was read under `before` only when nothing was written meanwhile. PURE. */
export function keepRead(before: string | null, after: string | null): boolean {
  return before != null && before === after;
}

/** Every folder with its routines — the kept list when nothing changed since it was read. */
export async function getWorkoutFolders(): Promise<Folder[]> {
  const before = await dataStamp().catch(() => null);
  if (cache && before != null && cache.stamp === before) return cache.folders;
  const folders = await listFolders();
  const after = await dataStamp().catch(() => null);
  cache = keepRead(before, after) && before != null ? { stamp: before, folders } : null;
  return folders;
}

/** Forget the kept list (after a write, so the next read never trusts an old stamp). */
export function forgetWorkoutFolders(): void {
  cache = null;
}

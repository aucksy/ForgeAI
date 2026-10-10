/**
 * The opt-in photo backup's arithmetic (audit PG-17, owner decision D11). PURE.
 *
 * Android's own backup holds at most 25 MB per app, and above that it backs up NOTHING —
 * the workouts included. So photos get what is left after the database, under a fixed ceiling:
 * the database plus the photos stay under 22 MB (3 MB of headroom for settings and growth
 * between two nightly backups), and photos never take more than 15 MB.
 */

export const MB = 1024 * 1024;
/** The most the photos may take. */
export const PHOTO_BUDGET_MAX = 15 * MB;
/** Database + photos stay under this (Android's limit is 25 MB). */
export const BACKUP_SAFE_TOTAL = 22 * MB;

/** Bytes the photos may take, given how big the database is now. */
export function photoBudgetBytes(databaseBytes: number): number {
  const left = BACKUP_SAFE_TOTAL - Math.max(0, databaseBytes);
  return Math.max(0, Math.min(PHOTO_BUDGET_MAX, left));
}

export interface SizedPhoto {
  id: string;
  dateISO: string;
  createdAt: number;
  bytes: number;
}

/**
 * The newest photos that fit, newest first, stopping at the first that does not — so what is
 * kept is always "your newest N", never a scatter with gaps. `total` = how many there are.
 */
export function pickNewestThatFit(photos: readonly SizedPhoto[], budget: number): { keep: string[]; bytes: number; total: number } {
  const newest = [...photos].sort((a, b) => (a.dateISO !== b.dateISO ? (a.dateISO < b.dateISO ? 1 : -1) : b.createdAt - a.createdAt));
  const keep: string[] = [];
  let bytes = 0;
  for (const p of newest) {
    if (bytes + p.bytes > budget) break;
    keep.push(p.id);
    bytes += p.bytes;
  }
  return { keep, bytes, total: photos.length };
}

function mbText(bytes: number): string {
  const mb = bytes / MB;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

const photosText = (n: number): string => `${n} ${n === 1 ? 'photo' : 'photos'}`;

/**
 * What Profile → Backup says about the photos. `failed` = photos that couldn't be copied
 * (a picture the phone can't shrink): said as such, never as "older ones stay on this phone".
 */
export function photoBackupLine(s: { kept: number; total: number; bytes: number; failed?: number }): string {
  const failed = s.failed ?? 0;
  if (s.total === 0) return 'No photos to back up yet.';
  if (failed > 0) {
    const notFit = s.total - s.kept - failed > 0;
    if (s.kept === 0) return `No photos backed up: ${photosText(failed)} couldn’t be copied${notFit ? '; the others don’t fit' : ''}.`;
    return `Backing up ${s.kept} of your ${photosText(s.total)} (${mbText(s.bytes)}). ${photosText(failed)} couldn’t be copied${notFit ? '; older ones stay on this phone only' : ''}.`;
  }
  if (s.kept === 0) return 'No room for photos: your workouts fill the backup. Use "Save to phone gallery" instead.';
  if (s.kept < s.total) return `Backing up your newest ${s.kept} photos (${mbText(s.bytes)}). Older ones stay on this phone only.`;
  if (s.total === 1) return `Backing up your 1 photo (${mbText(s.bytes)}).`;
  return `Backing up all ${s.total} photos (${mbText(s.bytes)}).`;
}

/** The backup copy's file name for a photo copied as-is: its id and its own extension. */
export function backupName(id: string, uri: string): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(uri);
  return `${id}.${m ? m[1].toLowerCase() : 'jpg'}`;
}

/** A shrunk backup copy is always a JPEG, so it is named .jpg (a PNG's copy is "id.jpg"). */
export function shrunkBackupName(id: string): string {
  return `${id}.jpg`;
}

/** Every name a photo's backup copy may have (shrunk, or as-is from before) — to delete it. */
export function backupNames(id: string, uri: string): string[] {
  return [...new Set([shrunkBackupName(id), backupName(id, uri)])];
}

/** The photo id a backup file belongs to ("abc.jpg" → "abc"). */
export function idOfBackupName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

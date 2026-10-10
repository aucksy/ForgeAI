/**
 * "Save my data file" — the start-up error screen's last resort (audit DS-08).
 *
 * When ForgeAI cannot start, the member can still hand their raw database to the Android share
 * sheet (Drive, email, Files…) so nothing is lost even if they later reinstall.
 *
 *  1. Best: a CONSISTENT single-file copy. If the database opens, `VACUUM INTO` writes the whole
 *     thing (including anything still in the write-ahead log) into one file in the cache.
 *  2. Otherwise (it will not open, or the phone is too full for a copy): share the files exactly
 *     where expo-sqlite keeps them, `<documentDirectory>SQLite/forgeai.db`, plus its `-wal` file
 *     when that holds unsaved pages (a second share sheet). Sharing in place needs no free space.
 *
 * Read-only towards the member's data: it never writes to, repairs or deletes the database.
 * The file must be there (and not empty) BEFORE anything opens it: opening a missing database
 * CREATES an empty one, which would then be shared as "your data" — an empty file the member
 * would keep instead of nothing.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';

import { DB_NAME, getDbIfOpen } from '@/db';

export type SaveDataFileResult =
  | { ok: true; files: number; consistent: boolean }
  | { ok: false; reason: 'no-share' | 'no-file' | 'failed'; detail?: string };

const MIME = 'application/vnd.sqlite3';

/** What the start-up error screen says when there is no data file to save. */
export const NO_DATA_FILE_MESSAGE = 'No data file found on this phone.';

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

/** The name the member sees in the share sheet. */
export function dataFileName(now: Date = new Date()): string {
  return `forgeai-data-${stamp(now)}.db`;
}

/** `file:///data/…/x.db` → `/data/…/x.db` (SQLite wants a plain path). */
export function toPlainPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

async function consistentCopy(target: string): Promise<boolean> {
  let own: SQLite.SQLiteDatabase | null = null;
  try {
    const handle = getDbIfOpen() ?? (own = await SQLite.openDatabaseAsync(DB_NAME));
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    await handle.runAsync('VACUUM INTO ?', [toPlainPath(target)]);
    const info = await FileSystem.getInfoAsync(target);
    return info.exists && (info.size ?? 0) > 0;
  } catch {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    return false;
  } finally {
    if (own) await own.closeAsync().catch(() => undefined);
  }
}

export async function saveDataFile(now: Date = new Date()): Promise<SaveDataFileResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'no-share' };
    const name = dataFileName(now);
    const dialogTitle = 'Save your ForgeAI data file';

    // Where expo-sqlite keeps the database. Checked first: never open (= create) a missing one.
    const dir = `${FileSystem.documentDirectory ?? ''}SQLite/`;
    const main = `${dir}${DB_NAME}`;
    const mainInfo = await FileSystem.getInfoAsync(main);
    if (!mainInfo.exists || (mainInfo.size ?? 0) <= 0) return { ok: false, reason: 'no-file' };

    const cache = FileSystem.cacheDirectory;
    if (cache) {
      const target = `${cache}${name}`;
      if (await consistentCopy(target)) {
        await Sharing.shareAsync(target, { mimeType: MIME, dialogTitle });
        return { ok: true, files: 1, consistent: true };
      }
    }

    // Fallback: the files themselves, in place.
    await Sharing.shareAsync(main, { mimeType: MIME, dialogTitle });
    let files = 1;
    const wal = `${main}-wal`;
    const walInfo = await FileSystem.getInfoAsync(wal);
    if (walInfo.exists && (walInfo.size ?? 0) > 0) {
      // Keep it next to the main file under the same name + "-wal" so SQLite reads both.
      await Sharing.shareAsync(wal, { mimeType: 'application/octet-stream', dialogTitle: `${dialogTitle} (part 2 of 2)` });
      files = 2;
    }
    return { ok: true, files, consistent: false };
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
}

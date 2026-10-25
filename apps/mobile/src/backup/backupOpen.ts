/**
 * "Restore from a backup", step 1 (R-123): open a picked file and say what is in it — nothing on
 * the phone changes. A MettleUp backup ZIP (or its backup.json on its own) opens; anything else is
 * refused with plain words.
 */
import { BACKUP_JSON_NAME, backupSummary, DAMAGED_BACKUP, NOT_A_BACKUP, parseBackup, type BackupFile } from './backupFormat';
import type { BackupIo } from './backupIo';
import { listZipEntries, looksLikeZip, readEntry, utf8Decode, ZipError, type ZipEntry, type ZipSource } from './zipStore';

export interface OpenedBackup {
  /** The picked file (a copy in the app's cache). */
  uri: string;
  file: BackupFile;
  /** The ZIP's entries by name (none for a bare backup.json: no photos then). */
  entries: Map<string, ZipEntry>;
  /** "512 workouts, 9 routines, … saved on 25 Oct 2026 by ForgeAI 0.55.2". */
  summary: string;
  /** The photos' size, for the room check before the restore. */
  photoBytes: number;
}

export type OpenResult = { ok: true; backup: OpenedBackup } | { ok: false; why: string };

export const REPACKED_BACKUP =
  'This backup was packed again by another app, so MettleUp can’t read it. Use the file exactly as MettleUp saved it. Nothing was changed.';

/** A bare backup.json bigger than this is not one MettleUp wrote. */
const MAX_JSON_BYTES = 64 * 1024 * 1024;

function words(e: unknown): string {
  if (e instanceof ZipError) return e.problem === 'compressed' ? REPACKED_BACKUP : e.problem === 'not-zip' ? NOT_A_BACKUP : DAMAGED_BACKUP;
  return DAMAGED_BACKUP;
}

/** Open and check a backup file. Never throws: every problem comes back as words. */
export async function openBackup(io: BackupIo, uri: string): Promise<OpenResult> {
  let h: ReturnType<BackupIo['openRead']>;
  try {
    h = io.openRead(uri);
  } catch (e) {
    console.warn('[backup] the picked file could not be opened', e);
    return { ok: false, why: 'MettleUp couldn’t open that file. Pick it again, or save it to your phone first.' };
  }
  try {
    const src: ZipSource = { size: h.size, readAt: (o, n) => h.readAt(o, n) };
    if (h.size < 4) return { ok: false, why: NOT_A_BACKUP };
    const head = h.readAt(0, 4);
    let json: string;
    const entries = new Map<string, ZipEntry>();
    if (looksLikeZip(head)) {
      for (const e of await listZipEntries(src)) entries.set(e.name, e);
      const main = entries.get(BACKUP_JSON_NAME);
      if (!main) return { ok: false, why: NOT_A_BACKUP };
      json = utf8Decode(await readEntry(src, main));
    } else if (head[0] === 0x7b /* { */ || (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf)) {
      if (h.size > MAX_JSON_BYTES) return { ok: false, why: NOT_A_BACKUP };
      json = utf8Decode(h.readAt(0, h.size)).replace(/^﻿/, '');
    } else {
      return { ok: false, why: NOT_A_BACKUP };
    }
    const parsed = parseBackup(json);
    if (!parsed.ok) return parsed;
    const file = parsed.file;
    // A photo whose picture is not in the file (a bare backup.json, or a damaged ZIP) is left out.
    file.photos = file.photos.filter((p) => {
      const e = entries.get(p.file);
      return e != null && e.method === 0;
    });
    file.counts = { ...file.counts, photos: file.photos.length };
    const photoBytes = file.photos.reduce((s, p) => s + (entries.get(p.file)?.size ?? 0), 0);
    return { ok: true, backup: { uri, file, entries, summary: backupSummary(file), photoBytes } };
  } catch (e) {
    console.warn('[backup] the picked file is not a backup this app can read', e);
    return { ok: false, why: words(e) };
  } finally {
    h.close();
  }
}

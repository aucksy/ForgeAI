import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { workoutsNotInBackup } from './restoreImpact';
import { create } from 'zustand';

import type { SettingsBlob } from '@/backup/backupFormat';
import { deviceBackupIo } from '@/backup/backupIo';
import { openBackup, type OpenedBackup } from '@/backup/backupOpen';
import { restoreBackup } from '@/backup/backupRestore';
import { saveBackupZip } from '@/backup/backupSave';
import { deviceSettingsIo } from '@/backup/backupSettings';
import { noSpaceText, SAVE_EMPTY } from '@/backup/backupText';
import {
  downloadNewestBackup,
  DriveError,
  getCurrentDriveUser,
  isDriveConfigured,
  newestDriveBackup,
  refuseEmptyOverwrite,
  signInToDrive,
  signOutDrive,
  uploadBackupFile,
} from '@/cloud/drive';
import { PlainError, RestoredUntidyError } from '@/cloud/backupWords';
import {
  describeSnapshot,
  exportSnapshot,
  importSnapshot,
  parseSnapshot,
  replaceAllInTransaction,
  type BackupInfo,
} from '@/cloud/snapshot';
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { clearDemoFlag } from '@/onboarding/db/dataActions';
import { readDemoMeta, writeDemoMeta } from '@/onboarding/db/importSafety';
import { forgetCatalogSync, resyncExerciseCatalog } from '@/tracker/catalog/catalogSync';
import { clearMissingExerciseMedia } from '@/tracker/services/exerciseMedia';
import { useSettings } from '@/store/settingsStore';
import { countWorkouts } from '@/tracker/services/historyExport';

/** meta keys: a local "the user linked Google before" marker + the last backup time. */
const LINKED_KEY = 'drive_linked';
const LAST_BACKUP_KEY = 'drive_last_backup_at';

/**
 * DS-10: the phone's own data, saved just before a restore replaces it, so a wrong or failed
 * restore can be undone. One file in the app's documents (not in Android's backup: only the
 * SQLite folder is), replaced by the next restore.
 *
 * It carries the demo flags too (the snapshot leaves `meta` out), so undoing a restore made over
 * the demo brings back the demo AS the demo. It lasts 24 hours: after that the phone has moved on
 * and the old copy would only take newer training away. Until then the confirm says how many
 * workouts saved since the restore an undo would take away.
 */
const SAFETY_FILE = 'forgeai-before-restore.json';
function safetyUri(): string | null {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}${SAFETY_FILE}` : null;
}

/** How long "Undo the last restore" stays offered. */
export const UNDO_RESTORE_TTL_MS = 24 * 60 * 60 * 1000;

interface SafetyFile {
  kind: 'forgeai-before-restore';
  savedAt: number;
  /** The phone's data before the restore (a snapshot envelope as JSON). */
  snapshot: string;
  /** The demo flags before the restore. */
  meta: Record<string, string | null>;
  /** The workouts the restore brought in: anything else found later is newer. */
  restoredSessionIds: string[];
  /**
   * R-123, a restore of a backup FILE: what it added beside the database (photo rows, the picture
   * files, the settings it replaced), so Undo takes those away again too. Absent for a database-only
   * restore.
   */
  added?: { photoRows: { progress: string[]; workout: string[]; exercise: string[] }; files: string[]; settings: SettingsBlob | null };
}

/** Has the copy expired? PURE. */
export function safetyCopyExpired(savedAt: number, now: number): boolean {
  return !(savedAt > 0) || now - savedAt >= UNDO_RESTORE_TTL_MS || now < savedAt;
}

/** The Undo confirm's body, naming the newer workouts it would take away. PURE. */
export function undoRestoreBody(newerWorkouts: number): string {
  const base = 'This puts back what was on this phone before the last restore.';
  if (newerWorkouts <= 0) return base;
  return `${base} ${newerWorkouts} workout${newerWorkouts === 1 ? '' : 's'} saved since the restore will be lost.`;
}

/** The safety file, or null when there is none, it is unreadable, or it has expired (then it is removed). */
async function readSafetyFile(): Promise<SafetyFile | null> {
  const uri = safetyUri();
  if (!uri) return null;
  const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
  if (!info.exists) return null;
  let file: SafetyFile | null = null;
  try {
    const raw = JSON.parse(await FileSystem.readAsStringAsync(uri)) as Partial<SafetyFile> | null;
    // An older version wrote the bare snapshot (no time, no demo flags): treated as expired.
    if (raw && raw.kind === 'forgeai-before-restore' && typeof raw.snapshot === 'string') file = raw as SafetyFile;
  } catch {
    file = null;
  }
  if (!file || safetyCopyExpired(Number(file.savedAt), Date.now())) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    return null;
  }
  return file;
}

/** Workouts on the phone now that the restore did not bring in. */
async function countNewerWorkouts(restoredSessionIds: readonly string[]): Promise<number> {
  const restored = new Set(restoredSessionIds);
  const rows = await getDb().getAllAsync<{ id: string }>('SELECT id FROM workout_sessions');
  return rows.filter((r) => !restored.has(r.id)).length;
}

interface FoundBackup extends BackupInfo {
  /** A backup older versions wrote (the database only): its JSON, re-validated on apply. */
  json?: string;
  /** R-123: the backup FILE, downloaded to the cache and opened. */
  file?: OpenedBackup;
  /** "512 workouts, 9 routines, … saved on 25 Oct 2026 by MettleUp 0.57.0" (a backup file only). */
  summary?: string;
}

export interface BackupState {
  ready: boolean;
  configured: boolean;
  googleEmail: string | null;
  lastBackupAt: string | null;
  busy: boolean;
  /** A downloaded-but-not-yet-applied backup, awaiting the user's confirm. */
  found: FoundBackup | null;
  init: () => Promise<void>;
  /** Returns the linked email, or null if the user cancelled. Throws on real errors. */
  linkGoogle: () => Promise<string | null>;
  unlinkGoogle: () => Promise<void>;
  backupNow: () => Promise<void>;
  /** Downloads + validates the Drive backup (no DB writes) and stashes it for confirm. */
  checkForBackup: () => Promise<{ found: boolean }>;
  /** C4-9: workouts on this phone the found backup does not hold (a restore removes them). */
  foundRemoves: () => Promise<number>;
  clearFound: () => void;
  /** Applies the stashed backup to SQLite (DELETE-first + insert). Returns false
   *  (a no-op) if there's no stashed backup — so callers don't report a false success. */
  restoreFound: () => Promise<boolean>;
  /** True when a safety copy from before the last restore is on this phone. */
  canUndoRestore: boolean;
  /** Put back what was on this phone before the last restore. Returns false when there is no copy. */
  undoRestore: () => Promise<boolean>;
  /** Before the Undo confirm: is a (non-expired) copy there, and how many newer workouts would go. */
  undoRestoreImpact: () => Promise<{ available: boolean; newerWorkouts: number }>;
}

/**
 * 16 Oct 2026 review: the restore cleared the one-time repairs' marks (snapshot.ts,
 * `RERUN_AFTER_RESTORE`) — a backup made before them brings back what they put right (an older
 * version's 85 kg x 12 lighter-set 1-rep-max record). They run now, in start-up's order, not only
 * at the next start. A failure is logged; its mark stays clear, so it tries again next start.
 */
async function rerunRepairs(): Promise<void> {
  const pr = await import('@/tracker/services/prRebuild');
  for (const fix of [pr.fixSingleE1rmRecords, pr.fixLongSetE1rmRecords, pr.fixLighterSetE1rmRecords]) {
    await enqueueWrite(fix).catch((e: unknown) => console.warn('[ForgeErr] restore: a record fix failed (tries again next start)', e));
  }
  // Queues its own writes: never inside another queued job.
  await import('@/tracker/services/linkFolderRepair')
    .then((m) => m.repairLinkFolders())
    .catch((e: unknown) => console.warn('[ForgeErr] restore: the folder repair failed (tries again next start)', e));
}

/** After a restore: take the demo badge off, run the repairs, re-link the library, clear media paths that aren't here. */
async function afterReplace(): Promise<void> {
  await clearDemoFlag();
  // Review fix (IM-07): a backup from before Phase 4 brings workouts imported the old way; the
  // restore cleared the repair's mark, so they are put right now, not at the next start. Before the
  // record fixes: those order workouts by their start.
  await import('@/tracker/services/importClockRepair')
    .then((m) => m.repairImportedClockTimes())
    .catch(() => 0); // quiet: the mark stays clear, so the next start repairs them
  await rerunRepairs();
  await resyncExerciseCatalog(false).catch(() => undefined);
  await clearMissingExerciseMedia().catch(() => undefined);
}

/**
 * 16 Oct 2026 review: the last restore replaced the data but a step after it failed, so the member
 * is told to tap Restore again. That second restore must keep the safety copy from BEFORE the first
 * (re-copying would save the restored data, and Undo could never bring the phone's own back).
 * In memory only: it covers this restore and its retry, not a later one after a restart.
 */
let untidyRestore = false;

/** R-123: take away what a backup FILE's restore added beside the database (photo rows and files, settings). */
async function undoAdded(added: NonNullable<SafetyFile['added']>): Promise<void> {
  await enqueueWrite(async () => {
    const db = getDb();
    for (const id of added.photoRows.progress) await db.runAsync('DELETE FROM progress_photos WHERE id = ?', [id]);
    for (const id of added.photoRows.workout) await db.runAsync('DELETE FROM workout_photos WHERE id = ?', [id]);
  });
  for (const f of added.files) deviceBackupIo.remove(f);
  if (added.settings) await deviceSettingsIo.apply(added.settings).catch((e: unknown) => console.warn('[ForgeErr] undo restore: settings not all put back', e));
}

export const useBackup = create<BackupState>()((set, get) => ({
  ready: false,
  configured: isDriveConfigured(),
  googleEmail: null,
  lastBackupAt: null,
  busy: false,
  found: null,
  canUndoRestore: false,

  init: async () => {
    if (get().ready) return;
    const lastBackupAt = await getMeta(LAST_BACKUP_KEY);
    const canUndoRestore = (await readSafetyFile().catch(() => null)) !== null;
    set({ canUndoRestore });
    // OFFLINE FIREWALL: only touch Google if the user linked it before (a local
    // marker). A never-linked demo user makes zero Drive/network calls here.
    let googleEmail: string | null = null;
    let linked = false;
    if (isDriveConfigured() && (await getMeta(LINKED_KEY)) === '1') {
      linked = true;
      googleEmail = await getCurrentDriveUser().catch((e: unknown) => {
        console.warn('[backup] could not read the linked Google account (offline?)', e);
        return null;
      });
    }
    // Review 21 Oct: linked, but the account could not be read (offline at the gym): not "ready",
    // so the next init tries again instead of showing the member as unlinked all session.
    set({ ready: !(linked && !googleEmail), configured: isDriveConfigured(), googleEmail, lastBackupAt });
  },

  linkGoogle: async () => {
    set({ busy: true });
    try {
      const email = await signInToDrive();
      if (email) {
        await setMeta(LINKED_KEY, '1');
        set({ googleEmail: email });
      }
      return email;
    } finally {
      set({ busy: false });
    }
  },

  unlinkGoogle: async () => {
    set({ busy: true });
    try {
      await signOutDrive();
      await setMeta(LINKED_KEY, '0');
      set({ googleEmail: null, found: null });
    } finally {
      set({ busy: false });
    }
  },

  backupNow: async () => {
    set({ busy: true });
    try {
      // DS-10: an empty phone (a fresh install) must never push out a real backup.
      const workouts = await countWorkouts();
      const refuse = refuseEmptyOverwrite(workouts, workouts > 0 ? null : await newestDriveBackup());
      if (refuse) throw new DriveError(refuse);
      // R-123: the SAME file "Save a backup" makes (everything, photos and settings too), uploaded
      // from disk; the local copy goes once it is up.
      const saved = await saveBackupZip(deviceBackupIo, {
        app: 'MettleUp',
        appVersion: Constants.expoConfig?.version ?? '',
        units: useSettings.getState().unitSystem,
        settings: await deviceSettingsIo.read(),
      });
      if (saved.kind === 'empty') throw new PlainError(SAVE_EMPTY);
      if (saved.kind === 'no-space') throw new PlainError(noSpaceText(saved.needBytes, saved.freeBytes));
      if (saved.kind === 'too-big') throw new PlainError(noSpaceText(saved.needBytes, 0));
      try {
        const at = await uploadBackupFile(saved.uri, saved.bytes, workouts);
        await setMeta(LAST_BACKUP_KEY, at);
        set({ lastBackupAt: at });
      } finally {
        deviceBackupIo.remove(saved.uri);
      }
    } finally {
      set({ busy: false });
    }
  },

  checkForBackup: async () => {
    set({ busy: true });
    try {
      const prev = get().found?.file?.uri;
      if (prev) deviceBackupIo.remove(prev);
      const got = await downloadNewestBackup(deviceBackupIo.cacheDir);
      if (!got) {
        set({ found: null });
        return { found: false };
      }
      if (got.old) {
        // A backup an older version wrote: the database only, restored the old way.
        const json = await FileSystem.readAsStringAsync(got.uri);
        deviceBackupIo.remove(got.uri);
        const env = parseSnapshot(json); // throws on a corrupt / foreign backup
        set({ found: { ...describeSnapshot(env), json } });
        return { found: true };
      }
      const opened = await openBackup(deviceBackupIo, got.uri);
      if (!opened.ok) {
        deviceBackupIo.remove(got.uri);
        throw new PlainError(opened.why);
      }
      const f = opened.backup.file;
      set({
        found: { exportedAt: f.createdAt, workouts: f.counts.workouts, meals: f.rows.meals?.length ?? 0, file: opened.backup, summary: opened.backup.summary },
      });
      return { found: true };
    } finally {
      set({ busy: false });
    }
  },

  clearFound: () => {
    const uri = get().found?.file?.uri;
    if (uri) deviceBackupIo.remove(uri);
    set({ found: null });
  },

  foundRemoves: async () => {
    const found = get().found;
    if (!found) return 0;
    const rows = await getDb().getAllAsync<{ id: string }>('SELECT id FROM workout_sessions');
    if (found.file) {
      const inFile = new Set(found.file.file.items.filter((i) => i[0] === 'w').map((i) => i[1]));
      return rows.filter((r) => !inFile.has(r.id)).length;
    }
    if (!found.json) return 0;
    return workoutsNotInBackup(rows.map((r) => r.id), parseSnapshot(found.json));
  },

  restoreFound: async () => {
    const found = get().found;
    if (!found) return false; // already applied / cleared — caller must not claim success
    set({ busy: true });
    try {
      const env = found.json ? parseSnapshot(found.json) : null;
      // DS-10: a safety copy of this phone first. If it can't be saved, nothing is replaced.
      const uri = safetyUri();
      if (!uri) throw new PlainError('Could not save a copy of this phone’s data first, so nothing was changed.');
      const restoredSessionIds = env
        ? (env.tables['workout_sessions'] ?? []).map((r) => String(r.id))
        : (found.file?.file.items ?? []).filter((i) => i[0] === 'w').map((i) => i[1]);
      try {
        // The retry of a restore whose tidy-up failed: the copy from before it stays (only the
        // workouts it brings in are updated) — unless the member has saved a workout since.
        const kept = untidyRestore ? await readSafetyFile() : null;
        const copy: SafetyFile =
          kept && (await countNewerWorkouts(kept.restoredSessionIds ?? [])) === 0
            ? { ...kept, restoredSessionIds }
            : {
                kind: 'forgeai-before-restore',
                savedAt: Date.now(),
                snapshot: await exportSnapshot(),
                meta: await readDemoMeta(),
                restoredSessionIds,
              };
        await FileSystem.writeAsStringAsync(uri, JSON.stringify(copy));
      } catch (e) {
        console.warn('[ForgeErr] restore: the safety copy could not be written', e);
        throw new PlainError('Could not save a copy of this phone’s data first (is the phone full?), so nothing was changed.');
      }
      set({ canUndoRestore: true });
      // Before the replace commits: a kill right after it still re-syncs the library.
      await forgetCatalogSync().catch(() => undefined);
      if (env) {
        // One transaction: a failed restore changes nothing (and the safety copy is kept).
        await importSnapshot(env);
      } else if (found.file) {
        // R-123: the backup FILE (the same restore as "Restore from a backup": photos, settings and
        // records too). What it adds beside the database goes into the safety copy, for Undo.
        const r = await restoreBackup(deviceBackupIo, found.file, 'replace', { settings: deviceSettingsIo });
        if (r.kind === 'no-space') throw new PlainError(noSpaceText(r.needBytes, r.freeBytes));
        const kept = await readSafetyFile();
        if (kept) {
          const withAdded: SafetyFile = { ...kept, added: { photoRows: r.undo.photoRows, files: r.undo.files, settings: r.undo.settings } };
          await FileSystem.writeAsStringAsync(uri, JSON.stringify(withAdded)).catch((e: unknown) =>
            console.warn('[ForgeErr] restore: the photos and settings it added are not in the undo copy', e),
          );
        }
        deviceBackupIo.remove(found.file.uri);
      }
      // From here this phone holds the backup's data: the found backup is used up.
      set({ found: null });
      // Real history has replaced whatever was here — it is no longer demo data, so the badge
      // must not linger. Phase 2: an older backup holds the old library — link it to the bundled
      // one. The backup has each exercise's own photo/video PATH, not the file: clear the ones
      // that aren't on this phone so the library drawing shows instead of a blank square.
      try {
        await afterReplace();
      } catch (e) {
        // 16 Oct 2026 review: the data WAS replaced — never "nothing was changed".
        console.warn('[ForgeErr] restore: a step after the data swap failed', e);
        untidyRestore = true;
        throw new RestoredUntidyError();
      }
      untidyRestore = false;
      return true;
    } finally {
      set({ busy: false });
    }
  },

  undoRestoreImpact: async () => {
    const file = await readSafetyFile().catch(() => null);
    if (!file) {
      set({ canUndoRestore: false });
      return { available: false, newerWorkouts: 0 };
    }
    return { available: true, newerWorkouts: await countNewerWorkouts(file.restoredSessionIds ?? []) };
  },

  undoRestore: async () => {
    const uri = safetyUri();
    if (!uri) return false;
    set({ busy: true });
    try {
      const file = await readSafetyFile();
      if (!file) {
        set({ canUndoRestore: false });
        return false;
      }
      const env = parseSnapshot(file.snapshot);
      await forgetCatalogSync().catch(() => undefined);
      // The data and its demo flags in ONE queued transaction: what was a demo is a demo again.
      await enqueueWrite(() =>
        getDb().withExclusiveTransactionAsync(async (tx) => {
          await replaceAllInTransaction(tx, env);
          await writeDemoMeta(tx, file.meta ?? {});
        }),
      );
      if (file.added) {
        // R-123: the photos and settings a backup file brought in go too.
        await undoAdded(file.added);
      }
      const demo = (file.meta?.demo_data ?? null) === '1';
      await resyncExerciseCatalog(demo).catch(() => undefined);
      await clearMissingExerciseMedia().catch(() => undefined);
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      untidyRestore = false;
      set({ canUndoRestore: false });
      return true;
    } finally {
      set({ busy: false });
    }
  },
}));

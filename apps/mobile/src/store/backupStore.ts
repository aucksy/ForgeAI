import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import {
  backupToDrive,
  DriveError,
  getCurrentDriveUser,
  isDriveConfigured,
  newestDriveBackup,
  refuseEmptyOverwrite,
  restoreFromDrive,
  signInToDrive,
  signOutDrive,
} from '@/cloud/drive';
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
  /** The raw downloaded JSON, re-validated on apply. */
  json: string;
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

/** After any restore (or undo): re-link the library and clear media paths that aren't here. */
async function afterReplace(): Promise<void> {
  await clearDemoFlag();
  await resyncExerciseCatalog(false).catch(() => undefined);
  await clearMissingExerciseMedia().catch(() => undefined);
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
    if (isDriveConfigured() && (await getMeta(LINKED_KEY)) === '1') {
      googleEmail = await getCurrentDriveUser();
    }
    set({ ready: true, configured: isDriveConfigured(), googleEmail, lastBackupAt });
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
      const json = await exportSnapshot();
      const at = await backupToDrive(json, workouts);
      await setMeta(LAST_BACKUP_KEY, at);
      set({ lastBackupAt: at });
    } finally {
      set({ busy: false });
    }
  },

  checkForBackup: async () => {
    set({ busy: true });
    try {
      const json = await restoreFromDrive();
      if (!json) {
        set({ found: null });
        return { found: false };
      }
      const env = parseSnapshot(json); // throws on a corrupt / foreign backup
      set({ found: { ...describeSnapshot(env), json } });
      return { found: true };
    } finally {
      set({ busy: false });
    }
  },

  clearFound: () => set({ found: null }),

  restoreFound: async () => {
    const found = get().found;
    if (!found) return false; // already applied / cleared — caller must not claim success
    set({ busy: true });
    try {
      const env = parseSnapshot(found.json);
      // DS-10: a safety copy of this phone first. If it can't be saved, nothing is replaced.
      const uri = safetyUri();
      if (!uri) throw new Error('Could not save a copy of this phone’s data first, so nothing was changed.');
      try {
        const copy: SafetyFile = {
          kind: 'forgeai-before-restore',
          savedAt: Date.now(),
          snapshot: await exportSnapshot(),
          meta: await readDemoMeta(),
          restoredSessionIds: (env.tables['workout_sessions'] ?? []).map((r) => String(r.id)),
        };
        await FileSystem.writeAsStringAsync(uri, JSON.stringify(copy));
      } catch {
        throw new Error('Could not save a copy of this phone’s data first (is the phone full?), so nothing was changed.');
      }
      set({ canUndoRestore: true });
      // Before the replace commits: a kill right after it still re-syncs the library.
      await forgetCatalogSync().catch(() => undefined);
      // One transaction: a failed restore changes nothing (and the safety copy is kept).
      await importSnapshot(env);
      // Real history has replaced whatever was here — it is no longer demo data, so the badge
      // must not linger. Phase 2: an older backup holds the old library — link it to the bundled
      // one. The backup has each exercise's own photo/video PATH, not the file: clear the ones
      // that aren't on this phone so the library drawing shows instead of a blank square.
      await afterReplace();
      set({ found: null });
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
      const demo = (file.meta?.demo_data ?? null) === '1';
      await resyncExerciseCatalog(demo).catch(() => undefined);
      await clearMissingExerciseMedia().catch(() => undefined);
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      set({ canUndoRestore: false });
      return true;
    } finally {
      set({ busy: false });
    }
  },
}));

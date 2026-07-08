import { create } from 'zustand';

import {
  backupToDrive,
  getCurrentDriveUser,
  isDriveConfigured,
  restoreFromDrive,
  signInToDrive,
  signOutDrive,
} from '@/cloud/drive';
import {
  describeSnapshot,
  exportSnapshot,
  importSnapshot,
  parseSnapshot,
  type BackupInfo,
} from '@/cloud/snapshot';
import { getMeta, setMeta } from '@/db';

/** meta keys: a local "the user linked Google before" marker + the last backup time. */
const LINKED_KEY = 'drive_linked';
const LAST_BACKUP_KEY = 'drive_last_backup_at';

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
}

export const useBackup = create<BackupState>()((set, get) => ({
  ready: false,
  configured: isDriveConfigured(),
  googleEmail: null,
  lastBackupAt: null,
  busy: false,
  found: null,

  init: async () => {
    if (get().ready) return;
    const lastBackupAt = await getMeta(LAST_BACKUP_KEY);
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
      const json = await exportSnapshot();
      const at = await backupToDrive(json);
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
      await importSnapshot(env);
      set({ found: null });
      return true;
    } finally {
      set({ busy: false });
    }
  },
}));

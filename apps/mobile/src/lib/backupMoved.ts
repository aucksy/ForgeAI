/**
 * R-320 (owner, 4 Nov 2026: "Backups - Lets go with A"): Google Drive backup stopped; the MettleUp account
 * is the one backup. A phone that has Google Drive linked from an older version is told ONCE, on the
 * Workout tab (the notice slot's 'backup' place, where "last backed up to Google Drive N days ago" was):
 * "Backups now go to your MettleUp account. Sign in to keep your workouts safe." with "Sign in" (opens
 * Settings -> Backup and restore) and "Got it". Either tap ends it for good on this phone.
 * Never shown to a member already signed in (nothing to do), nor on a build that cannot sign in.
 *
 * The rule is PURE (`backupMovedDue`); the reads never throw.
 * TODO(R-320, remove ~Feb 2027): with the Drive restore link, once old Drive phones have seen it.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

// member-words (4 Nov 2026): what changed, then what to do, one short line each.
export const BACKUP_MOVED_WORDS = {
  body: 'Backups now go to your MettleUp account. Sign in to keep your workouts safe.',
  button: 'Sign in',
  close: 'Got it',
} as const;

/** Meta key: '1' once the member closed the card (never inside a backup: a new phone has no Drive link). */
export const BACKUP_MOVED_KEY = 'backup_moved_seen';
/** The backup store's own key (store/backupStore.ts): '1' while Google Drive is linked on this phone. */
const DRIVE_LINKED_KEY = 'drive_linked';

export interface BackupMovedFacts {
  driveLinked: boolean;
  seen: boolean;
  signedIn: boolean;
  /** This build can sign in to a MettleUp account. */
  accountAvailable: boolean;
}

/** PURE. */
export function backupMovedDue(f: BackupMovedFacts): boolean {
  return f.accountAvailable && f.driveLinked && !f.seen && !f.signedIn;
}

/** Drive link and "seen", from the phone. Never throws (a failed read says nothing: no card). */
export async function readBackupMoved(): Promise<{ driveLinked: boolean; seen: boolean }> {
  try {
    const [linked, seen] = await Promise.all([getMeta(DRIVE_LINKED_KEY), getMeta(BACKUP_MOVED_KEY)]);
    return { driveLinked: linked === '1', seen: seen === '1' };
  } catch (e) {
    console.warn('[backup moved] could not read the Drive link', e);
    return { driveLinked: false, seen: true };
  }
}

/** "Sign in" or "Got it": the card never shows again on this phone. */
export async function markBackupMovedSeen(): Promise<void> {
  await enqueueWrite(() => setMeta(BACKUP_MOVED_KEY, '1'));
}

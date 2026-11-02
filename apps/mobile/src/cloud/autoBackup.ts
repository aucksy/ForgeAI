/**
 * Automatic workout backup (owner backlog, Planned; built 21 Oct 2026): "members can't lose their
 * history". For a member who linked Google Drive (Settings → Backup), the app backs up by itself
 * after each finished workout, and the Workout tab warns when the last backup is more than 3 days
 * old. A member who never linked Drive is never touched: no network call, no card (the offline
 * firewall in backupStore.init stays the gate). Failures are logged and retried after the next
 * workout; the member is told only through the 3-day card.
 *
 * R-282 (owner, 2 Nov 2026: "automatic Google Drive backup after each workout"): a finished workout now
 * leaves a "backup owed" mark on the phone. A backup skipped for mobile data (or a failure) is tried again
 * whenever the app comes back to the screen, not only after the next workout. And a phone that never
 * backed up may make the FIRST automatic copy when Drive holds no backup yet (nothing to bury).
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { useBackup } from '@/store/backupStore';

/** Meta key: when a finished workout last asked for a backup ('' = none owed). Never inside a backup. */
export const BACKUP_OWED_KEY = 'auto_backup_owed';

/** The 3-day line after which the Workout tab says the backup is old. */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Two finishes close together back up once. */
export const MIN_GAP_MS = 10 * 60 * 1000;

export const AUTO_BACKUP_WORDS = {
  stale: (days: number) => `Your workouts were last backed up to Google Drive ${days} days ago.`,
  button: 'Back up now',
  done: 'Backed up to Google Drive.',
  failed: 'Backup failed. Nothing on this phone changed. Please try again.',
} as const;

/**
 * Back up after this workout? Linked, and THIS PHONE has backed up before (review MUST-FIX, 21 Oct:
 * a new phone that linked Drive but has not restored yet would make a 1-workout copy the newest on
 * Drive; restore takes the newest, and after 5 such copies the real one is pruned). The last-backup
 * time is kept on the phone only, never inside a backup, so a restored phone starts without it.
 * Not again within 10 minutes. PURE.
 */
export function autoBackupDue(linked: boolean, lastAt: string | null, now: number, driveEmpty = false): boolean {
  if (!linked) return false;
  // R-282: the first copy is safe when Drive has nothing it could bury.
  if (!lastAt) return driveEmpty;
  const t = Date.parse(lastAt);
  return !Number.isNaN(t) && now - t >= MIN_GAP_MS;
}

/**
 * Whole days since this phone's last backup when it is older than 3 days, else null. A phone that has
 * never backed up gets no card (the same new-phone case as above: Settings → Backup handles it, with
 * its restore-first checks). PURE.
 */
export function staleBackupDays(linked: boolean, lastAt: string | null, now: number): number | null {
  if (!linked || !lastAt) return null;
  const t = Date.parse(lastAt);
  if (Number.isNaN(t)) return null;
  const age = now - t;
  return age > STALE_AFTER_MS ? Math.floor(age / (24 * 60 * 60 * 1000)) : null;
}

/** After a finished workout: marks a backup owed, then tries it. Never throws. */
export async function autoBackupAfterWorkout(now = Date.now()): Promise<'done' | 'skipped' | 'failed'> {
  try {
    await enqueueWrite(() => setMeta(BACKUP_OWED_KEY, new Date(now).toISOString()));
  } catch (e) {
    console.warn('[auto backup] could not mark a backup owed; trying now only', e);
  }
  return backUpIfOwed(now, true);
}

/**
 * When a backup is owed (R-282): the app came back to the screen, or a workout just finished. Never throws;
 * never touches the network for an unlinked member or when nothing is owed.
 */
export async function backUpIfOwed(now = Date.now(), justFinished = false): Promise<'done' | 'skipped' | 'failed'> {
  try {
    const owed = justFinished || Boolean(await getMeta(BACKUP_OWED_KEY));
    if (!owed) return 'skipped';
    const store = useBackup.getState();
    await store.init();
    const s = useBackup.getState();
    if (!s.configured || s.busy || !s.googleEmail) return 'skipped';
    // A phone that never backed up: only when Drive is empty (one look, only for a linked member).
    const driveEmpty = s.lastBackupAt
      ? false
      : await import('./drive').then((m) => m.peekNewestDriveBackup()).then((f) => f == null);
    if (!autoBackupDue(true, s.lastBackupAt, now, driveEmpty)) return 'skipped';
    // R-123: a Drive backup is the whole backup file (photos too), so the automatic one waits for
    // Wi-Fi rather than spend mobile data after every workout; "Back up now" works on any network.
    const net = await import('@react-native-community/netinfo')
      .then((m) => m.default.fetch())
      .catch((e: unknown) => {
        console.warn('[auto backup] could not tell the network; trying anyway', e);
        return null;
      });
    if (net?.type === 'cellular') return 'skipped';
    await s.backupNow();
    await enqueueWrite(() => setMeta(BACKUP_OWED_KEY, ''));
    return 'done';
  } catch (e) {
    console.warn('[auto backup] failed; tries again when the app comes back', e);
    return 'failed';
  }
}

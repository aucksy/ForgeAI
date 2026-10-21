/**
 * Automatic workout backup (owner backlog, Planned; built 21 Oct 2026): "members can't lose their
 * history". For a member who linked Google Drive (Settings → Backup), the app backs up by itself
 * after each finished workout, and the Workout tab warns when the last backup is more than 3 days
 * old. A member who never linked Drive is never touched: no network call, no card (the offline
 * firewall in backupStore.init stays the gate). Failures are logged and retried after the next
 * workout; the member is told only through the 3-day card.
 */
import { useBackup } from '@/store/backupStore';

/** The 3-day line after which the Workout tab says the backup is old. */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Two finishes close together back up once. */
export const MIN_GAP_MS = 10 * 60 * 1000;

export const AUTO_BACKUP_WORDS = {
  stale: (days: number) => `Your workouts were last backed up to Google Drive ${days} days ago.`,
  never: 'Your workouts are not backed up to Google Drive yet.',
  button: 'Back up now',
  done: 'Backed up to Google Drive.',
  failed: "Couldn't back up. Check your internet and try again.",
} as const;

/** Back up after this workout? Linked, set up, and not backed up in the last 10 minutes. PURE. */
export function autoBackupDue(linked: boolean, lastAt: string | null, now: number): boolean {
  if (!linked) return false;
  const t = lastAt ? Date.parse(lastAt) : NaN;
  return Number.isNaN(t) || now - t >= MIN_GAP_MS;
}

/** Whole days since the last backup when it is older than 3 days (Infinity: never), else null. PURE. */
export function staleBackupDays(linked: boolean, lastAt: string | null, now: number): number | null {
  if (!linked) return null;
  const t = lastAt ? Date.parse(lastAt) : NaN;
  if (Number.isNaN(t)) return Infinity;
  const age = now - t;
  return age > STALE_AFTER_MS ? Math.floor(age / (24 * 60 * 60 * 1000)) : null;
}

/** After a finished workout. Never throws; never touches the network for an unlinked member. */
export async function autoBackupAfterWorkout(now = Date.now()): Promise<'done' | 'skipped' | 'failed'> {
  try {
    const store = useBackup.getState();
    await store.init();
    const s = useBackup.getState();
    if (!s.configured || s.busy || !autoBackupDue(Boolean(s.googleEmail), s.lastBackupAt, now)) return 'skipped';
    await s.backupNow();
    return 'done';
  } catch (e) {
    console.warn('[auto backup] failed; tries again after the next workout', e);
    return 'failed';
  }
}

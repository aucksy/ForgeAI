/**
 * Launch audit, 3 Nov 2026 (member app #3, HIGH): a member who uses the app without an account was
 * never told that their workouts live only on this phone. A lost or reset phone lost them all.
 *
 * After the member's 3rd workout (their own; the demo's never count), the Workout tab shows one card:
 * "Your workouts are only on this phone. ..." with a button to Settings -> Backup and restore, and
 * "Hide for 30 days". It never shows to a member who signed in, linked Google Drive, or has backed up
 * to Drive before, nor on a build without Drive backup (the button would lead nowhere useful).
 * It is one of the Workout tab's notices (lib/workoutNotices.ts), drawn last, one at a time.
 *
 * The rule is PURE (`safekeepDue`); the reads are below it and never throw.
 */
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { demoSessionIds } from '@/onboarding/db/dataActions';

/** The card shows from this many of the member's own workouts. */
export const SAFEKEEP_AFTER_WORKOUTS = 3;
/** "Hide for 30 days". */
export const SAFEKEEP_HIDE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// member-words (3 Nov 2026): a first-time reader, what it is about, what the button does.
export const SAFEKEEP_WORDS = {
  body: 'Your workouts are only on this phone. Back them up to Google Drive so you never lose them.',
  button: 'Back up my workouts',
  hide: 'Hide for 30 days',
} as const;

export interface SafekeepFacts {
  /** The member's own workouts (demo workouts left out). */
  workouts: number;
  /** Signed in with a MettleUp account (its own copy on our server). */
  signedIn: boolean;
  /** Google Drive backup was linked on this phone. */
  driveLinked: boolean;
  /** When the last Drive backup was made (null = never). */
  lastBackupAt: string | null;
  /** This build can back up to Google Drive. */
  driveAvailable: boolean;
  /** "Hide for 30 days" was tapped: hidden until this time (ms; null = never hidden). */
  hiddenUntil: number | null;
  now: number;
}

/** True when the card should show. PURE. */
export function safekeepDue(f: SafekeepFacts): boolean {
  if (!f.driveAvailable) return false;
  if (f.signedIn || f.driveLinked || f.lastBackupAt) return false;
  if (!(f.workouts >= SAFEKEEP_AFTER_WORKOUTS)) return false;
  if (f.hiddenUntil != null && Number.isFinite(f.hiddenUntil) && f.now < f.hiddenUntil) return false;
  return true;
}

/** The time a "Hide for 30 days" tapped now ends. PURE. */
export function safekeepHiddenUntil(now: number): number {
  return now + SAFEKEEP_HIDE_DAYS * DAY_MS;
}

/** A stored "hidden until" back to a number; anything broken = never hidden. PURE. */
export function parseHiddenUntil(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const HIDE_KEY = 'safekeep_hidden_until';
// The same keys the backup store keeps (store/backupStore.ts).
const DRIVE_LINKED_KEY = 'drive_linked';
const DRIVE_LAST_KEY = 'drive_last_backup_at';

/** The member's own workouts on this phone (the demo's left out). Never throws (0 on a failure). */
export async function ownWorkoutCount(): Promise<number> {
  try {
    const rows = await getDb().getAllAsync<{ id: string }>('SELECT id FROM workout_sessions');
    const demo = await demoSessionIds().catch(() => new Set<string>());
    return rows.filter((r) => !demo.has(r.id)).length;
  } catch (e) {
    console.warn('[safekeep] could not count workouts', e);
    return 0;
  }
}

/** What the phone has saved about backups. Never throws. */
export async function readSafekeepMeta(): Promise<{ driveLinked: boolean; lastBackupAt: string | null; hiddenUntil: number | null }> {
  try {
    const [linked, last, hidden] = await Promise.all([getMeta(DRIVE_LINKED_KEY), getMeta(DRIVE_LAST_KEY), getMeta(HIDE_KEY)]);
    return { driveLinked: linked === '1', lastBackupAt: last || null, hiddenUntil: parseHiddenUntil(hidden) };
  } catch (e) {
    console.warn('[safekeep] could not read the backup state', e);
    // Unknown: say nothing rather than nag a member who may well be backed up.
    return { driveLinked: true, lastBackupAt: null, hiddenUntil: null };
  }
}

/** "Hide for 30 days". */
export async function hideSafekeep(now = Date.now()): Promise<void> {
  await enqueueWrite(() => setMeta(HIDE_KEY, String(safekeepHiddenUntil(now))));
}

/**
 * Launch audit, 3 Nov 2026 (member app #3, HIGH): a member who uses the app without an account was
 * never told that their workouts live only on this phone. A lost or reset phone lost them all.
 *
 * After the member's 3rd workout (their own; the demo's never count), the Workout tab shows one card:
 * "Your workouts are only on this phone. ..." with a button to Settings -> Backup and restore, and
 * "Hide for 30 days". It never shows to a member who signed in, nor on a build that cannot sign in
 * (the button would lead nowhere useful).
 * It is one of the Workout tab's notices (lib/workoutNotices.ts), drawn last, one at a time.
 *
 * R-320 (owner, 4 Nov 2026: "Backups - Lets go with A"): the MettleUp account is the one backup, so the
 * card points to signing in only. Google Drive no longer counts: Drive backups stopped, so a member who
 * linked Drive before is told once by the "Backups now go to your MettleUp account" card
 * (lib/backupMoved.ts) and, after that, by this card like everyone else.
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

// member-words (3 Nov 2026; R-320, 4 Nov): a first-time reader, what it is about, what the button does.
export const SAFEKEEP_WORDS = {
  body: 'Your workouts are only on this phone. Sign in with Google and MettleUp keeps them safe in your account.',
  button: 'Sign in to keep them safe',
  hide: 'Hide for 30 days',
} as const;

export interface SafekeepFacts {
  /** The member's own workouts (demo workouts left out). */
  workouts: number;
  /** Signed in with a MettleUp account (its own copy on our server). */
  signedIn: boolean;
  /** This build can sign in to a MettleUp account (useAccount.configured). */
  accountAvailable: boolean;
  /** "Hide for 30 days" was tapped: hidden until this time (ms; null = never hidden). */
  hiddenUntil: number | null;
  now: number;
}

/** True when the card should show. PURE. */
export function safekeepDue(f: SafekeepFacts): boolean {
  if (!f.accountAvailable) return false;
  if (f.signedIn) return false;
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

/** When "Hide for 30 days" ends. Never throws (a failed read = hidden for now, rather than nag). */
export async function readSafekeepHidden(now = Date.now()): Promise<number | null> {
  try {
    return parseHiddenUntil(await getMeta(HIDE_KEY));
  } catch (e) {
    console.warn('[safekeep] could not read when the card was hidden', e);
    return now + DAY_MS;
  }
}

/** "Hide for 30 days". */
export async function hideSafekeep(now = Date.now()): Promise<void> {
  await enqueueWrite(() => setMeta(HIDE_KEY, String(safekeepHiddenUntil(now))));
}

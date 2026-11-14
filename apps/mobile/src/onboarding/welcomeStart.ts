/**
 * R-131 (owner, 25 Oct 2026: "create three organized sections... I just want the user onboarding very
 * well organized and simple"): the words of the welcome's first view, and its pure helpers. Written with
 * the member-words skill; Gemini's second opinion gave the two questions ("Do you train at a gym?") and
 * the plainer replace warning. PURE.
 */
export const START_WORDS = {
  // R-273 / R-277 (owner, 1-2 Nov 2026): one hero screen. Approved words from the design canvas
  // (HgYB2U7cdYHvAJRRExDDSV): the headline, the line under it and the four ways in.
  title: 'Get stronger every week',
  sub: 'Log every set at the gym. See what you lifted the previous time.',
  googleButton: 'Continue with Google',
  joinGym: 'Join my gym',
  bringWorkouts: 'Bring workouts',
  useWithout: 'Use without an account',
  /** Spoken for the decorative set card (hidden from screen readers otherwise). */
  exampleCard: 'Example of a logged bench press',
  looking: 'Checking your Google Drive for a backup…',
  restoreButton: 'Restore my backup',
  notNow: 'Not now',
  nothing: 'No MettleUp backup in your Google Drive yet. Tap Next to set up the app.',
  /** After Google: on to the 3 setup questions. */
  next: 'Next',
  restoring: 'Bringing back your backup…',
  otherAccount: 'Use another Google account',
  // "Join my gym" screen.
  gymTitle: 'Join your gym',
  gymBody: "Check in, see your membership and get your trainer's plan.",
  scanTitle: 'Scan the poster at your gym',
  scanHint: 'It is on the wall near the front desk',
  orType: 'or type the gym code',
  codeLabel: 'Gym code',
  // "Bring workouts" screen.
  bringTitle: 'Bring your workouts',
  bringBody: 'Keep every set you logged before. Your history and best lifts come with it.',
  fromHevy: 'From Hevy',
  fromHevyHint: 'Export a file in Hevy. Pick it after 3 quick questions',
  fromStrong: 'From Strong',
  fromStrongHint: 'Export a file in Strong. Pick it after 3 quick questions',
  fromBackup: 'A MettleUp backup',
  fromBackupHint: 'A backup file saved on this phone',
  /** Only in a build whose Google button looks in the member's Google Drive (WelcomeGoogle goDrive). */
  driveNote: 'Saved a backup to Google Drive? Go back and tap Continue with Google to find it.',
  /** The title of the backup-file view (also the Settings row's name). */
  restoreFile: 'Restore from a backup',
  replaceTitle: 'Replace the workouts on this phone?',
  replaceConfirm: 'Replace',
} as const;

/** "20 Oct 2026" from an ISO time; '' when it cannot be read. PURE. */
export function backupDay(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** "We found your backup from 20 Oct 2026 with 412 workouts. Bring it back to this phone?" PURE. */
export function foundBackupLine(modifiedTime: string, workouts: number | null): string {
  const day = backupDay(modifiedTime);
  const from = day ? ` from ${day}` : '';
  const count = workouts == null ? '' : ` with ${workouts} ${workouts === 1 ? 'workout' : 'workouts'}`;
  return `We found your backup${from}${count}. Bring it back to this phone?`;
}

/** The replace warning when this phone already holds workouts (kept after "Remove demo data"). PURE. */
export function replaceBody(workouts: number): string {
  return workouts === 1
    ? 'The 1 workout on this phone is deleted and your backup takes its place.'
    : `The ${workouts} workouts on this phone are deleted and your backup takes their place.`;
}

/** Said when a backup came back but held no profile: the welcome stays up for the name. */
export const RESTORED_NO_PROFILE = 'Your workouts are back. Tap Next and add your name to carry on.';

/** The start view's line when workouts are kept on this phone (after "Remove demo data"). PURE. */
export function keptWorkoutsLine(n: number): string {
  return `Your ${n} workout${n === 1 ? ' is' : 's are'} still here. Tap "${START_WORDS.useWithout}" and add your details to carry on.`;
}

/**
 * After a welcome restore (even one whose tidy-up failed): 'open' when the app now opens on the backup,
 * else 'needs-name' — the welcome must stop waiting and say RESTORED_NO_PROFILE (UAT 1 Nov 2026: the
 * tidy-up path left the start view held with a spinning button for good). PURE.
 */
export function welcomeRestoreOutcome(status: string): 'open' | 'needs-name' {
  return status === 'ready' ? 'open' : 'needs-name';
}

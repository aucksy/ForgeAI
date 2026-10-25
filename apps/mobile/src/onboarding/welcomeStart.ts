/**
 * R-131 (owner, 25 Oct 2026: "create three organized sections... I just want the user onboarding very
 * well organized and simple"): the words of the welcome's first view, and its pure helpers. Written with
 * the member-words skill; Gemini's second opinion gave the two questions ("Do you train at a gym?") and
 * the plainer replace warning. PURE.
 */
export const START_WORDS = {
  title: 'Welcome to MettleUp',
  sub: 'Your gym workout tracker. Pick one way to start.',
  googleTitle: 'Sign in with Google',
  googleBody: 'We check your Google Drive for a MettleUp backup, so you can bring your workouts back.',
  googleButton: 'Continue with Google',
  looking: 'Checking your Google Drive for a backup…',
  restoreButton: 'Restore my backup',
  notNow: 'Not now',
  nothing: 'No MettleUp backup in your Google Drive yet. Tap "Start fresh" below to begin.',
  restoring: 'Bringing back your backup…',
  otherAccount: 'Use another Google account',
  gymTitle: 'Do you train at a gym?',
  gymBody: 'Your gym’s code unlocks check-in, your membership, trainer plans and the gym shop.',
  gymButton: 'Enter your gym code',
  haveTitle: 'Already have workouts?',
  haveBody: 'Bring them from a backup file, Hevy or Strong.',
  restoreFile: 'Restore from a backup',
  startFresh: 'Start fresh',
  startFreshNote: 'Answer 3 quick questions and start training. No sign-in needed.',
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

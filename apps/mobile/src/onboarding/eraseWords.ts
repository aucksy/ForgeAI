/**
 * R-319 item 5 (owner, 4 Nov 2026: "Erase all data ... simply states that all your data will be
 * removed from this device. But is it expected to also remove their data from our servers? And if
 * they are using Google Drive backup ... should we tell them that it will not delete it from
 * there?"). "Erase all data" now says plainly where the member's data lives and what goes:
 *   - signed in to a MettleUp account: a choice — this phone only (the copy on MettleUp stays and
 *     comes back at the next sign-in), or this phone AND the account (the same delete as Settings →
 *     Backup → "Delete my account", done first, so nothing is erased if it fails);
 *   - Google Drive used on this phone: the backup file in Drive stays, and the line says so;
 *   - neither: the one question as before. Health Connect and the gym keep their lines. PURE.
 */
export type EraseScope = 'phone' | 'phone-and-account';

export const ERASE_WORDS = {
  title: 'Erase all data?',
  confirm: 'Erase everything',
  chooseTitle: 'What do you want to erase?',
  chooseBody: 'Your workouts are on this phone and saved in your MettleUp account.',
  phoneOnly: 'Erase this phone only',
  phoneOnlySub: 'Your saved copy on MettleUp stays. It comes back when you sign in again.',
  withAccount: 'Erase this phone and delete my MettleUp account',
  withAccountSub: 'Your MettleUp account and everything saved in it are deleted too. This cannot be undone.',
  withAccountTitle: 'Erase this phone and delete your account?',
  withAccountConfirm: 'Erase and delete',
  cancel: 'Cancel',
  accountNotDeleted: 'Could not delete your MettleUp account, so nothing was erased. Check your internet and try again.',
  driveStays: 'Your backup file in Google Drive stays. Delete it in Google Drive if you want it gone.',
} as const;

/** Signed in to a MettleUp account: the member chooses; otherwise the one question as before. */
export function eraseNeedsChoice(signedIn: boolean): boolean {
  return signedIn;
}

/** What the phone part of the erase removes, in one line. */
export function erasePhoneWhat(withCoach: boolean): string {
  return `Every workout, record, routine, body entry, photo and video, ${withCoach ? 'your AI keys, ' : ''}your gym and Google Drive links, and your settings. This phone goes back to new.`;
}

/**
 * The final confirm's body for one choice. `scope` null = not signed in (the old single question).
 * Lines in order: what goes from the phone; the account (signed in); the Drive file; Health
 * Connect; the gym.
 */
export function eraseConfirmBody(opts: {
  scope: EraseScope | null;
  withCoach: boolean;
  driveUsed: boolean;
  healthConnectUsed: boolean;
  gymNote: string;
}): string {
  const lines = [erasePhoneWhat(opts.withCoach)];
  if (opts.scope === 'phone') lines.push(ERASE_WORDS.phoneOnlySub);
  if (opts.scope === 'phone-and-account') lines.push(ERASE_WORDS.withAccountSub);
  if (opts.driveUsed) lines.push(ERASE_WORDS.driveStays);
  if (opts.healthConnectUsed) lines.push('Workouts already sent to Health Connect stay there; remove them in Health Connect.');
  if (opts.gymNote) lines.push(opts.gymNote);
  return lines.join(' ');
}

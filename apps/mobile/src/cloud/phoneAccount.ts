/**
 * F237 "Phone number sign-in also backs up workouts" (owner, 25 Nov 2026, R-627: "This has to go now, today").
 * The rules and words of the phone number account, kept PURE so they are tested without a phone:
 *
 * - The proven number (one WhatsApp message) signs in to the member's MettleUp account through the Edge Function
 *   "phone-account" (supabase/functions/phone-account, migration 0099). The account has a made-up e-mail, never
 *   shown: Settings says "Backed up with your number ending in 67" (only the last 2 digits are kept on the phone).
 * - Members under 18 never have anything saved on MettleUp's server (audit FN-L4-phone-cloud-backup-ai-02: the
 *   privacy notice and terms say MettleUp is for people 18 and older).
 *
 * Words: member-words rules (one idea per sentence, the buttons named exactly). Shared code: Android and iPhone.
 */

/** The last 2 digits of a 10-digit number, or null. PURE. */
export function phoneEnd(mobile10: string | null | undefined): string | null {
  const d = (mobile10 ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-2) : null;
}

/** Profiles under 18 save nothing on MettleUp's server. An unknown age (null, 0) is not blocked. PURE. */
export const BACKUP_MIN_AGE = 18;
export function backupAllowedForAge(age: number | null | undefined): boolean {
  return !(typeof age === 'number' && age > 0 && age < BACKUP_MIN_AGE);
}

/** What the Edge Function answered, in one shape. PURE. */
export type PhoneAccountAnswer = { ok: true; tokenHash: string; fresh: boolean } | { ok: false; problem: PhoneAccountProblem };
export type PhoneAccountProblem = 'off' | 'bad-proof' | 'no-name' | 'offline' | 'server';

export function phoneAccountAnswerFrom(raw: unknown): PhoneAccountAnswer {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as { ok?: unknown; token_hash?: unknown; fresh?: unknown; error?: unknown };
  if (r.ok === true && typeof r.token_hash === 'string' && r.token_hash.length > 0) {
    return { ok: true, tokenHash: r.token_hash, fresh: r.fresh === true };
  }
  switch (r.error) {
    case 'OFF':
      return { ok: false, problem: 'off' };
    case 'BAD_PROOF':
      return { ok: false, problem: 'bad-proof' };
    case 'NO_NAME':
      return { ok: false, problem: 'no-name' };
    default:
      return { ok: false, problem: 'server' };
  }
}

export const PHONE_ACCOUNT_WORDS = {
  /** Settings card, not signed in: what it does for them first. */
  cardBody:
    'Confirm your phone number with one WhatsApp message to keep your workouts safe. MettleUp then saves your workouts, routines and body weight by itself. On a new phone, sign in with the same number and everything comes back.',
  /** Owner's yes, 25 Nov 2026. */
  privacy: 'If you sign in with your phone number, your number (kept only as a scrambled code) is used to find your saved workouts.',
  phoneButton: 'Continue with your phone number',
  googleButton: 'Use Google instead',
  signedIn: (end: string | null): string => (end ? `Backed up with your phone number ending in ${end}.` : 'Backed up with your phone number.'),
  saving: 'Saving your workouts to your number…',
  how: 'WhatsApp opens with a message to MettleUp ready. Send it, then come back to this app. You pay nothing, and we never message you.',
  waitingBody: 'After you send it, come back here. Your backup turns on as soon as the message arrives.',
  savingOk: 'Your workouts are now saved to your number.',
  /** The phone step worked for the gym, but the backup did not. Never blocks the gym sign-in. */
  backupOff: 'Your backup is not on yet. Turn it on in Settings → "Backup and restore".',
  under18: 'Saving workouts on MettleUp is only for members aged 18 and older. Your workouts stay on this phone.',
  off: 'Saving workouts with your phone number is paused for a short time. Your workouts are safe on this phone. Please try again later.',
  badProof: 'The WhatsApp check ran out of time. Please confirm your number again.',
  noName: 'Add your first name in Profile first, then try again.',
  server: 'Could not turn on your backup. Check your internet and try again.',
  otherPerson:
    'This phone has another person’s workouts. To back up with a different account, first erase this phone in Settings → "Erase or start over".',
} as const;

export function phoneAccountProblemWords(p: PhoneAccountProblem): string {
  switch (p) {
    case 'off':
      return PHONE_ACCOUNT_WORDS.off;
    case 'bad-proof':
      return PHONE_ACCOUNT_WORDS.badProof;
    case 'no-name':
      return PHONE_ACCOUNT_WORDS.noName;
    case 'offline':
    case 'server':
    default:
      return PHONE_ACCOUNT_WORDS.server;
  }
}

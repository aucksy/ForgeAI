/**
 * "Run a gym on MettleUp?" (R-458, owner 12 Nov 2026): "if owner is logging in using their phone number, then
 * automatically their gym's colors and branding ... will be unlocked." The PURE half: what the person typed, the
 * server's answer, and every word. StaffDoorCard.tsx lays it out; gymApi.apiStaffGymCode makes the calls.
 *
 * How it works (no server change): the gym's owner or desk person types the mobile number and the 6-digit PIN (or a
 * one-time sign-in code) they already use on the MettleUp admin app. The app asks the gym server who that is
 * (staff_sign_in, supabase 0034/0048, the same check, tries and locks as the admin app), takes only the gym's join
 * code from the answer, signs that session out at once (staff_sign_out) and opens the usual "Join <gym>" screen
 * (/j/<code>), which asks before joining. Joining paints the app in the gym's colours (theme/gymTheme.ts). Nothing
 * of the staff sign-in is kept on the phone: no session, no PIN, no number.
 * Shared code: Android and iPhone alike.
 */

/** The 10-digit Indian mobile (the admin app's numbers are Indian), or null. "+91 98765 43210", "098765 43210". PURE. */
export function staffMobile(raw: string): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** The 6 digits of a PIN or a sign-in code, or null. Spaces and dashes do not matter. PURE. */
export function staffPin(raw: string): string | null {
  const d = String(raw ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(d) ? d : null;
}

export type StaffDoorAnswer =
  | { ok: true; joinCode: string; gymName: string }
  | { ok: false; problem: 'WRONG'; triesLeft: number | null }
  | { ok: false; problem: 'LOCKED'; lockedUntil: string | null }
  | { ok: false; problem: 'BAD_PHONE' | 'OTHER' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * staff_sign_in's answer, read WITHOUT its session key (the caller signs that out; this never returns it). A good
 * answer needs a 6-character join code. PURE.
 */
export function staffDoorFromRow(raw: unknown): StaffDoorAnswer {
  if (!isObj(raw)) return { ok: false, problem: 'OTHER' };
  const err = typeof raw.error === 'string' ? raw.error : null;
  if (err === 'WRONG_CODE') {
    const left = typeof raw.triesLeft === 'number' && Number.isFinite(raw.triesLeft) ? Math.max(0, Math.floor(raw.triesLeft)) : null;
    return { ok: false, problem: 'WRONG', triesLeft: left };
  }
  if (err === 'TOO_MANY_TRIES') return { ok: false, problem: 'LOCKED', lockedUntil: typeof raw.lockedUntil === 'string' ? raw.lockedUntil : null };
  if (err === 'BAD_PHONE') return { ok: false, problem: 'BAD_PHONE' };
  if (err) return { ok: false, problem: 'OTHER' };
  const code = typeof raw.joinCode === 'string' ? raw.joinCode.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(code)) return { ok: false, problem: 'OTHER' };
  return { ok: true, joinCode: code, gymName: typeof raw.name === 'string' ? raw.name.trim() : '' };
}

// ------------------------------------------------------------------ words (member-words rules, R-98)

export const STAFF_DOOR = {
  title: 'Do you run a gym on MettleUp?',
  body: 'Owners and front-desk staff can sign in here. The app then opens your gym in its own colours, so you see what your members see.',
  open: 'Sign in as gym staff',
  phoneLabel: 'Your mobile number',
  pinLabel: 'Your 6-digit PIN or sign-in code',
  pinHint: 'Use the same mobile number and PIN as on the MettleUp admin app.',
  go: 'Open my gym',
  close: 'Not now',
  kept: 'Your PIN is only checked. It is never saved on this phone.',
  forgot: 'Forgot your PIN? Get a new one on the MettleUp admin app at app.mettleup.fit.',
} as const;

export const STAFF_PHONE_ERROR = 'Type your 10-digit mobile number.';
export const STAFF_PIN_ERROR = 'Type the 6 digits of your PIN or sign-in code.';

/** "4:35 pm" in India time for a lock's end, or null. PURE. */
export function lockTime(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ist = new Date(t + 330 * 60_000);
  const h = ist.getUTCHours();
  const m = ist.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** The line under the boxes for a refused sign-in, or for no answer at all ('offline'). PURE. */
export function staffDoorProblem(a: Exclude<StaffDoorAnswer, { ok: true }> | { ok: false; problem: 'OFFLINE' }): string {
  switch (a.problem) {
    case 'WRONG':
      if (a.triesLeft === 0) return 'This mobile number and PIN do not match. Your PIN is now locked for a while. Try again later.';
      if (a.triesLeft != null && a.triesLeft <= 3) {
        return `This mobile number and PIN do not match. You have ${a.triesLeft} ${a.triesLeft === 1 ? 'try' : 'tries'} left before your PIN locks for a while.`;
      }
      return 'This mobile number and PIN do not match. Check both and try again.';
    case 'LOCKED': {
      const at = lockTime(a.lockedUntil);
      return at
        ? `Too many wrong tries, so your PIN is locked. Try again after ${at}.`
        : 'Too many wrong tries, so your PIN is locked. Try again in 15 minutes.';
    }
    case 'BAD_PHONE':
      return STAFF_PHONE_ERROR;
    case 'OFFLINE':
      return 'There is no internet connection. Connect and try again.';
    default:
      return 'We could not sign you in just now. Try again in a minute.';
  }
}

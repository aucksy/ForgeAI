/**
 * "Have a gym code? Join your gym" on the welcome screen (OWNER-INBOX #11, decided 18 Oct 2026) —
 * the PURE half. The code is only kept (shop/pendingInvite.ts, the same place a gym's invite link
 * waits), and the gym's own "Join <gym>" screen opens once setup is done: it shows the gym and asks
 * before joining. No internet is needed during setup.
 */
import { JOIN_CODE_LENGTH, joinCodeFromTyped } from '@/shop/gym';

export const WELCOME_GYM_ASK = 'Have a gym code? Join your gym';
export const WELCOME_GYM_WHY = 'Your gym gives you a code to check in and order from its shop. Your workouts stay on this phone.';

/** What was typed, as a code to keep, or what to say. PURE. */
export function welcomeGymCode(typed: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = joinCodeFromTyped(typed);
  if (code.length !== JOIN_CODE_LENGTH) return { ok: false, error: `The code is ${JOIN_CODE_LENGTH} letters or numbers. Ask at your gym's desk.` };
  return { ok: true, code };
}

/** The line once a code is kept. PURE. */
export function welcomeGymKept(code: string): string {
  return `Gym code ${code} saved. Your gym's join screen opens right after setup.`;
}

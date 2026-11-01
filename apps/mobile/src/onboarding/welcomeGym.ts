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

/** How long the welcome waits for the gym's answer before it simply keeps the code (ms). */
export const WELCOME_GYM_CHECK_MS = 6000;

/**
 * UAT 1 Nov 2026: a typed code is checked with the gym at once when the phone is online, so a wrong
 * code is told here, not after the 3 setup steps (where the old screen said "This link is not a gym's").
 * `answer`: the gym's preview answer — a gym, `null` (no gym has this code), or `'unknown'` (offline,
 * slow, or any failure: the code is kept and the join screen checks it after setup). PURE.
 */
export type WelcomeGymCheck = { keep: true; line: string } | { keep: false; error: string };
export function welcomeGymChecked(code: string, answer: { gymName: string } | null | 'unknown'): WelcomeGymCheck {
  if (answer === null) {
    return { keep: false, error: `No gym has the code ${code}. Check the code with your gym's desk and type it again.` };
  }
  if (answer === 'unknown') return { keep: true, line: welcomeGymKept(code) };
  const name = answer.gymName.trim();
  return {
    keep: true,
    line: name ? `${name} found. Its join screen opens right after setup.` : welcomeGymKept(code),
  };
}

/**
 * "Have a gym code? Join your gym" on the welcome screen (OWNER-INBOX #11, decided 18 Oct 2026) —
 * the PURE half. The code is only kept (shop/pendingInvite.ts, the same place a gym's invite link
 * waits), and the gym's own "Join <gym>" screen opens once setup is done: it shows the gym and asks
 * before joining. No internet is needed during setup.
 */
import { checkInCodeFromUrl } from '@/shop/checkIn';
import { JOIN_CODE_LENGTH, joinCodeFromTyped } from '@/shop/gym';
import { inviteCodeFromUrl } from '@/shop/pendingInvite';

export const WELCOME_GYM_ASK = 'Have a gym code? Join your gym';
export const WELCOME_GYM_WHY = 'Your gym gives you a code to check in and order from its shop. Your workouts stay on this phone.';

/** What was typed, as a code to keep, or what to say. PURE. */
export function welcomeGymCode(typed: string): { ok: true; code: string } | { ok: false; error: string } {
  const code = joinCodeFromTyped(typed);
  if (code.length !== JOIN_CODE_LENGTH) return { ok: false, error: `The code is ${JOIN_CODE_LENGTH} letters or numbers. Ask at your gym's desk.` };
  return { ok: true, code };
}

/**
 * Release QA 1 Nov 2026: the code is checked by itself the moment the box first holds a whole code
 * (the last letter typed, or a gym link pasted). Android's Back closes the keyboard without leaving
 * the box, so waiting for the box to lose focus missed it. PURE.
 */
export function welcomeGymAutoCheck(before: string, after: string): boolean {
  return welcomeGymCode(after).ok && !welcomeGymCode(before).ok;
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

/**
 * 1 Nov 2026: "Scan the poster" on the welcome screen, as on the Gym tab. The poster's QR holds the gym's
 * check-in link (/c/CODE) or its invite link (/j/CODE); both carry the gym's join code, which then fills
 * the box and is checked exactly as if it had been typed. null = not a gym's QR (keep scanning). PURE.
 */
export function welcomeGymScanned(data: string | null | undefined): string | null {
  return checkInCodeFromUrl(data) ?? inviteCodeFromUrl(data);
}

/** The welcome's scan words (member-words skill). The camera lines keep typing in view. */
export const WELCOME_SCAN_WORDS = {
  scan: 'Scan the poster',
  close: 'Close the camera',
  asking: "MettleUp needs your camera to read the QR code on your gym's poster.",
  refused: "MettleUp is not allowed to use your camera, so type your gym's code below instead.",
  camOff: "The camera is off for MettleUp, so type your gym's code below, or turn the camera on in Settings.",
  noCamera: "The camera didn't start, so type your gym's code below instead.",
} as const;

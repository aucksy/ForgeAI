/**
 * Every word a member reads about their ForgeAI account and the copy of their workouts (tracker #50,
 * #43). Written with the member-words skill: say where and what it does for them, one short line
 * each, the screens and buttons named exactly. Never "session", "PR", "volume" or "sync". Second opinion
 * from Gemini (gemini-3.1-flash-lite, 24 Oct 2026): "saved" instead of "copied", and the waiting line says
 * the changes go by themselves. Its shorter limit lines dropped "without a gym" and were not taken. PURE.
 *
 * The privacy line ("Only you can see what is saved...") is TRUE by the server's own rules (0032: no gym
 * policy on member_items). The privacy notice must get matching lines before launch (owner's words).
 */
import type { SendFailure } from './copyPlan';

export const ACCOUNT_WORDS = {
  cardTitle: 'Keep your workouts on ForgeAI',
  cardBody:
    'Sign in with Google and ForgeAI saves your workouts, routines and body weight on its own server. On a new phone, sign in again and everything comes back.',
  privacy: 'Only you can see what is saved. Your gym cannot. Progress photos stay on this phone.',
  signIn: 'Continue with Google',
  signedInAs: (email: string | null): string => (email ? `Signed in as ${email}` : 'Signed in with Google'),
  allCopied: (when: string): string => `Your workouts are saved on ForgeAI. Last saved: ${when}.`,
  notCopiedYet: 'Your workouts will be saved on ForgeAI in a moment.',
  waiting: (n: number): string => `${n} ${n === 1 ? 'change is' : 'changes are'} waiting for the internet. They are saved by themselves when you are online.`,
  needsSignIn: 'Sign in again to keep saving your workouts on ForgeAI.',
  full: 'Your space on ForgeAI is full, so new workouts stay on this phone only. Please tell us in Settings → "Send feedback".',
  bringBack: 'Bring back my workouts',
  broughtBack: (workouts: number): string =>
    workouts === 0 ? 'Everything was already on this phone.' : `${workouts} ${workouts === 1 ? 'workout' : 'workouts'} brought back to this phone.`,
  signOut: 'Sign out',
  signOutTitle: 'Sign out of ForgeAI?',
  signOutBody: 'Your workouts stay on this phone. New workouts are not saved on ForgeAI until you sign in again.',
  deleteAccount: 'Delete my account',
  deleteTitle: 'Delete your ForgeAI account?',
  deleteBody: 'This deletes your account and everything saved on ForgeAI’s server. The workouts on this phone stay.',
  deleteConfirm: 'Delete account',
  deleted: 'Your account and everything saved on ForgeAI are deleted. Your workouts are still on this phone.',
  deletedKeptSignIn:
    'Everything saved on ForgeAI is deleted. Your Google sign-in stays, because your gym also uses it. Your workouts are still on this phone.',
  otherPerson:
    'This phone has another person’s workouts. To use a different Google account, first erase this phone in Settings → "Erase or start over".',
  finishWorkoutFirst: 'Finish your workout first, then try again.',
  signOutFailed: 'Could not sign out. Please try again.',
  welcomeAsk: 'Used ForgeAI before? Sign in to bring your workouts back.',
  welcomeNothing: 'You are signed in. Nothing is saved yet, so answer the 3 questions to start.',
  demo: 'This phone has the demo data. Remove it first (Settings → "Erase or start over"), then try again.',
  notInThisVersion: 'Google sign-in is not ready in this version of the app yet.',
  noPlayServices: 'Google sign-in needs Google Play services, and this phone does not have it.',
  couldNotSignIn: 'Could not sign in with Google. Check your internet and try again.',
} as const;

/** The line under "Signed in as…": what is waiting, or when the workouts were last saved. PURE. */
export function copyStatusLine(
  s: { waiting: number; lastAt: number | null; needsSignIn: boolean; full: boolean } | null,
  when: (ms: number) => string,
): string {
  if (!s) return ACCOUNT_WORDS.notCopiedYet;
  if (s.needsSignIn) return ACCOUNT_WORDS.needsSignIn;
  if (s.full) return ACCOUNT_WORDS.full;
  if (s.waiting > 0) return ACCOUNT_WORDS.waiting(s.waiting);
  return s.lastAt ? ACCOUNT_WORDS.allCopied(when(s.lastAt)) : ACCOUNT_WORDS.notCopiedYet;
}

/** A failure in the member's words. PURE. */
export function copyFailureWords(f: SendFailure | 'demo'): string {
  switch (f) {
    case 'demo':
      return ACCOUNT_WORDS.demo;
    case 'signed-out':
      return ACCOUNT_WORDS.needsSignIn;
    case 'full':
      return ACCOUNT_WORDS.full;
    case 'not-ready':
      return 'Saving workouts on ForgeAI is not switched on yet. Your workouts are safe on this phone.';
    case 'refused':
      return 'Something on this phone could not be saved on ForgeAI. Your workouts are safe here. Please try again later.';
    case 'offline':
    default:
      return 'No internet right now. Your workouts are safe on this phone. Try again when you are online.';
  }
}

/** An error the member reads (`message`) with the technical reason kept for the log only. */
export class AccountError extends Error {
  readonly detail: string;
  constructor(words: string, detail: string) {
    super(words);
    this.name = 'AccountError';
    this.detail = detail;
  }
}

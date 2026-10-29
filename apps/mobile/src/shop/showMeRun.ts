/**
 * The two "What my gym can see" switches, wired once (R-200): Settings → Your gym → What my gym can
 * see and the leaderboard's "Show me to my gym" box both go through these, so the box switches on
 * exactly what the Settings switches do, with the same server calls (leaderboardSync.pushBoard and
 * mateSync.shareWithMates; no server change). The rules: showMe.ts.
 */
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { runShowMe, type ShowMeOffer, type ShowMeResult } from './showMe';

/** "Show my name on my gym's leaderboard": set it, keep it until the gym has heard (a change made with no signal is sent again later). */
export function setBoardName(on: boolean): void {
  const prefs = usePhonePrefs.getState();
  prefs.setShowNameOnBoard(on);
  prefs.setBoardNamePending(true);
}

/** "Let my gym mates see my workouts": set it, keep it until the gym has heard. */
export function setMateShare(on: boolean): void {
  const prefs = usePhonePrefs.getState();
  prefs.setShareWorkoutsWithGym(on);
  prefs.setMateSharePending(true);
}

const pushName = () => import('./leaderboardSync').then((m) => m.pushBoard('setting'));
const pushShare = () => import('./mateSync').then((m) => m.shareWithMates('setting'));

/** The Settings name switch: set it and tell the gym (not awaited by the switch). */
export function switchBoardName(on: boolean): void {
  setBoardName(on);
  void pushName().catch((e: unknown) => console.warn('[board] name switch push', e));
}

/** The Settings workouts switch: set it and tell the gym (not awaited by the switch). */
export function switchMateShare(on: boolean): void {
  setMateShare(on);
  void pushShare().catch((e: unknown) => console.warn('[mates] share switch', e));
}

/** The leaderboard box's "Show me": both on (or the name only), or both back off with 'failed'. */
export function showMeToGym(want: Exclude<ShowMeOffer, 'none'>): Promise<ShowMeResult> {
  return runShowMe(want, {
    setName: setBoardName,
    setShare: setMateShare,
    pushName,
    pushShare,
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message, detail) => console.warn(message, detail ?? ''),
  });
}

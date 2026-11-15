/**
 * R-590 (15 Nov 2026): a gym message must make a sound on phones that take the sound away.
 *
 * OPPO / OnePlus phones (ColorOS 16-17) rewrite every channel an app makes, unless the app is on OPPO's
 * own list (WhatsApp, Truecaller, Facebook...): no sound, no buzz, no banner. His OPPO showed the gym's
 * reply in the list with no sound and no pop-up (R-583). The native piece (ForgeRest.ringIfMuted,
 * AlertRing.kt) plays the phone's own notification sound once, right after the app or the push posted a
 * message on "Messages from your gym", but ONLY when that channel has no sound and the member did not
 * choose that (and the phone is on ring, Do Not Disturb off). Phones that kept the sound ring through the
 * channel and never here. The banner cannot be given back by any app (see AlertRing.kt).
 *
 * Call it at every place a gym message is shown WITH a sound: the push (app closed or in the background),
 * the app's own post with the app open, the 15-minute check, trainer replies and the MettleUp team's
 * reply. Never for the quiet copy during a workout with the app open (R-501). Never throws.
 */
import { Platform } from 'react-native';

import { GYM_MESSAGES_CHANNEL } from './gymPopup';

interface NativeRing {
  ringIfMuted?(channelId: string): string;
}

let mod: NativeRing | null | undefined;
function R(): NativeRing | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as { requireOptionalNativeModule: (n: string) => unknown };
    mod = (core.requireOptionalNativeModule('ForgeRest') as NativeRing | null) ?? null;
  } catch {
    mod = null;
  }
  return mod;
}

/** Tests only: a stand-in for the native piece (null: none). */
export function setGymRingNativeForTest(n: unknown): void {
  mod = n as NativeRing | null;
}

/**
 * Should a gym message shown now get the app's own ring (when the phone took the channel's sound)?
 * Not with the app open over a workout: that one is posted again on the quiet channel (R-501). PURE.
 */
export function gymRingWanted(inFront: boolean, workoutOpen: boolean): boolean {
  return !(inFront && workoutOpen);
}

/** The last answer ("rang", or why not): the feedback box's device line. */
let last = '';
export function lastGymRing(): string {
  return last;
}

/**
 * A gym message was just shown on `channelId` (default "Messages from your gym"): ring it if the phone
 * took that channel's sound. Returns the native answer ("rang", "channel-rings", ...) or '' (none).
 */
export function ringGymMessage(opts: { inFront: boolean; workoutOpen: boolean; channelId?: string }): string {
  if (!gymRingWanted(opts.inFront, opts.workoutOpen)) return '';
  const channelId = opts.channelId ?? GYM_MESSAGES_CHANNEL;
  // Only "Messages from your gym" rings: the quiet channel is quiet on purpose.
  if (channelId !== GYM_MESSAGES_CHANNEL) return '';
  try {
    const n = R();
    if (!n?.ringIfMuted) return '';
    last = n.ringIfMuted(channelId);
    if (last.startsWith('failed')) console.warn('[ForgeErr] gym ring:', last);
    return last;
  } catch (e) {
    console.warn('[ForgeErr] gym ring', e);
    return '';
  }
}

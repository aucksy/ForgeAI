/**
 * R-117 (0034): the one-time "Set your own PIN" prompt. After a person signs in with a one-time
 * code and has no PIN yet, this device remembers to ask them once (auth/PinForms.tsx PinPrompt).
 * Saving a PIN or tapping "Not now" forgets it, so they are never asked twice on this device.
 * Kept apart from the signed-in gym (forgeai.cloudGym.v1) on purpose: writing that key makes every
 * other tab of the app reload.
 */

import type { KeyValueStore } from '../data/local';
import type { SignedIn } from './signin';

export const ASK_PIN_KEY = 'mettleup.askPin.v1';

function store(s?: KeyValueStore | null): KeyValueStore | null {
  if (s !== undefined) return s;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // quiet: storage blocked (private mode); the prompt is a nicety and is simply not shown
    return null;
  }
}

/** Ask this person for a PIN: they came in with a one-time code and have none (0034 says so). PURE. */
export function shouldOfferPin(s: Pick<SignedIn, 'via' | 'hasPin'>): boolean {
  return s.via === 'code' && s.hasPin === false;
}

export function rememberAskPin(staffId: string, s?: KeyValueStore | null): void {
  try {
    store(s)?.setItem(ASK_PIN_KEY, staffId);
  } catch (e) {
    console.warn('[ForgeErr] askPin: not remembered, the prompt will not show', e);
  }
}

export function askPinFor(staffId: string | null | undefined, s?: KeyValueStore | null): boolean {
  if (!staffId) return false;
  try {
    return store(s)?.getItem(ASK_PIN_KEY) === staffId;
  } catch (e) {
    console.warn('[ForgeErr] askPin: not read', e);
    return false;
  }
}

export function forgetAskPin(s?: KeyValueStore | null): void {
  try {
    store(s)?.removeItem(ASK_PIN_KEY);
  } catch (e) {
    console.warn('[ForgeErr] askPin: not cleared', e);
  }
}

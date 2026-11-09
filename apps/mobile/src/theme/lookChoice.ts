/**
 * Light or dark (owner, 9 Nov 2026: "it should be system default"): the member's choice — "Same as
 * phone" (the default), "Light" or "Dark" — kept where it can be read SYNCHRONOUSLY while the app is
 * still loading (expo-sqlite's key-value store, like the gym's look in theme/themeMirror.ts), so the
 * very first frame is already in the right look. PURE apart from the store and the phone's setting.
 */
import { Appearance } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

import type { Scheme } from './brandTokens';

export type LookChoice = 'system' | 'light' | 'dark';

export const LOOK_CHOICE_KEY = 'mettleup-look';

/** A saved choice, cleaned: anything else is "Same as phone". PURE. */
export function cleanLookChoice(raw: unknown): LookChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** The look to show: the member's choice, or the phone's when they follow it. PURE. */
export function resolveScheme(choice: LookChoice, phone: Scheme | null): Scheme {
  if (choice === 'light' || choice === 'dark') return choice;
  // A phone that says nothing (very old Android): the dark look the app always had.
  return phone ?? 'dark';
}

/** Never throws: no saved choice is "Same as phone". */
export function readLookChoiceSync(): LookChoice {
  try {
    return cleanLookChoice(Storage.getItemSync(LOOK_CHOICE_KEY));
  } catch {
    return 'system';
  }
}

/** Never throws: a failed write only means the next launch follows the phone. */
export function writeLookChoice(choice: LookChoice): void {
  try {
    if (choice === 'system') Storage.removeItemSync(LOOK_CHOICE_KEY);
    else Storage.setItemSync(LOOK_CHOICE_KEY, choice);
  } catch {
    // ignore
  }
}

/** The phone's own light/dark setting now; null when it cannot say. Never throws. */
export function phoneScheme(): Scheme | null {
  try {
    const s = Appearance.getColorScheme();
    return s === 'light' || s === 'dark' ? s : null;
  } catch {
    return null;
  }
}

/** The words for each choice (Settings → Light or dark). member-words */
export const LOOK_WORDS: Record<LookChoice, string> = {
  system: 'Same as phone',
  light: 'Light',
  dark: 'Dark',
};

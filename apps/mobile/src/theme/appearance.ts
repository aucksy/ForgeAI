/**
 * Light or dark (owner, 9 Nov 2026: "it should be system default. If someone has their phone set to
 * light mode, the app should be in the light mode as well"). Keeps the app's look in step with the
 * member's choice (Settings → Light or dark: Same as phone / Light / Dark; theme/lookChoice.ts) and,
 * while they follow the phone, with the phone's own setting — also when it changes with the app open.
 *
 * Applying a look: the token VALUES are rewritten in place (theme/brandTokens.ts setTokenScheme, the
 * gym's colours kept on top) and the app re-draws from its root (theme/gymTheme.ts redrawForLook),
 * the same way a gym's look comes in. The screen the member is on stays; only things held on a
 * screen (an open sheet, a scroll position) start again. So a change the member did not make — the
 * phone switching at sunset — WAITS while a workout is open (the next time the app comes back, or
 * the workout ends); their own choice in Settings applies at once.
 *
 * The status bar is drawn by the root layout from `useAppearance`; the navigation bar's buttons and
 * the window behind the app follow here (native module forge-phone `systemBars`, expo-system-ui).
 */
import * as SystemUI from 'expo-system-ui';
import { Appearance } from 'react-native';
import { create } from 'zustand';

import { setTokenScheme, tokenScheme, type Scheme } from './brandTokens';
import { redrawForLook, workoutIsOpen } from './gymTheme';
import { phoneScheme, readLookChoiceSync, resolveScheme, writeLookChoice, type LookChoice } from './lookChoice';
import { color } from './tokens';
import { phoneNative } from '@/tracker/phone/native';

export interface AppearanceState {
  choice: LookChoice;
  /** The look the tokens hold (what the app shows). */
  scheme: Scheme;
}

export const useAppearance = create<AppearanceState>(() => ({ choice: readLookChoiceSync(), scheme: tokenScheme() }));

let started = false;
/** The phone's setting as last heard. */
let phone: Scheme | null = null;

/** The window behind the app and the navigation bar's buttons follow the look. Quiet on failure. */
function syncSystemBars(scheme: Scheme): void {
  try {
    phoneNative()?.systemBars?.(scheme === 'light');
  } catch (e) {
    console.warn('[ForgeErr] navigation bar look', e);
  }
  try {
    // The window behind the app (seen for a moment while a screen opens or the keyboard moves).
    void SystemUI.setBackgroundColorAsync(color.bg).catch(() => undefined);
  } catch {
    // ignore
  }
}

/** Show `next` now: tokens, re-draw, system bars. */
function show(next: Scheme): void {
  if (setTokenScheme(next)) redrawForLook();
  useAppearance.setState({ scheme: tokenScheme() });
  syncSystemBars(tokenScheme());
}

/**
 * Bring the look in line with the choice and the phone. `own`: the member's own choice in Settings
 * (applied at once). Otherwise (the phone changed) it waits while a workout is open. Returns whether
 * the look is now what it should be.
 */
export function followLook(own = false): boolean {
  const want = resolveScheme(useAppearance.getState().choice, phone);
  if (want === tokenScheme()) {
    useAppearance.setState({ scheme: want });
    return true;
  }
  if (!own && workoutIsOpen()) return false;
  show(want);
  return true;
}

/** Settings → Light or dark. Saved for the next launch and shown at once. */
export function setLookChoice(choice: LookChoice): void {
  writeLookChoice(choice);
  useAppearance.setState({ choice });
  followLook(true);
}

/** Start once, at app start (root layout). The tokens already hold the look the app booted in. */
export function startAppearance(): void {
  if (started) return;
  started = true;
  phone = phoneScheme();
  syncSystemBars(tokenScheme());
  // The phone's setting can have changed between the boot read and now.
  followLook(false);
  try {
    Appearance.addChangeListener(({ colorScheme }) => {
      phone = colorScheme === 'light' || colorScheme === 'dark' ? colorScheme : null;
      followLook(false);
    });
  } catch (e) {
    console.warn('[ForgeErr] phone light/dark setting cannot be followed', e);
  }
}

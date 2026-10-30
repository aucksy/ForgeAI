/**
 * "Add <gym> to your home screen" (OWNER-INBOX #11, icon option A, decided 18 Oct 2026). Android
 * never lets an app use a downloaded logo as its own icon, so the gym's logo becomes a home-screen
 * shortcut that opens ForgeAI (modules/forge-phone GymShortcut.kt). Android asks the member first.
 *
 * Offered once per gym in a pop-up right after joining (GymIconOffer.tsx, R-77) and always in Settings → Your
 * gym. A pinned one follows the gym: a new logo or name redraws it without asking; leaving greys it
 * out; joining again brings it back (startGymShortcutSync, from the root layout).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { hasFeature } from '@forgeai/theme';

import { pictureUrl } from '@/cloud/picture';
import { phoneNative, type GymShortcutResult } from '@/tracker/phone/native';

import { useGymShop } from './gymStore';
import type { GymLink } from './types';

/** What a shortcut is drawn from. */
export interface GymShortcutPlan {
  name: string;
  logoUrl: string;
  bg: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
/** Behind a logo with no background tone of the gym's own: white keeps any logo readable. */
export const SHORTCUT_PLAIN_BG = '#FFFFFF';

/** The shortcut for this gym, or null with no gym or no logo (an https picture). PURE. */
export function gymShortcutPlan(link: Pick<GymLink, 'gymName' | 'brand' | 'plan'> | null): GymShortcutPlan | null {
  // T66: the gym's logo is Pro (always allowed while PLAN_GATE_ON is off).
  if (link && !hasFeature(link, 'branding')) return null;
  const logo = link?.brand?.logoUrl;
  if (!link || !logo || !logo.startsWith('https://')) return null;
  const bg = link.brand?.bg && HEX.test(link.brand.bg) ? link.brand.bg : SHORTCUT_PLAIN_BG;
  return { name: link.gymName, logoUrl: logo, bg };
}

/** Did the shortcut's picture or name change between two links? PURE. */
export function shortcutChanged(a: GymShortcutPlan | null, b: GymShortcutPlan | null): boolean {
  if (!a || !b) return a !== b;
  return a.name !== b.name || a.logoUrl !== b.logoUrl || a.bg !== b.bg;
}

/** The line after a tap, or null when Android's own question is on screen. PURE. */
export function gymShortcutWords(r: GymShortcutResult, gymName: string): string | null {
  switch (r) {
    case 'asked':
      return null;
    case 'updated':
      return `${gymName} is already on your home screen. Its picture is up to date.`;
    case 'unsupported':
      return "This phone's home screen doesn't take shortcuts.";
    case 'no-logo':
      return `Couldn't get ${gymName}'s logo. Check the internet and try again.`;
    default:
      return "Couldn't add it. Try again.";
  }
}

/** The line when a gym leaves (Android shows it on the greyed-out shortcut). PURE. */
export function shortcutOffText(gymName: string): string {
  return `You left ${gymName}. Open MettleUp from its own icon.`;
}

/** Can this phone pin it, for this gym? */
export function canAddGymShortcut(link: GymLink | null): boolean {
  if (!gymShortcutPlan(link)) return false;
  try {
    return phoneNative()?.gymShortcutSupported?.() === true;
  } catch (e) {
    console.warn('[ForgeErr] gym shortcut: support check', e);
    return false;
  }
}

/** Ask Android to pin it (ask=true), or only redraw a pinned one. Never throws. */
export async function addGymShortcut(link: GymLink | null, ask = true): Promise<GymShortcutResult> {
  const plan = gymShortcutPlan(link);
  const n = phoneNative();
  if (!plan) return 'no-logo';
  if (!n?.gymShortcutPin) return 'unsupported';
  try {
    return await n.gymShortcutPin(plan.name, pictureUrl(plan.logoUrl), plan.bg, ask);
  } catch (e) {
    console.warn('[ForgeErr] gym shortcut: pin', e);
    return 'failed';
  }
}

// ------------------------------------------------------------------ offered once per gym

/** Where the gym codes already offered are kept (so "Not now" is not asked again). */
export const SHORTCUT_OFFERED_KEY = 'forgeai-gym-shortcut-offered';

export async function shortcutOffered(joinCode: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SHORTCUT_OFFERED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes(joinCode);
  } catch (e) {
    console.warn('[ForgeErr] gym shortcut: reading the offered list', e);
    // Unknown: don't nag. Settings → Your gym still has it.
    return true;
  }
}

export async function markShortcutOffered(joinCode: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SHORTCUT_OFFERED_KEY);
    const old: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(old) ? old.filter((c): c is string => typeof c === 'string' && c !== joinCode) : [];
    await AsyncStorage.setItem(SHORTCUT_OFFERED_KEY, JSON.stringify([...list.slice(-19), joinCode]));
  } catch (e) {
    console.warn('[ForgeErr] gym shortcut: saving the offered list', e);
  }
}

// ------------------------------------------------------------------ a pinned one follows the gym

let syncing = false;

/** Start once (root layout): leaving greys a pinned shortcut out; a new logo, name or gym redraws it. */
export function startGymShortcutSync(): void {
  if (syncing) return;
  syncing = true;
  // After the saved link is read: reading it is not a change (no download on every launch).
  if (useGymShop.persist.hasHydrated()) watch();
  else {
    const unsub = useGymShop.persist.onFinishHydration(() => {
      unsub();
      watch();
    });
  }
}

function watch(): void {
  useGymShop.subscribe((s, prev) => {
    if (s.link === prev.link) return;
    const before = gymShortcutPlan(prev.link);
    const after = gymShortcutPlan(s.link);
    if (!s.link && prev.link) {
      try {
        phoneNative()?.gymShortcutOff?.(shortcutOffText(prev.link.gymName));
      } catch (e) {
        console.warn('[ForgeErr] gym shortcut: grey out', e);
      }
      return;
    }
    if (after && (shortcutChanged(before, after) || prev.link?.gymId !== s.link?.gymId)) void addGymShortcut(s.link, false);
  });
}

/**
 * The gym's opening hours (R-124): asked from the gym and kept on the phone, like the diet plans
 * (tracker/services/gymBodySync.ts). Asked when the Gym tab or the hours page opens, at most every
 * 10 minutes on its own (a pull to refresh asks at once). Kept in AsyncStorage, so the hours still
 * show offline after the first answer. Offline, or a server without 0036, changes nothing (and
 * before 0036 nothing is ever kept, so nothing shows). Leaving the gym or Erase all data forgets
 * them. Never throws. The words: gymTimings.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiGymTimings } from './gymApi';
import { parseGymHoursCopy, type GymHoursCopy } from './gymTimings';
import type { GymLink } from './types';

export const GYM_HOURS_KEY = 'forgeai-gym-hours';
export const GYM_HOURS_EVERY_MS = 10 * 60 * 1000;

let lastAsked: { key: string; at: number } | null = null;

/** The kept hours of this gym, or null (none kept, another gym's, or unreadable). */
export async function readGymHours(link: GymLink | null): Promise<GymHoursCopy | null> {
  if (!link) return null;
  try {
    const c = parseGymHoursCopy(await AsyncStorage.getItem(GYM_HOURS_KEY));
    return c && c.gymId === link.gymId ? c : null;
  } catch (e) {
    console.warn('[ForgeErr] gym hours: reading the kept copy', e);
    return null;
  }
}

/** Ask the gym and keep its answer. The fresh copy, or null when nothing new came (keep showing the kept one). */
export async function syncGymHours(link: GymLink | null, opts: { force?: boolean; now?: number } = {}): Promise<GymHoursCopy | null> {
  if (!link) return null;
  const now = opts.now ?? Date.now();
  if (!opts.force && lastAsked?.key === link.memberKey && now - lastAsked.at < GYM_HOURS_EVERY_MS) return null;
  lastAsked = { key: link.memberKey, at: now };
  try {
    const r = await apiGymTimings(link.memberKey);
    if (!r.ok) {
      if (!('missing' in r) && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] gym hours', r.error);
      return null;
    }
    const copy: GymHoursCopy = { gymId: r.data.gymId, gymName: r.data.gymName, hours: r.data.hours, at: now };
    await AsyncStorage.setItem(GYM_HOURS_KEY, JSON.stringify(copy));
    return copy;
  } catch (e) {
    console.warn('[ForgeErr] gym hours: saving', e);
    return null;
  }
}

/** Leaving the gym: its hours go. */
export async function forgetGymHours(): Promise<void> {
  lastAsked = null;
  await AsyncStorage.removeItem(GYM_HOURS_KEY);
}

/** Tests only. */
export function resetGymHoursSyncForTests(): void {
  lastAsked = null;
}

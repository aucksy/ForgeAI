/**
 * The free plan's switch on the phone (tracker #43; the rules are limits.ts). Reads the server's
 * `app_limits()` (0032) at most every 12 hours and keeps the answer, so a check never waits on the
 * internet. Offline, a server without 0032, or anything unreadable: the last good answer, else OFF.
 *
 * The check only reads the server for a member in NO gym (a gym member always gets everything), and
 * only when a limit is about to matter (creating a routine or an exercise, picking a chart range).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isAccountBuild } from '@/cloud/config';
import { getDb } from '@/db';

import { atLimit, chartRangeAllowed, LAUNCH_LIMITS, LIMITS_KEEP_MS, limitsFresh, parseFreeLimits, type CountedLimit, type FreeLimits } from './limits';

export const LIMITS_STORAGE_KEY = 'forgeai-free-limits';

interface LimitsState {
  limits: FreeLimits;
  /** When the server last answered (ms), or when the next try is due after a failed one. */
  at: number | null;
  /**
   * The limits to use NOW: the kept answer (read from the phone once), and a fresh read from the
   * server started in the background when the kept one is older than 12 hours. Never waits on the
   * internet: a check made before the first answer uses the launch rules (off).
   */
  current: (now?: number) => Promise<FreeLimits>;
  /** Ask the server (the background read above). */
  refresh: (now?: number) => Promise<FreeLimits>;
}

let kept: Promise<void> | null = null;
let asking: Promise<FreeLimits> | null = null;
/** After a failed read, the next one waits this long (offline at the gym: no call per tap). */
const RETRY_MS = 10 * 60 * 1000;

export const useFreeLimits = create<LimitsState>()((set, get) => ({
  limits: LAUNCH_LIMITS,
  at: null,
  current: async (now = Date.now()) => {
    kept ??= (async () => {
      try {
        const raw = await AsyncStorage.getItem(LIMITS_STORAGE_KEY);
        const v = raw ? (JSON.parse(raw) as { limits?: unknown; at?: unknown }) : null;
        if (v && typeof v.at === 'number' && get().at == null) set({ limits: parseFreeLimits(v.limits), at: v.at });
      } catch (e) {
        console.warn('[free limits] the kept answer could not be read; asking the server', e);
      }
    })();
    await kept;
    // A build without the member account never asks the server (no client, no network call).
    if (!limitsFresh(get().at, now) && isAccountBuild()) {
      void get().refresh(now).catch((e: unknown) => console.warn('[free limits] background read failed', e));
    }
    return get().limits;
  },
  refresh: (now = Date.now()) => {
    asking ??= (async () => {
      const { apiAppLimits } = await import('./copyApi');
      const r = await apiAppLimits();
      if (!r.ok && r.failure !== 'not-ready') {
        // Keep what we had; try again in 10 minutes, not on every tap.
        set({ at: now - LIMITS_KEEP_MS + RETRY_MS });
        return get().limits;
      }
      // A server without 0032 has no limits: off, kept like any answer.
      const limits = r.ok ? parseFreeLimits(r.data) : LAUNCH_LIMITS;
      set({ limits, at: now });
      await AsyncStorage.setItem(LIMITS_STORAGE_KEY, JSON.stringify({ limits, at: now })).catch((e: unknown) =>
        console.warn('[free limits] could not keep the answer; asked again next time', e),
      );
      return limits;
    })().finally(() => {
      asking = null;
    });
    return asking;
  },
}));

/** Is this phone in a gym on ForgeAI? (The gym shop's link, from Join.) */
async function inGym(): Promise<boolean> {
  const { useGymShop } = await import('@/shop/gymStore');
  // Right after start the kept link may still be loading: a gym member is never limited by that.
  if (!useGymShop.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const off = useGymShop.persist.onFinishHydration(() => {
        off();
        resolve();
      });
      setTimeout(resolve, 3000);
    });
  }
  return useGymShop.getState().link != null;
}

async function have(kind: CountedLimit): Promise<number> {
  const sql =
    kind === 'routines'
      ? // The member's own routines only: a ready program or an import (a folder with a source) is not counted.
        'SELECT COUNT(*) AS n FROM plan_days d JOIN workout_plans p ON p.id = d.plan_id WHERE p.source IS NULL'
      : // Made in the exercise form (it stores its own muscles), not a library row.
        'SELECT COUNT(*) AS n FROM exercises WHERE catalog_key IS NULL AND muscles IS NOT NULL';
  const r = await getDb().getFirstAsync<{ n: number }>(sql);
  return r?.n ?? 0;
}

/** True when one more routine / own exercise would go over the free plan. Never throws (false). */
export async function reachedLimit(kind: CountedLimit): Promise<boolean> {
  try {
    if (await inGym()) return false;
    const limits = await useFreeLimits.getState().current();
    if (!limits.on) return false;
    return atLimit(limits, false, kind, await have(kind));
  } catch (e) {
    console.warn('[free limits] check failed; nothing is limited', e);
    return false;
  }
}

/** May a chart show `months` back (null = all time)? Never throws (true). */
export async function chartAllowed(months: number | null): Promise<boolean> {
  try {
    if (await inGym()) return true;
    return chartRangeAllowed(await useFreeLimits.getState().current(), false, months);
  } catch (e) {
    console.warn('[free limits] chart check failed; nothing is limited', e);
    return true;
  }
}

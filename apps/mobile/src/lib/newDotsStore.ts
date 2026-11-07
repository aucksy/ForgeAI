/**
 * F198 "follow the dots" (R-389/R-390): what this phone has seen, kept in AsyncStorage, and the dots lit
 * now (rules: lib/newDots.ts). Every failure is quiet: a list that cannot be read lights no dots, a write
 * that fails still clears the dots until the app is closed.
 *
 * QA builds only (qa-device.yml writes 'newDots' into extra.qaStandIns; store and GitHub release builds never
 * carry it): mettleup://qa-dots?at=<ISO>&reset=1 sets the dots' clock and forgets what was seen, so the device
 * UAT can see a fresh trail and the 30-day end on any day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';

import { healthState } from '@/tracker/phone/healthConnect';
import { canReadSleep } from '@/tracker/phone/sleepLink';

import { featuresAt, litFeatures, litSpots, parseSeen, withSeen, type DotSpot, type NewFeature } from './newDots';
import { onIphone } from './onIphone';
import { WHATS_NEW_LOG } from './whatsNew';

const KEY = 'mettleup.newDotsSeen.v1';

interface NewDotsState {
  /** Seen feature ids; null until read, or when the stored list could not be read (then no dots). */
  seen: string[] | null;
  loaded: boolean;
  /** Health apps' page shows on this phone with its Sleep row (null = not known yet). */
  health: boolean | null;
  /** QA builds only: the dots' clock (epoch ms), else null = the phone's clock. */
  qaNow: number | null;
}

export const useNewDotsStore = create<NewDotsState>(() => ({ seen: null, loaded: false, health: null, qaNow: null }));

let loading: Promise<void> | null = null;

/** Read the seen list (once) and whether Health apps shows. Never throws. */
export function loadNewDots(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    let seen: string[] | null = null;
    try {
      seen = parseSeen(await AsyncStorage.getItem(KEY));
      if (seen == null) console.warn('[new dots] the seen list could not be read; no dots');
    } catch (e) {
      console.warn('[new dots] the seen list could not be read; no dots', e);
    }
    useNewDotsStore.setState({ seen, loaded: true });
    let health = false;
    try {
      health = !onIphone() && canReadSleep() && (await healthState()) !== 'none';
    } catch (e) {
      console.warn('[new dots] Health Connect state could not be read', e);
    }
    useNewDotsStore.setState({ health });
  })();
  return loading;
}

/** Opening a page: its features are seen on this phone (at once in memory, then stored; quiet on failure). */
export function markNewDotsSeen(ids: readonly string[]): void {
  const { seen } = useNewDotsStore.getState();
  if (!seen || ids.length === 0 || ids.every((id) => seen.includes(id))) return;
  const next = withSeen(seen, ids);
  useNewDotsStore.setState({ seen: next });
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch((e: unknown) => console.warn('[new dots] the seen list could not be saved', e));
}

function hasDotsStandIn(): boolean {
  const list = (Constants.expoConfig?.extra as { qaStandIns?: unknown } | undefined)?.qaStandIns;
  return Array.isArray(list) && list.includes('newDots');
}

/** QA builds only (the qa-dots link): set the dots' clock and/or forget what was seen. Ignored elsewhere. */
export function setQaDots(at: number | null, reset: boolean): void {
  if (!hasDotsStandIn()) return;
  useNewDotsStore.setState({ qaNow: at });
  if (reset) {
    useNewDotsStore.setState({ seen: [] });
    AsyncStorage.removeItem(KEY).catch((e: unknown) => console.warn('[new dots] could not forget', e));
  }
  console.log(`[QA] new dots: clock ${at == null ? 'phone' : new Date(at).toISOString()}${reset ? ', seen forgotten' : ''}`);
}

/** Whether this phone shows the feature's page at all (a dot must never lead nowhere). */
function availableOn(health: boolean | null) {
  return (f: NewFeature): boolean => {
    // Only Settings pages mark a feature seen when opened (components/settings/SettingsPage.tsx).
    if (!f.href.startsWith('/settings/') || f.href === '/settings/details' || f.href === '/settings/workouts') return false;
    if (f.href === '/settings/health') return health === true;
    // "What my gym can see" shows only in a gym whose ranking is on: not known here, so never lit.
    if (f.href === '/settings/gym-sees') return false;
    // "Your watch" shows only with a watch connected: not known here, so never lit.
    if (f.href === '/settings/watch') return false;
    if (f.href === '/settings/notifications' || f.href === '/settings/widgets') return !onIphone();
    return true;
  };
}

/** The features lit now on this phone, newest first (at most 3). */
export function useLitFeatures(): NewFeature[] {
  const seen = useNewDotsStore((s) => s.seen);
  const health = useNewDotsStore((s) => s.health);
  const qaNow = useNewDotsStore((s) => s.qaNow);
  useEffect(() => {
    void loadNewDots();
  }, []);
  return useMemo(() => {
    return litFeatures({
      log: WHATS_NEW_LOG,
      now: qaNow ?? Date.now(),
      seen: seen ? new Set(seen) : null,
      available: availableOn(health),
    });
  }, [seen, health, qaNow]);
}

/** Every place that carries a dot now. */
export function useLitSpots(): Set<DotSpot> {
  const lit = useLitFeatures();
  return useMemo(() => litSpots(lit), [lit]);
}

/** The lit features whose page is `href` (for that page's visit). */
export function useFeaturesAt(href: string | null): NewFeature[] {
  const lit = useLitFeatures();
  return useMemo(() => (href ? featuresAt(lit, href) : []), [lit, href]);
}

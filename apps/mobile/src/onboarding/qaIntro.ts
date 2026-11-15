/**
 * R-587, QA builds only (the 'watchIntro' stand-in that qa-device.yml writes into app.json): the cloud phone has no
 * Wear OS watch, so the welcome's watch screen could never be photographed there. mettleup://qa-intro?watch=missing
 * (a watch without the app: "Install on my watch") or ?watch=installed ("On your watch" with a tick), opened while
 * the first welcome screen is up, stands in for Wear OS's answer for this run. ?watch=none takes it back. Read by the
 * root layout on the welcome (the navigator is not drawn yet). Store and GitHub release builds carry no stand-in,
 * so the link does nothing there. Kept in memory only (one app run).
 */
import Constants from 'expo-constants';
import { create } from 'zustand';

import type { WatchState } from '@/tracker/services/watchInstall';

/** Does this build carry the stand-in (app.json extra.qaStandIns has 'watchIntro')? PURE. */
export function hasWatchIntroStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('watchIntro');
}

/** The watch state a qa-intro link names; undefined = not a qa-intro link; null = take the stand-in back. PURE. */
export function qaIntroWatchFromUrl(url: string | null | undefined): WatchState | null | undefined {
  const m = /^[a-z][a-z0-9+.-]*:\/\/\/?qa-intro\/?(?:\?(.*))?$/i.exec(String(url ?? '').trim());
  if (!m) return undefined;
  const w = /(?:^|&)watch=([a-z]+)/.exec(m[1] ?? '')?.[1];
  return w === 'missing' || w === 'installed' ? w : null;
}

/** The stood-in watch answer for this run, or null (the real Wear OS answer). */
export const useQaIntroWatch = create<{ watch: WatchState | null }>(() => ({ watch: null }));

/** A qa-intro link in a QA build: true when it was one and it was applied. Never throws. */
export function applyQaIntroLink(url: string | null | undefined): boolean {
  try {
    const w = qaIntroWatchFromUrl(url);
    if (w === undefined || !hasWatchIntroStandIn(Constants.expoConfig?.extra)) return false;
    useQaIntroWatch.setState({ watch: w });
    console.log(`[QA] welcome watch screen: watch=${w ?? 'real'}`);
    return true;
  } catch (e) {
    console.warn('[QA] the welcome watch link could not be read', e);
    return false;
  }
}

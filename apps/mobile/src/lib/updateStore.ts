/**
 * R-260: one place that knows whether a newer MettleUp exists and what to do about it. The launch
 * pop-up (components/UpdatePrompt.tsx) and the Workout tab card (components/UpdateCard.tsx) both read it.
 *
 * Two kinds of copy (lib/installSource.ts):
 *  - Google Play: Play's own flexible update. "Update" opens Google's box; the new version downloads
 *    while the member keeps using the app; "Restart" installs it. A finished download the member never
 *    restarts for is installed the next time the app goes to the background with no workout open.
 *  - GitHub APK: "Update" opens the new APK (lib/appUpdate.ts), as the card always did.
 * When to ask: lib/updatePrompt.ts.
 */
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { create } from 'zustand';

import { findLatest, readUpdateMeta, writeUpdateMeta } from '@/lib/appUpdate';
import { offersGithubUpdate, readInstaller } from '@/lib/installSource';
import { cardDue, isUrgent, markFor, popupDue, readMark, versionsBehind } from '@/lib/updatePrompt';
import { phoneNative, type PlayUpdateStatus } from '@/tracker/phone/native';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const POPUP_KEY = 'update_popup'; // JSON PopupMark
const CARD_LATER_KEY = 'update_card_later'; // JSON { key, at }
const PLAY_STORE_URL = 'market://details?id=com.mettleup.app';
const PLAY_WEB_URL = 'https://play.google.com/store/apps/details?id=com.mettleup.app';

export type UpdateKind = 'github' | 'play';

export interface UpdateState {
  /** The update this phone can take ("0.65.0" or "play:123"); null = up to date or unknown. */
  key: string | null;
  kind: UpdateKind | null;
  /** GitHub: the new version and its APK. */
  version: string | null;
  url: string | null;
  /** Play: where the download is. */
  playStatus: PlayUpdateStatus;
  /** The launch pop-up is on screen. */
  popup: boolean;
  /** The Workout tab card may show (no "Later" on it in the last 3 days). */
  card: boolean;
  /** "Update" was pressed and Google's box is opening. */
  busy: boolean;
  check: (opts?: { launch?: boolean }) => Promise<void>;
  setPlayStatus: (s: PlayUpdateStatus) => void;
  update: () => Promise<void>;
  restart: () => boolean;
  laterPopup: () => void;
  laterCard: () => void;
  /** The pop-up is really on screen now: start its "Later" wait (review fix: not when it was only due). */
  shown: () => void;
}

function workoutOpen(): boolean {
  return useActiveWorkout.getState().active != null;
}

function isPlayCopy(): boolean {
  return !offersGithubUpdate(readInstaller(phoneNative()), Constants.expoConfig?.extra?.distribution);
}

async function readCardLater(): Promise<{ key: string | null; at: number }> {
  const raw = await readUpdateMeta(CARD_LATER_KEY);
  try {
    const v = raw ? (JSON.parse(raw) as { key?: unknown; at?: unknown }) : null;
    return { key: typeof v?.key === 'string' ? v.key : null, at: typeof v?.at === 'number' ? v.at : 0 };
  } catch {
    return { key: null, at: 0 }; // quiet: a broken saved "Later" is the same as none
  }
}

function openPlayPage(): void {
  Linking.openURL(PLAY_STORE_URL).catch(() =>
    Linking.openURL(PLAY_WEB_URL).catch((e: unknown) => console.warn('[update] could not open Google Play', e)),
  );
}

let checking: Promise<void> | null = null;

export const useAppUpdate = create<UpdateState>()((set, get) => ({
  key: null,
  kind: null,
  version: null,
  url: null,
  playStatus: 'none',
  popup: false,
  card: false,
  busy: false,

  check: (opts) => {
    if (checking) return checking;
    checking = (async () => {
      try {
        const now = Date.now();
        const current = Constants.expoConfig?.version ?? null;
        let key: string | null = null;
        let kind: UpdateKind | null = null;
        let version: string | null = null;
        let url: string | null = null;
        let staleDays: number | null = null;
        let playStatus: PlayUpdateStatus = get().playStatus;
        if (isPlayCopy()) {
          const info = await phoneNative()?.playUpdateCheck?.().catch((e: unknown) => {
            console.warn('[update] Play check failed', e);
            return null;
          });
          if (info && (info.available || info.status === 'downloaded' || info.status === 'downloading')) {
            key = `play:${info.versionCode}`;
            kind = 'play';
            staleDays = info.staleDays;
            playStatus = info.status;
          }
        } else {
          const u = await findLatest(current, now);
          if (u) {
            key = u.version;
            kind = 'github';
            version = u.version;
            url = u.url;
          }
        }
        if (!key) {
          set({ key: null, kind: null, version: null, url: null, popup: false, card: false });
          return;
        }
        const saved = readMark(await readUpdateMeta(POPUP_KEY));
        const mark = markFor(saved, key, now);
        const urgent = isUrgent({ behind: versionsBehind(version, current), staleDays, firstAt: mark.firstAt, now });
        const later = await readCardLater();
        // The pop-up only on a launch (or a return after hours away), never while it is already up.
        const due = opts?.launch === true && !get().popup && popupDue({ now, mark, urgent, workoutOpen: workoutOpen() });
        if (saved?.key !== key) {
          writeUpdateMeta(POPUP_KEY, JSON.stringify(mark)).catch((e: unknown) => console.warn('[update] could not save the pop-up mark', e));
        }
        // Review fix: a "downloaded" heard from Play while this check waited is newer than what it read.
        if (kind === 'play' && get().playStatus === 'downloaded') playStatus = 'downloaded';
        set({
          key,
          kind,
          version,
          url,
          playStatus,
          card: cardDue({ now, key, laterKey: later.key, laterAt: later.at }),
          popup: get().popup || due,
        });
      } catch (e) {
        console.warn('[update] check failed', e);
      } finally {
        checking = null;
      }
    })();
    return checking;
  },

  setPlayStatus: (s) => {
    const was = get().playStatus;
    set({ playStatus: s });
    // The download finished while the app is open: ask once for the restart (never during a workout).
    if (s === 'downloaded' && was !== 'downloaded' && !workoutOpen()) set({ popup: true, card: true });
    if (s === 'installed' || s === 'canceled') set({ key: null, kind: null, popup: false, card: false });
  },

  update: async () => {
    const s = get();
    if (s.kind === 'github' && s.url) {
      set({ popup: false });
      Linking.openURL(s.url).catch((e: unknown) => console.warn('[update] could not open', s.url, e));
      return;
    }
    if (s.kind !== 'play') return;
    if (s.playStatus === 'downloaded') {
      get().restart();
      return;
    }
    if (s.busy) return;
    set({ busy: true });
    try {
      const r = (await phoneNative()?.playUpdateStart?.()) ?? 'failed';
      if (r === 'accepted') set({ popup: false, playStatus: 'downloading' });
      else if (r === 'declined') get().laterPopup();
      else {
        // Google's box would not open (an old Play app, a copy Play does not know): the store page instead.
        console.warn('[update] Play update box answered', r);
        set({ popup: false });
        openPlayPage();
      }
    } catch (e) {
      console.warn('[update] Play update failed', e);
      set({ popup: false });
      openPlayPage();
    } finally {
      set({ busy: false });
    }
  },

  restart: () => {
    if (workoutOpen()) return false;
    set({ popup: false });
    return phoneNative()?.playUpdateFinish?.() ?? false;
  },

  laterPopup: () => set({ popup: false }),

  shown: () => {
    const key = get().key;
    if (!key) return;
    void (async () => {
      const now = Date.now();
      const mark = markFor(readMark(await readUpdateMeta(POPUP_KEY)), key, now);
      await writeUpdateMeta(POPUP_KEY, JSON.stringify({ ...mark, lastAt: now }));
    })().catch((e: unknown) => console.warn('[update] could not save the pop-up mark', e));
  },

  laterCard: () => {
    const key = get().key;
    set({ card: false });
    if (key) {
      writeUpdateMeta(CARD_LATER_KEY, JSON.stringify({ key, at: Date.now() })).catch((e: unknown) =>
        console.warn('[update] could not save Later', e),
      );
    }
  },
}));

/**
 * The app has been in the background for a while (components/UpdatePrompt.tsx waits 60 s: Android also
 * says "background" while a share sheet or photo picker covers the app): a finished Play download
 * installs now, unless a workout is open.
 */
export function installDownloadedQuietly(): void {
  const s = useAppUpdate.getState();
  if (s.kind === 'play' && s.playStatus === 'downloaded' && !workoutOpen()) {
    phoneNative()?.playUpdateFinish?.();
  }
}

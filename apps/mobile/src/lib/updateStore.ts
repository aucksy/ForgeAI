/**
 * R-260 / R-336: one place that knows whether a newer MettleUp exists and what to do about it. The
 * full-screen pop-up (components/UpdatePrompt.tsx) and the Workout tab's orange line
 * (components/UpdateLine.tsx) both read it.
 *
 * Two kinds of copy (lib/installSource.ts):
 *  - Google Play: Play's own flexible update. "Update now" opens Google's box; the new version downloads
 *    while the member keeps using the app; "Restart" installs it. A finished download the member never
 *    restarts for is installed the next time the app goes to the background with no workout open.
 *  - GitHub APK: "Update now" opens the new APK (lib/appUpdate.ts).
 * When to ask: lib/updatePrompt.ts. What changed: whats-new.json of the newest release (findReleaseNews).
 */
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { create } from 'zustand';

import { findLatest, findReleaseNews, readUpdateMeta, writeUpdateMeta, type ReleaseNews } from '@/lib/appUpdate';
import { offersGithubUpdate, readInstaller } from '@/lib/installSource';
import { onIphone } from '@/lib/onIphone';
import {
  countLaunch,
  hasUpdateStandIn,
  isUrgent,
  markFor,
  markShown,
  newsFor,
  popupDue,
  readMark,
  standInVersion,
  type UpdateKind,
} from '@/lib/updatePrompt';
import { phoneNative, type PlayUpdateStatus } from '@/tracker/phone/native';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const POPUP_KEY = 'update_popup'; // JSON PopupMark
const QA_KEY = 'update_qa_stand_in'; // QA builds only: JSON { behind }
const PLAY_STORE_URL = 'market://details?id=com.mettleup.app';
const PLAY_WEB_URL = 'https://play.google.com/store/apps/details?id=com.mettleup.app';

export type { UpdateKind };

export interface UpdateState {
  /** The update this phone can take ("0.65.0" or "play:123"); null = up to date or unknown. */
  key: string | null;
  kind: UpdateKind | null;
  /** The newest version when known (GitHub: always; Play: from whats-new.json). */
  version: string | null;
  /** GitHub: the new APK. */
  url: string | null;
  /** How many versions behind (1 when unknown). */
  behind: number;
  /** The newest version's What's new lines (up to 3); empty when they cannot be read. */
  news: string[];
  /** QA builds only: a made-up update for the device UAT (the screen says so). */
  standIn: boolean;
  /** Play: where the download is. */
  playStatus: PlayUpdateStatus;
  /** The pop-up is wanted (the full screen, or the small restart sheet once Play's download is done). */
  popup: boolean;
  /** "Update now" was pressed and Google's box is opening. */
  busy: boolean;
  check: (opts?: { launch?: boolean }) => Promise<void>;
  setPlayStatus: (s: PlayUpdateStatus) => void;
  update: () => Promise<void>;
  restart: () => boolean;
  laterPopup: () => void;
  /** The full screen is really on screen now: start counting launches (not when it was only due). */
  shown: () => void;
  /** QA builds only (mettleup://qa-update?behind=N): a made-up update, then a launch check. */
  qaStandIn: (behind: number) => Promise<void>;
}

export const QA_STAND_IN_NEWS = [
  'See which muscles are ready to train today.',
  'A quick workout for the time you have.',
  'Invite a friend to your gym.',
];

/** QA builds only: turn the made-up update on (behind >= 1) or off (0). */
export async function setUpdateStandIn(behind: number): Promise<void> {
  if (!hasUpdateStandIn(Constants.expoConfig?.extra)) return;
  await writeUpdateMeta(QA_KEY, behind >= 1 ? JSON.stringify({ behind: Math.min(9, Math.floor(behind)) }) : '');
}

async function readStandIn(): Promise<number> {
  if (!hasUpdateStandIn(Constants.expoConfig?.extra)) return 0;
  const raw = await readUpdateMeta(QA_KEY);
  try {
    const v = raw ? (JSON.parse(raw) as { behind?: unknown }) : null;
    return typeof v?.behind === 'number' && v.behind >= 1 ? v.behind : 0;
  } catch {
    return 0; // quiet: QA builds only; a broken value is the same as off
  }
}

function workoutOpen(): boolean {
  return useActiveWorkout.getState().active === true;
}

function isPlayCopy(): boolean {
  return !offersGithubUpdate(readInstaller(phoneNative()), Constants.expoConfig?.extra?.distribution);
}

function openPlayPage(): void {
  Linking.openURL(PLAY_STORE_URL).catch(() =>
    Linking.openURL(PLAY_WEB_URL).catch((e: unknown) => console.warn('[update] could not open Google Play', e)),
  );
}

let checking: Promise<void> | null = null;
let qaRun: Promise<void> | null = null;

export const useAppUpdate = create<UpdateState>()((set, get) => ({
  key: null,
  kind: null,
  version: null,
  url: null,
  behind: 1,
  news: [],
  standIn: false,
  playStatus: 'none',
  popup: false,
  busy: false,

  check: (opts) => {
    if (checking) return checking;
    checking = (async () => {
      try {
        // R-339: an iPhone copy is never offered the Android APK or Google Play. Its App Store check
        // comes with the App Store release (docs/ios/PARITY.yaml app-updates); until then, no prompt.
        if (onIphone()) {
          set({ key: null, kind: null, version: null, url: null, behind: 1, news: [], standIn: false, popup: false });
          return;
        }
        const now = Date.now();
        const current = Constants.expoConfig?.version ?? null;
        let key: string | null = null;
        let kind: UpdateKind | null = null;
        let version: string | null = null;
        let url: string | null = null;
        let staleDays: number | null = null;
        let playStatus: PlayUpdateStatus = get().playStatus;
        let news: ReleaseNews | null = null;
        const qaBehind = await readStandIn();
        const qaVersion = qaBehind > 0 ? standInVersion(current, qaBehind) : null;
        if (qaVersion) {
          key = qaVersion;
          kind = 'github';
          version = qaVersion;
          url = 'https://github.com/aucksy/ForgeAI/releases';
          news = { version: qaVersion, lines: QA_STAND_IN_NEWS };
        } else if (isPlayCopy()) {
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
        if (!key || !kind) {
          set({ key: null, kind: null, version: null, url: null, behind: 1, news: [], standIn: false, popup: false });
          return;
        }
        if (!qaVersion) news = await findReleaseNews(kind === 'github' ? version : null, now);
        const told = newsFor({ kind, version, current, news });
        const saved = readMark(await readUpdateMeta(POPUP_KEY));
        const fresh = markFor(saved, key, now);
        // R-336: a launch (or a return after 6+ hours away) counts toward the 7th (far behind: 3rd).
        const mark = opts?.launch === true ? countLaunch(fresh) : fresh;
        const urgent = isUrgent({ behind: told.behind, staleDays, firstAt: mark.firstAt, now });
        // The full screen only on a launch, never while it is already up.
        const due = opts?.launch === true && !get().popup && popupDue({ now, mark, urgent, workoutOpen: workoutOpen() });
        if (saved?.key !== key || mark !== fresh) {
          writeUpdateMeta(POPUP_KEY, JSON.stringify(mark)).catch((e: unknown) => console.warn('[update] could not save the pop-up mark', e));
        }
        // Review fix: a "downloaded" heard from Play while this check waited is newer than what it read.
        if (kind === 'play' && get().playStatus === 'downloaded') playStatus = 'downloaded';
        set({
          key,
          kind,
          version: told.version,
          url,
          behind: told.behind,
          news: told.lines,
          standIn: qaVersion != null,
          playStatus,
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
    if (s === 'downloaded' && was !== 'downloaded' && !workoutOpen()) set({ popup: true });
    if (s === 'installed' || s === 'canceled') set({ key: null, kind: null, popup: false });
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

  qaStandIn: (behind) => {
    // UAT finding: one link can reach two listeners (two tab screens mounted at once); run it once.
    if (qaRun) return qaRun;
    qaRun = (async () => {
      if (!hasUpdateStandIn(Constants.expoConfig?.extra)) return;
      await setUpdateStandIn(behind);
      // A check already running read the phone before the stand-in: wait for it, then check afresh.
      while (checking) await checking;
      set({ popup: false });
      await get().check({ launch: true });
    })().finally(() => {
      qaRun = null;
    });
    return qaRun;
  },

  shown: () => {
    const key = get().key;
    if (!key) return;
    void (async () => {
      const now = Date.now();
      const mark = markFor(readMark(await readUpdateMeta(POPUP_KEY)), key, now);
      await writeUpdateMeta(POPUP_KEY, JSON.stringify(markShown(mark, now)));
    })().catch((e: unknown) => console.warn('[update] could not save the pop-up mark', e));
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

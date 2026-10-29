/**
 * F67 "Install the watch app from the phone" (owner-approved spec, 29 Oct 2026).
 *
 * The phone asks Wear OS (native: WearSync.watchAppState, NodeClient + CapabilityClient with the
 * watch app's capability "forgeai_watch_app", android/wear res/values/wear.xml) whether a watch is
 * connected and whether every connected watch has the MettleUp watch app. Then:
 *  - Workout tab: after the member's first finished workout, with a watch connected and the app
 *    missing, ONE card: "MettleUp works on your watch too" + "Install on watch" + "Not now". It goes
 *    for good after "Not now", after the watch's Play Store opened, or once the app is seen on the
 *    watch (meta key `watch_install_card` = 'done', like lib/layoutHints.ts). No watch, no card.
 *  - Settings: a "Your watch" row that says "Installed" or "Install on watch" (left out with no
 *    watch, or when Wear OS cannot say).
 * "Install on watch" asks the watch to open its Play Store on the MettleUp page (native:
 * WearSync.installOnWatch, RemoteActivityHelper + market://details?id=com.mettleup.app). Anything
 * that goes wrong (no Play services, the watch refuses, a timeout) never crashes: it is logged and
 * the member reads the fallback "Open Play Store on your watch and search MettleUp."
 *
 * The watch app is not on Play yet (it waits on the owner); the link is the right one for when it is.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import { nativeInstallOnWatch, nativeWatchAppState } from './restCard';

/** What Wear OS says: no watch, every watch has MettleUp, one lacks it, or it could not say. */
export type WatchState = 'none' | 'installed' | 'missing' | 'unknown';

/** What "Install on watch" did. */
export type InstallResult = 'opened' | 'installed' | 'none' | 'failed' | 'unknown';

const STATES: readonly WatchState[] = ['none', 'installed', 'missing', 'unknown'];
const RESULTS: readonly InstallResult[] = ['opened', 'installed', 'none', 'failed', 'unknown'];

/** The native answer as a state; anything else (null, an older build, junk) is 'unknown'. PURE. */
export function parseWatchState(raw: unknown): WatchState {
  return typeof raw === 'string' && (STATES as readonly string[]).includes(raw) ? (raw as WatchState) : 'unknown';
}

/** The native answer to "Install on watch"; anything else is 'failed'. PURE. */
export function parseInstallResult(raw: unknown): InstallResult {
  return typeof raw === 'string' && (RESULTS as readonly string[]).includes(raw) ? (raw as InstallResult) : 'failed';
}

export const CARD_KEY = 'watch_install_card';
/** The stored mark: the card never shows again. */
export const CARD_DONE = 'done';

export interface WatchCardInput {
  /** What Wear OS says now. */
  state: WatchState;
  /** The member has at least one saved workout (null = not read yet). */
  hasWorkouts: boolean | null;
  /** The welcome demo's sample workouts are loaded (they are not the member's own). */
  demo: boolean;
  /** The stored mark (`CARD_KEY`), null = never closed; undefined = not read yet. */
  stored: string | null | undefined;
}

/**
 * The Workout tab's card shows only after a finished workout of the member's own, with a watch
 * connected that lacks the app, and never once closed or done. Unknown counts as no. PURE.
 */
export function watchCardShows(o: WatchCardInput): boolean {
  if (o.stored === undefined || o.stored === CARD_DONE) return false;
  if (o.hasWorkouts !== true || o.demo) return false;
  return o.state === 'missing';
}

/** Once the app is on the watch the card is never needed again: store the mark. PURE. */
export function stateEndsCard(state: WatchState): boolean {
  return state === 'installed';
}

/** After a tap on "Install on watch": the card is done when the Play Store opened or the app is there. PURE. */
export function resultEndsCard(r: InstallResult): boolean {
  return r === 'opened' || r === 'installed';
}

// ------------------------------------------------------------------ words (member-words skill)
export const WATCH_WORDS = {
  cardTitle: 'MettleUp works on your watch too', // member-words
  cardBody: 'See your rest timer and next set on your wrist.', // member-words
  install: 'Install on watch', // member-words
  notNow: 'Not now', // member-words
  gotIt: 'Got it', // member-words
  rowTitle: 'Your watch', // member-words
  installed: 'Installed', // member-words
  opened: 'Check your watch: its Play Store is open on MettleUp. Tap Install there.', // member-words
  already: 'MettleUp is already on your watch.', // member-words
  noWatch: 'Your watch is not connected. Open Play Store on your watch and search MettleUp.', // member-words
  fallback: 'Open Play Store on your watch and search MettleUp.', // member-words
  opening: 'Opening on your watch…', // member-words
} as const;

/** The Settings row's grey line; null = leave the row out (no watch, or Wear OS cannot say). PURE. */
export function watchRowLine(state: WatchState): string | null {
  if (state === 'installed') return WATCH_WORDS.installed;
  if (state === 'missing') return WATCH_WORDS.install;
  return null;
}

/** The one line the member reads after "Install on watch". PURE. */
export function installNote(r: InstallResult): string {
  switch (r) {
    case 'opened':
      return WATCH_WORDS.opened;
    case 'installed':
      return WATCH_WORDS.already;
    case 'none':
      return WATCH_WORDS.noWatch;
    default:
      return WATCH_WORDS.fallback;
  }
}

// ------------------------------------------------------------------ the phone
/** The JS side waits at most this long for Wear OS (native has its own, shorter timeouts). */
const STATE_WAIT_MS = 10_000;
const INSTALL_WAIT_MS = 20_000;

function within<T>(p: Promise<T>, ms: number, late: T, what: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[watch install] ${what} timed out`);
      resolve(late);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        console.warn(`[watch install] ${what} failed`, e);
        resolve(late);
      },
    );
  });
}

/** What Wear OS says now; 'unknown' with no native piece, an error or a timeout. Never throws. */
export async function readWatchState(): Promise<WatchState> {
  const raw = await within(nativeWatchAppState(), STATE_WAIT_MS, null, 'watch lookup');
  const s = parseWatchState(raw);
  if (raw != null && s === 'unknown') console.warn('[watch install] Wear OS could not say', raw);
  if (stateEndsCard(s)) markWatchCardDone().catch((e: unknown) => console.warn('[watch install] could not save the card mark', e));
  return s;
}

/** "Install on watch": opens the watch's Play Store on MettleUp. Never throws. */
export async function installOnWatch(): Promise<InstallResult> {
  const raw = await within(nativeInstallOnWatch(), INSTALL_WAIT_MS, 'failed', 'watch Play Store');
  const r = parseInstallResult(raw);
  if (r === 'failed' || r === 'unknown') console.warn('[watch install] the watch Play Store did not open', raw);
  if (resultEndsCard(r)) markWatchCardDone().catch((e: unknown) => console.warn('[watch install] could not save the card mark', e));
  return r;
}

/** The stored card mark, or null. Never throws (a failed read hides the card this time). */
export async function readWatchCardMark(): Promise<string | null> {
  try {
    return await getMeta(CARD_KEY);
  } catch (e) {
    console.warn('[watch install] could not read the card mark', e);
    return CARD_DONE;
  }
}

/** "Not now", the Play Store opened, or the app is on the watch: the card never shows again. */
export async function markWatchCardDone(): Promise<void> {
  await enqueueWrite(() => setMeta(CARD_KEY, CARD_DONE));
}

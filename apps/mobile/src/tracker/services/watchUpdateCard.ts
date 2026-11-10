/**
 * R-438 (owner, 10 Nov 2026, design 2 "Watch in hand"): the phone's "Your watch app has an update"
 * pop-up. WHEN it shows, WHAT it says and what "Update on watch" leads to. The watch versions and the
 * Play Store tap are watchUpdate.ts; the screen is components/WatchUpdatePrompt.tsx.
 *
 * When:
 * - Only when watchUpdate.ts says 'update-ready' (a watch with the app is older than this phone app).
 *   Never on 'unknown' or 'none'.
 * - Checked when the app opens, and when it comes back after 6+ hours away (as the phone's own update
 *   pop-up, UpdatePrompt.tsx). Only over the 3 main tabs, never while a workout is open.
 * - The phone's own update goes first: while a newer PHONE version waits, the watch pop-up stays
 *   away (the watch would only fall behind again).
 * - "Later" (before any "Update on watch"): not again for 24 hours, so the next app open after a day
 *   asks again. A NEW phone version asks at once (its watch app is newer still). A clock set back skips
 *   the 24-hour wait rather than blocking for ever.
 * - R-444 (fresh-eyes review, 10 Nov 2026): once the member tapped "Update on watch" (then "Got it",
 *   back, or nothing), it never asks again for THIS phone version, even if the watch stays old. Play
 *   may simply have no newer watch build for them (a watch on a test track the phone is not on, or a
 *   watch release that lags the phone's): asking every day would nag about something they cannot do.
 *   A newer phone version asks once more.
 * No phone notification: Play already notifies, and more alerts push members to turn ours off.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { isNewer, versionParts } from '@/lib/appUpdate';
import { WHATS_NEW_LOG, type WhatsNewEntry } from '@/lib/whatsNew';

import type { UpdateResult, WatchNode, WatchUpdateState, WatchVersions } from './watchUpdate';

export const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** At most this many "New on your watch" lines. */
export const WATCH_NEWS_MAX = 3;
/** The stored "Later": JSON { version, at }. */
export const SNOOZE_KEY = 'watch_update_later';

// ------------------------------------------------------------------ words (member-words skill)
export const WATCH_UPDATE_WORDS = {
  kicker: (v: string) => `New version: ${v}`, // member-words + fresh reader ("old or new version?")
  title: 'Your watch app has an update', // member-words
  newHeading: 'New on your watch:', // member-words
  noNews: 'Update it so your watch and phone work well together.', // member-words + fresh reader
  updateOnWatch: 'Update on watch', // member-words
  later: 'Later', // member-words
  // On the drawn watch (always black, like a real watch screen).
  faceApp: 'MettleUp',
  faceReady: 'Update ready', // member-words
  faceUpdate: 'Update',
  tapThis: 'Tap this on your watch', // member-words
  // After "Update on watch"
  openedTitle: 'Check your watch', // member-words
  opened: 'Look at your watch and tap Update there. If its screen is dark, tap it first.', // member-words + fresh reader
  gotIt: 'Got it', // member-words
  tryAgainOpened: 'Nothing on your watch? Try again', // member-words + fresh reader
  fallbackTitle: 'The update did not start', // member-words + fresh reader ("it does not say it failed")
  fallback: 'Open Play Store on your watch, search for MettleUp and tap Update.', // member-words
  noWatchTitle: 'Your watch is not connected', // member-words + fresh reader
  noWatch: 'Check that Bluetooth is on, then tap Try again. Or open Play Store on your watch, search for MettleUp and tap Update.', // member-words + fresh reader
  tryAgain: 'Try again', // member-words
} as const;

/** What the pop-up shows: the offer, or the line after "Update on watch". */
export type CardStep = 'offer' | 'opened' | 'fallback' | 'noWatch';

/** The step after a tap on "Update on watch". Anything but 'opened' gets the search-for-it fallback. PURE. */
export function stepAfter(r: UpdateResult): CardStep {
  if (r === 'opened') return 'opened';
  if (r === 'none') return 'noWatch';
  return 'fallback';
}

/** The title and the line for a step after the tap. PURE. */
export function stepWords(step: Exclude<CardStep, 'offer'>): { title: string; body: string; again: string } {
  if (step === 'opened') return { title: WATCH_UPDATE_WORDS.openedTitle, body: WATCH_UPDATE_WORDS.opened, again: WATCH_UPDATE_WORDS.tryAgainOpened };
  if (step === 'noWatch') return { title: WATCH_UPDATE_WORDS.noWatchTitle, body: WATCH_UPDATE_WORDS.noWatch, again: WATCH_UPDATE_WORDS.tryAgain };
  return { title: WATCH_UPDATE_WORDS.fallbackTitle, body: WATCH_UPDATE_WORDS.fallback, again: WATCH_UPDATE_WORDS.tryAgain };
}

/** "0.76.0" -> "0.76"; "0.62.1" stays. For the watch face and the kicker. PURE. */
export function shortVersion(v: string): string {
  const p = versionParts(v);
  if (!p) return v;
  return p[2] === 0 ? `${p[0]}.${p[1]}` : `${p[0]}.${p[1]}.${p[2]}`;
}

/** The stored "Later", or null for none or anything broken. PURE. */
export interface Snooze {
  version: string;
  at: number;
  /** R-444: the member tapped "Update on watch" for this phone version: never again for it. */
  tapped?: true;
}
export function readSnooze(raw: string | null | undefined): Snooze | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Snooze>;
    if (typeof v.version !== 'string' || typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
    return v.tapped === true ? { version: v.version, at: v.at, tapped: true } : { version: v.version, at: v.at };
  } catch {
    return null; // quiet: a broken mark is the same as none; the next "Later" rewrites it
  }
}

/** Whether a "Later" still holds for this phone version at `now`. PURE. */
export function snoozed(s: Snooze | null, phoneVersion: string | null | undefined, now: number): boolean {
  if (!s || !phoneVersion || s.version !== phoneVersion) return false;
  if (s.tapped) return true; // R-444: already tried "Update on watch" for this phone version
  if (now < s.at) return false; // a clock set back: ask rather than block for ever
  return now - s.at < SNOOZE_MS;
}

export interface CardInput {
  state: WatchUpdateState;
  /** The stored "Later" (undefined = not read yet). */
  snooze: Snooze | null | undefined;
  phoneVersion: string | null | undefined;
  now: number;
  workoutOpen: boolean;
  /** A newer PHONE version waits (lib/updateStore.ts `kind`), or its pop-up is up. */
  phoneUpdateWaits: boolean;
}

/** The one rule: does the pop-up show on this open? PURE. */
export function cardShows(o: CardInput): boolean {
  if (o.state !== 'update-ready') return false;
  if (o.snooze === undefined) return false;
  if (o.workoutOpen || o.phoneUpdateWaits) return false;
  return !snoozed(o.snooze, o.phoneVersion, o.now);
}

/** A line that is about the watch, as it reads under "New on your watch:"; null for any other. PURE. */
export function watchLine(text: string): string | null {
  const t = text.trim();
  const m = /^watch:\s*(.+)$/i.exec(t);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  if (/^(on )?your watch\b/i.test(t)) return t;
  return null;
}

/**
 * "New on your watch": the watch lines of every version newer than the watch's and up to the phone's,
 * newest first, at most 3. A watch too old to say its version: the last 3 versions up to the phone's.
 * Empty when none of them changed anything on the watch (the pop-up then says why to update). PURE.
 */
export function watchNews(
  phoneVersion: string | null | undefined,
  watchVersion: string | null | undefined,
  log: readonly WhatsNewEntry[] = WHATS_NEW_LOG,
): string[] {
  if (!versionParts(phoneVersion)) return [];
  const upTo = log.filter((e) => !isNewer(e.version, phoneVersion));
  const range = versionParts(watchVersion) ? upTo.filter((e) => isNewer(e.version, watchVersion)) : upTo.slice(0, 3);
  const out: string[] = [];
  for (const e of range) {
    for (const l of e.lines) {
      const w = watchLine(l.text);
      if (w && !out.includes(w)) out.push(w);
    }
  }
  return out.slice(0, WATCH_NEWS_MAX);
}

/** The oldest version among the watches to update (null when one cannot say its version). PURE. */
export function oldestWatchVersion(stale: readonly WatchNode[]): string | null {
  let oldest: string | null = null;
  for (const w of stale) {
    if (w.versionName == null || !versionParts(w.versionName)) return null;
    if (oldest == null || isNewer(oldest, w.versionName)) oldest = w.versionName;
  }
  return oldest;
}

/** Which watch "Update on watch" asks: the one to update, or every watch with the app when several. PURE. */
export function targetNode(stale: readonly WatchNode[]): string | null {
  return stale.length === 1 ? stale[0].nodeId : null;
}

// ------------------------------------------------------------------ QA builds only (UAT on a cloud phone)
/**
 * A cloud emulator has no watch. QA builds (extra.qaStandIns has 'updateOffer', lib/updatePrompt.ts
 * hasUpdateStandIn) take these links so the device UAT can photograph the pop-up:
 *   mettleup://qa-update?watch=old     one watch with the app, one version behind this phone
 *   mettleup://qa-update?watch=same    one watch, up to date (no pop-up)
 *   mettleup://qa-update?watch=off     back to the real watch read
 *   mettleup://qa-update?watch=forget  forget "Later"
 *   mettleup://qa-update?watchtap=opened|failed|none|missing   what the next "Update on watch" gets
 * The stand-in is saved (meta), so a restart keeps it. PURE.
 */
export type QaWatch = 'old' | 'same' | 'off' | 'forget';
export function qaWatchLink(url: string | null | undefined): { watch: QaWatch | null; tap: UpdateResult | null } {
  const u = url ?? '';
  if (!/^(?:mettleup|forgeai):\/\/\/?qa-update\/?\?/.test(u)) return { watch: null, tap: null };
  const w = /[?&]watch=(old|same|off|forget)(?:&|$)/.exec(u);
  const t = /[?&]watchtap=(opened|failed|none|missing|unknown)(?:&|$)/.exec(u);
  return { watch: (w?.[1] as QaWatch | undefined) ?? null, tap: (t?.[1] as UpdateResult | undefined) ?? null };
}

/** The made-up watch read for a saved QA stand-in ('old' = one minor version behind). PURE. */
export function qaWatchRead(mode: string | null, phoneVersion: string | null | undefined): WatchVersions | null {
  const p = versionParts(phoneVersion);
  if (!p || (mode !== 'old' && mode !== 'same')) return null;
  const v = mode === 'same' ? `${p[0]}.${p[1]}.${p[2]}` : `${p[0]}.${Math.max(0, p[1] - 1)}.0`;
  return { ok: true, nodes: [{ nodeId: 'qa-watch', displayName: 'QA watch', hasApp: true, versionName: v, versionCode: null }] };
}

export const QA_WATCH_KEY = 'qa_watch_standin';
export const QA_TAP_KEY = 'qa_watch_tap';

// ------------------------------------------------------------------ the phone
/** The stored "Later"; null when none. A failed read counts as snoozed this time (never a pop-up storm). */
export async function readWatchSnooze(): Promise<Snooze | null> {
  try {
    return readSnooze(await getMeta(SNOOZE_KEY));
  } catch (e) {
    console.warn('[watch update] could not read "Later"', e);
    return { version: '', at: Number.MAX_SAFE_INTEGER };
  }
}

/** The mark to store: "Later" before any tap (24 h), or "tapped" once "Update on watch" was tapped (R-444). PURE. */
export function snoozeMark(phoneVersion: string, now: number, tapped: boolean): Snooze {
  return tapped ? { version: phoneVersion, at: now, tapped: true } : { version: phoneVersion, at: now };
}

/**
 * "Later": not again for 24 hours on this phone version. [tapped] (R-444: "Update on watch" was tapped,
 * then "Got it" or back): never again for this phone version. Never throws.
 */
export async function snoozeWatchCard(phoneVersion: string, now: number = Date.now(), tapped = false): Promise<void> {
  try {
    await enqueueWrite(() => setMeta(SNOOZE_KEY, JSON.stringify(snoozeMark(phoneVersion, now, tapped))));
  } catch (e) {
    console.warn('[watch update] could not save "Later"', e);
  }
}

/** QA builds: forget "Later". */
export async function qaForgetWatchSnooze(): Promise<void> {
  await enqueueWrite(() => setMeta(SNOOZE_KEY, ''));
}

/** QA builds: the saved made-up watch ('old' / 'same' / ''), or null. Never throws. */
export async function qaReadWatchStandIn(): Promise<string | null> {
  try {
    return await getMeta(QA_WATCH_KEY);
  } catch (e) {
    console.warn('[watch update] QA stand-in not read', e);
    return null;
  }
}

/** QA builds: the saved made-up answer to "Update on watch", or null. Never throws. */
export async function qaReadWatchTap(): Promise<string | null> {
  try {
    return await getMeta(QA_TAP_KEY);
  } catch (e) {
    console.warn('[watch update] QA tap stand-in not read', e);
    return null;
  }
}

export async function qaWriteWatchStandIn(value: string): Promise<void> {
  await enqueueWrite(() => setMeta(QA_WATCH_KEY, value));
}

export async function qaWriteWatchTap(value: string): Promise<void> {
  await enqueueWrite(() => setMeta(QA_TAP_KEY, value));
}

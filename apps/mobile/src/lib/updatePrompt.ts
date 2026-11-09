/**
 * R-336 (5 Nov 2026, owner on the design canvas: "B (full screen) ... not showing this every time ...
 * once someone has tapped on the later button ... one simple line at the top ... show this again on,
 * let's say, the seventh launch ... consider ... quite a few different versions ... you decide").
 * Replaces R-260's "every 3 days" rule. WHEN the full-screen "A new MettleUp is here" shows. PURE; the
 * store (lib/updateStore.ts) feeds it.
 *
 * - A launch = the app starting, or coming back after 6+ hours away (components/UpdatePrompt.tsx).
 * - The first launch that finds a newer version: the full screen shows.
 * - "Later": the slim orange line on the Workout tab (components/UpdateLine.tsx) stays until the app is
 *   up to date. The full screen comes back on the 7th launch after it last showed.
 * - Far behind (2+ versions, or the update is 14+ days old): every 3rd launch instead of the 7th.
 * - Never twice within 24 hours, never while a workout is open. A clock set back: the 24-hour cap is
 *   skipped rather than blocking for ever.
 * - A NEW version starts afresh: it shows on the next launch.
 * - Never forced: "Later" always works.
 * No phone notification: Google Play already sends one, and more alerts push members to turn off all
 * of ours, the rest-timer alert with them.
 */
import { isNewer, versionParts, type ReleaseNews } from '@/lib/appUpdate';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** The full screen comes back on this launch after it last showed. */
export const LAUNCHES_NORMAL = 7;
/** ... or this one when the member is far behind. */
export const LAUNCHES_URGENT = 3;
/** Never twice within this long. */
export const MIN_GAP_MS = DAY_MS;
/** An update this old (days) counts as far behind. */
export const URGENT_DAYS = 14;
/** This many versions behind counts as far behind. */
export const URGENT_BEHIND = 2;

/** What was shown for which update. `key`: the version ("0.65.0") or the Play build ("play:123"). */
export interface PopupMark {
  key: string;
  /** When this phone first learned of this update. */
  firstAt: number;
  /** When the full screen last showed (0 = never). */
  lastAt: number;
  /** Launches since it last showed (this launch included, once counted). */
  launchesSince: number;
}

/**
 * How many versions behind: a newer major counts as far behind (99); else the minor steps, and a patch
 * alone counts as 1. 0 when not behind or not plain versions. PURE.
 */
export function versionsBehind(latest: string | null | undefined, current: string | null | undefined): number {
  const a = versionParts(latest);
  const b = versionParts(current);
  if (!a || !b) return 0;
  if (a[0] !== b[0]) return a[0] > b[0] ? 99 : 0;
  if (a[1] !== b[1]) return a[1] > b[1] ? a[1] - b[1] : 0;
  return a[2] > b[2] ? 1 : 0;
}

/** True when the member is far behind: the full screen comes every 3rd launch. PURE. */
export function isUrgent(o: { behind: number; staleDays: number | null; firstAt: number; now: number }): boolean {
  if (o.behind >= URGENT_BEHIND) return true;
  if (o.staleDays != null && o.staleDays >= URGENT_DAYS) return true;
  return o.now - o.firstAt >= URGENT_DAYS * DAY_MS;
}

/** The mark to keep for `key` (a new update starts afresh). PURE. */
export function markFor(mark: PopupMark | null, key: string, now: number): PopupMark {
  return mark && mark.key === key ? mark : { key, firstAt: now, lastAt: 0, launchesSince: 0 };
}

/** This launch counted (only once it has shown: before that the first launch shows it anyway). PURE. */
export function countLaunch(mark: PopupMark): PopupMark {
  return mark.lastAt === 0 ? mark : { ...mark, launchesSince: mark.launchesSince + 1 };
}

/** The mark after the full screen really showed. PURE. */
export function markShown(mark: PopupMark, now: number): PopupMark {
  return { ...mark, lastAt: now, launchesSince: 0 };
}

/** Whether the full screen shows on this launch (`mark` already counts this launch). PURE. */
export function popupDue(o: { now: number; mark: PopupMark; urgent: boolean; workoutOpen: boolean }): boolean {
  if (o.workoutOpen) return false;
  if (o.mark.lastAt === 0) return true;
  // Never twice within 24 hours; a clock set back skips this cap rather than blocking for ever.
  if (o.now >= o.mark.lastAt && o.now - o.mark.lastAt < MIN_GAP_MS) return false;
  return o.mark.launchesSince >= (o.urgent ? LAUNCHES_URGENT : LAUNCHES_NORMAL);
}

/** Saved marks are JSON; anything broken reads as none. A mark from before R-336 counts 0 launches. PURE. */
export function readMark(raw: string | null): PopupMark | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PopupMark>;
    if (typeof v.key !== 'string' || typeof v.firstAt !== 'number' || typeof v.lastAt !== 'number') return null;
    const n = typeof v.launchesSince === 'number' && Number.isFinite(v.launchesSince) && v.launchesSince >= 0 ? Math.floor(v.launchesSince) : 0;
    return { key: v.key, firstAt: v.firstAt, lastAt: v.lastAt, launchesSince: n };
  } catch {
    return null; // quiet: a broken saved mark is the same as none; the next launch rewrites it
  }
}

/** The small orange word over the title. `version`: the newest version when known. PURE. */
export function kickerFor(behind: number, version: string | null): string {
  if (behind >= 2 && behind < 99) return `You are ${behind} versions behind`;
  return version ? `Version ${version} is ready` : 'A new version is ready';
}

/** The grey line under the rows when 2+ versions behind ("And the changes from 2 earlier updates."). PURE. */
export function earlierLine(behind: number): string | null {
  if (behind < 2 || behind >= 99) return null;
  const n = behind - 1;
  return `And the changes from ${n} earlier ${n === 1 ? 'update' : 'updates'}.`;
}

/** R-336: the Workout tab's orange line (components/UpdateLine.tsx). */
export const LINE_WORDS = {
  ready: 'A new version of MettleUp is ready',
  update: 'Update',
  downloading: 'Downloading the new version. Keep using the app.',
  downloaded: 'The new version is ready.',
  restart: 'Restart',
  afterWorkout: 'The new version is ready. It installs after your workout.',
} as const;

/** R-412: the link after the line's words that opens this version's What's new inside the bar. */
export const UPDATE_LINE_NEWS = { show: "What's new", hide: "Hide what's new" } as const;

export type LineState = { text: string; action: string | null };

/** What the line says, or null for no line. PURE. */
export function lineFor(o: { kind: 'github' | 'play' | null; playStatus: string; workout: boolean }): LineState | null {
  if (!o.kind) return null;
  if (o.kind === 'play' && o.playStatus === 'downloaded') {
    return o.workout ? { text: LINE_WORDS.afterWorkout, action: null } : { text: LINE_WORDS.downloaded, action: LINE_WORDS.restart };
  }
  if (o.kind === 'play' && (o.playStatus === 'downloading' || o.playStatus === 'pending')) return { text: LINE_WORDS.downloading, action: null };
  return { text: LINE_WORDS.ready, action: LINE_WORDS.update };
}

export type UpdateKind = 'github' | 'play';

/**
 * QA builds only (qa-device.yml writes extra.qaStandIns with 'updateOffer' into app.json; store and GitHub
 * release builds never carry it): the link mettleup://qa-update?behind=N makes this phone see a made-up
 * update N versions ahead, so the device UAT can photograph the full screen and the Workout tab line.
 * PURE.
 */
export function hasUpdateStandIn(extra: unknown): boolean {
  const list = extra && typeof extra === 'object' ? (extra as { qaStandIns?: unknown }).qaStandIns : undefined;
  return Array.isArray(list) && list.includes('updateOffer');
}

/** The made-up version N minor steps ahead of `current` ("0.72.0", 3 -> "0.75.0"). PURE. */
export function standInVersion(current: string | null | undefined, behind: number): string | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((current ?? '').trim());
  if (!m || behind < 1) return null;
  return `${m[1]}.${Number(m[2]) + behind}.0`;
}

/**
 * How far behind, and the lines to show. The lines count only when they are about the newest version:
 * GitHub, the very version offered; Play (which gives only a build number), any version newer than this
 * app. PURE.
 */
export function newsFor(o: { kind: UpdateKind; version: string | null; current: string | null; news: ReleaseNews | null }): {
  version: string | null;
  behind: number;
  lines: string[];
} {
  const n = o.news;
  const fits = n != null && (o.kind === 'github' ? n.version === o.version : isNewer(n.version, o.current));
  const version = o.kind === 'github' ? o.version : fits ? n.version : null;
  const behind = Math.max(1, versionsBehind(version, o.current));
  return { version, behind, lines: fits ? n.lines : [] };
}

/** QA builds only: N from "mettleup://qa-update?behind=N", else null. PURE. */
/** R-401 UAT, QA builds only: mettleup://qa-update?oldnews=1 makes this phone forget it saw this version's What's new. PURE. */
export function qaOldNews(url: string | null | undefined): boolean {
  return /^(?:mettleup|forgeai):\/\/\/?qa-update\/?\?(?:.*&)?oldnews=1(?:&|$)/.test(url ?? '');
}

export function qaStandInBehind(url: string | null | undefined): number | null {
  const m = /^(?:mettleup|forgeai):\/\/\/?qa-update\/?\?(?:.*&)?behind=(\d+)/.exec(url ?? '');
  return m ? Number(m[1]) : null;
}

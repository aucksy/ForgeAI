/**
 * R-260 (31 Oct 2026, owner: "give them a pop-up on their launches to update the app ... do the best
 * implementation"): WHEN the "new version" pop-up shows. PURE; the store (lib/updateStore.ts) feeds it.
 *
 * - The first launch that finds a newer version: the pop-up shows.
 * - "Later": it waits 3 days, then asks again on a launch.
 * - Far behind (2 or more versions, or the update is 14+ days old): at most once a day.
 * - Never while a workout is open, never twice in one day, never on a phone with no newer version.
 * - The Workout tab's small card stays meanwhile: the always-there reminder (its "Later" also waits 3 days).
 * No phone notification: Google Play already sends one, and more alerts push members to turn off all
 * of ours, the rest-timer alert with them.
 */
import { versionParts } from '@/lib/appUpdate';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** After "Later": ask again after this long. */
export const SNOOZE_MS = 3 * DAY_MS;
/** An update this old (days) makes the reminder daily. */
export const URGENT_DAYS = 14;
/** This many versions behind makes the reminder daily. */
export const URGENT_BEHIND = 2;

/** What was shown for which update. `key`: the version ("0.65.0") or the Play build ("play:123"). */
export interface PopupMark {
  key: string;
  /** When this phone first learned of this update. */
  firstAt: number;
  /** When the pop-up last showed (0 = never). */
  lastAt: number;
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

/** True when the reminder should come daily, not every 3 days. PURE. */
export function isUrgent(o: { behind: number; staleDays: number | null; firstAt: number; now: number }): boolean {
  if (o.behind >= URGENT_BEHIND) return true;
  if (o.staleDays != null && o.staleDays >= URGENT_DAYS) return true;
  return o.now - o.firstAt >= URGENT_DAYS * DAY_MS;
}

/** The mark to keep for `key` (a new update starts afresh). PURE. */
export function markFor(mark: PopupMark | null, key: string, now: number): PopupMark {
  return mark && mark.key === key ? mark : { key, firstAt: now, lastAt: 0 };
}

/** Whether the pop-up shows on this launch. PURE. */
export function popupDue(o: { now: number; mark: PopupMark; urgent: boolean; workoutOpen: boolean }): boolean {
  if (o.workoutOpen) return false;
  if (o.mark.lastAt === 0) return true;
  // A clock set back: ask again rather than never.
  if (o.now < o.mark.lastAt) return true;
  return o.now - o.mark.lastAt >= (o.urgent ? DAY_MS : SNOOZE_MS);
}

/** Whether the Workout tab card shows: an update exists, and no "Later" on it in the last 3 days. PURE. */
export function cardDue(o: { now: number; key: string | null; laterKey: string | null; laterAt: number }): boolean {
  if (!o.key) return false;
  if (o.laterKey !== o.key) return true;
  return o.now < o.laterAt || o.now - o.laterAt >= SNOOZE_MS;
}

/** Saved marks are JSON; anything broken reads as none. PURE. */
export function readMark(raw: string | null): PopupMark | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PopupMark>;
    return typeof v.key === 'string' && typeof v.firstAt === 'number' && typeof v.lastAt === 'number'
      ? { key: v.key, firstAt: v.firstAt, lastAt: v.lastAt }
      : null;
  } catch {
    return null; // quiet: a broken saved mark is the same as none; the next pop-up rewrites it
  }
}

/**
 * Release A one-time "it moved" hints (docs/ux/MEMBER-APP-MAP.md A1, A5; owner decision 24 Oct 2026:
 * "Your charts are now in the Progress tab", dismissable, shown once, on Profile).
 *
 * Only a member who had the old layout is told: someone who met an earlier version of the app AND
 * has workouts of their own (the Profile tiles were theirs). A fresh install, or the welcome demo,
 * never sees "now in", because there was no "before". The answer is settled once, at the first
 * launch of this version (the Workout tab opens first), and kept: 'due' shows the hint until the
 * member closes it, 'done' never shows it.
 *
 *  - progressTab: on Profile, "Your charts are now in the Progress tab."
 *  - shopInGym:   on the Gym tab above its shop, for a member whose tab used to say "Shop".
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

export type LayoutHint = 'progressTab' | 'shopInGym';

export const HINT_TEXT: Readonly<Record<LayoutHint, string>> = {
  progressTab: 'Your charts are now in the Progress tab.',
  shopInGym: 'Your gym’s shop is now inside the Gym tab.',
};

export type HintState = 'due' | 'done';

const key = (h: LayoutHint): string => `layout_hint_${h}`;

/**
 * What to store for a hint that has no answer yet; null = it is settled already (keep it). PURE.
 * `hadOldLayout`: this member used the screen that moved.
 */
export function settleHint(stored: string | null, hadOldLayout: boolean): HintState | null {
  if (stored === 'due' || stored === 'done') return null;
  return hadOldLayout ? 'due' : 'done';
}

/** The hint shows only while it is due. PURE. */
export function hintShows(stored: string | null): boolean {
  return stored === 'due';
}

/** The Profile tiles were this member's: an earlier version, workouts of their own, not the demo. PURE. */
export function hadOldTiles(o: { metEarlierVersion: boolean; hasWorkouts: boolean; demo: boolean }): boolean {
  return o.metEarlierVersion && o.hasWorkouts && !o.demo;
}

/** This member's third tab said "Shop": an earlier version, a gym joined, and its shop on. PURE. */
export function hadShopTab(o: { metEarlierVersion: boolean; joined: boolean; productCount: number }): boolean {
  return o.metEarlierVersion && o.joined && o.productCount > 0;
}

/** Settle one hint (first launch of this version). Never throws: a failed write is tried next launch. */
export async function settleLayoutHint(h: LayoutHint, hadOldLayout: boolean): Promise<void> {
  try {
    const next = settleHint(await getMeta(key(h)), hadOldLayout);
    if (next) await enqueueWrite(() => setMeta(key(h), next));
  } catch (e) {
    console.warn('[layout hint] could not settle', h, e);
  }
}

/** True while the hint is waiting to be read. Never throws (a failed read hides it this time). */
export async function hintDue(h: LayoutHint): Promise<boolean> {
  try {
    return hintShows(await getMeta(key(h)));
  } catch (e) {
    console.warn('[layout hint] could not read', h, e);
    return false;
  }
}

/** "Got it": never again. */
export async function dismissHint(h: LayoutHint): Promise<void> {
  await enqueueWrite(() => setMeta(key(h), 'done'));
}

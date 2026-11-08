/**
 * F198 "follow the dots" (owner R-389/R-390, 7 Nov 2026; plan docs/plans/R-389-new-feature-dots.md). Like
 * Samsung's settings: a NEW feature (a What's new line with `feature: true`, never a fix) puts one small dot
 * on every place on the way to it, so the member follows the dots to it.
 *
 *  - One source: the line's `go` (lib/whatsNew.ts). The trail is derived from `go.href` (+ `section`):
 *      '/settings/health' -> the Profile tab, the Settings button on Profile, the "Health apps" row on Settings,
 *      and the place on the page itself (beside the feature's heading);
 *      '/shop', '/workout', '/profile' -> that tab (+ the section of the Gym tab, when named); '/progress'
 *      (F199: the Progress tab moved into Profile) -> the Profile tab.
 *  - Clears: opening the page marks that feature seen on this phone. The page's own dot shows for that visit
 *    (so the member sees where it is) and is gone the next time. A parent dot (tab, button, row) goes at once,
 *    unless another unseen feature sits under it.
 *  - Expiry: no dot from 30 days after the entry's date (India time). At most 3 features carry dots at once,
 *    newest first: a seen one makes room for the next.
 *  - Seen unknown (storage could not be read): no dots at all, never dots that cannot be cleared.
 * PURE (no React, no storage).
 */
import type { GymSection } from '@/shop/gymTab';

import type { WhatsNewEntry, WhatsNewLine } from './whatsNew';

/** Days a feature keeps its dots, counted from its entry's date (India time). */
export const DOT_DAYS = 30;
/** At most this many features carry dots at once (newest first). */
export const DOT_LIMIT = 3;

/** A place that can carry a dot. */
export type DotSpot =
  | `tab:${string}` // a bottom tab (route name: workout, progress, shop, profile)
  | 'gear' // the Settings button on the Profile tab
  | `row:${string}` // a row on Settings (by its page's href)
  | `section:${string}` // a part of the Gym tab (My gym, Shop, Ranking)
  | `page:${string}`; // the place on the destination page itself

export interface NewFeature {
  /** Stable per feature: the version and its place, e.g. "0.73.0|/settings/health". */
  id: string;
  version: string;
  href: string;
  section?: GymSection;
  /** The day it went live: midnight, India time, as epoch ms. */
  liveAt: number;
  trail: readonly DotSpot[];
}

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The India-time day number (days since 1 Jan 1970) of an instant. */
export function istDay(ms: number): number {
  return Math.floor((ms + IST_MS) / DAY_MS);
}

/**
 * An entry's "6 Nov" as midnight India time, epoch ms. The log has no year: it is the latest such day
 * that is not after today (India time), so an entry of late December read in January is last year's.
 * Null for a date that cannot be read.
 */
export function liveAtOf(date: string, now: number): number | null {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})/.exec(date);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0 || day < 1 || day > 31) return null;
  const todayIst = new Date(now + IST_MS);
  let year = todayIst.getUTCFullYear();
  const at = (y: number) => Date.UTC(y, month, day) - IST_MS;
  if (istDay(at(year)) > istDay(now)) year -= 1;
  return at(year);
}

/** The bottom tab a place lives under. */
function tabOf(href: string): string | null {
  if (href.startsWith('/settings/')) return 'profile';
  const tab = href.replace(/^\//, '');
  // F199 (R-403): an older line's '/progress' lives on the Profile tab now.
  if (tab === 'progress' || tab === 'profile') return 'profile';
  return tab === 'workout' || tab === 'shop' ? tab : null;
}

/** Every place on the way to a line's `go`, outermost first, ending at the page itself. PURE. */
export function trailOf(go: NonNullable<WhatsNewLine['go']>): DotSpot[] {
  const trail: DotSpot[] = [];
  const tab = tabOf(go.href);
  if (tab) trail.push(`tab:${tab}`);
  if (go.href.startsWith('/settings/')) trail.push('gear', `row:${go.href}`);
  if (go.section) trail.push(`section:${go.section}`);
  trail.push(`page:${pageKey(go.href, go.section)}`);
  return trail;
}

/** The key of a destination: its href, plus "#section" for a part of the Gym tab. */
export function pageKey(href: string, section?: string): string {
  return section ? `${href}#${section}` : href;
}

/** Every feature line of the log that has a place to go, newest first. PURE. */
export function featuresOf(log: readonly WhatsNewEntry[], now: number): NewFeature[] {
  const out: NewFeature[] = [];
  for (const e of log) {
    const liveAt = liveAtOf(e.date, now);
    if (liveAt == null) continue;
    for (const l of e.lines) {
      // Fixes never light a dot: only a line marked as a feature, with a place to go.
      if (!l.feature || !l.go) continue;
      out.push({
        id: `${e.version}|${pageKey(l.go.href, l.go.section)}`,
        version: e.version,
        href: l.go.href,
        section: l.go.section,
        liveAt,
        trail: trailOf(l.go),
      });
    }
  }
  // Newest first (the log is already; a stable sort keeps the log's order within one day).
  return out.sort((a, b) => b.liveAt - a.liveAt);
}

/** True while a feature is young enough for dots: its day and the 29 days after it (India time). PURE. */
export function stillNew(f: Pick<NewFeature, 'liveAt'>, now: number): boolean {
  const age = istDay(now) - istDay(f.liveAt);
  return age >= 0 && age < DOT_DAYS;
}

export interface DotInput {
  log: readonly WhatsNewEntry[];
  now: number;
  /** The features already seen on this phone; null = could not be read (then no dots). */
  seen: ReadonlySet<string> | null;
  /** Whether this phone shows the feature's page at all (e.g. Health apps needs Health Connect). */
  available?: (f: NewFeature) => boolean;
  limit?: number;
}

/** The features that carry dots now: young, on this phone, not yet seen; newest first, at most 3. PURE. */
export function litFeatures({ log, now, seen, available = () => true, limit = DOT_LIMIT }: DotInput): NewFeature[] {
  if (!seen) return [];
  return featuresOf(log, now)
    .filter((f) => stillNew(f, now) && !seen.has(f.id) && available(f))
    .slice(0, limit);
}

/** Every place that carries a dot for these features. PURE. */
export function litSpots(features: readonly NewFeature[]): Set<DotSpot> {
  const spots = new Set<DotSpot>();
  for (const f of features) for (const s of f.trail) spots.add(s);
  return spots;
}

/** The lit features whose page is this one (opening it marks them seen). PURE. */
export function featuresAt(features: readonly NewFeature[], href: string, section?: string): NewFeature[] {
  const key = pageKey(href, section);
  return features.filter((f) => pageKey(f.href, f.section) === key);
}

/** The seen list after a visit: the old one plus these ids, once each. PURE. */
export function withSeen(seen: readonly string[], ids: readonly string[]): string[] {
  const out = [...seen];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/** The stored seen list, read back; anything unreadable is null (then no dots). PURE. */
export function parseSeen(raw: string | null): string[] | null {
  if (raw == null) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null;
  } catch {
    return null;
  }
}

/** A dot's test id (qa flows find it by this): "new-dot-row-health", "new-dot-tab-profile", "new-dot-gear". PURE. */
export function dotTestId(spot: DotSpot): string {
  return `new-dot-${spot.replace(/:\/?/, '-').replace(/^(row|page)-settings\//, '$1-').replace(/[/#]/g, '-')}`;
}

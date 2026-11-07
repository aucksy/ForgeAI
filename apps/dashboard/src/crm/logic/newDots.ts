/**
 * F198 "new-feature dots" (R-389/R-390, owner 7 Nov 2026): like Samsung's settings, a NEW feature (never a
 * fix) puts a small dot on every entry point on the way to it, so the owner follows the dots: the left menu
 * (or the phone's bottom bar and More), the row on Settings, and beside the page heading.
 * Plan: docs/plans/R-389-new-feature-dots.md.
 *
 * - One source: an ADMIN_NEWS line with `feature: true`. Its `go.path` is the destination; the trail is
 *   worked out from that path and the links each page already has. No second list to keep in step.
 * - Expiry: a dot shows from the entry's day (00:00 India time) for DOT_DAYS days. Before its day
 *   (a test clock, a wrong device clock) it is not live yet, so no dot.
 * - Limit: the MAX_DOTS newest live features are the only ones that can carry dots. Seeing one does NOT
 *   pull an older one in: the dots go down to zero instead of a new dot popping up after each visit.
 * - Seen: opening the destination marks it seen on this device (localStorage). A browser that never saw
 *   any (a new computer, a new person) sees the dots, still only inside the DOT_DAYS days.
 *
 * Everything here is PURE except readSeen/saveSeen (which never throw).
 */

import { ADMIN_NEWS, type AdminNewsEntry, type NewsStore } from './whatsNew';

export const DOT_DAYS = 30;
export const MAX_DOTS = 3;
export const DOTS_SEEN_KEY = 'forgeai.adminNews.dotsSeen.v1';

const DAY_MS = 86_400_000;

export interface NewFeature {
  /** `<entry id>|<path>`: what "seen" remembers. */
  key: string;
  id: string;
  path: string;
}

/** 00:00 India time on the entry's day, in ms; null for a bad id. PURE. */
export function liveFrom(id: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  const t = Date.parse(`${id}T00:00:00+05:30`);
  return Number.isFinite(t) ? t : null;
}

/** A route path without its query or a trailing slash: `/settings/mettleup`. PURE. */
export function cleanPath(path: string): string {
  const p = (path.split('?')[0] ?? '').replace(/\/+$/, '');
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * The features that may carry dots at `now`: lines marked `feature` with a `go` path, live (from their day,
 * for DOT_DAYS days), newest first, at most `max`. Fixes (no `feature`) never count. PURE.
 */
export function dotFeatures(now: number, log: readonly AdminNewsEntry[] = ADMIN_NEWS, max = MAX_DOTS): NewFeature[] {
  const out: NewFeature[] = [];
  const sorted = [...log].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  for (const entry of sorted) {
    const from = liveFrom(entry.id);
    if (from === null || now < from || now >= from + DOT_DAYS * DAY_MS) continue;
    for (const line of entry.lines) {
      if (line.feature !== true || !line.go) continue;
      const path = cleanPath(line.go.path);
      out.push({ key: `${entry.id}|${path}`, id: entry.id, path });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** The features still to light: those not seen on this device. PURE. */
export function unseen(features: readonly NewFeature[], seen: ReadonlySet<string>): NewFeature[] {
  return features.filter((f) => !seen.has(f.key));
}

/** The features whose destination is this page. PURE. */
export function featuresAt(features: readonly NewFeature[], routePath: string): NewFeature[] {
  const here = cleanPath(routePath);
  return features.filter((f) => f.path === here);
}

/**
 * Which of a list of links leads to `dest`: the longest path that `dest` is, or starts with
 * (`/settings/mettleup` -> `/settings`; `/settings/branding` -> `/settings/branding` when that is in the
 * list). `/` only matches itself. Null when none does. PURE.
 */
export function linkFor(paths: readonly string[], dest: string): string | null {
  const d = cleanPath(dest);
  let best: string | null = null;
  for (const raw of paths) {
    const p = cleanPath(raw);
    const hit = p === '/' ? d === '/' : d === p || d.startsWith(`${p}/`);
    if (hit && (best === null || p.length > best.length)) best = p;
  }
  return best;
}

/** Does the link `item`, among its sibling links (a menu, the More list), lead to a lit feature? PURE. */
export function linkLit(features: readonly NewFeature[], siblings: readonly string[], item: string): boolean {
  const it = cleanPath(item);
  return features.some((f) => linkFor(siblings, f.path) === it);
}

/**
 * The phone's bottom bar: a feature behind one of its own items lights that item; anything else is
 * reached through More. `barPaths` are the bar's items, `/more` among them. PURE.
 */
export function barLit(features: readonly NewFeature[], barPaths: readonly string[], item: string): boolean {
  const own = barPaths.filter((p) => cleanPath(p) !== '/more');
  const it = cleanPath(item);
  return features.some((f) => (linkFor(own, f.path) ?? '/more') === it);
}

export type SettingsTabId = 'gym' | 'app' | 'data';

/**
 * Where a destination sits on the Settings page: its tab, and whether that tab has a row (a card with a
 * button) that opens it. Pages with their own menu entry (Branding, Gym timings) are not here: the
 * menu leads to them directly.
 */
export const SETTINGS_SPOTS: Readonly<Record<string, { tab: SettingsTabId; row: boolean }>> = {
  '/settings': { tab: 'gym', row: false },
  '/settings/app': { tab: 'app', row: false },
  '/settings/data': { tab: 'data', row: false },
  '/settings/mettleup': { tab: 'gym', row: true },
  '/settings/payments': { tab: 'gym', row: true },
  '/settings/people': { tab: 'data', row: true },
};

/** Settings: does this tab hold a lit feature? PURE. */
export function settingsTabLit(features: readonly NewFeature[], tab: SettingsTabId): boolean {
  return features.some((f) => SETTINGS_SPOTS[f.path]?.tab === tab);
}

/** Settings: does the row that opens `path` lead to a lit feature? PURE. */
export function settingsRowLit(features: readonly NewFeature[], path: string): boolean {
  const p = cleanPath(path);
  return SETTINGS_SPOTS[p]?.row === true && features.some((f) => f.path === p);
}

/** The features seen on this device. Bad or missing storage = none seen. Never throws. */
export function readSeen(store: NewsStore | null): Set<string> {
  if (!store) return new Set();
  try {
    const raw = store.getItem(DOTS_SEEN_KEY);
    if (!raw) return new Set();
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch (e) {
    console.warn('[new dots] could not read what was seen', e);
    return new Set();
  }
}

/** Remember what was seen. Keeps only keys of features still in the list, so it never grows. Never throws. */
export function saveSeen(store: NewsStore | null, seen: ReadonlySet<string>, log: readonly AdminNewsEntry[] = ADMIN_NEWS): void {
  if (!store) return;
  const known = new Set(
    log.flatMap((e) => e.lines.filter((l) => l.feature === true && l.go).map((l) => `${e.id}|${cleanPath(l.go!.path)}`)),
  );
  try {
    store.setItem(DOTS_SEEN_KEY, JSON.stringify([...seen].filter((k) => known.has(k))));
  } catch (e) {
    console.warn('[new dots] could not save what was seen', e);
  }
}

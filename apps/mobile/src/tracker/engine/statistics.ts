/**
 * The Statistics screen's numbers (R3, PLAN §4.1 — Hevy's Statistics). PURE.
 *
 * Sets per muscle GROUP (Hevy's six: chest, back, shoulders, arms, legs, core) over time, the
 * muscle split of this period against the one before, and the period's totals. The counts come
 * from the same rules as everywhere else:
 *   - a working set counts 1 for a muscle it mainly trains and ½ for one it helps (catalog
 *     `setShares`); for a GROUP a set counts its biggest share there, so a lat pulldown (lats
 *     1, upper back ½) is one back set, not one and a half;
 *   - totals are `totalsOf` (engine/reports) over sessions whose volume came from the ONE
 *     volume rule.
 */
import { addDays, tinyDateWithYear, weekStartISO } from '@/lib/date';

import { setShares, type Muscle, type MuscleMap } from '../catalog/muscles';
import { monthName } from '../lib/months';
import { totalsOf, type PeriodTotals, type ReportSession } from './reports';
import { setsText, type VolumeSession } from './volume';

export type StatGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export const STAT_GROUPS: readonly { id: StatGroup; label: string }[] = [
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' },
  { id: 'legs', label: 'Legs' },
  { id: 'core', label: 'Core' },
];

/** Which group each finer muscle counts for (cardio counts for none). */
export const GROUP_OF: Record<Muscle, StatGroup | null> = {
  chest: 'chest',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  lats: 'back',
  upper_back: 'back',
  traps: 'back',
  lower_back: 'back',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'core',
  obliques: 'core',
  glutes: 'legs',
  quads: 'legs',
  hamstrings: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  calves: 'legs',
  cardio: null,
};

export type GroupSets = Partial<Record<StatGroup, number>>;

/** How much one working set counts for each group: its biggest muscle share there. */
export function groupShares(map: MuscleMap): Map<StatGroup, number> {
  const out = new Map<StatGroup, number>();
  for (const [m, share] of setShares(map)) {
    const g = GROUP_OF[m];
    if (g) out.set(g, Math.max(out.get(g) ?? 0, share));
  }
  return out;
}

/** Working sets per group in one session (warm-ups never count). */
export function sessionGroupSets(session: VolumeSession): GroupSets {
  const out: GroupSets = {};
  for (const g of session.exercises) {
    const working = g.sets.filter((s) => !s.isWarmup).length;
    if (working === 0) continue;
    for (const [group, share] of groupShares(g.exercise.muscles)) out[group] = (out[group] ?? 0) + share * working;
  }
  return out;
}

/** A workout as Statistics needs it: the report's facts plus its sets per group. */
export interface StatSession extends ReportSession {
  groups: GroupSets;
}

/** Fractional sets to the nearest half, as everywhere else. */
export const halfRound = (n: number): number => Math.round(n * 2) / 2;

// ---------------------------------------------------------------- ranges

export type StatRange = '30d' | '3m' | '1y' | 'all';
export const STAT_RANGES: readonly { id: StatRange; label: string }[] = [
  { id: '30d', label: '30 days' },
  { id: '3m', label: '3 months' },
  { id: '1y', label: 'Year' },
  { id: 'all', label: 'All time' },
];

const RANGE_DAYS: Record<Exclude<StatRange, 'all'>, number> = { '30d': 30, '3m': 91, '1y': 365 };

/** First day of a range ending today. All time starts at the first workout (or today). */
export function rangeFrom(range: StatRange, today: string, firstWorkoutISO: string | null): string {
  if (range === 'all') return firstWorkoutISO && firstWorkoutISO < today ? firstWorkoutISO : today;
  return addDays(today, -(RANGE_DAYS[range] - 1));
}

/** This period (ending today) and the same length just before it. All time has no "before". */
export function periodPair(range: Exclude<StatRange, 'all'>, today: string): { cur: { from: string; to: string }; prev: { from: string; to: string } } {
  const days = RANGE_DAYS[range];
  const from = addDays(today, -(days - 1));
  return { cur: { from, to: today }, prev: { from: addDays(from, -days), to: addDays(from, -1) } };
}

/**
 * 12 Oct 2026 statistics audit: the period before is only a fair yardstick when the member's
 * log covers ALL of it. A member who started 40 days ago compared 30 days of training with the
 * 10 days they had trained in "the 30 days before" and read "+200%". false = no arrows.
 */
export function fullPeriodBefore(pair: { prev: { from: string } }, firstWorkoutISO: string | null): boolean {
  return firstWorkoutISO != null && firstWorkoutISO <= pair.prev.from;
}

const PERIOD_WORDS: Record<Exclude<StatRange, 'all'>, { cur: string; before: string }> = {
  '30d': { cur: 'Last 30 days', before: 'the 30 days before' },
  '3m': { cur: 'Last 3 months', before: 'the 3 months before' },
  // A rolling 365 days: "Last year" read as 2025 (12 Oct 2026 statistics audit).
  '1y': { cur: 'Last 12 months', before: 'the 12 months before' },
};

/** The line over the tiles, saying what the numbers cover and what the arrows compare with. */
export function comparisonText(range: Exclude<StatRange, 'all'>, comparable: boolean): string {
  const w = PERIOD_WORDS[range];
  return comparable ? `${w.cur}, against ${w.before}` : `${w.cur}. Your log is too new to compare with ${w.before}.`;
}

// ---------------------------------------------------------------- sets per group over time

export type StatGrouping = 'week' | 'month';

/** The bucket a day falls in: its Monday, or the 1st of its month. */
export function bucketOf(dateISO: string, grouping: StatGrouping): string {
  return grouping === 'week' ? weekStartISO(dateISO) : `${dateISO.slice(0, 7)}-01`;
}

/**
 * The first day the sets chart counts: the range's first day moved back to the start of its
 * week or month, so the first bar is a whole week or month like the others (12 Oct 2026 audit:
 * "30 days" by week opened on a bar labelled "Sep 7" that held only Sunday 13 Sep, and "Year"
 * by month on an "Oct '25" holding 13–31 Oct — both read as a slump that never happened).
 */
export function chartFrom(range: StatRange, today: string, firstWorkoutISO: string | null, grouping: StatGrouping): string {
  return bucketOf(rangeFrom(range, today, firstWorkoutISO), grouping);
}

/**
 * The sets chart's headline: the total of every bar and the day it counts from — "412 sets
 * since 7 Sep" — never a bare number with no period.
 */
export function setsSinceText(total: number, from: string, today: string): string {
  return `${setsText(total)} since ${tinyDateWithYear(from, today)}`;
}

/** Every bucket from `from` to `to`, oldest first (empty ones included, so gaps show). */
export function bucketsBetween(from: string, to: string, grouping: StatGrouping): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let b = bucketOf(from, grouping);
  const last = bucketOf(to, grouping);
  while (b <= last && out.length < 1200) {
    out.push(b);
    if (grouping === 'week') b = addDays(b, 7);
    else {
      const y = Number(b.slice(0, 4));
      const m = Number(b.slice(5, 7));
      b = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    }
  }
  return out;
}

/** A bucket's x label: "Oct 6" for a week, "Oct" (or "Oct '25" across years) for a month. */
export function bucketLabel(bucket: string, grouping: StatGrouping, withYear = false): string {
  const month = monthName(bucket.slice(0, 7)).slice(0, 3);
  if (grouping === 'week') return `${month} ${Number(bucket.slice(8, 10))}`;
  return withYear ? `${month} '${bucket.slice(2, 4)}` : month;
}

/** Sets of the picked groups in each bucket of the range, oldest first. */
export function setsSeries(
  sessions: readonly StatSession[],
  from: string,
  to: string,
  grouping: StatGrouping,
  picked: readonly StatGroup[],
): { bucket: string; sets: number }[] {
  const sums = new Map<string, number>(bucketsBetween(from, to, grouping).map((b) => [b, 0]));
  for (const s of sessions) {
    if (s.dateISO < from || s.dateISO > to) continue;
    const b = bucketOf(s.dateISO, grouping);
    if (!sums.has(b)) continue;
    let n = 0;
    for (const g of picked) n += s.groups[g] ?? 0;
    sums.set(b, (sums.get(b) ?? 0) + n);
  }
  return [...sums.entries()].map(([bucket, sets]) => ({ bucket, sets: halfRound(sets) }));
}

/** Sets per group between two days (inclusive), to the nearest half. */
export function groupTotals(sessions: readonly StatSession[], from: string, to: string): Record<StatGroup, number> {
  const out = { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0 } as Record<StatGroup, number>;
  for (const s of sessions) {
    if (s.dateISO < from || s.dateISO > to) continue;
    for (const g of STAT_GROUPS) out[g.id] += s.groups[g.id] ?? 0;
  }
  for (const g of STAT_GROUPS) out[g.id] = halfRound(out[g.id]);
  return out;
}

/** Each group's sets this period and the one before, in the fixed group order. */
export function distribution(
  sessions: readonly StatSession[],
  pair: { cur: { from: string; to: string }; prev: { from: string; to: string } },
): { group: StatGroup; label: string; cur: number; prev: number }[] {
  const cur = groupTotals(sessions, pair.cur.from, pair.cur.to);
  const prev = groupTotals(sessions, pair.prev.from, pair.prev.to);
  return STAT_GROUPS.map((g) => ({ group: g.id, label: g.label, cur: cur[g.id], prev: prev[g.id] }));
}

/** Workouts, time, volume and sets between two days (inclusive): `totalsOf`, nothing new. */
export function totalsBetween(sessions: readonly StatSession[], from: string, to: string): PeriodTotals {
  return totalsOf(sessions.filter((s) => s.dateISO >= from && s.dateISO <= to));
}

/** "Down 3" / "Up 12%" style change words are in reports.changeText; this is the arrow-free delta. */
export function deltaOf(cur: number, prev: number): number {
  return Math.round((cur - prev) * 10) / 10;
}

// ---------------------------------------------------------------- main exercises

/** "24 times", "1 time". */
export function timesText(n: number): string {
  return `${n} ${n === 1 ? 'time' : 'times'}`;
}

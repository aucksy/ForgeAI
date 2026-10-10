/**
 * Headline numbers — Phase 3 "one truth per number" (audit HI-06, PG-10, PG-11, PG-13, SH-05).
 * PURE. Every screen that shows one of these totals reads it through here, so Home, Progress,
 * History, the month report, the year review and the finish screen can never disagree.
 *
 *  - Records (owner decision D10 = A): a TOTAL counts the LIFTS that beat a best in the
 *    period ("4 lifts beat their best this week"), not every kind of record they set — each
 *    kind still shows on the lift itself. The events come from the one record rule
 *    (`engine/records`), where a member's very first sets of an exercise are never news.
 *  - Body-weight change: first and last weigh-in inside a window, always said with its span
 *    ("+1.2 kg in 30 days"), coloured by the member's goal.
 */
import { tinyDate } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import type { Goal, UnitSystem } from '@/types/models';

// ---------------------------------------------------------------- records (D10)

/** Distinct lifts with at least one record event between two days (inclusive; open when omitted). */
export function liftsBeatingBest(events: readonly { exerciseId: string; dateISO: string }[], from?: string, to?: string): number {
  const ids = new Set<string>();
  for (const e of events) {
    if (from != null && e.dateISO < from) continue;
    if (to != null && e.dateISO > to) continue;
    ids.add(e.exerciseId);
  }
  return ids.size;
}

/** "4 lifts beat their best this week" / "1 lift beat its best this month". */
export function liftsUpText(n: number, when?: string): string {
  const base = n === 1 ? '1 lift beat its best' : `${n} lifts beat their best`;
  return when ? `${base} ${when}` : base;
}

/** The tile form: "4 lifts up" / "1 lift up". */
export function liftsUpShort(n: number): string {
  return n === 1 ? '1 lift up' : `${n} lifts up`;
}

// ---------------------------------------------------------------- body weight

export interface WeightChange {
  /** Last minus first weigh-in, kg, to 0.1. */
  changeKg: number;
  fromISO: string;
  toISO: string;
  /** Days between the two weigh-ins. */
  days: number;
  /** The two weigh-ins compared (kg) — a day with two weigh-ins counts the one used here. */
  fromKg: number;
  toKg: number;
}

const dayNum = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * The change between the first and last weigh-in inside [from, to] (open bounds when
 * omitted). null with fewer than two weigh-ins on different days.
 */
export function weightChange(points: readonly { dateISO: string; weightKg: number }[], from?: string, to?: string): WeightChange | null {
  const inside = points
    .filter((p) => (from == null || p.dateISO >= from) && (to == null || p.dateISO <= to) && Number.isFinite(p.weightKg))
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  if (inside.length < 2) return null;
  const a = inside[0];
  const b = inside[inside.length - 1];
  if (a.dateISO === b.dateISO) return null;
  return { changeKg: Math.round((b.weightKg - a.weightKg) * 10) / 10, fromISO: a.dateISO, toISO: b.dateISO, days: Math.round(dayNum(b.dateISO) - dayNum(a.dateISO)), fromKg: a.weightKg, toKg: b.weightKg };
}

/** Spans longer than this read "since 13 Jul 2025" instead of a count of days. */
const DAYS_IN_WORDS = 120;

/** The change in the member's unit, to 0.1 (what the pill shows). */
export function weightChangeShown(c: Pick<WeightChange, 'changeKg'>, units: UnitSystem): number {
  return Math.round(kgToShown(c.changeKg, units) * 10) / 10;
}

/** "in 30 days" / "since 13 Jul 2025". */
export function weightSpanText(c: Pick<WeightChange, 'fromISO' | 'days'>): string {
  if (c.days > DAYS_IN_WORDS) return `since ${tinyDate(c.fromISO)} ${c.fromISO.slice(0, 4)}`;
  return `in ${c.days} ${c.days === 1 ? 'day' : 'days'}`;
}

/** "+1.2 kg in 30 days", "−0.5 lb in 1 day", "No change in 30 days". */
export function weightChangeText(c: Pick<WeightChange, 'changeKg' | 'fromISO' | 'toISO' | 'days'>, units: UnitSystem): string {
  const v = weightChangeShown(c, units);
  const span = weightSpanText(c);
  if (v === 0) return `No change ${span}`;
  return `${v > 0 ? '+' : '−'}${trimNum(Math.abs(v))} ${weightUnitOf(units)} ${span}`;
}

export type ChangeTone = 'good' | 'bad' | 'neutral';

/**
 * Whether a body-weight change is good news, by the member's goal: losing fat → down is
 * good; building muscle → up is good; strength or general → neither (PG-10).
 */
export function weightChangeTone(changeKg: number, goal: Goal | null | undefined): ChangeTone {
  if (!(Math.abs(changeKg) >= 0.05)) return 'neutral';
  if (goal === 'fat_loss') return changeKg < 0 ? 'good' : 'bad';
  if (goal === 'muscle') return changeKg > 0 ? 'good' : 'bad';
  return 'neutral';
}

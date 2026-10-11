/**
 * The Calendar page's maths (R3, PLAN §4.4 — Hevy's Calendar). PURE.
 * Months are 'YYYY-MM', days 'YYYY-MM-DD'; weeks start on Monday, as everywhere in the app.
 */
import { daysInMonth, firstWeekday, shiftMonth } from './months';

/** Every month from this one back to the first workout's, newest first (just this month when none). */
export function calendarMonths(firstISO: string | null, today: string): string[] {
  const last = today.slice(0, 7);
  const first = firstISO && firstISO.slice(0, 7) < last ? firstISO.slice(0, 7) : last;
  const out: string[] = [];
  for (let m = last; m >= first && out.length < 1200; m = shiftMonth(m, -1)) out.push(m);
  return out;
}

/** The years the Year view can show, newest first. */
export function calendarYears(firstISO: string | null, today: string): number[] {
  const last = Number(today.slice(0, 4));
  const first = firstISO ? Math.min(last, Number(firstISO.slice(0, 4))) : last;
  const out: number[] = [];
  for (let y = last; y >= first; y--) out.push(y);
  return out;
}

/** A month's weeks, Monday first: day numbers, null for the padding. */
export function monthWeeks(ym: string): (number | null)[][] {
  const cells: (number | null)[] = [...Array.from({ length: firstWeekday(ym) }, () => null), ...Array.from({ length: daysInMonth(ym) }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 'YYYY-MM' + a day number → 'YYYY-MM-DD'. */
export function dayISO(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, '0')}`;
}

/** Workouts in one month, from the per-day counts. */
export function monthTotal(days: Readonly<Record<string, number>>, ym: string): number {
  let n = 0;
  for (const [d, c] of Object.entries(days)) if (d.startsWith(`${ym}-`)) n += c;
  return n;
}

/** Workouts in one year, from the per-day counts. */
export function yearTotal(days: Readonly<Record<string, number>>, year: number): number {
  let n = 0;
  for (const [d, c] of Object.entries(days)) if (d.startsWith(`${year}-`)) n += c;
  return n;
}

/** What tapping a day does: nothing (no workout), open the one workout, or list them. */
export function dayTap(count: number): 'none' | 'open' | 'list' {
  if (!(count > 0)) return 'none';
  return count === 1 ? 'open' : 'list';
}

/** "12 workouts" / "1 workout" / "No workouts". */
export function workoutsLine(n: number): string {
  if (n <= 0) return 'No workouts';
  return `${n} ${n === 1 ? 'workout' : 'workouts'}`;
}

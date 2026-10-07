/** Calendar months and years for the reports (Phase 3). PURE. Months are 'YYYY-MM'. */
import { daysBetween, fromISO, toISO } from '@/lib/date';

/** How far apart two days are, for two photos: "Same day", "1 day apart", "6 weeks apart". */
export function apartText(a: string, b: string): string {
  const d = Math.abs(daysBetween(a, b));
  if (d === 0) return 'Same day';
  if (d === 1) return '1 day apart';
  if (d % 7 === 0) return `${d / 7} ${d === 7 ? 'week' : 'weeks'} apart`;
  return `${d} days apart`;
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const YM = /^(\d{4})-(\d{2})$/;

export function isMonthKey(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = YM.exec(v);
  return m != null && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** 'YYYY-MM' of a day. */
export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** "September 2026". */
export function monthTitle(ym: string): string {
  const m = YM.exec(ym);
  if (!m) return ym;
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

/** "September". */
export function monthName(ym: string): string {
  const m = YM.exec(ym);
  return m ? MONTH_NAMES[Number(m[2]) - 1] : ym;
}

/** The month `delta` months away. */
export function shiftMonth(ym: string, delta: number): string {
  const m = YM.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
  return toISO(d).slice(0, 7);
}

/** First and last day of a month. */
export function monthDays(ym: string): { from: string; to: string } {
  const m = YM.exec(ym);
  if (!m) return { from: `${ym}-01`, to: `${ym}-31` };
  const last = new Date(Number(m[1]), Number(m[2]), 0);
  return { from: `${ym}-01`, to: toISO(last) };
}

/** Number of days in a month. */
export function daysInMonth(ym: string): number {
  return Number(monthDays(ym).to.slice(8, 10));
}

/** Weekday of the 1st, Monday = 0 (weeks start on Monday, like History). */
export function firstWeekday(ym: string): number {
  return (fromISO(`${ym}-01`).getDay() + 6) % 7;
}

/** First and last day of a year. */
export function yearDays(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

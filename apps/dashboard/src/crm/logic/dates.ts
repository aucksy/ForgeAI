/**
 * Calendar days — `'YYYY-MM-DD'`, matching the mobile app's `dateISO` convention.
 *
 * Every function here is pure arithmetic over the Y/M/D triple via `Date.UTC`.
 * We deliberately never build a `Date` from a local-time string: `new Date('2026-07-26')`
 * is parsed as UTC midnight and then *displayed* in local time, so in IST it reads
 * back as 26 Jul 05:30 and any `.getDate()` on a machine west of UTC returns the
 * 25th. The mobile app shipped a bug of exactly that shape (W4/H1: saving an
 * imported evening workout moved it a day). A membership expiry is a legal-ish
 * fact about a gym's money — it must not depend on where the browser is.
 */

/** A local calendar day, `'YYYY-MM-DD'`. */
export type DateISO = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a well-formed `'YYYY-MM-DD'` that is a real calendar day. */
export function isValidDateISO(value: unknown): value is DateISO {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Days in a (1-based) month, leap-year aware. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today as a local calendar day. Pass `now` to make a caller deterministic. */
export function todayISO(now: Date = new Date()): DateISO {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * The local calendar day an epoch-ms timestamp falls on.
 *
 * Use this instead of `new Date(ms).toISOString().slice(0, 10)`, which converts to
 * UTC: a gym created at 02:00 IST would render as the previous day for every user
 * in India. The same trap `todayISO` avoids.
 */
export function dateISOFromEpoch(ms: number): DateISO {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * The LOCAL wall-clock hour (0–23) an epoch-ms timestamp falls in, or null when the
 * timestamp is not a real instant.
 *
 * Local, not UTC, for the same reason `dateISOFromEpoch` is: a 6am check-in at a
 * Jaipur gym is 00:30 UTC, so a peak-hour report built on `getUTCHours` would tell
 * the owner their gym is busiest in the middle of the night.
 */
export function hourOfEpoch(ms: number): number | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

/** Build a `DateISO` from parts, zero-padded. */
export function toISO(year: number, month: number, day: number): DateISO {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Split a valid `DateISO` into parts. Throws on malformed input — callers validate first. */
export function partsOf(date: DateISO): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Add (or subtract, when negative) whole days. */
export function addDays(date: DateISO, days: number): DateISO {
  const { year, month, day } = partsOf(date);
  const t = Date.UTC(year, month - 1, day) + Math.trunc(days) * 86_400_000;
  const d = new Date(t);
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Add whole calendar months, clamping to the end of the target month.
 * 31 Jan + 1 month = 28 Feb (29 in a leap year) — the convention every gym uses
 * verbally ("one month from today") and the only one that can't overflow into
 * the month after next.
 */
export function addMonths(date: DateISO, months: number): DateISO {
  const { year, month, day } = partsOf(date);
  const zeroBased = year * 12 + (month - 1) + Math.trunc(months);
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  return toISO(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function diffDays(from: DateISO, to: DateISO): number {
  const a = partsOf(from);
  const b = partsOf(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/** Earlier of two days. */
export function minDate(a: DateISO, b: DateISO): DateISO {
  return a <= b ? a : b;
}

/** Later of two days. */
export function maxDate(a: DateISO, b: DateISO): DateISO {
  return a >= b ? a : b;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** `26 Jul 2026` — unambiguous, unlike 07/26 vs 26/07. */
export function formatDay(date: DateISO): string {
  if (!isValidDateISO(date)) return '—';
  const { year, month, day } = partsOf(date);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** `26 Jul` — for dense tables where the year is obvious from context. */
export function formatDayShort(date: DateISO): string {
  if (!isValidDateISO(date)) return '—';
  const { month, day } = partsOf(date);
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

/**
 * Human gap relative to `today`, written from the reader's point of view:
 * past days read "3 days ago", future days read "in 3 days".
 */
export function relativeDay(date: DateISO, today: DateISO): string {
  const d = diffDays(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d < 0) return `${describeSpan(-d)} ago`;
  return `in ${describeSpan(d)}`;
}

function describeSpan(days: number): string {
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  // Switch to years at 11 months rather than 12, so the scale never reads
  // "12 months" one day and "1 year" the next for what is the same span.
  if (days < 335) return `${Math.round(days / 30)} months`;
  const years = days / 365;
  return years < 1.5 ? '1 year' : `${Math.round(years)} years`;
}

/** Month key `'YYYY-MM'` — the bucket every revenue report groups by. */
export function monthKey(date: DateISO): string {
  return date.slice(0, 7);
}

/** First day of the month containing `date`. */
export function startOfMonth(date: DateISO): DateISO {
  const { year, month } = partsOf(date);
  return toISO(year, month, 1);
}

/** Last day of the month containing `date`. */
export function endOfMonth(date: DateISO): DateISO {
  const { year, month } = partsOf(date);
  return toISO(year, month, daysInMonth(year, month));
}

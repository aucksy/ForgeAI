/** Local-calendar date helpers. All "days" are the device's local days. */

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function daysBetween(aISO: string, bISO: string): number {
  const ms = fromISO(bISO).getTime() - fromISO(aISO).getTime();
  return Math.round(ms / 86400000);
}

/** Monday of the week containing `iso` (weeks start Monday). */
export function weekStartISO(iso: string): string {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

export function isSameWeek(aISO: string, bISO: string): boolean {
  return weekStartISO(aISO) === weekStartISO(bISO);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayName(iso: string): string {
  return DAY_NAMES[fromISO(iso).getDay()];
}

/** "Mon, 12 Jun" */
export function shortDate(iso: string): string {
  const d = fromISO(iso);
  return `${DAY_NAMES[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "12 Jun" */
export function tinyDate(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * HI-15: "Fri, 9 Oct" this year, "Fri, 9 Oct 2025" otherwise — the year whenever it isn't
 * this year, so an old workout is never ambiguous. `today` is for tests.
 */
export function dateWithYear(iso: string, today: string = todayISO()): string {
  const base = shortDate(iso);
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

/** "October 2026" — a month heading. `ym` is "2026-10". */
export function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * "Today", "Yesterday", "3 days ago", else the date (with its year when not this year).
 * HI-20: a day AFTER today (a flight west, a corrected clock) never reads "-1 days ago":
 * the day after is "Tomorrow", anything later is its date.
 */
export function relativeDay(iso: string, today: string = todayISO()): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return dateWithYear(iso, today);
}

/** "18:05" — a clock time on the phone's own clock. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The editor's Minutes and Start fields (HI-18, start-time editing) — what a typed value means,
 * and what to say when it can't be used. PURE: the screen shows the message, the store only
 * ever receives a value that passed.
 *
 *  - Minutes: blank = unchanged (no message); 0 = "at least 1 minute"; above 600 = "up to 600
 *    minutes (10 hours)". Never a silent clamp: what is on screen is what is saved.
 *  - Start: a real clock time (0:00–23:59) that has already happened on the workout's day.
 */
import { fromISO } from '@/lib/date';

export const MAX_MINUTES = 600;

export interface MinutesCheck {
  /** The minutes to save, or null (blank → leave as it was; an error → say why). */
  minutes: number | null;
  /** What to tell the member, or null. */
  error: string | null;
}

export function checkMinutes(text: string): MinutesCheck {
  const clean = text.replace(/[^0-9]/g, '');
  if (clean === '') return { minutes: null, error: null };
  const n = parseInt(clean, 10);
  if (!Number.isFinite(n) || n < 1) return { minutes: null, error: 'A workout lasts at least 1 minute.' };
  if (n > MAX_MINUTES) return { minutes: null, error: `Up to ${MAX_MINUTES} minutes (10 hours).` };
  return { minutes: n, error: null };
}

/**
 * Why `hour:minute` on `dateISO` can't be the start, or null when it can. With `minutes` (the
 * workout's length), a workout that would END after now is refused too — said plainly, never
 * slid back to fit at Save.
 */
export function checkStartTime(dateISO: string, hour: number, minute: number, now: number, minutes?: number | null): string | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return 'Use a time from 00:00 to 23:59.';
  }
  const d = fromISO(dateISO);
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime();
  if (at > now) return "That time hasn't come yet.";
  if (minutes != null && minutes > 0 && at + minutes * 60_000 > now) {
    return `With ${minutes} minute${minutes === 1 ? '' : 's'} it would end after now. Start earlier or make it shorter.`;
  }
  return null;
}

/** "18" + "5" → { hour: 18, minute: 5 }; null when either box is blank or not a number. PURE. */
export function parseClock(hourText: string, minuteText: string): { hour: number; minute: number } | null {
  const h = hourText.replace(/[^0-9]/g, '');
  const m = minuteText.replace(/[^0-9]/g, '');
  if (h === '' || m === '') return null;
  return { hour: parseInt(h, 10), minute: parseInt(m, 10) };
}

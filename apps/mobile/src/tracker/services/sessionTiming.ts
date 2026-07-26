/**
 * Moving a saved workout to another day — PURE (Phase W4).
 *
 * `date_iso` and `started_at` must keep agreeing: the streak walk, the consistency
 * heatmap and the weekly-volume buckets read the day string, while history ordering
 * and PR detection read the timestamp. Shifting one without the other silently
 * reorders a member's training.
 *
 * The shift is measured from the session's STORED `date_iso`, never from the local
 * calendar day of its `started_at`. Those two legitimately disagree: the Hevy import
 * derives both from UTC (`Date.UTC` + UTC getters, so a re-import stays idempotent
 * across timezones), so on an IST device any evening session's local day is one
 * ahead of its stored day. Measuring from the timestamp would make a save that
 * changed nothing move the workout a full day — for most of an imported history.
 */
import { fromISO } from '@/lib/date';

export interface EditedTiming {
  dateISO: string;
  startedAt: number;
  endedAt: number | null;
}

/** Whole-day offset between two local calendar days, in ms. */
export function dayDeltaMs(fromDateISO: string, toDateISO: string): number {
  return fromISO(toDateISO).getTime() - fromISO(fromDateISO).getTime();
}

/**
 * Timing for a saved session moved from `originalDateISO` to `dateISO`. The clock
 * travels with the date, so the time of day and the duration the member actually
 * trained are preserved.
 *
 * `now` clamps the result: a workout moved onto today must not land in the future,
 * because PR detection only compares against sessions that started EARLIER — a
 * future timestamp would hide the session from its own history and hand out a
 * "personal record" for a lighter lift.
 */
export function computeEditedTiming(input: {
  originalDateISO: string;
  dateISO: string;
  startedAt: number;
  endedAt: number | null;
  now: number;
}): EditedTiming {
  const { originalDateISO, dateISO, startedAt, endedAt, now } = input;
  const requested = dayDeltaMs(originalDateISO, dateISO);
  const overshoot = startedAt + requested - now;
  const shift = overshoot > 0 ? requested - overshoot : requested;

  const nextStart = startedAt + shift;
  const nextEnd = endedAt == null ? null : Math.max(nextStart, Math.min(endedAt + shift, now));
  return { dateISO, startedAt: nextStart, endedAt: nextEnd };
}

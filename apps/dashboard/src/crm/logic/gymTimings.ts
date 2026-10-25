/**
 * Gym timings in the admin app (R-124, 25 Oct 2026). PURE helpers for the editor: changing a day,
 * copying Monday to the other weekdays, special days, the payload Save sends, reading the server's
 * answer and plain words for its refusals. The rules themselves (what may be saved, the words for
 * each problem, India-time "open now") are shared with the member app: packages/theme/src/gymHours.ts.
 * Server: supabase/migrations/0036_gym_timings.sql (owner_gym_timings, owner_save_gym_timings).
 */

import {
  DAY_KEYS,
  hoursFrom,
  hoursProblem,
  sortRanges,
  type DayHours,
  type DayKey,
  type DayKind,
  type GymHours,
  type SpecialDay,
  type TimeRange,
} from '@forgeai/theme';

/** What a new "Times" day starts with: the usual morning and evening (research §3). */
export const MORNING: TimeRange = { open: '05:00', close: '11:00' };
export const EVENING: TimeRange = { open: '16:00', close: '22:00' };

/** The days "Copy Monday" fills: Tuesday to Saturday (Sunday is often different in India). */
export const COPY_MONDAY_TO: readonly DayKey[] = ['tue', 'wed', 'thu', 'fri', 'sat'];

const copyDay = (d: DayHours): DayHours => ({ kind: d.kind, ranges: d.ranges.map((r) => ({ ...r })) });

/** A day switched to Closed / Times / Open 24 hours. Times keeps the day's times, or starts with morning and evening. PURE. */
export function withKind<T extends DayHours>(d: T, kind: DayKind): T {
  if (kind !== 'hours') return { ...d, kind, ranges: [] };
  return { ...d, kind, ranges: d.ranges.length > 0 ? d.ranges : [{ ...MORNING }, { ...EVENING }] };
}

/** One day of the week changed. PURE. */
export function withDay(h: GymHours, key: DayKey, day: DayHours): GymHours {
  return { ...h, week: { ...h.week, [key]: day } };
}

/** Monday's hours on Tuesday to Saturday too. PURE. */
export function copyMonday(h: GymHours): GymHours {
  const week = { ...h.week };
  for (const k of COPY_MONDAY_TO) week[k] = copyDay(h.week.mon);
  return { ...h, week };
}

/** One time of a day changed ('open' or 'close' of range i). PURE. */
export function withTime<T extends DayHours>(d: T, i: number, field: keyof TimeRange, value: string): T {
  return { ...d, ranges: d.ranges.map((r, j) => (j === i ? { ...r, [field]: value } : r)) };
}

/** A second (evening) time added: it starts where the first ends, or the usual evening. PURE. */
export function withSecondTime<T extends DayHours>(d: T): T {
  if (d.ranges.length >= 2) return d;
  const first = d.ranges[0];
  const evening = first && first.close >= EVENING.open ? { open: '18:00', close: '22:00' } : { ...EVENING };
  return { ...d, kind: 'hours', ranges: [...d.ranges, evening] };
}

/** The second time taken away. PURE. */
export function withoutTime<T extends DayHours>(d: T, i: number): T {
  return { ...d, ranges: d.ranges.filter((_, j) => j !== i) };
}

/** A new special day: tomorrow, closed, no note (the owner picks the date). PURE. */
export function newSpecial(tomorrowISO: string): SpecialDay {
  return { date: tomorrowISO, kind: 'closed', ranges: [], note: null };
}

/**
 * What Save sends: notes trimmed, times earliest first, special days already over left out; or the
 * plain-words problem (the server refuses the same things). `todayISO`: today in India. PURE.
 */
export function timingsPayload(h: GymHours, todayISO: string): { payload: GymHours | null; problem: string | null } {
  const tidy = (d: DayHours): DayHours => ({ kind: d.kind, ranges: d.kind === 'hours' ? sortRanges(d.ranges) : [] });
  const week = {} as Record<DayKey, DayHours>;
  for (const k of DAY_KEYS) week[k] = tidy(h.week[k]);
  const special = h.special
    .filter((s) => !s.date || s.date >= todayISO)
    .map((s) => ({ date: s.date, ...tidy(s), note: s.note?.trim() || null }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const clean: GymHours = { week, special, note: h.note?.trim() || null };
  const problem = hoursProblem(clean, todayISO);
  return problem ? { payload: null, problem } : { payload: clean, problem: null };
}

export interface TimingsAnswer {
  hours: GymHours | null;
  updatedAt: number | null;
  updatedByName: string | null;
  /** The owner (or an old owner key): may change them. The front desk: may only read. */
  canEdit: boolean;
}

/** owner_gym_timings' / owner_save_gym_timings' answer, checked. PURE. */
export function timingsFromAnswer(raw: unknown): TimingsAnswer {
  const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return { hours: null, updatedAt: null, updatedByName: null, canEdit: false };
  return {
    hours: r.hours == null ? null : hoursFrom(r.hours),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
    updatedByName: typeof r.updatedByName === 'string' && r.updatedByName.trim() ? r.updatedByName.trim() : null,
    canEdit: r.canEdit === true,
  };
}

/** Did the owner change anything since the last save? PURE. */
export function timingsChanged(draft: GymHours, saved: GymHours | null, todayISO: string): boolean {
  if (!saved) return true;
  const a = timingsPayload(draft, todayISO).payload ?? draft;
  const b = timingsPayload(saved, todayISO).payload ?? saved;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** Plain words for a refused save, or null when it is not one of these codes. PURE. */
export function timingsErrorWords(err: unknown): string | null {
  const t = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the owner can change the gym timings.';
  if (/\bINVALID\b/.test(t)) return 'Your gym’s server could not take these timings. Check each time and try again.';
  return null;
}

/** What Save says: where members see it and how soon (the app asks at most every 10 minutes). */
export const TIMINGS_SAVED = 'Gym timings saved. Members see them in the MettleUp app (Gym tab) within 10 minutes.';
export const MEMBERS_SEE_TIMINGS = 'Members see these on the Gym tab of the MettleUp app: “Open now · closes 10:00 pm”, and the whole week. Times are India time.';

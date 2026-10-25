/**
 * The gym's opening hours in the member app (R-124, 25 Oct 2026). The PURE half: reading the gym's
 * answer (member_gym_timings, supabase/migrations/0036_gym_timings.sql) and the copy kept on the
 * phone, and the Gym tab row's words. The rules and the "open now" sums are shared with the admin
 * app: packages/theme/src/gymHours.ts. gymTimingsSync.ts does the asking and the keeping.
 *
 *  - Before 0036 is on the server, or while the gym has set no hours, nothing shows (no empty card).
 *  - Hours that can't be read show nothing: no hours beats wrong hours.
 */
import { hoursFrom, indiaNow, openStatus, specialWords, upcomingSpecial, dayLines, hoursOn, type GymHours, type OpenStatus } from '@forgeai/theme';

export interface GymHoursCopy {
  gymId: string;
  gymName: string;
  /** null: the gym has set no hours (the row stays hidden). */
  hours: GymHours | null;
  /** When the phone got it (ms). */
  at: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** member_gym_timings' answer, checked; null when it is not one. PURE. */
export function gymHoursFromRow(raw: unknown): { gymId: string; gymName: string; hours: GymHours | null } | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true || !str(r.gymId)) return null;
  return { gymId: str(r.gymId), gymName: str(r.gymName) || 'Your gym', hours: r.hours == null ? null : hoursFrom(r.hours) };
}

/** The kept copy read back, or null. PURE. */
export function parseGymHoursCopy(raw: string | null): GymHoursCopy | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v) || !str(v.gymId)) return null;
    return { gymId: str(v.gymId), gymName: str(v.gymName) || 'Your gym', hours: v.hours == null ? null : hoursFrom(v.hours), at: typeof v.at === 'number' ? v.at : 0 };
  } catch {
    return null;
  }
}

/** Days ahead a special day shows on the Gym tab by itself (members' main complaint: no holiday notice). */
export const SPECIAL_NOTICE_DAYS = 7;

export interface GymHoursRowWords {
  status: OpenStatus;
  /** The line under it: a special day coming up, today's special note, or today's hours. */
  sub: string;
}

/** The Gym tab row: "Open now · closes 10:00 pm", and under it what matters next. PURE. */
export function gymHoursRowWords(h: GymHours, nowMs: number): GymHoursRowWords {
  const status = openStatus(h, nowMs);
  const today = indiaNow(nowMs).dateISO;
  const soon = upcomingSpecial(h, nowMs, SPECIAL_NOTICE_DAYS);
  if (soon.length > 0) return { status, sub: specialWords(soon[0]!, today) };
  const { day } = hoursOn(h, today);
  return { status, sub: day.kind === 'hours' ? `Today ${dayLines(day).join(', ')}` : h.note ?? 'Tap for the week' };
}

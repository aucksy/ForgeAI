/**
 * How busy the gym is right now (R-163; OWNER-INBOX #58 item 2). The PURE half: reading the gym's
 * answer (member_gym_busy, supabase/migrations/0039_gym_busy.sql) and the Gym tab card's words and
 * sums. gymBusySync.ts does the asking; GymBusyCard.tsx draws it.
 *
 *  - The server sends only gym-level levels: "quiet / normal / busy / closed" now, a rounded count
 *    (only when 5 or more), and per weekday and hour a usual level 0..4 (null = closed that hour).
 *    No names, no member ids, no times of anyone's visit.
 *  - While the gym has too few timed check-ins (`learning`), or before 0039 is on the server,
 *    nothing shows: no card beats a guess.
 *  - The gym's own hours (0036, kept on the phone) win for "now": special days (Diwali) included.
 */
import { hoursOn, indiaNow, openStatus, type DayKey, type GymHours } from '@forgeai/theme';

export type BusyLevel = 'quiet' | 'normal' | 'busy' | 'closed';

/** Per hour 0..23: 0 (almost nobody) to 4 (the busiest hour of the week), null = closed. */
export type BusyDay = readonly (number | null)[];

export interface GymBusy {
  gymId: string;
  level: BusyLevel;
  /** People checked in during the last 90 minutes, rounded to 5; null under 5. */
  about: number | null;
  /** Weeks the usual levels come from (1..8). */
  weeks: number;
  week: Record<DayKey, BusyDay>;
}

export const DAY_KEYS: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT: Record<DayKey, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const LEVELS: readonly BusyLevel[] = ['quiet', 'normal', 'busy', 'closed'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function dayFrom(raw: unknown): BusyDay | null {
  if (!Array.isArray(raw) || raw.length !== 24) return null;
  const out: (number | null)[] = [];
  for (const v of raw) {
    if (v === null) out.push(null);
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4) out.push(v);
    else return null;
  }
  return out;
}

/**
 * member_gym_busy's answer, checked. `learning` (too few check-ins yet) and anything that is not a
 * full answer read as null: the card stays hidden. PURE.
 */
export function busyFromRow(raw: unknown): GymBusy | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true || r.learning !== false || typeof r.gymId !== 'string' || !r.gymId) return null;
  if (typeof r.level !== 'string' || !LEVELS.includes(r.level as BusyLevel)) return null;
  if (!isObj(r.week)) return null;
  const week = {} as Record<DayKey, BusyDay>;
  for (const k of DAY_KEYS) {
    const d = dayFrom(r.week[k]);
    if (!d) return null;
    week[k] = d;
  }
  const about = typeof r.about === 'number' && Number.isFinite(r.about) && r.about >= 5 ? Math.round(r.about) : null;
  const weeks = typeof r.weeks === 'number' && r.weeks >= 1 ? Math.min(8, Math.round(r.weeks)) : 1;
  return { gymId: r.gymId, level: r.level as BusyLevel, about, weeks, week };
}

/** The level to show now: the gym's own hours say closed (a holiday too) = closed. PURE. */
export function levelNow(b: GymBusy, hours: GymHours | null, nowMs: number): BusyLevel {
  if (hours && openStatus(hours, nowMs).state === 'closed') return 'closed';
  return b.level;
}

/** The card's main line. PURE. */
export function levelLine(level: BusyLevel): string {
  switch (level) {
    case 'quiet':
      return 'Quiet right now';
    case 'busy':
      return 'Busier than usual right now';
    case 'closed':
      return 'Closed right now';
    default:
      return 'About as busy as usual';
  }
}

/** "About 15 people checked in during the last 90 minutes", or null (under 5, or closed). PURE. */
export function aboutLine(b: GymBusy, level: BusyLevel): string | null {
  if (level === 'closed' || b.about == null) return null;
  return `About ${b.about} people checked in during the last 90 minutes`;
}

/** "From check-ins at your gym over the last 8 weeks. No names are shown." PURE. */
export function sourceLine(weeks: number): string {
  return `From check-ins at your gym over the last ${weeks === 1 ? 'week' : `${weeks} weeks`}. No names are shown.`;
}

/** "6 am", "12 pm", "9 pm". PURE. */
export function hourWords(h: number): string {
  const x = ((h % 24) + 24) % 24;
  const twelve = x % 12 === 0 ? 12 : x % 12;
  return `${twelve} ${x < 12 ? 'am' : 'pm'}`;
}

/**
 * The hours worth drawing, the same for every day so the bars line up: from the first to the last
 * hour that is ever busy (level 1 or more) in the week. null when there is nothing to draw. PURE.
 */
export function hourSpan(b: GymBusy): { from: number; to: number } | null {
  let from = 24;
  let to = -1;
  for (const k of DAY_KEYS) {
    b.week[k].forEach((v, h) => {
      if (v != null && v > 0) {
        from = Math.min(from, h);
        to = Math.max(to, h);
      }
    });
  }
  return to < 0 ? null : { from, to };
}

/** India weekday and hour now. PURE. */
export function indiaDayHour(nowMs: number): { day: DayKey; hour: number; dateISO: string } {
  const n = indiaNow(nowMs);
  return { day: n.day, hour: Math.floor(n.minute / 60), dateISO: n.dateISO };
}

/**
 * The quietest stretch of a day, from `fromHour` on (today: the hour now), inside the drawn span, among
 * hours the gym is open: the longest run of the lowest level. Ties: the earlier run. null when no hour
 * is left. Returns [start, end) hours. PURE.
 */
export function quietestRun(day: BusyDay, span: { from: number; to: number }, fromHour: number): { start: number; end: number } | null {
  const first = Math.max(span.from, fromHour);
  let low = Infinity;
  for (let h = first; h <= span.to; h++) {
    const v = day[h];
    if (v != null && v < low) low = v;
  }
  if (low === Infinity) return null;
  let best: { start: number; end: number } | null = null;
  let start = -1;
  for (let h = first; h <= span.to + 1; h++) {
    const v = h <= span.to ? day[h] : null;
    if (v === low) {
      if (start < 0) start = h;
    } else if (start >= 0) {
      if (!best || h - start > best.end - best.start) best = { start, end: h };
      start = -1;
    }
  }
  return best;
}

/** "Quietest later today: 2 pm to 4 pm" / "Quietest on Tue: 2 pm to 4 pm", or null. PURE. */
export function quietestLine(b: GymBusy, day: DayKey, nowMs: number, hours: GymHours | null): string | null {
  const span = hourSpan(b);
  if (!span) return null;
  const now = indiaDayHour(nowMs);
  const isToday = day === now.day;
  if (isToday && closedAllToday(hours, now.dateISO)) return null;
  // Today: from the next whole hour (the hour now is already under way).
  const run = quietestRun(b.week[day], span, isToday ? now.hour + 1 : 0);
  if (!run) return null;
  const when = `${hourWords(run.start)} to ${hourWords(run.end)}`;
  return isToday ? `Quietest later today: ${when}` : `Quietest on ${DAY_SHORT[day]}: ${when}`;
}

/** Today is a special closed day (a holiday the gym set). PURE. */
export function closedAllToday(hours: GymHours | null, todayISO: string): boolean {
  if (!hours) return false;
  const { day, special } = hoursOn(hours, todayISO);
  return special != null && day.kind === 'closed';
}

/** The day chip's label: "Today" for today, else "Mon". PURE. */
export function dayChipLabel(day: DayKey, today: DayKey): string {
  return day === today ? 'Today' : DAY_SHORT[day];
}

/** The days in chip order, starting with today. PURE. */
export function daysFromToday(today: DayKey): DayKey[] {
  const i = DAY_KEYS.indexOf(today);
  return [...DAY_KEYS.slice(i), ...DAY_KEYS.slice(0, i)];
}

/** What a screen reader says for one hour's bar. PURE. */
export function barSpoken(h: number, v: number | null): string {
  const words = v == null ? 'closed' : (['very quiet', 'quiet', 'a little busy', 'busy', 'busiest'] as const)[v] ?? 'quiet';
  return `${hourWords(h)}: ${words}`;
}

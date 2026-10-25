/**
 * The gym's opening hours (R-124, 25 Oct 2026). ONE pure module shared by the admin app (which edits
 * and checks them) and the member app (which reads them and says "Open now · closes 10:00 pm"), so
 * what the owner saves is exactly what members read. The server's twin is _timings_clean in
 * supabase/migrations/0036_gym_timings.sql: the same rules and limits. Research:
 * docs/research/R-gym-timings.md (Google Business Profile's model, made smaller).
 *
 * The model:
 *  - each day Mon..Sun is Closed, Open 24 hours, or 1-2 time ranges (morning + evening);
 *  - a time is 'HH:MM' (24-hour clock); an end of '00:00' is midnight at the END of the day;
 *  - a range whose end is earlier than its start runs past midnight and ends the next morning, by
 *    6:00 am at the latest (later than that is almost always an am/pm slip: refused in plain words);
 *  - special days: a date that is closed or has its own hours (with a short note, "Diwali"); they
 *    replace that date's weekday hours; at most 30, at most 400 days ahead;
 *  - one optional note for the whole gym ("Ladies batch 11 am to 12 pm").
 * Every clock reading is India time (Asia/Kolkata, UTC+5:30, no summer time), whatever the phone says.
 */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAY_KEYS: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES: Readonly<Record<DayKey, string>> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
export const DAY_SHORT: Readonly<Record<DayKey, string>> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** closed: shut all day. hours: the ranges. allDay: open 24 hours. */
export type DayKind = 'closed' | 'hours' | 'allDay';

export interface TimeRange {
  /** 'HH:MM', 24-hour clock. */
  open: string;
  /** 'HH:MM'; '00:00' = midnight at the end of the day; earlier than `open` = the next morning. */
  close: string;
}

export interface DayHours {
  kind: DayKind;
  /** 1-2 for 'hours', empty otherwise. Earliest first. */
  ranges: TimeRange[];
}

export interface SpecialDay extends DayHours {
  /** 'YYYY-MM-DD' (India). */
  date: string;
  /** "Diwali", or null. */
  note: string | null;
}

export interface GymHours {
  week: Record<DayKey, DayHours>;
  /** Earliest date first. */
  special: SpecialDay[];
  note: string | null;
}

export const HOURS_LIMITS = {
  rangesPerDay: 2,
  specialDays: 30,
  /** Days ahead a special day may be set. */
  specialAhead: 400,
  /** Characters. */
  note: 120,
  specialNote: 40,
  /** A range past midnight ends by this minute of the next day (6:00 am). */
  latestOvernightEnd: 6 * 60,
} as const;

const DAY_MIN = 24 * 60;
const IST_MS = 330 * 60 * 1000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Minutes after midnight for 'HH:MM', or null. PURE. */
export function minutesOf(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = TIME.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A range as minutes from the start of its day: end may pass 1440 (the next morning). Null when unreadable. PURE. */
export function rangeSpan(r: TimeRange): { start: number; end: number; overnight: boolean } | null {
  const start = minutesOf(r.open);
  const close = minutesOf(r.close);
  if (start == null || close == null) return null;
  let end = close === 0 ? DAY_MIN : close;
  const overnight = end <= start;
  if (overnight) end = close + DAY_MIN;
  return { start, end, overnight };
}

// ------------------------------------------------------------------ the rules, in plain words

/** What is wrong with one day's hours, in plain words, or null. `label`: "Monday", "Sun 8 Nov". PURE. */
export function dayProblem(day: DayHours, label: string): string | null {
  if (day.kind !== 'hours') return null;
  if (day.ranges.length === 0) return `${label}: add a time, or choose Closed.`;
  if (day.ranges.length > HOURS_LIMITS.rangesPerDay) return `${label}: at most ${HOURS_LIMITS.rangesPerDay} times a day (morning and evening).`;
  const spans = [];
  for (const r of day.ranges) {
    const s = rangeSpan(r);
    if (!s) return `${label}: pick a start time and an end time.`;
    if (s.start === s.end || (s.overnight && s.end - DAY_MIN === s.start)) return `${label}: the end time must be after the start time.`;
    if (s.overnight && s.end - DAY_MIN > HOURS_LIMITS.latestOvernightEnd) {
      return `${label}: ${timeWords(r.open)} to ${timeWords(r.close)} would end the next day. Check am and pm. A time past midnight must end by 6:00 am; for a gym that never closes, choose "24 hours".`;
    }
    spans.push(s);
  }
  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i += 1) {
    const prev = spans[i - 1]!;
    if (spans[i]!.start < prev.end) return `${label}: the two times overlap. The second must start after the first ends.`;
  }
  return null;
}

/** 'YYYY-MM-DD' plus n days. PURE. */
export function addDaysISO(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function validDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "Sun 8 Nov" for 'YYYY-MM-DD'. PURE. */
export function dateWords(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = DAY_KEYS[(d.getUTCDay() + 6) % 7]!;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]!;
  return `${DAY_SHORT[day]} ${d.getUTCDate()} ${month}`;
}

/**
 * What is wrong with the whole set of hours, in plain words, or null when it can be saved.
 * `todayISO`: today in India (special days must not be more than 400 days ahead). PURE.
 */
export function hoursProblem(h: GymHours, todayISO: string): string | null {
  for (const k of DAY_KEYS) {
    const p = dayProblem(h.week[k], DAY_NAMES[k]);
    if (p) return p;
  }
  if (DAY_KEYS.every((k) => h.week[k].kind === 'closed')) return 'Every day is Closed. Mark at least one day open.';
  if ((h.note ?? '').trim().length > HOURS_LIMITS.note) return `The note can be at most ${HOURS_LIMITS.note} letters.`;
  if (h.special.length > HOURS_LIMITS.specialDays) return `At most ${HOURS_LIMITS.specialDays} special days. Remove ones that are over.`;
  const seen = new Set<string>();
  const last = addDaysISO(todayISO, HOURS_LIMITS.specialAhead);
  for (const s of h.special) {
    if (!validDate(s.date)) return 'A special day needs a date.';
    const label = dateWords(s.date);
    if (seen.has(s.date)) return `${label} is in the special days twice. Keep one.`;
    seen.add(s.date);
    if (s.date > last) return `${label} is more than a year away. Add it nearer the time.`;
    if ((s.note ?? '').trim().length > HOURS_LIMITS.specialNote) return `${label}: the note can be at most ${HOURS_LIMITS.specialNote} letters.`;
    const p = dayProblem(s, label);
    if (p) return p;
  }
  return null;
}

// ------------------------------------------------------------------ reading (server answers, the kept copy)

function dayFrom(raw: unknown): DayHours | null {
  if (!isObj(raw)) return null;
  const kind = raw.kind;
  if (kind !== 'closed' && kind !== 'hours' && kind !== 'allDay') return null;
  if (kind !== 'hours') return { kind, ranges: [] };
  if (!Array.isArray(raw.ranges)) return null;
  const ranges: TimeRange[] = [];
  for (const r of raw.ranges) {
    if (!isObj(r) || typeof r.open !== 'string' || typeof r.close !== 'string') return null;
    ranges.push({ open: r.open, close: r.close });
  }
  const day: DayHours = { kind, ranges: sortRanges(ranges) };
  return dayProblem(day, 'Day') ? null : day;
}

/** Ranges earliest first. PURE. */
export function sortRanges(ranges: readonly TimeRange[]): TimeRange[] {
  return [...ranges].sort((a, b) => (minutesOf(a.open) ?? 0) - (minutesOf(b.open) ?? 0));
}

/**
 * Hours as the server or the phone's kept copy hold them, checked; null when anything in them can't
 * be read (no hours shown beats wrong hours). PURE.
 */
export function hoursFrom(raw: unknown): GymHours | null {
  if (!isObj(raw) || !isObj(raw.week)) return null;
  const week = {} as Record<DayKey, DayHours>;
  for (const k of DAY_KEYS) {
    const d = dayFrom(raw.week[k]);
    if (!d) return null;
    week[k] = d;
  }
  const special: SpecialDay[] = [];
  if (Array.isArray(raw.special)) {
    for (const s of raw.special) {
      if (!isObj(s) || typeof s.date !== 'string' || !validDate(s.date)) return null;
      const d = dayFrom(s);
      if (!d) return null;
      const note = typeof s.note === 'string' && s.note.trim() ? s.note.trim().slice(0, HOURS_LIMITS.specialNote) : null;
      special.push({ date: s.date, ...d, note });
    }
  }
  special.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, HOURS_LIMITS.note) : null;
  return { week, special, note };
}

// ------------------------------------------------------------------ words

/** "5:00 am", "12:30 pm", "12 midnight" for 'HH:MM'. PURE. */
export function timeWords(t: string): string {
  const m = minutesOf(t);
  if (m == null) return t;
  if (m === 0) return '12 midnight';
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

/** "5:00 am to 11:00 am". PURE. */
export function rangeWords(r: TimeRange): string {
  return `${timeWords(r.open)} to ${timeWords(r.close)}`;
}

/** One line per range, or "Closed" / "Open 24 hours". PURE. */
export function dayLines(d: DayHours): string[] {
  if (d.kind === 'closed') return ['Closed'];
  if (d.kind === 'allDay') return ['Open 24 hours'];
  return d.ranges.map(rangeWords);
}

function sameDay(a: DayHours, b: DayHours): boolean {
  return a.kind === b.kind && JSON.stringify(a.ranges) === JSON.stringify(b.ranges);
}

/** The week in groups of days with the same hours: [{days: "Mon to Sat", lines}, {days: "Sun", lines: ["Closed"]}]. PURE. */
export function weekGroups(h: GymHours): { days: string; lines: string[] }[] {
  const out: { days: string; lines: string[] }[] = [];
  let i = 0;
  while (i < DAY_KEYS.length) {
    let j = i;
    while (j + 1 < DAY_KEYS.length && sameDay(h.week[DAY_KEYS[j + 1]!], h.week[DAY_KEYS[i]!])) j += 1;
    const first = DAY_SHORT[DAY_KEYS[i]!];
    const days = j === i ? first : j === i + 1 ? `${first}, ${DAY_SHORT[DAY_KEYS[j]!]}` : `${first} to ${DAY_SHORT[DAY_KEYS[j]!]}`;
    out.push({ days: i === 0 && j === DAY_KEYS.length - 1 ? 'Every day' : days, lines: dayLines(h.week[DAY_KEYS[i]!]) });
    i = j + 1;
  }
  return out;
}

// ------------------------------------------------------------------ India time

/** The date, weekday and minute of the day in India for a moment (ms). PURE. */
export function indiaNow(ms: number): { dateISO: string; day: DayKey; minute: number } {
  const d = new Date(ms + IST_MS);
  return {
    dateISO: d.toISOString().slice(0, 10),
    day: DAY_KEYS[(d.getUTCDay() + 6) % 7]!,
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

function dayKeyOf(dateISO: string): DayKey {
  return DAY_KEYS[(new Date(`${dateISO}T00:00:00Z`).getUTCDay() + 6) % 7]!;
}

/** The hours that hold on a date: its special day if it has one, else its weekday's. PURE. */
export function hoursOn(h: GymHours, dateISO: string): { day: DayHours; special: SpecialDay | null } {
  const special = h.special.find((s) => s.date === dateISO) ?? null;
  return { day: special ?? h.week[dayKeyOf(dateISO)], special };
}

/** Open stretches as minutes from the start of `fromISO`, merged where they touch. PURE. */
function openStretches(h: GymHours, fromISO: string, days: number): { start: number; end: number }[] {
  const raw: { start: number; end: number }[] = [];
  for (let k = 0; k < days; k += 1) {
    const { day } = hoursOn(h, addDaysISO(fromISO, k));
    const base = k * DAY_MIN;
    if (day.kind === 'allDay') raw.push({ start: base, end: base + DAY_MIN });
    else if (day.kind === 'hours') {
      for (const r of day.ranges) {
        const s = rangeSpan(r);
        if (s) raw.push({ start: base + s.start, end: base + s.end });
      }
    }
  }
  raw.sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export interface OpenStatus {
  /** open: open now (closing at a time). closed: shut now. allDay: today is Open 24 hours. */
  state: 'open' | 'closed' | 'allDay';
  /** "Open now · closes 10:00 pm", "Closes soon · 10:00 pm", "Closed now · opens 5:00 am tomorrow", "Open 24 hours". */
  line: string;
  /** Today's special day (its note says why), or null. */
  today: SpecialDay | null;
}

/** Minutes before closing that the line says "Closes soon". */
export const CLOSES_SOON_MIN = 30;

/**
 * Open or closed right now, in India time, with split shifts, Open 24 hours, closed days, times past
 * midnight (yesterday's late range still counts this morning) and special days. PURE.
 */
export function openStatus(h: GymHours, nowMs: number): OpenStatus {
  const now = indiaNow(nowMs);
  const yesterday = addDaysISO(now.dateISO, -1);
  const { day, special } = hoursOn(h, now.dateISO);
  const t = DAY_MIN + now.minute; // minutes from the start of yesterday
  const stretches = openStretches(h, yesterday, 9);
  const open = stretches.find((s) => s.start <= t && t < s.end);
  if (day.kind === 'allDay') return { state: 'allDay', line: 'Open 24 hours', today: special };
  if (open) {
    const left = open.end - t;
    const at = clockAt(open.end);
    if (left <= CLOSES_SOON_MIN) return { state: 'open', line: `Closes soon · ${at}`, today: special };
    return { state: 'open', line: `Open now · closes ${at}`, today: special };
  }
  const next = stretches.find((s) => s.start > t);
  if (!next) return { state: 'closed', line: 'Closed now', today: special };
  const dayOff = Math.floor(next.start / DAY_MIN) - 1; // 0 = today
  const at = clockAt(next.start);
  const opens =
    dayOff === 0 || (dayOff === 1 && next.start % DAY_MIN === 0)
      ? at
      : dayOff === 1
        ? `${at} tomorrow`
        : `${DAY_SHORT[dayKeyOf(addDaysISO(now.dateISO, dayOff))]} ${at}`;
  const head = day.kind === 'closed' ? 'Closed today' : 'Closed now';
  return { state: 'closed', line: `${head} · opens ${opens}`, today: special };
}

/** The clock words for a minute counted from any day's start. */
function clockAt(min: number): string {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return timeWords(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
}

/** "today", "tomorrow" or "Sun 8 Nov" for a date seen from today. PURE. */
export function dayFromToday(dateISO: string, todayISO: string): string {
  if (dateISO === todayISO) return 'today';
  if (dateISO === addDaysISO(todayISO, 1)) return 'tomorrow';
  return dateWords(dateISO);
}

/** "Closed Sun 8 Nov · Diwali", "Open 24 hours tomorrow", "Sun 8 Nov: 7:00 am to 12:00 pm · Diwali". PURE. */
export function specialWords(s: SpecialDay, todayISO: string): string {
  const when = dayFromToday(s.date, todayISO);
  const head =
    s.kind === 'closed'
      ? `Closed ${when}`
      : s.kind === 'allDay'
        ? `Open 24 hours ${when}`
        : `${when.charAt(0).toUpperCase()}${when.slice(1)}: ${s.ranges.map(rangeWords).join(', ')}`;
  return s.note ? `${head} · ${s.note}` : head;
}

/** Special days in the `days` days from today (today counts as the first), earliest first. PURE. */
export function upcomingSpecial(h: GymHours, nowMs: number, days: number): SpecialDay[] {
  const today = indiaNow(nowMs).dateISO;
  const last = addDaysISO(today, days - 1);
  return h.special.filter((s) => s.date >= today && s.date <= last);
}

/** The member app's week: Mon..Sun with this week's special days put in and today marked. PURE. */
export function weekRows(h: GymHours, nowMs: number): { key: DayKey; name: string; dateISO: string; lines: string[]; today: boolean; special: SpecialDay | null }[] {
  const now = indiaNow(nowMs);
  const mondayISO = addDaysISO(now.dateISO, -DAY_KEYS.indexOf(now.day));
  return DAY_KEYS.map((key, i) => {
    const dateISO = addDaysISO(mondayISO, i);
    // A special day already over this week does not matter any more: the usual hours show.
    const { day, special } = dateISO >= now.dateISO ? hoursOn(h, dateISO) : { day: h.week[key], special: null };
    return { key, name: DAY_NAMES[key], dateISO, lines: dayLines(day), today: dateISO === now.dateISO, special };
  });
}

// ------------------------------------------------------------------ starting points for the owner

const R = (open: string, close: string): TimeRange => ({ open, close });
const hours = (...ranges: TimeRange[]): DayHours => ({ kind: 'hours', ranges });

function weekOf(monSat: DayHours, sun: DayHours): Record<DayKey, DayHours> {
  return { mon: monSat, tue: monSat, wed: monSat, thu: monSat, fri: monSat, sat: monSat, sun };
}

/** The usual Indian patterns (docs/research/R-gym-timings.md §3). */
export const HOURS_PRESETS: readonly { key: string; title: string; sub: string; hours: () => GymHours }[] = [
  {
    key: 'split',
    title: 'Morning and evening',
    sub: 'Mon to Sat 5:00 am to 11:00 am and 4:00 pm to 10:00 pm, Sunday morning only',
    hours: () => ({ week: weekOf(hours(R('05:00', '11:00'), R('16:00', '22:00')), hours(R('06:00', '11:00'))), special: [], note: null }),
  },
  {
    key: 'long',
    title: 'One long day',
    sub: 'Mon to Sat 5:00 am to 10:00 pm, Sunday closed',
    hours: () => ({ week: weekOf(hours(R('05:00', '22:00')), { kind: 'closed', ranges: [] }), special: [], note: null }),
  },
  {
    key: 'allDay',
    title: 'Open 24 hours',
    sub: 'Every day, day and night',
    hours: () => ({ week: weekOf({ kind: 'allDay', ranges: [] }, { kind: 'allDay', ranges: [] }), special: [], note: null }),
  },
];

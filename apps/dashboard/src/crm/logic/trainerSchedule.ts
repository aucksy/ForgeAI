/**
 * F105 "Trainer profiles and schedules" (plan docs/plans/F105-trainer-profiles.md; server
 * supabase/migrations/0065_trainer_schedule.sql, NOT APPLIED). PURE: the server's answer read defensively, the
 * week and its time grid, working hours, the clash rules the desk sees BEFORE pressing Book (the server checks
 * the same ones again, except classes left, which only the app can count), each trainer's personal-training
 * members with classes left, and every word on the screen.
 *
 * Words: never "session" to the reader (member-words): "personal-training classes left".
 */

import { addDays, formatDayShort, isValidDateISO, partsOf, type DateISO } from './dates';
import { ptLeftRunning, runningPtPacks } from './pt';
import type { Member, Membership } from '../types';

// ---------------------------------------------------------------- times

/** Bookings run from 5:00 am to 11:00 pm, starting on the half hour. */
export const DAY_FIRST_MIN = 300;
export const DAY_LAST_MIN = 1380;
export const SLOT_MIN = 30;
export const LENGTHS = [30, 45, 60, 90] as const;
export const DEFAULT_LENGTH = 60;
/** How far ahead a booking may be made. */
export const MAX_DAYS_AHEAD = 31;
/** When no trainer has hours, the day's grid runs 6:00 am to 10:00 pm. */
const GRID_DEFAULT: Shift = [360, 1320];

/** A shift: [from, to) minutes after midnight, India time. */
export type Shift = readonly [number, number];
/** ISO weekday (1 = Monday .. 7 = Sunday) -> up to 2 shifts. A weekday with no key is a day off. */
export type WeekHours = Readonly<Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, readonly Shift[]>>>;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function dayName(d: Weekday): string {
  return DAY_NAMES[d - 1]!;
}

/** ISO weekday of a day (1 = Monday). */
export function isoWeekday(day: DateISO): Weekday {
  const { year, month, day: dd } = partsOf(day);
  const js = new Date(Date.UTC(year, month - 1, dd)).getUTCDay();
  return (js === 0 ? 7 : js) as Weekday;
}

export function mondayOf(day: DateISO): DateISO {
  return addDays(day, 1 - isoWeekday(day));
}

/** The 7 days of the week that starts on `monday`. */
export function weekDays(monday: DateISO): DateISO[] {
  return WEEKDAYS.map((i) => addDays(monday, i - 1));
}

/** "Mon 19 Oct". */
export function dayChip(day: DateISO): string {
  return `${DAY_SHORT[isoWeekday(day) - 1]} ${formatDayShort(day)}`;
}

/** "7:00 am", "12:30 pm", "11:00 pm". */
export function timeWords(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** "7:00 am to 8:00 am". */
export function rangeWords(start: number, length: number): string {
  return `${timeWords(start)} to ${timeWords(start + length)}`;
}

/** Minutes after midnight in India now (UTC + 5:30). */
export function indiaMinutes(nowMs: number): number {
  const m = Math.floor(nowMs / 60_000) + 330;
  return ((m % 1440) + 1440) % 1440;
}

/** "06:30" (an <input type="time"> value) -> 390; null for anything else. */
export function minutesFromInput(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** 390 -> "06:30". */
export function inputFromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- working hours

export function shiftsOn(hours: WeekHours, weekday: Weekday): readonly Shift[] {
  return hours[weekday] ?? [];
}

/** Has the trainer set any hours at all? Without any, every time is open. */
export function hoursSet(hours: WeekHours): boolean {
  return WEEKDAYS.some((d) => shiftsOn(hours, d).length > 0);
}

/** Is [start, start + length) inside one shift on that day? True when no hours are set. */
export function insideHours(hours: WeekHours, day: DateISO, start: number, length: number): boolean {
  if (!hoursSet(hours)) return true;
  return shiftsOn(hours, isoWeekday(day)).some(([a, b]) => a <= start && start + length <= b);
}

/** Is the half hour starting at `min` inside a shift? (Grid cells.) True when no hours are set. */
export function workingAt(hours: WeekHours, day: DateISO, min: number): boolean {
  return insideHours(hours, day, min, SLOT_MIN);
}

/** One day's hours in words: "6:00 am to 10:00 am, 5:00 pm to 9:00 pm", "Day off", or "Not set". */
export function hoursLine(hours: WeekHours, weekday: Weekday): string {
  if (!hoursSet(hours)) return TRAINER_WORDS.hoursNotSet;
  const s = shiftsOn(hours, weekday);
  if (s.length === 0) return 'Day off';
  return s.map(([a, b]) => `${timeWords(a)} to ${timeWords(b)}`).join(', ');
}

/**
 * The hours form: the days ticked and one or two shifts as "HH:MM" -> the hours to save, or the words of
 * what is wrong. No day ticked = no hours (every time is open). PURE.
 */
export function hoursFromForm(
  days: readonly Weekday[],
  shifts: ReadonlyArray<{ from: string; to: string }>,
): { ok: true; hours: WeekHours } | { ok: false; words: string } {
  const filled = shifts.filter((s) => s.from.trim() || s.to.trim());
  if (days.length === 0) return { ok: true, hours: {} };
  if (filled.length === 0) return { ok: false, words: 'Pick the start and end time of the shift.' };
  const out: Shift[] = [];
  for (const s of filled) {
    const a = minutesFromInput(s.from);
    const b = minutesFromInput(s.to);
    if (a === null || b === null) return { ok: false, words: 'Pick the start and end time of each shift.' };
    if (a % SLOT_MIN !== 0 || b % SLOT_MIN !== 0) return { ok: false, words: 'Use times on the hour or half hour, like 6:00 or 6:30.' };
    if (a < DAY_FIRST_MIN || b > DAY_LAST_MIN) return { ok: false, words: 'Working hours can be from 5:00 am to 11:00 pm.' };
    if (a >= b) return { ok: false, words: 'Each shift must end after it starts.' };
    out.push([a, b]);
  }
  out.sort((x, y) => x[0] - y[0]);
  if (out.length === 2 && out[1]![0] < out[0]![1]) return { ok: false, words: 'The two shifts overlap. Change one of them.' };
  const hours: Partial<Record<Weekday, readonly Shift[]>> = {};
  for (const d of days) hours[d] = out;
  return { ok: true, hours };
}

/** The form's starting values from saved hours: the days with shifts, and the first such day's shifts. */
export function formFromHours(hours: WeekHours): { days: Weekday[]; shifts: { from: string; to: string }[] } {
  const days = WEEKDAYS.filter((d) => shiftsOn(hours, d).length > 0);
  const first = days.length ? shiftsOn(hours, days[0]!) : [];
  const shifts = first.map(([a, b]) => ({ from: inputFromMinutes(a), to: inputFromMinutes(b) }));
  while (shifts.length < 2) shifts.push({ from: '', to: '' });
  return { days, shifts };
}

/** Do the saved hours differ from day to day? (The form sets one set of shifts for the ticked days.) */
export function hoursDifferByDay(hours: WeekHours): boolean {
  const lines = WEEKDAYS.map((d) => shiftsOn(hours, d)).filter((s) => s.length > 0).map((s) => JSON.stringify(s));
  return new Set(lines).size > 1;
}

// ---------------------------------------------------------------- the server's answer

export interface TrainerProfile {
  id: string;
  name: string;
  teaches: string | null;
  hours: WeekHours;
  /** Base64 JPEG, or null. */
  photo: string | null;
}

export interface PtBooking {
  id: string;
  trainerId: string;
  memberId: string;
  day: DateISO;
  start: number;
  length: number;
  byName: string | null;
}

export interface TrainerSchedule {
  /** This key's person (null for an old owner key). */
  me: string | null;
  owner: boolean;
  week: DateISO;
  trainers: TrainerProfile[];
  /** List member id -> trainer id (the owner's pick on the member's page). */
  assigned: Record<string, string>;
  bookings: PtBooking[];
  /** List member id -> classes booked from now on (any week). */
  ahead: Record<string, number>;
}

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** Hours as saved; anything unreadable is dropped. PURE. */
export function hoursFrom(raw: unknown): WeekHours {
  const out: Partial<Record<Weekday, Shift[]>> = {};
  if (!isObj(raw)) return out;
  for (const d of WEEKDAYS) {
    const list = raw[String(d)];
    if (!Array.isArray(list)) continue;
    const shifts: Shift[] = [];
    for (const s of list.slice(0, 2)) {
      if (!Array.isArray(s)) continue;
      const a = int(s[0]);
      const b = int(s[1]);
      if (a !== null && b !== null && a >= DAY_FIRST_MIN && b <= DAY_LAST_MIN && a < b) shifts.push([a, b]);
    }
    if (shifts.length) out[d] = shifts.sort((x, y) => x[0] - y[0]);
  }
  return out;
}

export function bookingFrom(raw: unknown): PtBooking | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const trainerId = str(raw.trainerId);
  const memberId = str(raw.memberId);
  const start = int(raw.start);
  const length = int(raw.length);
  if (!id || !trainerId || !memberId || !isValidDateISO(raw.day) || start === null || length === null) return null;
  return { id, trainerId, memberId, day: raw.day, start, length, byName: str(raw.byName) || null };
}

/** owner_trainer_schedule's answer. PURE. */
export function scheduleFrom(raw: unknown, fallbackWeek: DateISO): TrainerSchedule {
  const r = isObj(raw) ? raw : {};
  const trainers: TrainerProfile[] = [];
  for (const t of Array.isArray(r.trainers) ? r.trainers : []) {
    if (!isObj(t) || !str(t.id)) continue;
    const photo = typeof t.photo === 'string' && /^\/9j\/[A-Za-z0-9+/]+=*$/.test(t.photo) ? t.photo : null;
    trainers.push({ id: str(t.id), name: str(t.name) || 'Trainer', teaches: str(t.teaches) || null, hours: hoursFrom(t.hours), photo });
  }
  const assigned: Record<string, string> = {};
  for (const a of Array.isArray(r.assigned) ? r.assigned : []) {
    if (isObj(a) && str(a.memberId) && str(a.trainerId)) assigned[str(a.memberId)] = str(a.trainerId);
  }
  const ahead: Record<string, number> = {};
  if (isObj(r.ahead)) for (const [k, v] of Object.entries(r.ahead)) if (typeof v === 'number' && v > 0) ahead[k] = Math.floor(v);
  return {
    me: str(r.me) || null,
    owner: r.owner === true,
    week: isValidDateISO(r.week) ? r.week : fallbackWeek,
    trainers,
    assigned,
    bookings: (Array.isArray(r.bookings) ? r.bookings : []).map(bookingFrom).filter((b): b is PtBooking => b !== null),
    ahead,
  };
}

// ---------------------------------------------------------------- who may do what

/** May this person edit this trainer's page? The owner any; a trainer only their own. */
export function canEditProfile(s: Pick<TrainerSchedule, 'owner' | 'me'>, trainerId: string): boolean {
  return s.owner || (s.me !== null && s.me === trainerId);
}

/** Has the booking started (or is it over)? */
export function bookingStarted(b: Pick<PtBooking, 'day' | 'start'>, today: DateISO, nowMin: number): boolean {
  return b.day < today || (b.day === today && b.start <= nowMin);
}

/** May this person cancel it? Anyone before it starts; only the owner after. */
export function canCancel(owner: boolean, b: Pick<PtBooking, 'day' | 'start'>, today: DateISO, nowMin: number): boolean {
  return owner || !bookingStarted(b, today, nowMin);
}

// ---------------------------------------------------------------- personal-training members

export interface PtMemberRow {
  memberId: string;
  name: string;
  /** Classes left on running packs. */
  left: number;
  /** Classes booked from now on. */
  booked: number;
}

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Does a pack's typed trainer name ("Rohit") mean this trainer ("Rohit Sharma")? Whole name or first name. */
export function nameMeansTrainer(typed: string | null | undefined, trainerName: string): boolean {
  const t = norm(typed);
  const full = norm(trainerName);
  if (!t || !full) return false;
  return t === full || t === full.split(' ')[0];
}

/**
 * A trainer's personal-training members: the members the owner picked this trainer for, plus members with a
 * running personal-training pack typed with this trainer's name. Not archived. Fewest classes left first, then
 * by name. PURE.
 */
export function trainerPtMembers(
  trainer: Pick<TrainerProfile, 'id' | 'name'>,
  members: readonly Pick<Member, 'id' | 'fullName' | 'archived'>[],
  memberships: readonly Membership[],
  assigned: Readonly<Record<string, string>>,
  ahead: Readonly<Record<string, number>>,
  today: DateISO,
): PtMemberRow[] {
  const byMember = new Map<string, Membership[]>();
  for (const m of memberships) {
    const list = byMember.get(m.memberId) ?? [];
    list.push(m);
    byMember.set(m.memberId, list);
  }
  const rows: PtMemberRow[] = [];
  for (const mem of members) {
    if (mem.archived) continue;
    const own = byMember.get(mem.id) ?? [];
    const picked = assigned[mem.id] === trainer.id;
    const byPack = runningPtPacks(own, today).some((p) => nameMeansTrainer(p.trainer, trainer.name));
    if (!picked && !byPack) continue;
    rows.push({ memberId: mem.id, name: mem.fullName, left: ptLeftRunning(own, today), booked: ahead[mem.id] ?? 0 });
  }
  return rows.sort((a, b) => a.left - b.left || a.name.localeCompare(b.name));
}

/** Classes a member can still book: left on running packs minus those already booked ahead. */
export function classesFree(left: number, booked: number): number {
  return Math.max(0, left - booked);
}

/** "3 personal-training classes left", "1 personal-training class left", "No personal-training classes left". */
export function classesLeftWords(n: number): string {
  if (n <= 0) return 'No personal-training classes left';
  return n === 1 ? '1 personal-training class left' : `${n} personal-training classes left`;
}

/** "2 booked" next to the classes left, or ''. */
export function bookedWords(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '1 class already booked' : `${n} classes already booked`;
}

// ---------------------------------------------------------------- the clash rules

export interface BookingTry {
  trainer: Pick<TrainerProfile, 'id' | 'name' | 'hours'>;
  memberId: string;
  memberName: string;
  day: DateISO;
  start: number;
  length: number;
  /** Classes left on the member's running packs, and already booked ahead. */
  left: number;
  booked: number;
}

export type BookingCheck =
  | { ok: true; outsideHours: boolean }
  | { ok: false; code: 'PAST' | 'TOO_FAR' | 'BAD_TIME' | 'NO_CLASSES' | 'TRAINER_BUSY' | 'MEMBER_BUSY'; words: string };

export function overlaps(aStart: number, aLen: number, bStart: number, bLen: number): boolean {
  return aStart < bStart + bLen && bStart < aStart + aLen;
}

/**
 * May this booking be made? Checked in this order: the time, classes left (a member with none, or with
 * every one already booked, is refused), the trainer's other bookings, the member's other bookings. A time
 * outside the trainer's working hours is allowed with a warning ("Book anyway"). `bookings`: every known
 * booking (not cancelled). PURE.
 */
export function checkBooking(t: BookingTry, bookings: readonly PtBooking[], names: (memberId: string) => string, today: DateISO, nowMin: number, ignoreId?: string): BookingCheck {
  if (!(LENGTHS as readonly number[]).includes(t.length) || t.start % SLOT_MIN !== 0 || t.start < DAY_FIRST_MIN || t.start + t.length > DAY_LAST_MIN) {
    return { ok: false, code: 'BAD_TIME', words: 'Pick a start time from 5:00 am, ending by 11:00 pm.' };
  }
  if (t.day < today || (t.day === today && t.start <= nowMin)) return { ok: false, code: 'PAST', words: TRAINER_WORDS.past };
  if (t.day > addDays(today, MAX_DAYS_AHEAD)) return { ok: false, code: 'TOO_FAR', words: TRAINER_WORDS.tooFar };
  if (t.left <= 0) return { ok: false, code: 'NO_CLASSES', words: `${t.memberName} has no personal-training classes left. Sell a personal-training plan first.` };
  if (classesFree(t.left, t.booked) <= 0) {
    return { ok: false, code: 'NO_CLASSES', words: `All ${t.left} of ${t.memberName}’s personal-training classes left are already booked. Sell more first, or cancel a booking.` };
  }
  const same = bookings.filter((b) => b.id !== ignoreId && b.day === t.day && overlaps(b.start, b.length, t.start, t.length));
  const trainerClash = same.find((b) => b.trainerId === t.trainer.id);
  if (trainerClash) {
    return { ok: false, code: 'TRAINER_BUSY', words: `${t.trainer.name} already has ${names(trainerClash.memberId)} at ${timeWords(trainerClash.start)}. Pick another time.` };
  }
  const memberClash = same.find((b) => b.memberId === t.memberId);
  if (memberClash) {
    return { ok: false, code: 'MEMBER_BUSY', words: `${t.memberName} is already booked at ${timeWords(memberClash.start)} that day. Pick another time.` };
  }
  return { ok: true, outsideHours: !insideHours(t.trainer.hours, t.day, t.start, t.length) };
}

/** The server's refusal codes in words; null for one that is not this screen's. PURE. */
export function scheduleErrorWords(err: unknown, trainerName = 'This trainer'): string | null {
  const t = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  if (/\bTRAINER_BUSY\b/.test(t)) return `${trainerName} was just booked at this time on another screen. Pick another time.`;
  if (/\bMEMBER_BUSY\b/.test(t)) return 'This member was just booked at this time on another screen. Pick another time.';
  if (/\bOUTSIDE_HOURS\b/.test(t)) return `This is outside ${trainerName}’s working hours.`;
  if (/\bPAST\b/.test(t)) return TRAINER_WORDS.past;
  if (/\bTOO_FAR\b/.test(t)) return TRAINER_WORDS.tooFar;
  if (/\bBAD_TIME\b/.test(t)) return 'Pick a start time from 5:00 am, ending by 11:00 pm.';
  if (/\bNOT_TRAINER\b/.test(t)) return 'This person is no longer a trainer. Tick "Trainer" for them in Staff & sign-in.';
  if (/\bNO_MEMBER\b/.test(t)) return 'This member is not on your list any more.';
  if (/\bOWNER_ONLY\b/.test(t)) return 'Only the gym owner can do this.';
  if (/\bNOT_FOUND\b/.test(t)) return 'This booking was already cancelled.';
  if (/\bBAD_PHOTO\b/.test(t)) return 'This photo could not be saved. Pick a JPG or PNG photo.';
  if (/\bINVALID\b/.test(t)) return 'These working hours could not be saved. Check the times.';
  if (/\bSUSPENDED\b/.test(t)) return 'Your gym is paused, so nothing can be booked.';
  return null;
}

// ---------------------------------------------------------------- the day's grid

export type GridCell =
  | { kind: 'booked'; booking: PtBooking; first: boolean }
  | { kind: 'free' }
  | { kind: 'off' }
  /** Already over (today before now, or an earlier day): nothing to book. Not the same as "not working". */
  | { kind: 'past' };

export interface GridRow {
  min: number;
  cells: GridCell[];
}

/**
 * The time grid of one day: one row per half hour from the earliest shift that day to the latest end (6:00 am
 * to 10:00 pm when no one works that day or no hours are set), widened to show every booking; one cell per
 * trainer (in `trainers` order). A booking fills every half hour it covers; `first` marks its starting row.
 * A half hour already past today reads 'off' unless booked. PURE.
 */
export function dayGrid(day: DateISO, trainers: readonly TrainerProfile[], bookings: readonly PtBooking[], today: DateISO, nowMin: number): GridRow[] {
  const mine = bookings.filter((b) => b.day === day);
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const t of trainers) {
    for (const [a, b] of hoursSet(t.hours) ? shiftsOn(t.hours, isoWeekday(day)) : [GRID_DEFAULT]) {
      from = Math.min(from, a);
      to = Math.max(to, b);
    }
  }
  if (!Number.isFinite(from)) [from, to] = GRID_DEFAULT;
  for (const b of mine) {
    from = Math.min(from, b.start - (b.start % SLOT_MIN));
    to = Math.max(to, b.start + b.length);
  }
  const rows: GridRow[] = [];
  for (let min = from; min < to; min += SLOT_MIN) {
    const cells = trainers.map((t): GridCell => {
      const b = mine.find((x) => x.trainerId === t.id && overlaps(x.start, x.length, min, SLOT_MIN));
      if (b) return { kind: 'booked', booking: b, first: b.start >= min && b.start < min + SLOT_MIN };
      if (day < today || (day === today && min <= nowMin)) return { kind: 'past' };
      return workingAt(t.hours, day, min) ? { kind: 'free' } : { kind: 'off' };
    });
    rows.push({ min, cells });
  }
  return rows;
}

/** How many bookings each day of the week has. */
export function countsByDay(days: readonly DateISO[], bookings: readonly PtBooking[]): number[] {
  return days.map((d) => bookings.filter((b) => b.day === d).length);
}

/** "1 booking", "3 bookings", "No bookings". */
export function bookingsWords(n: number): string {
  if (n === 0) return 'No bookings';
  return n === 1 ? '1 booking' : `${n} bookings`;
}

// ---------------------------------------------------------------- the screen's state

export type ScheduleLoad =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error'; message: string }
  | { state: 'ready'; schedule: TrainerSchedule };

export const TRAINER_WORDS = {
  title: 'Trainers',
  subtitle: 'Your trainers, their hours, and personal-training bookings',
  navHint: 'Their hours, and personal-training bookings',
  offTitle: 'Trainer pages need your gym online',
  offBody: 'Put your gym online first (Settings → Sign-in & data).',
  missingTitle: 'Trainer pages are not ready for your gym yet',
  missingBody:
    'MettleUp has not switched on trainer pages and personal-training bookings for your gym yet. Nothing you do here is saved. Message MettleUp on WhatsApp if you want it for your gym.',
  errorTitle: 'Could not load your trainers',
  noTrainersTitle: 'No trainers yet',
  noTrainersOwner: 'Open Staff & sign-in and tick "Trainer" next to each trainer. They show here with their own page.',
  noTrainersStaff: 'The gym owner picks the trainers in Staff & sign-in. They show here with their own page.',
  hoursNotSet: 'Working hours not set',
  weekTitle: 'Personal training this week',
  past: 'This time has already passed. Pick a time later than now.',
  tooFar: 'You can book at most 31 days ahead.',
  outside: (name: string) => `This is outside ${name}’s working hours.`,
  noMembers: 'No personal-training members yet. A member shows here when the owner picks this trainer on the member’s page, or sells a personal-training plan with this trainer’s name.',
  booked: (member: string, trainer: string, day: DateISO, start: number, length: number) =>
    `Booked: ${member} with ${trainer}, ${dayChip(day)}, ${rangeWords(start, length)}.`,
};

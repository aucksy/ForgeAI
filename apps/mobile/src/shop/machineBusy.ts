/**
 * F137 "Busy times by exercise" (OWNER-INBOX #68): the PURE half. machineBusySync.ts does the asking and the
 * sending; MachineTipCard.tsx draws the one line on the Gym tab.
 *
 *  - The gym's answer (member_machine_busy, supabase/migrations/0049_busy_by_exercise.sql): whether the owner
 *    switched it on, which exercise library keys the gym's machines use (only those may leave the phone), and
 *    the machines whose weekly guesses have proven right most weeks, each with this week's usual level per
 *    weekday and hour (0 quiet, 1 some, 2 busy). Before 0049 is on the server, or while it is off, nothing shows.
 *  - What the phone sends: per workout of the last 35 days only {d: day, h: hour it started, x: keys of the
 *    gym's machines}. No title, sets, weights or exact time; exercises without a library key never leave.
 *  - The tip: a routine the member usually does on one weekday at one hour (3+ times in the last 6 weeks, the
 *    same weekday at least twice and for at least half of them), when one of its machines is usually busy then
 *    and the same hour on a nearby day is quiet on every machine it uses: "Leg day is quieter on Tuesday".
 */
import { DAY_NAMES, rangeSpan, type DayKey, type GymHours } from '@forgeai/theme';

import { hourWords } from './gymBusy';

export const MACHINE_DAYS: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Days of workouts the phone sends (the server keeps the same 35). */
export const PUSH_DAYS = 35;
/** At most this many workouts per send (the server refuses more than 80). */
export const PUSH_MAX = 80;
/** Days of workouts the tip looks at. */
export const TIP_DAYS = 42;
/** "Not now" hides a tip for this many days (owner, #68: "'Not now' hides it for a month"). */
export const TIP_SNOOZE_DAYS = 30;

const KEY_RE = /^[a-z0-9_]{1,60}$/;

/** Ask the gym again after this long (the guesses change once a week; the switch can change any time). */
export const MACHINE_READ_EVERY_MS = 30 * 60 * 1000;
/** Send the workout starts at most this often, except straight after a workout. */
export const MACHINE_PUSH_EVERY_MS = 6 * 60 * 60 * 1000;

export type MachineTrigger = 'start' | 'active' | 'focus' | 'workout';

/** Is a send due? After a workout: always; else once every 6 hours per member key. PURE. */
export function machinePushDue(trigger: MachineTrigger, lastAt: number | null, now: number): boolean {
  return trigger === 'workout' || lastAt == null || now - lastAt >= MACHINE_PUSH_EVERY_MS;
}

/** Is a fresh read due? After a workout, or none yet, or 30 minutes on. PURE. */
export function machineReadDue(trigger: MachineTrigger, lastAt: number | null, now: number): boolean {
  return trigger === 'workout' || lastAt == null || now - lastAt >= MACHINE_READ_EVERY_MS;
}

export interface BusyMachine {
  id: string;
  name: string;
  ex: string[];
  /** Per weekday, 24 hourly levels: 0 quiet, 1 some, 2 busy. */
  week: Record<DayKey, number[]>;
}

export interface MachineBusyAnswer {
  on: boolean;
  /** Library keys the gym's machines use: the only ones the phone sends. */
  keys: string[];
  /** Proven machines only (empty until the gym's guesses prove right most weeks). */
  machines: BusyMachine[];
}

/** One saved workout, as the phone reads it. `routineId` null: not started from a routine. */
export interface WorkoutStart {
  dateISO: string;
  hour: number;
  routineId: string | null;
  name: string;
  keys: readonly string[];
}

export interface PushWorkout {
  d: string;
  h: number;
  x: string[];
}

export interface MachineTip {
  /** Stable for the same advice (routine, usual day and hour, quieter day): "Not now" hides it. */
  id: string;
  routine: string;
  machine: string;
  usualDay: DayKey;
  hour: number;
  quietDay: DayKey;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function weekFrom(raw: unknown): Record<DayKey, number[]> | null {
  if (!isObj(raw)) return null;
  const out = {} as Record<DayKey, number[]>;
  for (const k of MACHINE_DAYS) {
    const day = raw[k];
    if (!Array.isArray(day) || day.length !== 24) return null;
    if (!day.every((v) => v === 0 || v === 1 || v === 2)) return null;
    out[k] = day as number[];
  }
  return out;
}

/** member_machine_busy's answer, checked; null when it is not one. PURE. */
export function machineBusyFromRow(raw: unknown): MachineBusyAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true || typeof r.on !== 'boolean') return null;
  if (!r.on) return { on: false, keys: [], machines: [] };
  const keys = Array.isArray(r.keys) ? r.keys.filter((k): k is string => typeof k === 'string' && KEY_RE.test(k)) : [];
  const machines: BusyMachine[] = [];
  for (const m of Array.isArray(r.machines) ? r.machines : []) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.name !== 'string' || !m.name.trim() || !Array.isArray(m.ex)) continue;
    const week = weekFrom(m.week);
    if (!week) continue;
    const ex = m.ex.filter((k): k is string => typeof k === 'string' && KEY_RE.test(k));
    if (ex.length) machines.push({ id: m.id, name: m.name.trim(), ex, week });
  }
  return { on: true, keys, machines };
}

/** 'YYYY-MM-DD' plus n days. PURE. */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return t.toISOString().slice(0, 10);
}

/** The weekday of a day. PURE. */
export function dayOf(iso: string): DayKey {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
  return MACHINE_DAYS[(js + 6) % 7]!;
}

/**
 * What goes to the gym: the last 35 days' workouts, each with only the gym's keys, the newest 80; a workout
 * with none of them is left out. Days in order. PURE.
 */
export function pushPayload(workouts: readonly WorkoutStart[], keys: readonly string[], today: string): PushWorkout[] {
  const allowed = new Set(keys);
  const from = addDaysISO(today, -PUSH_DAYS);
  const out = workouts
    .filter((w) => w.dateISO >= from && w.dateISO <= today && Number.isInteger(w.hour) && w.hour >= 0 && w.hour <= 23)
    .map((w) => ({ d: w.dateISO, h: w.hour, x: [...new Set(w.keys.filter((k) => allowed.has(k)))].sort() }))
    .filter((w) => w.x.length > 0)
    .sort((a, b) => (a.d === b.d ? a.h - b.h : a.d < b.d ? -1 : 1));
  return out.slice(Math.max(0, out.length - PUSH_MAX));
}

/** The most common value; ties go to the smallest. PURE. */
function mode(values: readonly number[]): { value: number; count: number } {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = { value: Infinity, count: 0 };
  for (const [value, count] of counts) {
    if (count > best.count || (count === best.count && value < best.value)) best = { value, count };
  }
  return best;
}

/**
 * The one tip to show, or null. Routines are tried most-done first. `isOpen(day, hour)`: false when the gym's
 * own hours say it is closed then (never suggest a closed hour). PURE.
 */
export function findTip(
  workouts: readonly WorkoutStart[],
  machines: readonly BusyMachine[],
  today: string,
  isOpen: (day: DayKey, hour: number) => boolean = () => true,
): MachineTip | null {
  if (!machines.length) return null;
  const from = addDaysISO(today, -(TIP_DAYS - 1));
  const groups = new Map<string, WorkoutStart[]>();
  for (const w of workouts) {
    if (!w.routineId || w.dateISO < from || w.dateISO > today) continue;
    const g = groups.get(w.routineId) ?? [];
    g.push(w);
    groups.set(w.routineId, g);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  for (const [routineId, list] of ordered) {
    if (list.length < 3) continue;
    const dayIdx = mode(list.map((w) => MACHINE_DAYS.indexOf(dayOf(w.dateISO))));
    if (dayIdx.count < 2 || dayIdx.count * 2 < list.length) continue;
    const usualDay = MACHINE_DAYS[dayIdx.value]!;
    const hour = mode(list.filter((w) => dayOf(w.dateISO) === usualDay).map((w) => w.hour)).value;
    const keys = new Set(list.flatMap((w) => w.keys));
    const used = machines.filter((m) => m.ex.some((k) => keys.has(k)));
    const busy = used.find((m) => m.week[usualDay][hour] === 2);
    if (!busy) continue;
    for (const step of [1, -1, 2, -2, 3, -3]) {
      const quietDay = MACHINE_DAYS[(dayIdx.value + step + 7) % 7]!;
      if (!isOpen(quietDay, hour)) continue;
      if (!used.every((m) => m.week[quietDay][hour] === 0)) continue;
      const newest = [...list].sort((a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0))[0]!;
      return { id: `${routineId}|${usualDay}|${hour}|${quietDay}`, routine: newest.name.trim() || 'This routine', machine: busy.name, usualDay, hour, quietDay };
    }
  }
  return null;
}

/** "Leg day is quieter on Tuesday". PURE. */
export function tipTitle(t: MachineTip): string {
  return `${t.routine} is quieter on ${DAY_NAMES[t.quietDay]}`;
}

/** "You usually do it on Monday at 7 pm, when the Leg press is usually busy. On Tuesday at 7 pm it is usually quiet." PURE. */
export function tipBody(t: MachineTip): string {
  const at = hourWords(t.hour);
  return `You usually do it on ${DAY_NAMES[t.usualDay]} at ${at}, when the ${t.machine} is usually busy. On ${DAY_NAMES[t.quietDay]} at ${at} it is usually quiet.`;
}

/** Where the advice comes from. PURE. */
export const TIP_SOURCE = 'From workouts that members of your gym log in the app. No names are shown.';

/** Hidden tips kept on the phone: {tip id: the day it may show again}. Old entries are dropped. PURE. */
export function hiddenFrom(raw: string | null, today: string): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, until] of Object.entries(v)) if (typeof until === 'string' && until > today) out[k] = until;
    return out;
  } catch {
    // quiet: a damaged note only means a hidden tip may show again.
    return {};
  }
}

/** The hidden list after "Not now" on one tip. PURE. */
export function withSnoozed(hidden: Record<string, string>, tipId: string, today: string): Record<string, string> {
  return { ...hidden, [tipId]: addDaysISO(today, TIP_SNOOZE_DAYS) };
}

/**
 * Is the gym open for any part of this hour on this weekday, by its weekly hours? No hours set: yes (we do not
 * know). Special days are not looked at: the tip is about the usual week. PURE.
 */
export function openAtHour(hours: GymHours | null, day: DayKey, hour: number): boolean {
  if (!hours) return true;
  const d = hours.week[day];
  if (!d || d.kind === 'allDay') return true;
  if (d.kind === 'closed') return false;
  const from = hour * 60;
  return d.ranges.some((r) => {
    const span = rangeSpan(r);
    return span != null && span.start < from + 60 && span.end > from;
  });
}

/**
 * Workout reminders (v0.27.0; audit Phase 6). Off until the member turns them on in Profile. A
 * quiet alert on the chosen days at the chosen time: "Time to train" / "Next up: Push 1".
 *
 * Audit Phase 6:
 *  - PH-04: a WEEKLY repeat per chosen day (expo-notifications `WEEKLY`), so reminders keep
 *    coming however long the app stays closed. (v0.27.0 set 14 single alerts, which ran out.)
 *  - "Not on a day you already trained" and PH-07 "never mid-workout": a weekly repeat cannot be
 *    told to skip one day. So when today must be skipped (a workout saved today, or one open
 *    now) and today's time is still ahead, today's weekday gets DATED alerts on its next 52
 *    weeks instead of the repeat; the next time the app runs after today's time it is a weekly
 *    repeat again. The app runs anyway at every start, return, finish, discard and delete, so
 *    in practice the bridge lasts hours — a year is only the worst case. (Review fix: it was 8
 *    weeks, so a phone left unopened that long lost that weekday's reminder for good; 52 dated
 *    alerts are still few, well under Android's limit of alarms per app.)
 *      · a workout started → today's skipped; finished → still skipped (trained);
 *        discarded → today's back (presence host → `phoneWorkoutLive`);
 *      · today's workout deleted → today's back (HI-17, `phoneAfterDelete`).
 *  - PH-08: a weekly repeat follows the phone's clock, but the alarm already set is an instant.
 *    The time-zone offset is kept (meta) and checked on every start and return; a change sets
 *    every reminder again. Nothing is redone when nothing changed.
 *  - Owner pick: switched on for the first time, the days and time are "your usual training
 *    days and time" (the last 8 weeks), else the plan's days, else Mon/Wed/Fri 6:00 pm.
 */
import { Platform } from 'react-native';

import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { addDays, fromISO, todayISO, weekStartISO } from '@/lib/date';
import { getActivePlan } from '@/db/repos/planRepo';
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { followedFolder } from '@/tracker/db/folderRepo';
import { planDaysPerWeek } from '@/tracker/services/planState';
import { getTodayPlan } from '@/tracker/services/todayService';

import { ensureAlertPermission, notificationsGranted } from '../services/workoutAlerts';
import { liveWorkout } from './liveWorkout';
import { DEFAULT_REMINDER_DAYS, DEFAULT_REMINDER_MINUTES, usePhonePrefs } from './phonePrefs';

type NotificationsModule = typeof import('expo-notifications');

export const REMINDER_PREFIX = 'forgeai-reminder-';
const CHANNEL = 'workout-reminders';
/** Worst-case length of the dated bridge for a skipped day (see the header). */
export const BRIDGE_WEEKS = 52;
/** "Your usual days": the last this many weeks. */
export const USUAL_WEEKS = 8;
const META_KEY = 'phoneReminderSchedule';

/** Weekday of a date, 0 = Monday … 6 = Sunday. */
export function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** expo-notifications' weekday (1 = Sunday … 7 = Saturday) for 0 = Monday … 6 = Sunday. PURE. */
export function expoWeekday(mon0: number): number {
  return ((mon0 + 1) % 7) + 1;
}

/** "6:00 pm" for minutes after midnight. */
export function fmtReminderTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

// ---------------------------------------------------------------- the time picker (PH-06)

/** One hour earlier / later, the minutes kept. PURE. */
export function stepReminderHour(minutes: number, dir: 1 | -1): number {
  return (((minutes + dir * 60) % 1440) + 1440) % 1440;
}

/** Five minutes earlier / later, inside the same hour (snapped to the 5-minute grid). PURE. */
export function stepReminderMinute(minutes: number, dir: 1 | -1): number {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const snapped = dir > 0 ? Math.floor(m / 5) * 5 + 5 : Math.ceil(m / 5) * 5 - 5;
  return h * 60 + (((snapped % 60) + 60) % 60);
}

// ---------------------------------------------------------------- your usual days and time

/** A plan of N days a week, spread over the week (0 = Monday). PURE. */
export function planDaysToWeekdays(n: number): number[] {
  const spread: Record<number, number[]> = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return spread[Math.max(1, Math.min(7, Math.round(n)))] ?? [...DEFAULT_REMINDER_DAYS];
}

export interface ReminderSlot {
  days: number[];
  minutes: number;
  from: 'history' | 'plan' | 'default';
}

/**
 * PURE. "Your usual training days and time" from the last 8 weeks: a weekday trained on in at
 * least 2 of those weeks counts; the time is the middle start time of those workouts, on a
 * 5-minute step. Too little history → the plan's days a week, spread out → Mon/Wed/Fri. The
 * time without history is 6:00 pm.
 */
export function usualTrainingSlot(o: {
  sessions: readonly { dateISO: string; startedAt: number }[];
  todayISO: string;
  planDaysPerWeek: number | null;
}): ReminderSlot {
  const floor = addDays(o.todayISO, -(USUAL_WEEKS * 7 - 1));
  const recent = o.sessions.filter((s) => s.dateISO >= floor && s.dateISO <= o.todayISO);
  const weeksByDay = new Map<number, Set<string>>();
  for (const s of recent) {
    const wd = weekdayMon0(fromISO(s.dateISO));
    const set = weeksByDay.get(wd) ?? new Set<string>();
    set.add(weekStartISO(s.dateISO));
    weeksByDay.set(wd, set);
  }
  const days = [...weeksByDay.entries()]
    .filter(([, weeks]) => weeks.size >= 2)
    .map(([d]) => d)
    .sort((a, b) => a - b);
  if (days.length > 0) {
    const want = new Set(days);
    const mins = recent
      .filter((s) => want.has(weekdayMon0(fromISO(s.dateISO))))
      .map((s) => {
        const d = new Date(s.startedAt);
        return d.getHours() * 60 + d.getMinutes();
      })
      .sort((a, b) => a - b);
    const mid = mins.length % 2 === 1 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2;
    const minutes = (Math.round(mid / 5) * 5) % 1440;
    return { days, minutes, from: 'history' };
  }
  if (o.planDaysPerWeek != null && o.planDaysPerWeek > 0) {
    return { days: planDaysToWeekdays(o.planDaysPerWeek), minutes: DEFAULT_REMINDER_MINUTES, from: 'plan' };
  }
  return { days: [...DEFAULT_REMINDER_DAYS], minutes: DEFAULT_REMINDER_MINUTES, from: 'default' };
}

/** Reads the last 8 weeks and the plan, for the first switch-on. Never throws. */
export async function readUsualSlot(): Promise<ReminderSlot> {
  try {
    const t = todayISO();
    const rows = await getDb().getAllAsync<{ date_iso: string; started_at: number }>(
      `SELECT date_iso, started_at FROM workout_sessions WHERE source != 'seed' AND date_iso >= ? AND date_iso <= ?`,
      [addDays(t, -(USUAL_WEEKS * 7 - 1)), t],
    );
    const [plan, folder] = await Promise.all([getActivePlan().catch(() => null), followedFolder().catch(() => null)]);
    const perWeek = plan && plan.days.length > 0 ? planDaysPerWeek(folder?.settings ?? {}, plan.days.length) : null;
    return usualTrainingSlot({ sessions: rows.map((r) => ({ dateISO: r.date_iso, startedAt: r.started_at })), todayISO: t, planDaysPerWeek: perWeek });
  } catch {
    return { days: [...DEFAULT_REMINDER_DAYS], minutes: DEFAULT_REMINDER_MINUTES, from: 'default' };
  }
}

// ---------------------------------------------------------------- what gets scheduled

export type ReminderTrigger =
  | { id: string; kind: 'weekly'; weekday: number; hour: number; minute: number }
  | { id: string; kind: 'date'; at: number };

/**
 * PURE. The alerts to set: a weekly repeat per chosen day; today's weekday bridged with dated
 * alerts on its next `bridgeWeeks` weeks when today must be skipped and its time is still ahead.
 */
export function reminderTriggers(
  o: { days: readonly number[]; minutes: number; now: Date; skipToday: boolean },
  bridgeWeeks = BRIDGE_WEEKS,
): ReminderTrigger[] {
  const hour = Math.floor(o.minutes / 60) % 24;
  const minute = o.minutes % 60;
  const todayWd = weekdayMon0(o.now);
  const todayAt = new Date(o.now.getFullYear(), o.now.getMonth(), o.now.getDate(), hour, minute);
  const bridgeToday = o.skipToday && todayAt.getTime() > o.now.getTime();
  const out: ReminderTrigger[] = [];
  for (const d of [...new Set(o.days)].sort((a, b) => a - b)) {
    if (d === todayWd && bridgeToday) {
      for (let k = 1; k <= bridgeWeeks; k++) {
        const at = new Date(o.now.getFullYear(), o.now.getMonth(), o.now.getDate() + 7 * k, hour, minute).getTime();
        out.push({ id: `${REMINDER_PREFIX}d${d}-${k}`, kind: 'date', at });
      }
    } else {
      out.push({ id: `${REMINDER_PREFIX}w${d}`, kind: 'weekly', weekday: d, hour, minute });
    }
  }
  return out;
}

/**
 * PURE. The next reminder (epoch ms, local clock) — for "Next: Thu 6:00 pm" in Profile. Today
 * counts only if its time is still ahead and today is not skipped.
 */
export function planReminders(
  o: { days: readonly number[]; minutes: number; now: Date; trainedToday: boolean },
  count = 1,
): number[] {
  const out: number[] = [];
  if (o.days.length === 0) return out;
  const want = new Set(o.days);
  const base = new Date(o.now.getFullYear(), o.now.getMonth(), o.now.getDate());
  for (let k = 0; out.length < count && k < 7 * count + 7; k++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + k, Math.floor(o.minutes / 60), o.minutes % 60);
    if (!want.has(weekdayMon0(d))) continue;
    if (k === 0 && (o.trainedToday || d.getTime() <= o.now.getTime())) continue;
    out.push(d.getTime());
  }
  return out;
}

export interface ScheduleStamp {
  /** `Date.getTimezoneOffset()` when the reminders were set. */
  offset: number;
  /** What was set (ids, times, words). */
  key: string;
}

/**
 * PURE (PH-08). Set the reminders again? Yes when the time-zone offset moved (travel, a clock
 * change, summer time), when what should be set differs from what was, or when one of them is
 * no longer with Android.
 */
export function needsReschedule(
  prev: ScheduleStamp | null,
  next: ScheduleStamp,
  scheduledIds: readonly string[],
  expectedIds: readonly string[],
): boolean {
  if (!prev) return true;
  if (prev.offset !== next.offset) return true;
  if (prev.key !== next.key) return true;
  const have = new Set(scheduledIds);
  const want = new Set(expectedIds);
  return expectedIds.some((id) => !have.has(id)) || scheduledIds.some((id) => !want.has(id));
}

/** PURE. The caption under "Workout reminders" (PH-01: never a next time that cannot come). */
export function reminderCaption(o: { on: boolean; blocked: boolean; next: string | null; days: number }): string {
  if (!o.on) return 'A quiet reminder on your usual training days, at your usual time.';
  if (o.blocked) return 'Notifications are off for ForgeAI, so no reminder can arrive.';
  if (o.days === 0) return 'Pick at least one day.';
  if (o.next) return `Next: ${o.next}. None on a day you already trained or while a workout is open.`;
  return 'Set. None on a day you already trained or while a workout is open.';
}

// ---------------------------------------------------------------- the native side

let mod: NotificationsModule | null | undefined;
function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch {
    mod = null;
  }
  return mod;
}

async function scheduledIds(n: NotificationsModule): Promise<string[]> {
  const all = await n.getAllScheduledNotificationsAsync();
  return all.map((r) => r.identifier).filter((id) => id.startsWith(REMINDER_PREFIX));
}

async function readStamp(): Promise<ScheduleStamp | null> {
  try {
    const raw = await getMeta(META_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ScheduleStamp>;
    return typeof v.offset === 'number' && typeof v.key === 'string' ? { offset: v.offset, key: v.key } : null;
  } catch {
    return null;
  }
}

function writeStamp(s: ScheduleStamp | null): Promise<void> {
  return enqueueWrite(() => setMeta(META_KEY, s ? JSON.stringify(s) : '')).catch(() => undefined);
}

/**
 * PH-01: can a reminder reach the member? False when Android blocks ForgeAI's notifications or
 * the "Workout reminders" channel is switched off; null when unknown.
 */
export async function remindersBlocked(): Promise<boolean | null> {
  const n = N();
  if (!n) return null;
  const granted = await notificationsGranted();
  if (granted === false) return true;
  try {
    const ch = await n.getNotificationChannelAsync(CHANNEL);
    if (ch && ch.importance === n.AndroidImportance.NONE) return true;
  } catch {
    // unknown channel state: the permission decides
  }
  return granted == null ? null : false;
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Set the reminders from the member's choice — only when something changed (see
 * `needsReschedule`). Returns the next one (epoch ms) or null. One at a time: a finish and a
 * workout closing ask at once, and two runs must not cancel each other's alerts.
 */
export function refreshReminders(opts: { ask?: boolean; force?: boolean } = {}): Promise<number | null> {
  const run = chain.then(() => refreshRemindersNow(opts));
  chain = run.catch(() => undefined);
  return run;
}

async function refreshRemindersNow(opts: { ask?: boolean; force?: boolean }): Promise<number | null> {
  const n = N();
  if (!n) return null;
  try {
    const p = usePhonePrefs.getState();
    if (!p.remindersOn || p.reminderDays.length === 0) {
      for (const id of await scheduledIds(n)) await n.cancelScheduledNotificationAsync(id);
      await writeStamp(null);
      return null;
    }
    if (opts.ask) await ensureAlertPermission();
    await n.setNotificationChannelAsync(CHANNEL, {
      name: 'Workout reminders',
      description: 'On the days and at the time you chose in Profile',
      importance: n.AndroidImportance.DEFAULT,
      showBadge: false,
    });
    const t = todayISO();
    const now = new Date();
    const [today, tp] = await Promise.all([getSessionsBetween(t, t), getTodayPlan(t).catch(() => null)]);
    const skipToday = today.length > 0 || liveWorkout() != null;
    const triggers = reminderTriggers({ days: p.reminderDays, minutes: p.reminderMinutes, now, skipToday });
    // Audit Phase 3: the one "Today" answer. The rotation only moves when a workout is saved,
    // and every save sets the reminders again, so every repeat can name the next routine.
    const next = tp?.next ? tp.next.name : null;
    const body = next ? `Next up: ${next}` : 'Open ForgeAI to start your workout';
    const stamp: ScheduleStamp = {
      offset: now.getTimezoneOffset(),
      key: JSON.stringify({ triggers, body }),
    };
    const have = await scheduledIds(n);
    const expected = triggers.map((x) => x.id);
    if (opts.force || needsReschedule(await readStamp(), stamp, have, expected)) {
      for (const id of have) await n.cancelScheduledNotificationAsync(id);
      for (const x of triggers) {
        await n.scheduleNotificationAsync({
          identifier: x.id,
          content: {
            title: 'Time to train',
            body,
            data: { kind: 'reminder', route: '/workout' },
            color: '#FF7A3B',
          },
          trigger:
            x.kind === 'weekly'
              ? { type: n.SchedulableTriggerInputTypes.WEEKLY, weekday: expoWeekday(x.weekday), hour: x.hour, minute: x.minute, channelId: CHANNEL }
              : { type: n.SchedulableTriggerInputTypes.DATE, date: x.at, channelId: CHANNEL },
        });
      }
      await writeStamp(stamp);
    }
    return planReminders({ days: p.reminderDays, minutes: p.reminderMinutes, now, trainedToday: skipToday })[0] ?? null;
  } catch {
    return null;
  }
}

/** "Thu 6:00 pm" for Profile. */
export function fmtNextReminder(ms: number, nowISO: string = todayISO()): string {
  const d = new Date(ms);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = iso === nowISO ? 'Today' : iso === addDays(nowISO, 1) ? 'Tomorrow' : fromISO(iso).toLocaleDateString('en-IN', { weekday: 'short' });
  return `${day} ${fmtReminderTime(d.getHours() * 60 + d.getMinutes())}`;
}

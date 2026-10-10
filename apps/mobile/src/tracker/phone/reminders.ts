/**
 * Workout reminders (v0.27.0, tracker plan Phase 5). Off until the member turns them on in
 * Profile and picks the days and the time. A quiet alert at that time on those days: "Time to
 * train" / "Next up: Push Day".
 *
 * Not a weekly repeat: the next 14 reminders are set as single alerts and set again whenever the
 * app opens or a workout is finished, so a day already trained gets no reminder and the name of
 * the next workout stays right. (An app left closed for two weeks stops reminding — calm, and
 * listed in the plan.)
 */
import { Platform } from 'react-native';

import { addDays, fromISO, todayISO } from '@/lib/date';
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { getTodayPlan } from '@/tracker/services/todayService';

import { ensureAlertPermission } from '../services/workoutAlerts';
import { usePhonePrefs } from './phonePrefs';

type NotificationsModule = typeof import('expo-notifications');

export const REMINDER_PREFIX = 'forgeai-reminder-';
const CHANNEL = 'workout-reminders';
export const REMINDER_COUNT = 14;

/** Weekday of a date, 0 = Monday … 6 = Sunday. */
export function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** "6:00 pm" for minutes after midnight. */
export function fmtReminderTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/**
 * PURE. The next reminder times (epoch ms, local clock): on the chosen weekdays at the chosen
 * time, starting today — unless today's time has passed or the member already trained today.
 */
export function planReminders(
  o: { days: readonly number[]; minutes: number; now: Date; trainedToday: boolean },
  count = REMINDER_COUNT,
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

async function clearAll(n: NotificationsModule): Promise<void> {
  const all = await n.getAllScheduledNotificationsAsync();
  for (const r of all) if (r.identifier.startsWith(REMINDER_PREFIX)) await n.cancelScheduledNotificationAsync(r.identifier);
}

/** Set the reminders again from the member's choice. Returns the next one (epoch ms) or null. */
export async function refreshReminders(opts: { ask?: boolean } = {}): Promise<number | null> {
  const n = N();
  if (!n) return null;
  try {
    const p = usePhonePrefs.getState();
    await clearAll(n);
    if (!p.remindersOn) return null;
    if (opts.ask) await ensureAlertPermission();
    await n.setNotificationChannelAsync(CHANNEL, {
      name: 'Workout reminders',
      description: 'On the days and at the time you chose in Profile',
      importance: n.AndroidImportance.DEFAULT,
      showBadge: false,
    });
    const t = todayISO();
    const [today, tp] = await Promise.all([getSessionsBetween(t, t), getTodayPlan(t).catch(() => null)]);
    const times = planReminders({ days: p.reminderDays, minutes: p.reminderMinutes, now: new Date(), trainedToday: today.length > 0 });
    // Audit Phase 3: the one "Today" answer — today's routine, or the next one once it is done.
    const next = tp?.next ? tp.next.name : null;
    for (let i = 0; i < times.length; i++) {
      await n.scheduleNotificationAsync({
        identifier: `${REMINDER_PREFIX}${i}`,
        content: {
          title: 'Time to train',
          // Only the next reminder knows the next workout; later ones stay general.
          body: next && i === 0 ? `Next up: ${next}` : 'Open ForgeAI to start your workout',
          data: { kind: 'reminder', route: '/workout' },
          color: '#FF7A3B',
        },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: times[i], channelId: CHANNEL },
      });
    }
    return times[0] ?? null;
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

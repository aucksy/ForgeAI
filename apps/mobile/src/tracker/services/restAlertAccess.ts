/**
 * Phase 2, packet D — can "Rest is over" reach the member on time? (owner decision D8 = A,
 * RT-01 second half, RT-02).
 *
 * Two Android switches decide it:
 *  - notifications for ForgeAI (Android 13+ asks) — off means no rest card, no "Rest is over",
 *    no watch buzz and no lock-screen card;
 *  - "Alarms & reminders" (exact alarms, Android 12+; OFF by default on Android 14+) — off means
 *    a locked phone may wake for "Rest is over" well after the rest ends.
 *
 * Read here, shown in Profile → Workout ("Rest alerts: …") and asked for ONCE when the first rest
 * starts (RestTimerBar). The pure parts are unit-tested; the reads never throw.
 */
import { Linking } from 'react-native';

import {
  canScheduleExact,
  nativeNotificationsEnabled,
  openExactAlarmSettings,
  openNotificationSettings,
} from './restCard';
import { notificationsGranted } from './workoutAlerts';

export interface AlertAccess {
  /** Notifications on for ForgeAI; null = unknown. */
  notifications: boolean | null;
  /** Exact alarms allowed (always true below Android 12); null = unknown (no native piece). */
  exact: boolean | null;
}

export type RestAlertStatus = 'on-time' | 'may-be-late' | 'off' | 'unknown';

/** PURE. What the Profile line says. */
export function restAlertStatus(a: AlertAccess): RestAlertStatus {
  if (a.notifications === false) return 'off';
  if (a.exact === false) return 'may-be-late';
  if (a.notifications === true && a.exact === true) return 'on-time';
  return 'unknown';
}

/**
 * PURE (D8). Ask "Get rest alerts on time?" only if it was never asked before, notifications are
 * on (with them off, exact timing changes nothing) and exact alarms are off.
 */
export function shouldAskExact(a: AlertAccess, alreadyAsked: boolean): boolean {
  return !alreadyAsked && a.notifications === true && a.exact === false;
}

/** The status line's words. */
export function statusText(s: RestAlertStatus): { title: string; caption: string } {
  switch (s) {
    case 'on-time':
      return { title: 'Rest alerts: On time', caption: 'Your phone and watch buzz when rest is over' };
    case 'may-be-late':
      return { title: 'Rest alerts: May be late — tap to fix', caption: 'Turns on "Alarms & reminders" for ForgeAI' };
    case 'off':
      return { title: 'Rest alerts: Off — notifications are blocked', caption: 'Tap to turn them on' };
    default:
      return { title: 'Rest alerts', caption: '' };
  }
}

/** Read both switches now (cheap; call on screen focus / app resume). */
export async function readAlertAccess(): Promise<AlertAccess> {
  let notifications = nativeNotificationsEnabled();
  if (notifications == null) notifications = await notificationsGranted();
  return { notifications, exact: canScheduleExact() };
}

/** Open the Android page that fixes this status. */
export function openFixFor(s: RestAlertStatus): void {
  if (s === 'may-be-late') {
    if (!openExactAlarmSettings()) void Linking.openSettings().catch(() => undefined);
    return;
  }
  if (s === 'off') {
    if (!openNotificationSettings()) void Linking.openSettings().catch(() => undefined);
  }
}

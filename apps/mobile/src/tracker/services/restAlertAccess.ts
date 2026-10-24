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
  alertChannelState,
  backgroundRestricted,
  canScheduleExact,
  nativeNotificationsEnabled,
  openAlertChannelSettings,
  openAppSettings,
  openExactAlarmSettings,
  openNotificationSettings,
} from './restCard';
import { notificationsGranted } from './workoutAlerts';

export interface AlertAccess {
  /** Notifications on for ForgeAI; null = unknown. */
  notifications: boolean | null;
  /** Exact alarms allowed (always true below Android 12); null = unknown (no native piece). */
  exact: boolean | null;
  /**
   * Rest-alert audit (11 Oct 2026): the "Rest timer" channel as Android has it now — a member or a
   * cleaner app can mute it. Absent / null = unknown (counts as fine).
   */
  channel?: 'ok' | 'silenced' | 'blocked' | null;
  /** Android's background restriction for ForgeAI is on (holds alarms back). Absent = unknown. */
  restricted?: boolean | null;
}

export type RestAlertStatus = 'on-time' | 'may-be-late' | 'off' | 'silenced' | 'held-back' | 'unknown';

/**
 * PURE. What the Profile line says. Since the audit, "Alarms & reminders" is granted at install
 * (USE_EXACT_ALARM), so on a working phone this is 'on-time' and the line is NOT shown at all
 * (owner: defaults that just work, no options to confuse). It appears only when Android has
 * something switched off.
 */
export function restAlertStatus(a: AlertAccess): RestAlertStatus {
  if (a.notifications === false || a.channel === 'blocked') return 'off';
  if (a.channel === 'silenced') return 'silenced';
  if (a.restricted === true) return 'held-back';
  if (a.exact === false) return 'may-be-late';
  if (a.notifications === true && a.exact === true) return 'on-time';
  return 'unknown';
}

/** PURE. The line shows only when something stops the alert. */
export function showAlertStatus(s: RestAlertStatus): boolean {
  return s !== 'on-time' && s !== 'unknown';
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
      return { title: 'Rest alerts: May be late — tap to fix', caption: 'Turns on "Alarms & reminders" for MettleUp' };
    case 'off':
      return { title: 'Rest alerts: Off — notifications are blocked', caption: 'Tap to turn them on' };
    case 'silenced':
      return { title: 'Rest alerts: Silent — tap to fix', caption: 'Android muted "Rest is over" for MettleUp. Turn its sound back on' };
    case 'held-back':
      return { title: 'Rest alerts: May be late — tap to fix', caption: 'Android is holding MettleUp back in the background. Allow it' };
    default:
      return { title: 'Rest alerts', caption: '' };
  }
}

/** Read both switches now (cheap; call on screen focus / app resume). */
export async function readAlertAccess(): Promise<AlertAccess> {
  let notifications = nativeNotificationsEnabled();
  if (notifications == null) notifications = await notificationsGranted();
  return { notifications, exact: canScheduleExact(), channel: alertChannelState(), restricted: backgroundRestricted() };
}

/** Open the Android page that fixes this status. */
export function openFixFor(s: RestAlertStatus): void {
  if (s === 'may-be-late') {
    if (!openExactAlarmSettings()) void Linking.openSettings().catch(() => undefined);
    return;
  }
  if (s === 'silenced') {
    if (!openAlertChannelSettings()) void Linking.openSettings().catch(() => undefined);
    return;
  }
  if (s === 'held-back') {
    if (!openAppSettings()) void Linking.openSettings().catch(() => undefined);
    return;
  }
  if (s === 'off') {
    if (!openNotificationSettings()) void Linking.openSettings().catch(() => undefined);
  }
}

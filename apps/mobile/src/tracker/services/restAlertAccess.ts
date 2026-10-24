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
 * Read here, shown in Settings → Rest timer and sounds ("Rest alerts: …") and asked for when a rest
 * starts (RestTimerBar): the first time, then at most once every 7 days while it stays off. The
 * pure parts are unit-tested; the reads never throw.
 *
 * 0.56.1 (Google Play policy, closed test blocked): the app no longer declares USE_EXACT_ALARM
 * (Play allows it only for alarm-clock and calendar apps). Exact alarms now come only from the
 * member's own "Alarms & reminders" switch (SCHEDULE_EXACT_ALARM), OFF by default for a new install
 * on Android 14+. Without it the rest's alarm is inexact (RestCard.arm: setAndAllowWhileIdle) and
 * still alerts, perhaps late; once allowed, a running rest is re-armed exactly (RestCard.rearm, on
 * the app's return and on Android's permission-changed broadcast, RestBootReceiver).
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
 * PURE. What the Settings line says. On a working phone this is 'on-time' and the line is NOT
 * shown at all (owner: defaults that just work, no options to confuse). It appears only when
 * Android has something switched off: since 0.56.1 that includes "Alarms & reminders" left off
 * (a new install on Android 14+), the line that stays after the member said "Not now".
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

/** 0.56.1: after "Not now" (or Allow with the switch left off), the ask waits this long. */
export const EXACT_ASK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * PURE (D8; 0.56.1 cooldown). Ask about "Alarms & reminders" only when notifications are on (with
 * them off, exact timing changes nothing) and exact alarms are off, and then only if it was never
 * asked or the last ask is at least 7 days old. `lastAskedAt` null = never asked (or asked before
 * 0.56.1, when the app still had exact alarms at install: asked once more). A clock set back
 * before the last ask waits until it passes that time again (never nags).
 */
export function shouldAskExact(a: AlertAccess, lastAskedAt: number | null, now: number): boolean {
  if (a.notifications !== true || a.exact !== false) return false;
  if (lastAskedAt == null || !Number.isFinite(lastAskedAt)) return true;
  return now - lastAskedAt >= EXACT_ASK_COOLDOWN_MS;
}

/** The ask's words (member-words pass, 25 Oct 2026). "Allow" opens Android's "Alarms & reminders" page. */
export const EXACT_ASK = {
  title: 'Hear "Rest is over" on time',
  body: 'Tap "Allow" to open your phone’s settings and turn on "Alarms & reminders". Then "Rest is over" rings on time, even when your phone is locked.',
  allow: 'Allow',
  notNow: 'Not now',
} as const;

/** The status line's words. */
export function statusText(s: RestAlertStatus): { title: string; caption: string } {
  switch (s) {
    case 'on-time':
      return { title: 'Rest alerts: On time', caption: 'Your phone and watch buzz when rest is over' };
    case 'may-be-late':
      return {
        title: 'Rest alerts: May be late — tap to fix',
        caption: 'Tap to turn on "Alarms & reminders" in your phone’s settings, so "Rest is over" rings on time',
      };
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

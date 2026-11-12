/**
 * R-452: the pop-up on the phone when the MettleUp team answered a question ("The MettleUp team answered
 * your question"). Shown only when the phone already allows the app's notifications: it never asks for
 * the permission (owner: never nag). It goes on the "Messages from your gym" channel, like HQ's own
 * "The MettleUp team replied" push (deploy/hq/push.js), and a tap opens Settings → Help and feedback.
 *
 * Android only today: on iPhone every notification of the app is still off (docs/ios/PARITY.yaml,
 * reminders-and-gym-notices). The red dot on the round button works on both.
 * Never throws; every failure logs.
 */
import { Platform } from 'react-native';

import { HELP_HISTORY_WORDS as W } from './helpHistory';

/** Settings → Help and feedback, where every question and its replies are. */
export const HELP_REPLY_ROUTE = '/settings/feedback';
/** One pop-up for the latest news: a newer one replaces it in the shade. */
export const HELP_REPLY_ALERT_ID = 'help-reply-local';

type NotificationsModule = typeof import('expo-notifications');

let mod: NotificationsModule | null | undefined;
function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('[help] no notifications module; no pop-up for a reply', e);
    mod = null;
  }
  return mod;
}

/** Tests only: a stand-in for expo-notifications (null: none). */
export function setHelpAlertNotificationsForTest(n: unknown): void {
  mod = n as NotificationsModule | null;
}

/** The pop-up's words for `count` new replies. PURE. */
export function helpReplyAlertWords(count: number): { title: string; body: string } {
  return { title: W.alertTitle, body: count > 1 ? `${count} new replies. ${W.alertBody}` : W.alertBody };
}

/** Pop up "The MettleUp team answered your question" now, if notifications are allowed. Never throws. */
export async function showHelpReplyAlert(count: number): Promise<void> {
  const n = N();
  if (!n || count < 1) return;
  try {
    const cur = await n.getPermissionsAsync();
    if (!cur.granted) return; // never ask: the red dot still shows
    const { ensureNoticeChannel, GYM_NOTICE_CHANNEL } = await import('@/shop/noticeAlertsRun');
    await ensureNoticeChannel();
    const words = helpReplyAlertWords(count);
    await n.scheduleNotificationAsync({
      identifier: HELP_REPLY_ALERT_ID,
      // kind 'gym-message': shown even with the app open (workoutAlerts.ts handler), no sound over a workout.
      content: { title: words.title, body: words.body, data: { kind: 'gym-message', route: HELP_REPLY_ROUTE, push: 'help_reply' } },
      trigger: { channelId: GYM_NOTICE_CHANNEL },
    });
  } catch (e) {
    console.warn('[help] the reply pop-up was not shown', e);
  }
}

/**
 * Gym notices that pop up on the phone (step 1, no Firebase): the native half. The phone asks the
 * gym for its messages about every 15 minutes in the background (noticeTask.ts) and shows ONE
 * pop-up per new notice; the rules are in noticeAlerts.ts, the words in noticeAlertWords.ts.
 *
 *  - The messages are read with the app's own refreshInbox (gymActions.ts), so the bell is right
 *    when the app opens.
 *  - With the app open in front nothing pops up; the notices are only remembered
 *    (afterInboxRefresh), so the background job never pops them later.
 *  - The first look after joining or after this update remembers every old notice and shows none.
 *  - Off with the "Messages from my gym" switch, in no gym, on demo data, or with Android's
 *    notifications off for the app: nothing pops up. Quiet on every failure.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

import { color } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { refreshInbox } from './gymActions';
import { useGymShop } from './gymStore';
import type { InboxMessage } from './inbox';
import { inboxFor, useGymInbox } from './inboxStore';
import { alertedFromSaved, NOTICE_ROUTE, planNoticeAlerts } from './noticeAlerts';
import { NOTICE_CHANNEL_DESCRIPTION, NOTICE_CHANNEL_NAME, noticePopups, type NoticePopup } from './noticeAlertWords';
import type { GymLink } from './types';

type NotificationsModule = typeof import('expo-notifications');

/** { memberId, ids }: the notices this phone has alerted for the member it is linked as. */
export const GYM_NOTICE_ALERTS_KEY = 'forgeai-gym-notice-alerts';
export const GYM_NOTICE_CHANNEL = 'gym-messages';

let mod: NotificationsModule | null | undefined;
function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('[ForgeErr] gym notices: no notifications module', e);
    mod = null;
  }
  return mod;
}

/** Tests only: a stand-in for expo-notifications (null: none). */
export function setNoticeNotificationsForTest(n: unknown): void {
  mod = n as NotificationsModule | null;
}

/** Tests only: pretend the app is in front (true) or not (false); null = ask Android. */
let frontForTest: boolean | null = null;
export function setNoticeAppInFrontForTest(v: boolean | null): void {
  frontForTest = v;
}
function appInFront(): boolean {
  return frontForTest ?? AppState.currentState === 'active';
}

/** The background job is running: a refresh it starts is its own to judge, not "the app in front". */
let taskBusy = false;

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.catch(() => undefined);
  return run;
}

/** The saved stores, read back (a background start asks before they are). Waits 5 s at most each. */
async function storesReady(): Promise<void> {
  const stores = [useGymShop.persist, usePhonePrefs.persist, useGymInbox.persist];
  await Promise.all(
    stores.map(async (p) => {
      if (p.hasHydrated()) return;
      await new Promise<void>((resolve) => {
        let unsub: () => void = () => undefined;
        const timer = setTimeout(() => {
          unsub();
          resolve();
        }, 5000);
        unsub = p.onFinishHydration(() => {
          clearTimeout(timer);
          unsub();
          resolve();
        });
      });
    }),
  );
}

async function readAlerted(memberId: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(GYM_NOTICE_ALERTS_KEY);
    return alertedFromSaved(raw ? (JSON.parse(raw) as unknown) : null, memberId);
  } catch (e) {
    console.warn('[ForgeErr] gym notices: reading what was alerted', e);
    return null;
  }
}

/** Forget what was alerted (left the gym, erase, the switch went off): the next look is a first look. */
export async function forgetNoticeAlerts(): Promise<void> {
  try {
    await serial(() => AsyncStorage.removeItem(GYM_NOTICE_ALERTS_KEY));
  } catch (e) {
    console.warn('[ForgeErr] gym notices: forgetting what was alerted', e);
  }
}

async function showPopups(popups: readonly NoticePopup[]): Promise<void> {
  const n = N();
  if (!n || popups.length === 0) return;
  const cur = await n.getPermissionsAsync();
  if (!cur.granted) return;
  await n.setNotificationChannelAsync(GYM_NOTICE_CHANNEL, {
    name: NOTICE_CHANNEL_NAME,
    description: NOTICE_CHANNEL_DESCRIPTION,
    importance: n.AndroidImportance.HIGH,
    showBadge: false,
  });
  for (const p of popups) {
    await n.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { kind: 'gym-message', route: NOTICE_ROUTE }, color: color.accent },
      // Right now, on the messages channel.
      trigger: { channelId: GYM_NOTICE_CHANNEL },
    });
  }
}

/** Remember these notices and (not in front) pop up the new ones. */
function take(link: GymLink, messages: readonly InboxMessage[], inFront: boolean): Promise<void> {
  return serial(async () => {
    const plan = planNoticeAlerts({ messages, alerted: await readAlerted(link.memberId), inFront });
    // Kept first: a crash after this can only lose a pop-up, never repeat one.
    await AsyncStorage.setItem(GYM_NOTICE_ALERTS_KEY, JSON.stringify({ memberId: link.memberId, ids: plan.alerted }));
    if (plan.notify.length > 0) await showPopups(noticePopups(link.gymName, plan.notify));
  });
}

/**
 * The app asked the gym for the inbox (gymActions.refreshInbox) with it open in front: remember
 * what is there, pop nothing up. Never throws.
 */
export async function afterInboxRefresh(memberId: string, messages: readonly InboxMessage[]): Promise<void> {
  try {
    if (taskBusy || !appInFront()) return;
    const link = useGymShop.getState().link;
    if (!link || link.memberId !== memberId || !usePhonePrefs.getState().gymMessagesOn) return;
    await take(link, messages, true);
  } catch (e) {
    console.warn('[ForgeErr] gym notices: remembering what the inbox showed', e);
  }
}

/** Demo workouts on the phone: the sample app, not a member's own. A database that will not open counts as not demo. */
async function onDemoData(): Promise<boolean> {
  try {
    const { initDb } = await import('@/db');
    await initDb();
    const { isDemoData } = await import('@/onboarding/db/dataActions');
    return await isDemoData();
  } catch (e) {
    console.warn('[ForgeErr] gym notices: could not tell demo data', e);
    return false;
  }
}

/**
 * The background job's work: ask the gym, keep the inbox, pop up what is new. true = done (also
 * when there was nothing to do), false = the gym could not be reached (the system tries again).
 * Never throws.
 */
export async function runNoticeCheck(): Promise<boolean> {
  taskBusy = true;
  try {
    await storesReady();
    const link = useGymShop.getState().link;
    if (!link || !usePhonePrefs.getState().gymMessagesOn) return true;
    if (await onDemoData()) return true;
    if (await refreshInbox()) return false;
    const now = useGymShop.getState().link;
    if (!now || now.memberKey !== link.memberKey) return true;
    await take(now, inboxFor(useGymInbox.getState(), now.memberId), appInFront());
    return true;
  } catch (e) {
    console.warn('[ForgeErr] gym notices: the check', e);
    return false;
  } finally {
    taskBusy = false;
  }
}

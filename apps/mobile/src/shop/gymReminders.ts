/**
 * Automatic reminders from the gym (R-86) — the native half: ask the gym (member_auto_reminders,
 * 0029, and My membership, 0023), keep the answers on the phone, and set the phone notifications
 * that autoReminders.ts plans. No server push: the phone sets them itself, so they come with no
 * internet and cost nothing.
 *
 *  - Set again whenever the gym is read (launch, return after an hour, the gym tab, a QR check-in,
 *    the offer card), when the member flips "Reminders from my gym", and when the gym's look changes
 *    (a set notification keeps the colour it was set with). Android is only touched when the plan
 *    changed (the stamp below), so this is cheap to call often.
 *  - Cancelled at once when the member leaves the gym, the gym lets the phone go (BAD_KEY), Erase
 *    all data, or the switch goes off.
 *  - A server without 0029: the built-in defaults (the common ones on) and one log line per run;
 *    never an error on screen.
 *  - Never asks for notification permission by itself (only when the member turns the switch on);
 *    Android's own permission and the "Gym reminders" channel decide whether anything shows.
 * One run at a time (a gym check and the membership card can ask together).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { color } from '@/theme/tokens';

import {
  OLD_GYM_REMINDER_PREFIX,
  deliveredOnly,
  GYM_REMINDER_ROUTE,
  autoAnswerFromRow,
  autoAnswerToRow,
  fallbackAnswer,
  planGymReminders,
  type AutoRemindersAnswer,
  type PlannedReminder,
} from './autoReminders';
import { apiAutoReminders, apiMembership } from './gymApi';
import { useGymShop } from './gymStore';
import { keepMembership, readKeptMembership } from './membershipKept';
import { OFFER_KEPT_KEY, offersFromRow, type OffersAnswer } from './offer';

type NotificationsModule = typeof import('expo-notifications');

/** The gym's last answer ({ memberId, answer, at }), the one-offs already set, and what is set now. */
export const GYM_REMINDERS_KEY = 'forgeai-gym-reminders';
export const GYM_REMINDERS_SENT_KEY = 'forgeai-gym-reminders-sent';
export const GYM_REMINDERS_STAMP_KEY = 'forgeai-gym-reminders-stamp';
/** When this phone joined the gym in the app ({ memberId, at }), for the welcome. */
export const GYM_REMINDERS_JOINED_KEY = 'forgeai-gym-reminders-joined';
/** Every key above: Leave the gym and Erase all data remove them all. */
export const GYM_REMINDER_STORAGE_KEYS = [GYM_REMINDERS_KEY, GYM_REMINDERS_SENT_KEY, GYM_REMINDERS_STAMP_KEY, GYM_REMINDERS_JOINED_KEY] as const;

export const GYM_CHANNEL = 'gym-reminders';

let mod: NotificationsModule | null | undefined;
function N(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('[ForgeErr] gym reminders: no notifications module', e);
    mod = null;
  }
  return mod;
}

/** Tests only: a stand-in for expo-notifications (null: none, as on the web). */
export function setGymNotificationsForTest(n: unknown): void {
  mod = n as NotificationsModule | null;
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch (e) {
    console.warn('[ForgeErr] gym reminders: reading', key, e);
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[ForgeErr] gym reminders: keeping', key, e);
  }
}

async function readKeptAnswer(memberId: string): Promise<AutoRemindersAnswer | null> {
  const v = await readJson(GYM_REMINDERS_KEY);
  if (!v || typeof v !== 'object') return null;
  const o = v as { memberId?: unknown; answer?: unknown };
  return o.memberId === memberId ? autoAnswerFromRow(o.answer) : null;
}

async function readKeptOfferAnswer(memberId: string): Promise<OffersAnswer | null> {
  const v = await readJson(OFFER_KEPT_KEY);
  if (!v || typeof v !== 'object') return null;
  const o = v as { memberId?: unknown; answer?: unknown };
  return o.memberId === memberId ? offersFromRow(o.answer) : null;
}

async function readSent(memberId: string): Promise<Record<string, string>> {
  const v = await readJson(GYM_REMINDERS_SENT_KEY);
  if (!v || typeof v !== 'object') return {};
  const o = v as { memberId?: unknown; sent?: unknown };
  if (o.memberId !== memberId || !o.sent || typeof o.sent !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(o.sent as Record<string, unknown>)) if (typeof d === 'string') out[k] = d;
  return out;
}

let toldMissing = false;
/** One line in the log, once per run: the gym's server has no automatic reminders yet. */
function noteMissing(): void {
  if (toldMissing) return;
  toldMissing = true;
  console.log('[Forge] gym reminders: server has no automatic reminders yet (0029); using the defaults');
}

let chain: Promise<unknown> = Promise.resolve();
function serial(fn: () => Promise<void>): Promise<void> {
  const run = chain.then(fn);
  // quiet: the next job only waits for this one; its failure is logged just below.
  chain = run.catch(() => undefined);
  // Never rejects: every caller fires and forgets.
  return run.catch((e: unknown) => console.warn('[ForgeErr] gym reminders', e));
}

/**
 * Ask the gym for its switches and the member's dates, and for the plan (My membership), keep both,
 * then set the reminders. Quiet: a failure keeps what the phone had.
 */
export function syncGymReminders(): Promise<void> {
  return serial(async () => {
    const link = useGymShop.getState().link;
    if (!link) return cancelNow();
    const [auto, plan] = await Promise.all([apiAutoReminders(link.memberKey), apiMembership(link.memberKey)]);
    // The member left (or joined another gym) meanwhile: drop both answers.
    if (useGymShop.getState().link?.memberKey !== link.memberKey) return;
    if (auto.ok) await writeJson(GYM_REMINDERS_KEY, { memberId: link.memberId, answer: autoAnswerToRow(auto.data), at: Date.now() });
    else if ('missing' in auto) noteMissing();
    else if (auto.error.kind !== 'offline' && auto.error.kind !== 'timeout') console.warn('[ForgeErr] gym reminders: asking the gym', auto.error);
    if (plan.ok) await keepMembership(link.memberId, plan.data);
    else if (!('missing' in plan) && plan.error.kind !== 'offline' && plan.error.kind !== 'timeout') console.warn('[ForgeErr] gym reminders: the plan', plan.error);
    await scheduleNow();
  });
}

/** Set the reminders again from what the phone keeps (no call to the gym). */
export function refreshGymReminders(): Promise<void> {
  return serial(scheduleNow);
}

/** Every gym reminder off (left the gym, erase, switched off). Keeps nothing set. */
export function cancelGymReminders(): Promise<void> {
  return serial(cancelNow);
}

/**
 * Every gym reminder Android holds. The old prefix (review NIT 9: 'forgeai-gym-<day>') starts the
 * new one too, so a phone that had the first build's ids sees them here and they are cancelled.
 */
async function scheduledIds(n: NotificationsModule): Promise<string[]> {
  const all = await n.getAllScheduledNotificationsAsync();
  return all.map((r) => r.identifier).filter((id) => id.startsWith(OLD_GYM_REMINDER_PREFIX));
}

async function cancelNow(): Promise<void> {
  const n = N();
  if (n) for (const id of await scheduledIds(n)) await n.cancelScheduledNotificationAsync(id);
  try {
    await AsyncStorage.removeItem(GYM_REMINDERS_STAMP_KEY);
  } catch (e) {
    console.warn('[ForgeErr] gym reminders: forgetting the stamp', e);
  }
  // Review NIT 4: a one-off set for a morning still ahead never came; it may come later.
  const v = await readJson(GYM_REMINDERS_SENT_KEY);
  if (v && typeof v === 'object') {
    const o = v as { memberId?: unknown; sent?: unknown };
    if (typeof o.memberId === 'string' && o.sent && typeof o.sent === 'object') {
      await writeJson(GYM_REMINDERS_SENT_KEY, { memberId: o.memberId, sent: deliveredOnly(await readSent(o.memberId), new Date()) });
    }
  }
}

/**
 * The phone joined a gym in the app just now (joinGym): kept so a member new to the app gets the
 * welcome (review SHOULD 1). A phone that joined before R-86 has no record: no app welcome.
 */
export async function noteAppJoin(memberId: string): Promise<void> {
  await writeJson(GYM_REMINDERS_JOINED_KEY, { memberId, at: Date.now() });
}

async function readAppJoinedAt(memberId: string): Promise<number | null> {
  const v = await readJson(GYM_REMINDERS_JOINED_KEY);
  if (!v || typeof v !== 'object') return null;
  const o = v as { memberId?: unknown; at?: unknown };
  return o.memberId === memberId && typeof o.at === 'number' ? o.at : null;
}

/** What is set, as a string: changed words, times or colour mean set them again. PURE. */
export function gymStampKey(reminders: readonly PlannedReminder[], accent: string): string {
  return JSON.stringify({ r: reminders.map((x) => [x.id, x.at, x.title, x.body]), accent, offset: new Date().getTimezoneOffset() });
}

async function scheduleNow(): Promise<void> {
  const link = useGymShop.getState().link;
  if (!link || !usePhonePrefs.getState().gymRemindersOn) return cancelNow();
  const n = N();
  if (!n) return;
  const [kept, plan, offer, sentBefore, appJoinedAt] = await Promise.all([
    readKeptAnswer(link.memberId),
    readKeptMembership(link.memberId),
    readKeptOfferAnswer(link.memberId),
    readSent(link.memberId),
    readAppJoinedAt(link.memberId),
  ]);
  const answer = kept ?? fallbackAnswer();
  const out = planGymReminders({
    now: new Date(),
    memberId: link.memberId,
    gymName: link.gymName,
    settings: answer.settings,
    membership: plan?.answer ?? null,
    dates: answer.dates,
    offer,
    sent: sentBefore,
    appJoinedAt,
  });
  const stamp = gymStampKey(out.reminders, color.accent);
  const have = await scheduledIds(n);
  const want = out.reminders.map((r) => r.id);
  const same = (await readJson(GYM_REMINDERS_STAMP_KEY)) === stamp && have.length === want.length && want.every((id) => have.includes(id));
  if (!same) {
    await n.setNotificationChannelAsync(GYM_CHANNEL, {
      name: 'Gym reminders',
      description: 'Plan ending, birthday wishes and other reminders from your gym',
      importance: n.AndroidImportance.DEFAULT,
      showBadge: false,
    });
    for (const id of have) await n.cancelScheduledNotificationAsync(id);
    for (const r of out.reminders) {
      await n.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { kind: 'gym', route: GYM_REMINDER_ROUTE, case: r.kase }, color: color.accent },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: GYM_CHANNEL },
      });
    }
    await writeJson(GYM_REMINDERS_STAMP_KEY, stamp);
  }
  await writeJson(GYM_REMINDERS_SENT_KEY, { memberId: link.memberId, sent: out.sent });
}

/** Leave the gym / BAD_KEY: everything off and forgotten. Never rejects. */
export function forgetGymReminders(): Promise<void> {
  // Review NIT 8: in the same queue, so a refresh waiting behind it cannot set them again from
  // what was kept before the keys went.
  return serial(async () => {
    await cancelNow();
    for (const k of GYM_REMINDER_STORAGE_KEYS) {
      try {
        await AsyncStorage.removeItem(k);
      } catch (e) {
        console.warn('[ForgeErr] gym reminders: forgetting', k, e);
      }
    }
  });
}

/**
 * R-533 (owner, 14 Nov 2026): "when I responded back from the admin panel, there was no notification... and there was
 * no dot or something in that section saying that there's something to be checked." The phone half of "the gym
 * replied" for "Ask about your workout" (0053). Never throws; a failure is one quiet '[ask] ...' log line.
 *
 *  - The red count (replies not opened yet) lives in useAskReplies (askReplyStore.ts). It badges the Gym tab
 *    (TrackerTabBar) and the row (AskTrainerRow). Asked when the app starts and comes back to the front (at most every
 *    5 minutes), when the Gym tab opens (the row reads the questions anyway), and at once when a reply's push arrives
 *    (noticeAlertsRun.onPushArrived). Opening the page clears it (saveAskSeen).
 *  - "Opened" = the newest reply time the page has shown on this phone (the same saved key the row always used).
 *  - The 15-minute check (noticeAlertsRun.runNoticeCheck) also looks for a reply the push missed and pops it up
 *    once (checkReplyAlerts): before this, a reply had NO second way, while gym messages always had that check.
 *  - A member who may not see the row (a pass member, no plan: askTrainer.askAccess "hidden") gets no count.
 * Light on purpose: no trainerSync import (the background job loads this).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { askUnreadCount, planReplyAlerts, REPLY_ALERTED_CAP, replyAlertedFrom, type AskQuestion } from './askTrainer';
import { setAskUnread, useAskReplies } from './askReplyStore';
import { apiAskQuestions } from './gymApi';
import { useGymShop } from './gymStore';
import type { GymLink } from './types';

export { askUnreadFor, useAskReplies } from './askReplyStore';

/** { memberId, at }: the newest reply time (ms) the page has shown (the key AskTrainerScreen always saved). */
export const ASK_SEEN_KEY = 'forgeai.askTrainer.seenReplies';
/** { memberId, ids }: the replies this phone popped up or heard as a push. */
export const ASK_ALERTED_KEY = 'forgeai.askTrainer.alertedReplies';

/** How often the count may be asked without a reason (ms). */
const UNREAD_EVERY_MS = 5 * 60 * 1000;

let missing = false;
let lastAsked = 0;

/** The newest reply time (ms) this phone has shown, per member; 0 when none. Never throws. */
export async function readAskSeen(memberId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(ASK_SEEN_KEY);
    const o = raw ? (JSON.parse(raw) as { memberId?: unknown; at?: unknown }) : null;
    return o && o.memberId === memberId && typeof o.at === 'number' ? o.at : 0;
  } catch (e) {
    console.warn('[ask] could not read what was seen', e);
    return 0;
  }
}

/** The page showed these questions: every reply in them is read, so the red count goes. Never throws. */
export async function saveAskSeen(memberId: string, list: readonly AskQuestion[]): Promise<void> {
  if (useAskReplies.getState().memberId === memberId) setAskUnread(memberId, 0);
  const at = Math.max(0, ...list.map((q) => q.answeredAt ?? 0));
  if (at <= 0) return;
  // Never backwards (an older copy of the list read later must not bring the count back).
  if (at <= (await readAskSeen(memberId))) return;
  await AsyncStorage.setItem(ASK_SEEN_KEY, JSON.stringify({ memberId, at })).catch((e: unknown) => console.warn('[ask] could not save what was seen', e));
}

/** The row read the questions (no second call): keep the count it shows. `shown` false = no row for this member. */
export function keepAskUnread(memberId: string, list: readonly AskQuestion[] | null, seenUpTo: number, shown: boolean): void {
  if (!shown) {
    setAskUnread(memberId, 0);
    return;
  }
  if (list) setAskUnread(memberId, askUnreadCount(list, seenUpTo));
}

async function readQuestions(link: GymLink): Promise<AskQuestion[] | null> {
  if (missing) return null;
  try {
    const r = await apiAskQuestions(link.memberKey);
    if (r.ok) return r.data;
    if ('missing' in r) {
      missing = true;
      return null;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ask] could not read the replies', r.error.kind, r.message ?? '');
    return null;
  } catch (e) {
    console.warn('[ask] reading the replies failed', e);
    return null;
  }
}

/** The red count to keep: unread replies, or 0 for a member who may not see the row (R-505 "hidden"). */
async function countFor(link: GymLink, list: readonly AskQuestion[], seen: number): Promise<number> {
  const n = askUnreadCount(list, seen);
  if (n === 0) return 0;
  // Only when there is something to show: may this member see the row at all?
  const { readAskAccess } = await import('./askAccessRead');
  const access = await readAskAccess(link);
  return access?.kind === 'hidden' ? 0 : n;
}

/**
 * Ask the server for the member's questions and keep the red count. `force`: now (a reply's push); otherwise at most
 * every 5 minutes. Offline: the count stays as it was. Never throws.
 */
export async function refreshAskUnread(link: GymLink | null, opts: { force?: boolean } = {}): Promise<void> {
  try {
    if (!link) {
      setAskUnread(null, 0);
      return;
    }
    const now = Date.now();
    if (!opts.force && now - lastAsked < UNREAD_EVERY_MS && useAskReplies.getState().memberId === link.memberId) return;
    lastAsked = now;
    const [list, seen] = await Promise.all([readQuestions(link), readAskSeen(link.memberId)]);
    if (!list) return;
    setAskUnread(link.memberId, await countFor(link, list, seen));
  } catch (e) {
    console.warn('[ask] refreshing the count failed', e);
  }
}

/** App start and back to the front (app/_layout.tsx): waits up to 5 s for the saved gym link. Never throws. */
export async function refreshAskForPhone(): Promise<void> {
  try {
    const s = useGymShop;
    if (!s.persist.hasHydrated()) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 5000);
        const unsub = s.persist.onFinishHydration(() => {
          clearTimeout(timer);
          unsub();
          resolve();
        });
      });
    }
    await refreshAskUnread(s.getState().link);
  } catch (e) {
    console.warn('[ask] refreshing the count failed', e);
  }
}

async function readAlerted(memberId: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(ASK_ALERTED_KEY);
    return replyAlertedFrom(raw ? (JSON.parse(raw) as unknown) : null, memberId);
  } catch (e) {
    console.warn('[ask] could not read the replies popped up', e);
    return null;
  }
}

async function saveAlerted(memberId: string, ids: readonly string[]): Promise<void> {
  await AsyncStorage.setItem(ASK_ALERTED_KEY, JSON.stringify({ memberId, ids })).catch((e: unknown) => console.warn('[ask] could not save the pop-ups', e));
}

/** A reply's push arrived: remember it, so the 15-minute check never pops it up a second time. Never throws. */
export async function rememberReplyAlerted(memberId: string, questionId: string): Promise<void> {
  try {
    const ids = (await readAlerted(memberId)) ?? [];
    if (!ids.includes(questionId)) await saveAlerted(memberId, [...ids, questionId].slice(-REPLY_ALERTED_CAP));
  } catch (e) {
    console.warn('[ask] remembering a pushed reply failed', e);
  }
}

/**
 * The 15-minute check: the replies to pop up now (the push missed them), already remembered as popped up (a crash
 * after this can only lose a pop-up, never repeat one). Also keeps the red count. [] when none or offline.
 */
export async function checkReplyAlerts(link: GymLink, inFront: boolean): Promise<AskQuestion[]> {
  try {
    const [list, seen] = await Promise.all([readQuestions(link), readAskSeen(link.memberId)]);
    if (!list) return [];
    setAskUnread(link.memberId, await countFor(link, list, seen));
    const plan = planReplyAlerts({ list, alerted: await readAlerted(link.memberId), seenUpTo: seen, inFront });
    await saveAlerted(link.memberId, plan.alerted);
    return plan.notify;
  } catch (e) {
    console.warn('[ask] checking for replies failed', e);
    return [];
  }
}

/** Tests only. */
export function resetAskRepliesForTests(): void {
  missing = false;
  lastAsked = 0;
  useAskReplies.setState({ memberId: null, unread: 0 });
}

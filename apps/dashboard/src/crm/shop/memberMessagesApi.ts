/**
 * "Member messages" (owner request, 12 Nov 2026): the calls to the gym server
 * (supabase/migrations/0069_member_messages.sql). Every call carries the owner's or the desk's key; the server
 * shows each person only what they may see (the owner: everything; the desk and trainers: no complaints).
 *
 * Until 0069 is on the server, the first call answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, and the menu item and the page stay hidden with no error (as
 * questionsApi.ts does for 0053). Any other failure is not remembered. The demo gym never calls.
 */

import { demoWithoutServer } from '../../lib/demoLock';
import { talkCountFrom, talkListFrom, talkThreadAnswerFrom, type TalkList, type TalkThread } from '../logic/memberMessages';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

let missing = false;

function markMissing(): void {
  if (missing) return;
  missing = true;
  console.info('[member messages] this gym server has no "Member messages" yet (0069 not applied); the page stays hidden');
}

/** True once the server said it has no 0069 (or in the demo gym). */
export function memberMessagesMissing(): boolean {
  return missing || demoWithoutServer();
}

async function guarded<T>(fn: () => Promise<T>): Promise<T | 'missing'> {
  if (memberMessagesMissing()) return 'missing';
  try {
    return await fn();
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markMissing();
      return 'missing';
    }
    throw e;
  }
}

/** Conversations waiting for a reply, for the menu badge. 'missing': no 0069. */
export function getTalkCount(key: string): Promise<number | 'missing'> {
  return guarded(async () => {
    const n = talkCountFrom(await call<unknown>('owner_talk_count', { p_key: key }));
    if (n == null) throw new Error('unreadable answer');
    return n;
  });
}

/** Every conversation this key may read (last 90 days). Opening the list tells members "Seen by your gym". */
export function getTalkList(key: string): Promise<TalkList | 'missing'> {
  return guarded(async () => {
    const r = talkListFrom(await call<unknown>('owner_talk_list', { p_key: key }));
    if (!r) throw new Error('unreadable answer');
    return r;
  });
}

/** Send a reply. Throws NOT_FOUND / THREAD_FULL / INVALID / SUSPENDED as they came. */
export async function replyTalk(key: string, threadId: string, text: string): Promise<TalkThread> {
  const t = talkThreadAnswerFrom(await call<unknown>('owner_talk_reply', { p_key: key, p_thread: threadId, p_text: text }));
  if (!t) throw new Error('unreadable answer');
  return t;
}

/** Mark as done, or open again. Throws NOT_FOUND / SUSPENDED as they came. */
export async function setTalkDone(key: string, threadId: string, done: boolean): Promise<TalkThread> {
  const t = talkThreadAnswerFrom(await call<unknown>('owner_talk_done', { p_key: key, p_thread: threadId, p_done: done }));
  if (!t) throw new Error('unreadable answer');
  return t;
}

/** Tests only: back to a fresh page. */
export function resetMemberMessagesApiForTest(): void {
  missing = false;
}

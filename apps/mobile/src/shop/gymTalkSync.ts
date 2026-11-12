/**
 * "Message your gym" on this phone (0069; words and rules in gymTalk.ts). Never throws; a failure is one quiet
 * '[talk] ...' log line.
 *  - The red count (threads with a gym reply not read yet) lives in useGymTalk: asked when the Gym tab opens, when
 *    the app starts and when it comes back to the front (at most every 5 minutes; the Gym tab and a pull ask at
 *    once). It badges the Gym tab (TrackerTabBar) and the "Message your gym" row.
 *  - A server without 0069 (not live until the owner says yes): remembered for this run, and the row, the page and
 *    the count stay hidden. QA builds with the 'gymTalk' stand-in (qa-device.yml) then use the pretend gym in
 *    gymTalk.ts instead, and the page says so on screen.
 */
import Constants from 'expo-constants';

import { apiTalkList, apiTalkReply, apiTalkSend, apiTalkUnread } from './gymApi';
import { PretendRefusal, createPretendTalk, hasTalkStandIn, talkErrorWords, type TalkKind, type TalkThread } from './gymTalk';
import { useGymShop } from './gymStore';
import { useGymTalk } from './gymTalkStore';
import type { GymLink } from './types';

export { talkUnreadFor, useGymTalk } from './gymTalkStore';

/** How often the count may be asked without a reason (ms). */
const UNREAD_EVERY_MS = 5 * 60 * 1000;

let missing = false;
let lastAsked = 0;
const standInBuild = hasTalkStandIn(Constants.expoConfig?.extra);
let pretend: ReturnType<typeof createPretendTalk> | null = null;

function pretendGym(): ReturnType<typeof createPretendTalk> | null {
  if (!missing || !standInBuild) return null;
  pretend ??= createPretendTalk(() => Date.now());
  return pretend;
}

function setCount(memberId: string, unread: number, mode: 'live' | 'standIn'): void {
  const s = useGymTalk.getState();
  if (s.memberId !== memberId || s.unread !== unread || s.mode !== mode) useGymTalk.setState({ memberId, unread, mode });
}

function markMissing(): void {
  if (!missing) console.log('[talk] the gym server has no "Message your gym" yet (0069 not live)');
  missing = true;
}

/**
 * Ask the server how many threads have an unread reply, and keep it for the badges. `force`: ask now (the Gym tab,
 * a pull); otherwise at most every 5 minutes. Returns the mode, or null when hidden. Never throws.
 */
export async function refreshTalkUnread(link: GymLink | null, opts: { force?: boolean } = {}): Promise<'live' | 'standIn' | null> {
  if (!link) {
    if (useGymTalk.getState().mode) useGymTalk.setState({ memberId: null, unread: 0, mode: null });
    return null;
  }
  const p = pretendGym();
  if (p) {
    setCount(link.memberId, p.unread(), 'standIn');
    return 'standIn';
  }
  if (missing) return null;
  const now = Date.now();
  if (!opts.force && now - lastAsked < UNREAD_EVERY_MS && useGymTalk.getState().memberId === link.memberId) return useGymTalk.getState().mode;
  lastAsked = now;
  try {
    const r = await apiTalkUnread(link.memberKey);
    if (r.ok) {
      setCount(link.memberId, r.data, 'live');
      return 'live';
    }
    if ('missing' in r) {
      markMissing();
      const q = pretendGym();
      if (q) {
        setCount(link.memberId, q.unread(), 'standIn');
        return 'standIn';
      }
      return null;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[talk] could not read the count', r.error.kind, r.message ?? '');
    // Offline: keep what was shown.
    return useGymTalk.getState().memberId === link.memberId ? useGymTalk.getState().mode : null;
  } catch (e) {
    console.warn('[talk] reading the count failed', e);
    return null;
  }
}

/**
 * App start and back to the front (app/_layout.tsx): the red count for this phone's gym member, at most every 5
 * minutes. Waits up to 5 s for the saved gym link to load. Never throws.
 */
export async function refreshTalkForPhone(): Promise<void> {
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
    await refreshTalkUnread(s.getState().link);
  } catch (e) {
    console.warn('[talk] refreshing the count failed', e);
  }
}

/** The member's threads (newest first); null when unknown (offline) or hidden. Reading marks the replies read. */
export async function readTalkThreads(link: GymLink): Promise<TalkThread[] | null> {
  const p = pretendGym();
  if (p) {
    const list = p.list();
    setCount(link.memberId, 0, 'standIn');
    return list;
  }
  if (missing) return null;
  try {
    const r = await apiTalkList(link.memberKey);
    if (r.ok) {
      setCount(link.memberId, 0, 'live');
      return r.data;
    }
    if ('missing' in r) {
      markMissing();
      return pretendGym() ? readTalkThreads(link) : null;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[talk] could not read the messages', r.error.kind, r.message ?? '');
    return null;
  } catch (e) {
    console.warn('[talk] reading the messages failed', e);
    return null;
  }
}

/** Is the page shown on the pretend gym (QA builds only)? */
export function talkIsStandIn(): boolean {
  return pretendGym() != null;
}

/** The server said it has no 0069 (and this is not a QA stand-in build): the page says "not ready". */
export function talkKnownMissing(): boolean {
  return missing && !standInBuild;
}

export type TalkSend = { ok: true; thread: TalkThread } | { ok: false; words: string };

function pretendCall(fn: () => TalkThread): TalkSend {
  try {
    return { ok: true, thread: fn() };
  } catch (e) {
    return { ok: false, words: talkErrorWords(e instanceof PretendRefusal ? e.message : undefined) };
  }
}

/** Start a thread. Never throws. */
export async function sendTalk(link: GymLink, kind: TalkKind, anonymous: boolean, text: string): Promise<TalkSend> {
  const p = pretendGym();
  if (p) return pretendCall(() => p.send(kind, anonymous, text));
  try {
    const r = await apiTalkSend(link.memberKey, kind, anonymous, text);
    if (r.ok) return { ok: true, thread: r.data };
    if ('missing' in r) return { ok: false, words: talkErrorWords(undefined) };
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[talk] the message was not accepted', r.error.kind, r.message ?? '');
    return { ok: false, words: talkErrorWords(r.message) };
  } catch (e) {
    console.warn('[talk] sending failed', e);
    return { ok: false, words: talkErrorWords(undefined) };
  }
}

/** Write back in a thread. Never throws. */
export async function replyTalk(link: GymLink, threadId: string, text: string): Promise<TalkSend> {
  const p = pretendGym();
  if (p) return pretendCall(() => p.reply(threadId, text));
  try {
    const r = await apiTalkReply(link.memberKey, threadId, text);
    if (r.ok) return { ok: true, thread: r.data };
    if ('missing' in r) return { ok: false, words: talkErrorWords(undefined) };
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[talk] the reply was not accepted', r.error.kind, r.message ?? '');
    return { ok: false, words: talkErrorWords(r.message) };
  } catch (e) {
    console.warn('[talk] replying failed', e);
    return { ok: false, words: talkErrorWords(undefined) };
  }
}

/** Tests only. */
export function resetGymTalkForTests(): void {
  missing = false;
  lastAsked = 0;
  pretend = null;
  useGymTalk.setState({ memberId: null, unread: 0, mode: null });
}

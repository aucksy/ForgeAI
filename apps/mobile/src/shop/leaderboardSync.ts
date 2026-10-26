/**
 * The gym leaderboard on this phone (R-133): the real wiring of leaderboardPush.ts (when to send)
 * and the reading for the Gym tab's card. Nothing here is saved on the phone (so nothing for the
 * backup to carry): the last answer is only kept in memory, so the card is back at once when the
 * tab opens again. Never throws; a failure is one quiet '[board] …' log line.
 *
 * A server without 0037 (leaderboard not live): the push stops for this run and the card stays
 * hidden: no words, no error.
 */
import { todayISO } from '@/lib/date';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { apiBoard, apiBoardPush } from './gymApi';
import { boardDays, boardFromDay, type Board } from './leaderboard';
import { createBoardPusher, type PushOutcome, type PushTrigger, type SendResult } from './leaderboardPush';
import { useGymShop } from './gymStore';
import type { GymLink } from './types';

/** The saved gym link, read once the phone has read it back (an app start asks before that). */
async function readyLink(): Promise<GymLink | null> {
  if (!useGymShop.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      let unsub: () => void = () => undefined;
      const timer = setTimeout(() => {
        unsub();
        resolve();
      }, 5000);
      unsub = useGymShop.persist.onFinishHydration(() => {
        clearTimeout(timer);
        unsub();
        resolve();
      });
    });
  }
  return useGymShop.getState().link;
}

const pusher = createBoardPusher({
  now: () => Date.now(),
  memberKey: async () => (await readyLink())?.memberKey ?? null,
  isDemo: async () => {
    const { isDemoData } = await import('@/onboarding/db/dataActions');
    return isDemoData().catch(() => true);
  },
  days: async () => {
    const { getSessionTotalsBetween } = await import('@/tracker/services/volumeService');
    const today = todayISO();
    const totals = await getSessionTotalsBetween(boardFromDay(today), today);
    return boardDays(totals, today);
  },
  showName: () => usePhonePrefs.getState().showNameOnBoard,
  namePending: () => usePhonePrefs.getState().boardNamePending,
  clearNamePending: () => usePhonePrefs.getState().setBoardNamePending(false),
  send: async (key, days, showName): Promise<SendResult> => {
    const r = await apiBoardPush(key, days, showName);
    if (r.ok) return 'ok';
    if ('missing' in r) return 'missing';
    // Offline and a slow signal are ordinary at a gym: no log line for them.
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[board] push was not accepted', r.error.kind);
    return 'failed';
  },
  log: (message, detail) => console.warn(message, detail ?? ''),
});

/** Send the day totals if the rules say so (leaderboardPush.ts). Never throws. */
export function pushBoard(trigger: PushTrigger): Promise<PushOutcome> {
  return pusher.push(trigger);
}

/** After a workout is saved (phoneSync.ts). Not awaited by the save. */
export function pushBoardAfterWorkout(): void {
  void pushBoard('workout');
}

// ------------------------------------------------------------------ reading the board

export type BoardRead = { kind: 'board'; board: Board } | { kind: 'hidden' } | { kind: 'keep' };

let boardMissing = false;
let boardLive = false;
let kept: { key: string; board: Board } | null = null;
const liveListeners = new Set<() => void>();

function setLive(v: boolean): void {
  if (boardLive === v) return;
  boardLive = v;
  for (const fn of [...liveListeners]) fn();
}

/**
 * True once the gym's server has answered `member_board` at least once in this app session; false
 * while it has no leaderboard (0037 not live) or has not been asked. Settings shows "What my gym can
 * see" only while this is true.
 */
export function boardIsLive(): boolean {
  return boardLive;
}

/** Tell me when boardIsLive() changes (useBoardLive.ts). Returns the way to stop. */
export function onBoardLiveChange(fn: () => void): () => void {
  liveListeners.add(fn);
  return () => {
    liveListeners.delete(fn);
  };
}

/** The last answer for this gym link, from memory; null when none came yet. */
export function peekBoard(link: GymLink | null): Board | null {
  return link && kept?.key === link.memberKey ? kept.board : null;
}

/**
 * Ask the gym for the board. `hidden`: no card (only when the server has no leaderboard yet);
 * `keep`: no answer this time (offline, a server error, an answer that is not one): the card stays
 * as it is, and with no answer held there is simply nothing to show.
 */
export async function readBoard(link: GymLink): Promise<BoardRead> {
  if (boardMissing) return { kind: 'hidden' };
  try {
    const r = await apiBoard(link.memberKey);
    if (r.ok) {
      kept = { key: link.memberKey, board: r.data };
      setLive(true);
      return { kind: 'board', board: r.data };
    }
    if ('missing' in r) {
      boardMissing = true;
      console.log('[board] the gym server has no leaderboard yet');
      kept = null;
      setLive(false);
      return { kind: 'hidden' };
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[board] could not read the board', r.error.kind);
    return { kind: 'keep' };
  } catch (e) {
    console.warn('[board] reading the board failed', e);
    return { kind: 'keep' };
  }
}

/**
 * Settings opened before the Gym tab: ask so the row can appear. Nothing when the server has
 * answered already, or is known to have no leaderboard (an offline try is made again next time).
 */
export async function ensureBoardRead(link: GymLink): Promise<void> {
  if (boardLive || boardMissing) return;
  await readBoard(link);
}

/** Tests only. */
export function resetBoardSyncForTests(): void {
  boardMissing = false;
  boardLive = false;
  kept = null;
  liveListeners.clear();
}

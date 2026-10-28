/**
 * Gym mate profiles on this phone (R-164): the real wiring of mateShare.ts (when to share) and the
 * two reads (which leaderboard names open a profile, and the profile itself). Nothing here is saved
 * on the phone; never throws; a failure is one quiet '[mates] …' log line.
 *
 * A server without 0040 (not live yet): sharing stops for this run, no name is tappable and the
 * Settings switch is not shown. No words, no error.
 */
import { todayISO, addDays } from '@/lib/date';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { apiMateBoard, apiMateProfile, apiMateShare, apiMateStop, type MateCall } from './gymApi';
import { useGymShop } from './gymStore';
import { MATE_DAYS, MATE_MAX_WORKOUTS, mateShareFrom, type MateBoard, type MateProfile } from './mateProfile';
import { createMateSharer, type MateOutcome, type MateSendResult, type MateTrigger } from './mateShare';
import type { GymLink } from './types';

const asSend = (r: MateCall<true>): MateSendResult => {
  if (r.ok) return 'ok';
  if ('missing' in r) return 'missing';
  if ('error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[mates] the gym did not accept it', r.error.kind);
  return 'failed';
};

const sharer = createMateSharer({
  now: () => Date.now(),
  memberKey: async () => {
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
    return s.getState().link?.memberKey ?? null;
  },
  isDemo: async () => {
    const { isDemoData } = await import('@/onboarding/db/dataActions');
    return isDemoData().catch(() => true);
  },
  shareOn: () => usePhonePrefs.getState().shareWorkoutsWithGym,
  pending: () => usePhonePrefs.getState().mateSharePending,
  clearPending: () => usePhonePrefs.getState().setMateSharePending(false),
  build: async () => {
    const today = todayISO();
    const [{ getHistoryPage }, { getSessionTotalsBetween }, { getProfileExtras }, { getTrackerExercisesByIds }, { sessionTitle }] = await Promise.all([
      import('@/tracker/services/historyFeed'),
      import('@/tracker/services/volumeService'),
      import('@/tracker/db/profileExtras'),
      import('@/tracker/db/exerciseInfo'),
      import('@/tracker/services/finishSummary'),
    ]);
    const [page, totals, extras] = await Promise.all([
      getHistoryPage({ limit: MATE_MAX_WORKOUTS }),
      getSessionTotalsBetween(addDays(today, -(MATE_DAYS - 1)), today),
      getProfileExtras().catch(() => ({ bio: null as string | null })),
    ]);
    const ids = [...new Set(page.items.flatMap((i) => i.exercises.map((g) => g.exercise.id)))];
    const infos = await getTrackerExercisesByIds(ids).catch(() => new Map<string, { catalogKey?: string | null }>());
    const keys = new Map<string, string | null>();
    for (const [id, x] of infos) keys.set(id, x.catalogKey ?? null);
    const workouts = page.items.map((i) => ({ id: i.id, dateISO: i.dateISO, title: sessionTitle(i), exercises: i.exercises }));
    return mateShareFrom(extras.bio ?? null, workouts, totals, keys, today);
  },
  send: async (key, share) => asSend(await apiMateShare(key, share)),
  stop: async (key) => asSend(await apiMateStop(key)),
  log: (message, detail) => console.warn(message, detail ?? ''),
});

/** Share (or take back) the workouts if the rules say so (mateShare.ts). Never throws. */
export function shareWithMates(trigger: MateTrigger): Promise<MateOutcome> {
  return sharer.share(trigger).catch((e: unknown) => {
    console.warn('[mates] share could not run', e);
    return 'failed' as const;
  });
}

// ------------------------------------------------------------------ reading

let missing = false;
let live = false;
const listeners = new Set<() => void>();

function setLive(v: boolean): void {
  if (live === v) return;
  live = v;
  for (const fn of [...listeners]) fn();
}

/** True once the gym's server answered member_mate_board in this app session (0040 is live). */
export function matesAreLive(): boolean {
  return live;
}

export function onMatesLiveChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Which leaderboard rows open a profile; null when unknown (offline, or 0040 not live). */
export async function readMateBoard(link: GymLink): Promise<MateBoard | null> {
  if (missing) return null;
  try {
    const r = await apiMateBoard(link.memberKey);
    if (r.ok) {
      setLive(true);
      return r.data;
    }
    if ('missing' in r) {
      missing = true;
      setLive(false);
      return null;
    }
    if ('error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[mates] could not read who shares', r.error.kind);
    return null;
  } catch (e) {
    console.warn('[mates] reading who shares failed', e);
    return null;
  }
}

export type MateRead = { kind: 'profile'; profile: MateProfile } | { kind: 'closed' } | { kind: 'failed' };

/** A gym mate's profile. `closed`: they no longer share (or the server cannot share yet). */
export async function readMateProfile(link: GymLink, profile: string): Promise<MateRead> {
  try {
    const r = await apiMateProfile(link.memberKey, profile);
    if (r.ok) return { kind: 'profile', profile: r.data };
    if ('notShared' in r || 'missing' in r) return { kind: 'closed' };
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[mates] could not read the profile', r.error.kind);
    return { kind: 'failed' };
  } catch (e) {
    console.warn('[mates] reading the profile failed', e);
    return { kind: 'failed' };
  }
}

/** Tests only. */
export function resetMateSyncForTests(): void {
  missing = false;
  live = false;
  listeners.clear();
}

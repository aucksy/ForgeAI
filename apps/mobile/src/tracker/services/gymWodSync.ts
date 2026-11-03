/**
 * F151 "The gym's workout of the day": the wiring of shop/gymWod.ts (pure) to the gym's server (0051) and this
 * phone's routines. Never throws from a read; a failure is one quiet '[wod] ...' log line.
 *
 *  - Asks the gym (member_gym_wod) when the Workout tab opens, at most every 10 minutes for the same member and
 *    day. Kept in memory only (a new day asks again).
 *  - A server without 0051 (not live yet): one log line, then nothing is asked until the app restarts, and the
 *    Workout tab shows no card (machineBusySync.ts's way).
 *  - Start: the workout is saved as the one routine of the folder "Workouts of the day", marked from the gym
 *    (planId WOD_PLAN_ID, so gymPlansSync never relabels it "No longer sent"), the way the gym's plans are saved
 *    (resolveSharedRoutines + saveImportedFolder: the member's own changes to a row are kept), then started like
 *    any routine (startShownWorkout: an open workout is resumed or asked about, never replaced). The folder is
 *    made only by a Start, so a member who never starts one never gets it.
 *  - The trainer's video links in it are kept for the exercise page (trainerVideos.ts).
 *  - Gym plans are a Pro feature (T66); so is this ('trainerPlans').
 */
import { hasFeature } from '@forgeai/theme';

import { todayISO } from '@/lib/date';
import { apiGymWod } from '@/shop/gymApi';
import type { GymWod, GymWodAnswer } from '@/shop/gymWod';
import type { GymLink } from '@/shop/types';

import { listFolders, type FromGym } from '../db/folderRepo';
import { WOD_PLAN_ID } from '../lib/gymPlanSteps';
import { resolveSharedRoutines } from './plansService';
import { saveImportedFolder } from './routineMerge';
import { saveTrainerVideos } from './trainerVideos';
import { startShownWorkout } from './todayStart';
import { forgetWorkoutFolders } from './workoutFolders';

/** At most this often (ms) for the same member and day. */
export const GYM_WOD_EVERY_MS = 10 * 60 * 1000;
/** The folder the workouts of the day are saved in (made at the first Start). */
export const WOD_FOLDER_NAME = 'Workouts of the day';

type TodayWod = Extract<GymWodAnswer, { ok: true }>;

let missing = false;
let kept: { key: string; day: string; at: number; answer: TodayWod | null } | null = null;
let running: Promise<TodayWod | null> | null = null;

/** Today's workout at the member's gym, or null (none, not linked yet, no 0051, a Starter gym, off-line with nothing kept). */
export function readGymWod(link: GymLink | null, opts: { force?: boolean; now?: number } = {}): Promise<TodayWod | null> {
  if (!link || missing || !hasFeature(link, 'trainerPlans')) return Promise.resolve(null);
  const now = opts.now ?? Date.now();
  const day = todayISO();
  const mine = kept?.key === link.memberKey && kept.day === day ? kept : null;
  if (mine && !opts.force && now - mine.at < GYM_WOD_EVERY_MS) return Promise.resolve(mine.answer);
  if (running) return running;
  const job = (async (): Promise<TodayWod | null> => {
    try {
      const r = await apiGymWod(link.memberKey);
      if (r.ok) {
        // "See the desk" answers (no check-in yet, a name that doesn't match): no card.
        const answer = r.data.ok ? r.data : null;
        kept = { key: link.memberKey, day, at: now, answer };
        // Today's links (none on a day without a workout: yesterday's go).
        if (answer) await saveTrainerVideos('wod', answer.wod?.videos ?? []);
        return answer;
      }
      if ('missing' in r) {
        missing = true;
        kept = null;
        console.log('[wod] the gym server has no workout of the day yet (0051 not live)');
        return null;
      }
      if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[wod] could not read the workout of the day', r.error.kind);
      return mine?.answer ?? null;
    } catch (e) {
      console.warn('[wod] read failed', e);
      return mine?.answer ?? null;
    } finally {
      running = null;
    }
  })();
  running = job;
  return job;
}

const nk = (n: string): string => n.replace(/\s+/g, ' ').trim().toLowerCase();

type Nav = Parameters<typeof startShownWorkout>[0];

/**
 * "Start": save today's workout into "Workouts of the day" (unless this version is already there) and start it.
 * Throws when it can't (the button then says so calmly).
 */
export async function startGymWod(nav: Nav, gym: { gymId: string; gymName: string }, wod: GymWod): Promise<void> {
  const name = wod.file.routines[0]?.name ?? wod.name;
  const isWod = (f: { settings: { fromGym?: FromGym } }) => f.settings.fromGym?.gymId === gym.gymId && f.settings.fromGym.planId === WOD_PLAN_ID;
  const before = (await listFolders()).find(isWod) ?? null;
  const was = before?.settings.fromGym;
  let routineId = was && was.version === wod.updatedAt && !was.gone ? (before?.routines.find((r) => nk(r.name) === nk(name))?.id ?? null) : null;
  if (!routineId) {
    const { routines } = await resolveSharedRoutines(wod.file);
    if (routines.length === 0 || routines[0].exercises.length === 0) throw new Error('the workout of the day has no exercise this phone can add');
    const fromGym: FromGym = { gymId: gym.gymId, planId: WOD_PLAN_ID, version: wod.updatedAt, gymName: gym.gymName, byName: wod.byName };
    const { folderId } = await saveImportedFolder(before, before ? before.name : WOD_FOLDER_NAME, routines, { ...(before?.settings ?? {}), fromGym }, {
      follow: false,
      todayISO: todayISO(),
    });
    forgetWorkoutFolders();
    const after = (await listFolders()).find((f) => f.id === folderId);
    routineId = after?.routines.find((r) => nk(r.name) === nk(routines[0].name))?.id ?? after?.routines[0]?.id ?? null;
    if (!routineId) throw new Error('the workout of the day was not saved');
  }
  await startShownWorkout(nav, routineId);
}

/** Tests only. */
export function resetGymWodForTests(): void {
  missing = false;
  kept = null;
  running = null;
}

/**
 * Workout plans from the gym → folders of routines (OWNER-INBOX #6, 18 Oct 2026; plan:
 * docs/overhaul/plans/gym-workout-plans.md). Asked when the Workout tab opens, at most every 10
 * minutes. Each plan is one folder marked `fromGym` ("From <gym> · <trainer>" under its name):
 *  - a new plan becomes a new folder (never followed by itself: the member chooses);
 *  - a changed plan (a new version) updates it the way a shared file does (saveImportedFolder): rows
 *    the member changed keep the member's version, the others take the trainer's;
 *  - a plan no longer sent (withdrawn, or no longer for this member) keeps its folder — workouts
 *    point at its routines — relabelled "No longer sent by <gym>", and is no longer updated.
 * Offline, an older server (no 0024) or a "see the desk" answer change nothing.
 */
import { todayISO } from '@/lib/date';
import { apiGymPlans } from '@/shop/gymApi';
import type { GymPlan } from '@/shop/gymPlans';
import type { GymLink } from '@/shop/types';

import { listFolders, setFolderSettings, type FromGym } from '../db/folderRepo';
import { gymSyncSteps } from '../lib/gymPlanSteps';
import { resolveSharedRoutines } from './plansService';
import { saveImportedFolder } from './routineMerge';
import { forgetWorkoutFolders } from './workoutFolders';

/** At most this often (ms) on its own; a pull to refresh can ask sooner. */
export const GYM_PLANS_EVERY_MS = 10 * 60 * 1000;
let lastAsked: { key: string; at: number } | null = null;
let running: Promise<boolean> | null = null;

/** Ask the gym and save what changed. True when a folder was added, updated or relabelled. Never throws. */
export function syncGymPlans(link: GymLink | null, opts: { force?: boolean; now?: number } = {}): Promise<boolean> {
  if (!link) return Promise.resolve(false);
  const now = opts.now ?? Date.now();
  if (!opts.force && lastAsked?.key === link.memberKey && now - lastAsked.at < GYM_PLANS_EVERY_MS) return Promise.resolve(false);
  if (running) return running;
  lastAsked = { key: link.memberKey, at: now };
  running = (async () => {
    try {
      const r = await apiGymPlans(link.memberKey);
      if (!r.ok) {
        if (!('missing' in r) && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] gym plans', r.error);
        return false;
      }
      // "See the desk" answers (no check-in yet, a name that doesn't match): nothing to save.
      if (!r.data.ok) return false;
      const { gymId, gymName, plans } = r.data;
      const steps = gymSyncSteps(gymId, plans, await listFolders());
      for (const step of steps) {
        if (step.kind === 'gone') {
          await setFolderSettings(step.folder.id, { ...step.folder.settings, fromGym: { ...step.from, gone: true } });
          continue;
        }
        const { plan, before } = step;
        const { routines } = await resolveSharedRoutines(plan.file);
        if (routines.every((x) => x.exercises.length === 0)) continue;
        const fromGym: FromGym = { gymId, planId: plan.id, version: plan.version, gymName, byName: plan.byName };
        await saveImportedFolder(before, before ? before.name : plan.name, routines, { ...(before?.settings ?? {}), fromGym }, { follow: false, todayISO: todayISO() });
      }
      if (steps.length > 0) forgetWorkoutFolders();
      return steps.length > 0;
    } catch (e) {
      console.warn('[ForgeErr] gym plans: saving', e);
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Tests only. */
export function resetGymPlansSyncForTests(): void {
  lastAsked = null;
  running = null;
}

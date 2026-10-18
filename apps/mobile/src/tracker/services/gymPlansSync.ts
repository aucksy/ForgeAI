/**
 * Workout plans from the gym → folders of routines (OWNER-INBOX #6, 18 Oct 2026; plan:
 * docs/overhaul/plans/gym-workout-plans.md). Asked when the Workout tab opens, at most every 10
 * minutes. Each plan is one folder marked `fromGym` ("From <gym> · <trainer>" under its name):
 *  - a new plan becomes a new folder (never followed by itself: the member chooses);
 *  - a changed plan (a new version) updates it the way a shared file does (saveImportedFolder): rows
 *    the member changed keep the member's version, the others take the trainer's;
 *  - a plan no longer sent (withdrawn, or no longer for this member, or the member left or switched
 *    gyms) keeps its folder — workouts point at its routines — relabelled "No longer sent by <gym>",
 *    and is no longer updated;
 *  - a folder the member deleted never comes back (GYM_PLANS_KNOWN_KEY).
 * Offline, an older server (no 0024) or a "see the desk" answer change nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayISO } from '@/lib/date';
import { apiGymPlans } from '@/shop/gymApi';
import type { GymPlan } from '@/shop/gymPlans';
import type { GymLink } from '@/shop/types';

import { listFolders, setFolderSettings, type FromGym } from '../db/folderRepo';
import { gymPlanKey, gymSyncSteps, leftGymSteps, type FolderLite, type GymSyncStep } from '../lib/gymPlanSteps';
import { resolveSharedRoutines } from './plansService';
import { saveImportedFolder } from './routineMerge';
import { forgetWorkoutFolders } from './workoutFolders';

/** At most this often (ms) on its own; a pull to refresh can ask sooner. */
export const GYM_PLANS_EVERY_MS = 10 * 60 * 1000;
let lastAsked: { key: string; at: number } | null = null;
let running: Promise<boolean> | null = null;
/** Which start owns `running`: only that one clears it. */
let runId = 0;

/** The gym plans this phone made a folder for, as gymPlanKey()s: a deleted one never comes back. Erase all data removes it. */
export const GYM_PLANS_KNOWN_KEY = 'forgeai-gym-plans-known';

async function readKnown(): Promise<Set<string>> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(GYM_PLANS_KNOWN_KEY)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : []);
  } catch (e) {
    console.warn('[ForgeErr] gym plans: reading the known list', e);
    return new Set();
  }
}

/** Relabel folders as "No longer sent" (gone) and forget the cached list. */
async function markGone(steps: readonly GymSyncStep<FolderLite>[]): Promise<void> {
  for (const step of steps) {
    if (step.kind === 'gone') await setFolderSettings(step.folder.id, { ...step.folder.settings, fromGym: { ...step.from, gone: true } });
  }
}

/**
 * The member left their gym (or the gym removed them): its folders stay (workouts point at them) as
 * "No longer sent". Queued behind a sync already running with the old link, and new syncs wait for
 * it, so a late save never undoes the label (release review). Never throws.
 */
export function retireGymFolders(): Promise<boolean> {
  const before = running;
  const id = ++runId;
  const mine: Promise<boolean> = (async () => {
    try {
      if (before) await before;
      const steps = leftGymSteps(await listFolders(), null);
      await markGone(steps);
      if (steps.length > 0) forgetWorkoutFolders();
      return steps.length > 0;
    } catch (e) {
      console.warn('[ForgeErr] gym plans: relabelling after leaving', e);
      return false;
    } finally {
      if (runId === id) running = null;
    }
  })();
  running = mine;
  return mine;
}

/** Ask the gym and save what changed. True when a folder was added, updated or relabelled. Never throws. */
export function syncGymPlans(link: GymLink | null, opts: { force?: boolean; now?: number } = {}): Promise<boolean> {
  if (!link) return Promise.resolve(false);
  const now = opts.now ?? Date.now();
  if (!opts.force && lastAsked?.key === link.memberKey && now - lastAsked.at < GYM_PLANS_EVERY_MS) return Promise.resolve(false);
  if (running) return running;
  lastAsked = { key: link.memberKey, at: now };
  const id = ++runId;
  const mine: Promise<boolean> = (async () => {
    try {
      const r = await apiGymPlans(link.memberKey);
      if (!r.ok) {
        if (!('missing' in r) && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] gym plans', r.error);
        return false;
      }
      // "See the desk" answers (no check-in yet, a name that doesn't match): nothing to save.
      if (!r.data.ok) return false;
      const { gymId, gymName, plans } = r.data;
      const folders = await listFolders();
      const known = await readKnown();
      const knownAtStart = known.size;
      // Folders already on the phone count as known (a phone that synced before this list existed).
      for (const f of folders) if (f.settings.fromGym) known.add(gymPlanKey(f.settings.fromGym.gymId, f.settings.fromGym.planId));
      const steps = gymSyncSteps(gymId, plans, folders, known);
      await markGone(steps);
      for (const step of steps) {
        if (step.kind === 'gone') continue;
        const { plan, before } = step;
        const { routines } = await resolveSharedRoutines(plan.file);
        if (routines.every((x) => x.exercises.length === 0)) continue;
        const fromGym: FromGym = { gymId, planId: plan.id, version: plan.version, gymName, byName: plan.byName };
        await saveImportedFolder(before, before ? before.name : plan.name, routines, { ...(before?.settings ?? {}), fromGym }, { follow: false, todayISO: todayISO() });
        known.add(gymPlanKey(gymId, plan.id));
      }
      if (known.size !== knownAtStart) {
        // Its own catch: a failed write must not hide the folders just saved (forgetWorkoutFolders below).
        await AsyncStorage.setItem(GYM_PLANS_KNOWN_KEY, JSON.stringify([...known])).catch((e: unknown) => console.warn('[ForgeErr] gym plans: saving the known list', e));
      }
      if (steps.length > 0) forgetWorkoutFolders();
      return steps.length > 0;
    } catch (e) {
      console.warn('[ForgeErr] gym plans: saving', e);
      return false;
    } finally {
      // A retire queued behind this sync owns `running` now: leave it.
      if (runId === id) running = null;
    }
  })();
  running = mine;
  return mine;
}

/** Tests only. */
export function resetGymPlansSyncForTests(): void {
  lastAsked = null;
  running = null;
}

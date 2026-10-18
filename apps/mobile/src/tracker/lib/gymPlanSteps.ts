/**
 * OWNER-INBOX #6: what the gym's plans mean for the folders on the phone — PURE (the saving is
 * services/gymPlansSync.ts). The member's own folders are never touched.
 */
import type { GymPlan } from '@/shop/gymPlans';

import type { FolderSettings, FromGym } from '../db/folderRepo';

export interface FolderLite {
  id: string;
  name: string;
  settings: FolderSettings;
}

export type GymSyncStep<F extends FolderLite = FolderLite> = { kind: 'save'; plan: GymPlan; before: F | null } | { kind: 'gone'; folder: F; from: FromGym };

/** The key a plan is remembered by on this phone ("this gym sent it once"). PURE. */
export function gymPlanKey(gymId: string, planId: string): string {
  return `${gymId}:${planId}`;
}

/**
 * What to do with this gym's plans and the folders already on the phone. PURE.
 * Release review fixes: `known` holds the plans this phone already made a folder for; one whose
 * folder is gone now was deleted by the member and never comes back. A folder from another gym
 * (the member switched gyms) is relabelled "No longer sent", as it gets no more updates.
 */
export function gymSyncSteps<F extends FolderLite>(
  gymId: string,
  plans: readonly GymPlan[],
  folders: readonly F[],
  known: ReadonlySet<string> = new Set(),
): GymSyncStep<F>[] {
  const mine = folders.filter((f) => f.settings.fromGym?.gymId === gymId);
  const steps: GymSyncStep<F>[] = [];
  for (const plan of plans) {
    const before = mine.find((f) => f.settings.fromGym?.planId === plan.id) ?? null;
    if (!before && known.has(gymPlanKey(gymId, plan.id))) continue;
    const was = before?.settings.fromGym;
    if (was && was.version === plan.version && !was.gone) continue;
    steps.push({ kind: 'save', plan, before });
  }
  for (const f of mine) {
    const from = f.settings.fromGym!;
    if (!from.gone && !plans.some((p) => p.id === from.planId)) steps.push({ kind: 'gone', folder: f, from });
  }
  steps.push(...leftGymSteps(folders, gymId));
  return steps;
}

/** Folders from gyms other than `gymId` (null: the member left), still labelled as sent: relabel. PURE. */
export function leftGymSteps<F extends FolderLite>(folders: readonly F[], gymId: string | null): GymSyncStep<F>[] {
  return folders.flatMap((f) => {
    const from = f.settings.fromGym;
    return from && !from.gone && from.gymId !== gymId ? [{ kind: 'gone' as const, folder: f, from }] : [];
  });
}

/**
 * OWNER-INBOX #6: what the gym's plans mean for the folders on the phone — PURE (the saving is
 * services/gymPlansSync.ts). Only this gym's folders are looked at; the member's own and another
 * gym's are never touched.
 */
import type { GymPlan } from '@/shop/gymPlans';

import type { FolderSettings, FromGym } from '../db/folderRepo';

export interface FolderLite {
  id: string;
  name: string;
  settings: FolderSettings;
}

export type GymSyncStep<F extends FolderLite = FolderLite> = { kind: 'save'; plan: GymPlan; before: F | null } | { kind: 'gone'; folder: F; from: FromGym };

/** What to do with this gym's plans and the folders already on the phone. PURE. */
export function gymSyncSteps<F extends FolderLite>(gymId: string, plans: readonly GymPlan[], folders: readonly F[]): GymSyncStep<F>[] {
  const mine = folders.filter((f) => f.settings.fromGym?.gymId === gymId);
  const steps: GymSyncStep<F>[] = [];
  for (const plan of plans) {
    const before = mine.find((f) => f.settings.fromGym?.planId === plan.id) ?? null;
    const was = before?.settings.fromGym;
    if (was && was.version === plan.version && !was.gone) continue;
    steps.push({ kind: 'save', plan, before });
  }
  for (const f of mine) {
    const from = f.settings.fromGym!;
    if (!from.gone && !plans.some((p) => p.id === from.planId)) steps.push({ kind: 'gone', folder: f, from });
  }
  return steps;
}

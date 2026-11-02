/**
 * F57: what the exercise page needs for the strength level — the member's weigh-ins and who they
 * chose to be compared with (meta `strength_standard`: everyone / men / women; carried by the
 * backup, `backupCollect.BACKUP_META_KEYS`). The level itself is worked out by the pure
 * `tracker/engine/strengthLevel.ts`. Everything is on the phone: it works offline.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import type { BodyweightPoint } from '@/tracker/engine/volume';
import { isStrengthStandard, type StrengthStandard } from '@/tracker/engine/strengthLevel';

import { getBodyweightTimeline } from './volumeService';

export interface StrengthLevelData {
  /** Sorted by date, oldest first. */
  weighIns: BodyweightPoint[];
  /** The member's own choice; null = never chosen (the body figure decides). */
  savedStandard: StrengthStandard | null;
}

export async function getStrengthLevelData(): Promise<StrengthLevelData> {
  const [weighIns, saved] = await Promise.all([
    getBodyweightTimeline(),
    getMeta('strength_standard').catch((e: unknown) => {
      console.warn('[strengthLevel] could not read the comparison choice', e);
      return null;
    }),
  ]);
  return { weighIns, savedStandard: isStrengthStandard(saved) ? saved : null };
}

export async function saveStrengthStandard(standard: StrengthStandard): Promise<void> {
  await enqueueWrite(() => setMeta('strength_standard', standard));
}

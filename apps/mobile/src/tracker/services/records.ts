/**
 * Records a member would recognise — Phase 2 review.
 *
 * The frozen PR detector also stores the first bodyweight, timed or distance set ever
 * logged ("Plank 0 kg") and an assisted move's help as a negative "record" (where fewer
 * reps at the same help even beat more). The finish screen, session detail, exercise page
 * and Progress already hide those with `isMeaningfulPr`; the coach's reply and its tools go
 * through here. (Phase 3: Home counts lifts by the one record rule — `dashboardPhase2`.)
 */
import { getAllPrs } from '@/db/repos/prRepo';

import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import { isMeaningfulPr } from './finishSummary';

/** Keep the records worth showing, given each exercise's log type. PURE. */
export function keepMeaningful<T extends { exerciseId: string; value: number }>(
  prs: readonly T[],
  logTypes: ReadonlyMap<string, string | null>,
): T[] {
  return prs.filter((p) => isMeaningfulPr(p.value, logTypes.get(p.exerciseId) ?? null));
}

/** The same filter, reading each exercise's log type. */
export async function meaningfulPrs<T extends { exerciseId: string; value: number }>(prs: readonly T[]): Promise<T[]> {
  if (prs.length === 0) return [];
  const infos = await getTrackerExercisesByIds(prs.map((p) => p.exerciseId));
  return keepMeaningful(prs, new Map([...infos].map(([id, info]) => [id, info.logType])));
}

/** Every exercise's best weight / e1RM record, minus the ones nobody would recognise. */
export async function getMeaningfulPrs(): Promise<Awaited<ReturnType<typeof getAllPrs>>> {
  return meaningfulPrs(await getAllPrs());
}

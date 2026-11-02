/**
 * F186: the guided first routine's stored mark and its one save (rules in `lib/firstRoutine.ts`).
 *
 * The save makes the folder, then the routine in it with the picked exercises (3 sets each, the
 * rep range from the member's goal, as "New routine" does). The folder is NOT followed: Up next
 * already comes from the first folder when none is followed, and following would start plan
 * weeks the member never asked for (RP-08's spirit). A routine save that fails removes the empty
 * folder it just made, so a retry never leaves two "My plan" folders.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import { createFolder, deleteFolder } from '../db/folderRepo';
import { createRoutineFromWorkout } from '../db/routineRepo';
import { GUIDE_DONE, GUIDE_KEY, START_SETS, cleanName, dayTypeFor } from '../lib/firstRoutine';
import type { DayType } from '@/types/models';

/** The stored mark, or null. Never throws: a failed read hides the card this time. */
export async function readGuideMark(): Promise<string | null> {
  try {
    return await getMeta(GUIDE_KEY);
  } catch (e) {
    console.warn('[first routine] could not read the guide mark', e);
    return GUIDE_DONE;
  }
}

/** Skip, a saved routine, or routines seen: the guide never shows again. Never throws. */
export async function markGuideDone(): Promise<void> {
  try {
    await enqueueWrite(() => setMeta(GUIDE_KEY, GUIDE_DONE));
  } catch (e) {
    console.warn('[first routine] could not save the guide mark', e);
  }
}

/** Saves the folder and its first routine; returns both ids. Throws when the routine could not be saved. */
export async function saveFirstRoutine(input: {
  folderName: string;
  routineName: string;
  /** The day a tapped ready name means; else read from the typed name. */
  dayType?: DayType | null;
  exerciseIds: readonly string[];
}): Promise<{ folderId: string; routineId: string }> {
  const routineName = cleanName(input.routineName);
  const folderId = await createFolder(cleanName(input.folderName));
  try {
    const routineId = await createRoutineFromWorkout({
      name: routineName,
      dayType: input.dayType ?? dayTypeFor(routineName),
      folderId,
      items: input.exerciseIds.map((exerciseId) => ({ exerciseId, workingSets: START_SETS, rows: START_SETS })),
    });
    await markGuideDone();
    return { folderId, routineId };
  } catch (e) {
    await deleteFolder(folderId).catch((err: unknown) => console.warn('[first routine] could not remove the empty folder', err));
    throw e;
  }
}

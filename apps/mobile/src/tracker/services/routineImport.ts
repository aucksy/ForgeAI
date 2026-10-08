/**
 * v0.28.0 — save the routines the member checked (rebuilt by `routineRebuild`) as the folder
 * "From Hevy" / "From Strong", and follow it when asked. Runs after the history import, so every
 * exercise name in the file is already one of the member's exercises.
 */
import { todayISO } from '@/lib/date';

import { appFolder, followedFolder, saveAppFolder, type ImportApp, type NewRoutine } from '../db/folderRepo';
import { exerciseIdsForTitles } from './hevyImport';
import type { FoundExercise } from './routineRebuild';

export const APP_FOLDER_NAME: Record<ImportApp, string> = { hevy: 'From Hevy', strong: 'From Strong' };

/** A timed or distance exercise has no reps; the routine row still needs a range. */
const NO_REPS = { repMin: 8, repMax: 12 };

/** The kept routines as folder rows. Names with no exercise are left out. PURE. */
export function toNewRoutines(
  chosen: readonly { title: string; dayType: NewRoutine['dayType']; exercises: readonly FoundExercise[] }[],
  ids: ReadonlyMap<string, string>,
): NewRoutine[] {
  return chosen
    .map((r) => ({
      name: r.title,
      dayType: r.dayType,
      exercises: r.exercises.flatMap((e) => {
        const exerciseId = ids.get(e.title);
        if (!exerciseId) return [];
        const reps = e.repMin != null && e.repMax != null ? { repMin: e.repMin, repMax: e.repMax } : NO_REPS;
        return [{ exerciseId, sets: e.sets, ...reps }];
      }),
    }))
    .filter((r) => r.exercises.length > 0);
}

/** What the follow question needs: the folder followed now (if not this app's), and whether this app's folder exists. */
export async function followQuestion(app: ImportApp): Promise<{ followingName: string | null; updating: boolean }> {
  const [now, mine] = await Promise.all([followedFolder().catch(() => null), appFolder(app).catch(() => null)]);
  return { followingName: now && now.id !== mine?.id ? now.name : null, updating: mine != null };
}

export async function saveImportedRoutines(
  app: ImportApp,
  chosen: readonly { title: string; dayType: NewRoutine['dayType']; exercises: readonly FoundExercise[] }[],
  opts: { follow: boolean },
): Promise<{ folderId: string; routines: number }> {
  const ids = await exerciseIdsForTitles([...new Set(chosen.flatMap((r) => r.exercises.map((e) => e.title)))]);
  const routines = toNewRoutines(chosen, ids);
  const folderId = await saveAppFolder(app, APP_FOLDER_NAME[app], routines, { follow: opts.follow, todayISO: todayISO() });
  return { folderId, routines: routines.length };
}

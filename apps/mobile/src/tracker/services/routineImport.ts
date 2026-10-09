/**
 * v0.28.0 — save the routines the member checked (rebuilt by `routineRebuild`) as the folder
 * "From Hevy" / "From Strong", and follow it when asked. Runs after the history import, so every
 * exercise name in the file is already one of the member's exercises.
 */
import { todayISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';

import { appFolder, followedFolder, linkFolder, saveAppFolder, saveLinkFolder, type ImportApp, type NewRoutine } from '../db/folderRepo';
import { getExerciseRestSec, setExerciseRestSec } from '../db/exercisePrefs';
import { exerciseIdsCreating, exerciseIdsForTitles } from './hevyImport';
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

/**
 * What the follow question needs: the folder followed now (if not this app's), and the name of
 * this app's folder when one exists (it is refilled — the member may have renamed it).
 */
export async function followQuestion(app: ImportApp): Promise<{ followingName: string | null; updatingName: string | null }> {
  const [now, mine] = await Promise.all([followedFolder().catch(() => null), appFolder(app).catch(() => null)]);
  return { followingName: now && now.id !== mine?.id ? now.name : null, updatingName: mine?.name ?? null };
}

/** After saving: the routine Home's "Today" shows now (the frozen rotation), or null. */
export async function homeToday(): Promise<string | null> {
  const tw = await getTodaysWorkout().catch(() => null);
  return tw && tw.planDayId ? tw.dayName : null;
}

export async function saveImportedRoutines(
  app: ImportApp,
  chosen: readonly { title: string; dayType: NewRoutine['dayType']; exercises: readonly FoundExercise[] }[],
  opts: { follow: boolean },
): Promise<{ folderId: string; routines: number; name: string }> {
  const ids = await exerciseIdsForTitles([...new Set(chosen.flatMap((r) => r.exercises.map((e) => e.title)))]);
  const routines = toNewRoutines(chosen, ids);
  if (routines.length === 0) throw new Error('nothing to save');
  const folderId = await saveAppFolder(app, APP_FOLDER_NAME[app], routines, { follow: opts.follow, todayISO: todayISO() });
  const saved = await appFolder(app).catch(() => null);
  return { folderId, routines: routines.length, name: saved?.name ?? APP_FOLDER_NAME[app] };
}

// ---------------------------------------------------------------- v0.29.0: from a share link

/** The follow question for a link's folder: the folder followed now, and this link's folder if any. */
export async function linkFollowQuestion(url: string): Promise<{ followingName: string | null; updatingName: string | null }> {
  const [now, mine] = await Promise.all([followedFolder().catch(() => null), linkFolder(url).catch(() => null)]);
  return { followingName: now && now.id !== mine?.id ? now.name : null, updatingName: mine?.name ?? null };
}

/**
 * Save a link's checked routines as the folder named in Hevy. An exercise not in ForgeAI yet is
 * made (a custom exercise); its rest from the link becomes its own rest unless the member set
 * one. Returns the folder, how many routines and how many new exercises.
 */
export async function saveLinkedRoutines(
  link: { url: string; folderName: string; rests: ReadonlyMap<string, number> },
  chosen: readonly { title: string; dayType: NewRoutine['dayType']; exercises: readonly FoundExercise[] }[],
  opts: { follow: boolean },
): Promise<{ folderId: string; routines: number; name: string; created: number }> {
  const items = new Map<string, boolean>();
  for (const r of chosen) for (const e of r.exercises) items.set(e.title, (items.get(e.title) ?? true) && e.repMin == null);
  const { ids, created } = await exerciseIdsCreating([...items].map(([title, timed]) => ({ title, timed })));
  const routines = toNewRoutines(chosen, ids);
  if (routines.length === 0) throw new Error('nothing to save');
  // The same link copied again: its rests win too (the folder "now matches this link").
  const again = (await linkFolder(link.url).catch(() => null)) != null;
  const folderId = await saveLinkFolder(link.url, link.folderName, routines, { follow: opts.follow, todayISO: todayISO() });
  for (const [title, sec] of link.rests) {
    const id = ids.get(title);
    if (id && (again || (await getExerciseRestSec(id).catch(() => 0)) == null)) await setExerciseRestSec(id, sec).catch(() => undefined);
  }
  const saved = await linkFolder(link.url).catch(() => null);
  return { folderId, routines: routines.length, name: saved?.name ?? link.folderName, created };
}

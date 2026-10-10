/**
 * v0.28.0 — save the routines the member checked (rebuilt by `routineRebuild`) as the folder
 * "From Hevy" / "From Strong", and follow it when asked. Runs after the history import, so every
 * exercise name in the file is already one of the member's exercises.
 */
import { getDb } from '@/db';
import { todayISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';

import { appFolder, followedFolder, linkFolder, myRoutinesFolderId, parseFolderSettings, type Folder, type ImportApp, type NewRoutine } from '../db/folderRepo';
import { LOG_TYPE_LABEL, type LogType } from '../engine/logTypes';
import { workingCount, type PlanSetType } from '../plans/routineSets';
import { classifyMuscle, exerciseIdsCreating, exerciseIdsForTitles, linkLogType, titlesNotInLibrary } from './hevyImport';
import { continueFrom, lastSetTypes, routineHistory, saveImportedFolder } from './routineMerge';
import { rotationOrder, type FoundExercise, type FoundRoutine } from './routineRebuild';

export const APP_FOLDER_NAME: Record<ImportApp, string> = { hevy: 'From Hevy', strong: 'From Strong' };

/** An exercise with reps left blank in Hevy ("Pull Up · 3 sets"): the routine row still needs a range. */
const NO_REPS = { repMin: 8, repMax: 12 };
/** IM-12: a timed exercise has no rep target (its time is on its sets); the column needs a number. */
const TIMED_REPS = { repMin: 1, repMax: 1 };

/**
 * The kept routines as folder rows. Names with no exercise are left out. Phase 4: each row keeps
 * what was copied — its set types and targets (warm-ups stay warm-ups), rest, superset and note;
 * a timed exercise gets no made-up "8–12 reps". PURE.
 */
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
        const reps = e.repMin != null && e.repMax != null ? { repMin: e.repMin, repMax: e.repMax } : e.timed ? TIMED_REPS : NO_REPS;
        return [
          {
            exerciseId,
            sets: e.setList && e.setList.length > 0 ? Math.max(1, workingCount(e.setList)) : e.sets,
            ...reps,
            ...(e.setList ? { setList: e.setList } : {}),
            ...(e.restSec != null ? { restSec: e.restSec } : {}),
            ...(e.supersetGroup != null ? { supersetGroup: e.supersetGroup } : {}),
            ...(e.note ? { note: e.note } : {}),
          },
        ];
      }),
    }))
    .filter((r) => r.exercises.length > 0);
}

/** `routines` in `order` (by name); names not in it keep their place after. PURE. */
export function inOrder<T extends { title: string }>(routines: readonly T[], order: readonly string[] | null | undefined): T[] {
  if (!order || order.length === 0) return [...routines];
  const at = (t: string): number => {
    const i = order.findIndex((o) => o.replace(/\s+/g, ' ').trim().toLowerCase() === t.replace(/\s+/g, ' ').trim().toLowerCase());
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return routines.map((r, i) => ({ r, i })).sort((a, b) => at(a.r.title) - at(b.r.title) || a.i - b.i).map((x) => x.r);
}

/**
 * IM-03: the member's real rotation of these routines, from their own workouts (imported from
 * Hevy or logged here) — null when their history does not say (then the folder keeps Hevy's
 * order, and the screen says "as saved in Hevy", never "the order you do them").
 */
export async function linkRotation(titles: readonly string[]): Promise<string[] | null> {
  return rotationOrder(titles, await routineHistory().catch(() => []));
}

/**
 * IM-02 (when the link's page data could not be read, only its headings): Hevy's "5 sets"
 * counts warm-ups. Where the member's last workout of that routine had the same number of sets
 * for the exercise, its warm-ups and drop sets are taken from there ("2 warm-up · 3 sets").
 * PURE: `types` = routine title → file exercise title → that workout's set types.
 */
export function withHistoryTypes(found: readonly FoundRoutine[], types: ReadonlyMap<string, ReadonlyMap<string, readonly PlanSetType[]>>): FoundRoutine[] {
  return found.map((r) => ({
    ...r,
    exercises: r.exercises.map((e) => {
      if (e.setList || e.timed) return e;
      const t = types.get(r.title)?.get(e.title);
      if (!t || t.length !== e.sets || !t.some((x) => x === 'warmup' || x === 'drop')) return e;
      const setList = t.map((type) => ({ type }));
      return { ...e, setList, sets: Math.max(1, workingCount(setList)) };
    }),
  }));
}

/** `withHistoryTypes` with the member's own history read from the database. */
export async function historyTypesFor(found: readonly FoundRoutine[]): Promise<FoundRoutine[]> {
  const titles = [...new Set(found.flatMap((r) => r.exercises.map((e) => e.title)))];
  const ids = await exerciseIdsForTitles(titles).catch(() => new Map<string, string>());
  const out = new Map<string, Map<string, PlanSetType[]>>();
  for (const r of found) {
    const want = r.exercises.filter((e) => !e.setList && ids.has(e.title));
    if (want.length === 0) continue;
    const byId = await lastSetTypes(r.title, want.map((e) => ids.get(e.title) as string)).catch(() => new Map<string, PlanSetType[]>());
    const m = new Map<string, PlanSetType[]>();
    for (const e of want) {
      const t = byId.get(ids.get(e.title) as string);
      if (t) m.set(e.title, t);
    }
    out.set(r.title, m);
  }
  return withHistoryTypes(found, out);
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
): Promise<{ folderId: string; routines: number; name: string; keptEdits: string[] }> {
  const ids = await exerciseIdsForTitles([...new Set(chosen.flatMap((r) => r.exercises.map((e) => e.title)))]);
  const routines = toNewRoutines(chosen, ids);
  if (routines.length === 0) throw new Error('nothing to save');
  // IM-22: the member's own changes to these routines since the last import are kept.
  const history = opts.follow ? await routineHistory().catch(() => []) : [];
  const { folderId, keptEdits } = await saveImportedFolder(await appFolder(app), APP_FOLDER_NAME[app], routines, { fromApp: app }, {
    follow: opts.follow,
    todayISO: todayISO(),
    // IM-03: Today continues the member's rotation (the routine after the one done last).
    startISO: continueFrom(routines.map((r) => r.name), history),
  });
  const saved = await appFolder(app).catch(() => null);
  return { folderId, routines: routines.length, name: saved?.name ?? APP_FOLDER_NAME[app], keptEdits };
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
/**
 * IM-20: the routines were not saved, but `createdExercises` new exercises were already added
 * to the member's library (and stay there). Anything else thrown means nothing was written.
 */
export class RoutineSaveError extends Error {
  constructor(readonly createdExercises: number) {
    super('The routines were not saved.');
    this.name = 'RoutineSaveError';
  }
}

/** The failure line for the routine steps: honest about what was already written. PURE. */
export function routineSaveFailureText(e: unknown): string {
  if (e instanceof RoutineSaveError && e.createdExercises > 0) {
    const n = e.createdExercises;
    return `The routines weren’t saved. ${n} new exercise${n === 1 ? ' was' : 's were'} added to your library and ${n === 1 ? 'stays' : 'stay'} there. Please try again.`;
  }
  return 'Nothing was changed. Please try again.';
}

async function folderById(id: string): Promise<Omit<Folder, 'routines'> | null> {
  const p = await getDb().getFirstAsync<{ id: string; name: string; is_active: number; source: string | null; settings: string | null }>(
    'SELECT id, name, is_active, source, settings FROM workout_plans WHERE id = ?',
    [id],
  );
  if (!p) return null;
  const source = p.source === 'program' || p.source === 'builder' || p.source === 'import' ? p.source : null;
  return { id: p.id, name: p.name, following: p.is_active === 1, source, settings: parseFolderSettings(p.settings) };
}

/**
 * Save a link's checked routines. A folder link: the folder named in Hevy (copied again → the
 * same folder, merged with the member's own changes, IM-22), in the member's real rotation when
 * their history says it (`order`, IM-03). A single routine (IM-21): into the folder the member
 * chose (`folderId`; null = "My routines"), next to its routines — one of the same name there is
 * updated, not doubled. An exercise not in ForgeAI yet is made (a custom exercise, logged the way
 * Hevy logs it) unless the member matched it to one of theirs (`matches`, IM-15). Each routine
 * row keeps Hevy's own rest for it (the exercise's rest everywhere else is not touched).
 */
export async function saveLinkedRoutines(
  link: { url: string; kind?: 'folder' | 'routine'; folderName: string },
  chosen: readonly { title: string; dayType: NewRoutine['dayType']; exercises: readonly FoundExercise[] }[],
  opts: { follow: boolean; folderId?: string | null; order?: readonly string[] | null; matches?: ReadonlyMap<string, string> },
): Promise<{ folderId: string; routines: number; name: string; created: number; keptEdits: string[] }> {
  const items = new Map<string, { timed: boolean; logType: LogType | null }>();
  for (const r of chosen) {
    for (const e of r.exercises) {
      const was = items.get(e.title);
      items.set(e.title, { timed: (was?.timed ?? true) && e.repMin == null, logType: was?.logType ?? e.logType ?? null });
    }
  }
  const { ids, created } = await exerciseIdsCreating(
    [...items].map(([title, v]) => ({ title, timed: v.timed, logType: v.logType })),
    opts.matches,
  );
  // IM-20: the new exercises are already saved (their own transaction, owned by hevyImport). If
  // the folder fails now, the member is told what was kept — never "Nothing was changed".
  let folderId: string;
  let routines: NewRoutine[];
  let keptEdits: string[];
  let name = link.folderName;
  try {
    routines = toNewRoutines(inOrder(chosen, opts.order), ids);
    if (routines.length === 0) throw new Error('nothing to save');
    if (link.kind === 'routine') {
      const target = await folderById(opts.folderId ?? (await myRoutinesFolderId()));
      if (!target) throw new Error('no folder');
      name = target.name;
      ({ folderId, keptEdits } = await saveImportedFolder(target, target.name, routines, {}, { follow: false, todayISO: todayISO(), addOnly: true }));
    } else {
      // IM-03: in the member's real rotation, Today continues it (the routine after the one done last).
      const history = opts.follow && opts.order ? await routineHistory().catch(() => []) : [];
      // Hevy's own page order is kept with the folder (the one-time repair reads it).
      const pageOrder = chosen.map((c) => c.title.replace(/\s+/g, ' ').trim());
      ({ folderId, keptEdits } = await saveImportedFolder(await linkFolder(link.url), link.folderName, routines, { fromLink: link.url, pageOrder }, {
        follow: opts.follow,
        todayISO: todayISO(),
        startISO: opts.order ? continueFrom(routines.map((r) => r.name), history) : null,
      }));
      name = (await linkFolder(link.url).catch(() => null))?.name ?? link.folderName;
    }
  } catch (e) {
    throw created > 0 ? new RoutineSaveError(created) : e;
  }
  return { folderId, routines: routines.length, name, created, keptEdits };
}

/** v0.29.1: an exercise from the link that ForgeAI does not have yet, and how it would be made. */
export interface NewExercise {
  title: string;
  /** "Back · Weight and reps" */
  about: string;
  /** How it will be logged (review fix: "Same as …?" only offers an exercise logged the same way). */
  logType: LogType;
}

/** What `about` says for a name. PURE. */
export function newExerciseAbout(title: string, timed: boolean): string {
  const m = classifyMuscle(title);
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} · ${LOG_TYPE_LABEL[linkLogType(title, timed)]}`;
}

/** The ticked exercises that are new to ForgeAI (each becomes the member's own exercise). */
export async function newExercisesIn(chosen: readonly { exercises: readonly FoundExercise[] }[]): Promise<NewExercise[]> {
  const timed = new Map<string, boolean>();
  const known = new Map<string, LogType>();
  for (const r of chosen) {
    for (const e of r.exercises) {
      timed.set(e.title, (timed.get(e.title) ?? true) && e.repMin == null);
      if (e.logType && !known.has(e.title)) known.set(e.title, e.logType);
    }
  }
  const missing = await titlesNotInLibrary([...timed.keys()]);
  return missing.map((title) => {
    const lt = known.get(title);
    const m = classifyMuscle(title);
    return {
      title,
      about: lt ? `${m.charAt(0).toUpperCase()}${m.slice(1)} · ${LOG_TYPE_LABEL[lt]}` : newExerciseAbout(title, timed.get(title) ?? false),
      logType: lt ?? linkLogType(title, timed.get(title) ?? false),
    };
  });
}

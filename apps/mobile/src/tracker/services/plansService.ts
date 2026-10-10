/**
 * Folders from a ready program, the plan builder or a shared file — Phase 4. Each becomes a
 * routine folder in one transaction; "follow" makes it the plan "Today" comes from.
 */
import type { PlanDayFull } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { todayISO } from '@/lib/date';

import { catalogEntryByName } from '../catalog/exerciseCatalog';
import { coarseOf, type MuscleMap } from '../catalog/muscles';
import { createCustomExercise } from '../db/customExercise';
import { getTrackerExercisesByIds } from '../db/exerciseInfo';
import {
  createFolderWithRoutines,
  exerciseIdsByName,
  exerciseIdsForKeys,
  fileFolder,
  folderOfRoutine,
  followedFolder,
  programFolder,
  refillFolder,
  type Folder,
  type FolderSettings,
  type NewRoutine,
  type RoutineFull,
} from '../db/folderRepo';
import type { BuilderInput, BuiltPlan, Level } from '../plans/builder';
import { PLAN_EQUIPMENT, SORE_AREAS, type FitContext, type PlanEquipment, type SoreArea } from '../plans/fit';
import { EASY_EVERY } from '../plans/easyWeek';
import { programByKey, programRoutines, type ProgramEquipment } from '../plans/programs';
import { fileFingerprint, makeRoutineFile, type RoutineFile, type SharedRoutine } from '../plans/routineFile';

const easySchedule = (on: boolean): FolderSettings['easy'] => (on ? { every: EASY_EVERY, base: 0 } : null);

/** Routines of library keys → rows with the member's exercise ids (unknown keys left out). */
async function withIds(routines: readonly { name: string; dayType: NewRoutine['dayType']; exercises: { key: string; sets: number; repMin: number; repMax: number }[] }[]): Promise<NewRoutine[]> {
  const ids = await exerciseIdsForKeys(routines.flatMap((r) => r.exercises.map((x) => x.key)));
  return routines.map((r) => ({
    name: r.name,
    dayType: r.dayType,
    exercises: r.exercises.flatMap((x) => {
      const exerciseId = ids.get(x.key);
      return exerciseId ? [{ exerciseId, sets: x.sets, repMin: x.repMin, repMax: x.repMax }] : [];
    }),
  }));
}

/**
 * RP-18: what to do when the folder is already in the member's routines — "update" rewrites that
 * folder in place (its routines keep their ids; followed when asked), "copy" adds a second one.
 */
export type ExistingChoice = 'update' | 'copy';

/** RP-18: the folder this program was added as before, or null. */
export function existingProgramFolder(key: string): Promise<Omit<Folder, 'routines'> | null> {
  return programFolder(key);
}

/**
 * Add a ready program as a folder; returns its id. Already in the routines (RP-18): updated in
 * place unless the member chose to add a copy — the same program never silently makes two
 * folders.
 */
export async function addProgram(key: string, opts: { follow: boolean; easyWeeks: boolean; existing?: ExistingChoice }): Promise<string> {
  const p = programByKey(key);
  if (!p) throw new Error('That program is not in this version of ForgeAI.');
  const routines = await withIds(programRoutines(p));
  // RP-06: the plan remembers its days a week (3 for a 3-day program of 2 routines).
  const settings: FolderSettings = { program: p.key, easy: easySchedule(opts.easyWeeks), daysPerWeek: p.daysPerWeek };
  const before = opts.existing === 'copy' ? null : await programFolder(p.key);
  if (before) {
    // An easy-week rhythm already running keeps its count.
    const easy = opts.easyWeeks ? (before.settings.easy ?? settings.easy) : null;
    return refillFolder(before, before.name, routines, { ...settings, easy }, { follow: opts.follow, todayISO: todayISO() });
  }
  return createFolderWithRoutines(opts.existing === 'copy' ? `${p.name} (copy)` : p.name, routines, {
    source: 'program',
    settings,
    follow: opts.follow,
    todayISO: todayISO(),
  });
}

/** Save what the plan builder made as a folder (followed: it is the member's plan). */
export async function saveBuiltPlan(plan: BuiltPlan, input: BuilderInput, opts: { follow: boolean; easyWeeks: boolean }): Promise<string> {
  const routines = await withIds(plan.routines);
  return createFolderWithRoutines(plan.name, routines, {
    source: 'builder',
    settings: { builder: { ...input }, easy: easySchedule(opts.easyWeeks), daysPerWeek: Math.max(1, Math.min(7, Math.round(input.days))) },
    follow: opts.follow,
    todayISO: todayISO(),
  });
}

/** The routines as a share file / text: names, library keys, sets, rep ranges, main muscles. */
export async function sharedRoutinesOf(routines: readonly (PlanDayFull | RoutineFull)[]): Promise<SharedRoutine[]> {
  const infos = await getTrackerExercisesByIds(routines.flatMap((r) => r.exercises.map((pe) => pe.exerciseId)));
  return routines.map((r) => ({
    name: r.name,
    dayType: r.dayType,
    exercises: r.exercises.map((pe) => {
      const info = infos.get(pe.exerciseId);
      return {
        name: pe.exercise.name,
        catalogKey: info?.catalogKey ?? null,
        logType: info?.logType ?? 'weight_reps',
        sets: pe.targetSets,
        repMin: pe.repRangeMin,
        repMax: pe.repRangeMax,
        primary: info ? [...info.muscles.primary] : [],
        // RP-19: the routine's set types, rest, superset and note travel with it.
        ...('sets' in pe && pe.sets ? { setList: pe.sets } : {}),
        ...('restSec' in pe && pe.restSec != null ? { restSec: pe.restSec } : {}),
        ...('supersetGroup' in pe && pe.supersetGroup != null ? { supersetGroup: pe.supersetGroup } : {}),
        ...('note' in pe && pe.note ? { note: pe.note } : {}),
      };
    }),
  }));
}

export async function routineFileOf(folder: string | null, routines: readonly (PlanDayFull | RoutineFull)[]): Promise<RoutineFile> {
  return makeRoutineFile(folder, await sharedRoutinesOf(routines));
}

/** A ready program's kit as the builder's equipment (home programs assume a pull-up bar). */
const PROGRAM_KIT: Record<ProgramEquipment, PlanEquipment> = { gym: 'gym', dumbbells: 'dumbbells_bench', home: 'bar' };

/**
 * What a swap must respect for a routine (or, with no routine, the plan the member follows):
 * the equipment, sore areas and "never" list from the plan builder's answers when the folder
 * came from it, a ready program's own kit, else a full gym and nothing to avoid; the level
 * from the profile.
 */
export async function swapContextFor(dayId: string | null): Promise<{ level: Level } & FitContext> {
  const [folder, profile] = await Promise.all([
    (dayId ? folderOfRoutine(dayId) : followedFolder()).catch(() => null),
    getProfile().catch(() => null),
  ]);
  const b = folder?.settings.builder ?? {};
  const program = programByKey(folder?.settings.program);
  const equipment = PLAN_EQUIPMENT.includes(b.equipment as PlanEquipment)
    ? (b.equipment as PlanEquipment)
    : program
      ? PROGRAM_KIT[program.equipment]
      : 'gym';
  const sore = Array.isArray(b.sore) ? (b.sore as unknown[]).filter((a): a is SoreArea => SORE_AREAS.includes(a as SoreArea)) : [];
  const avoid = Array.isArray(b.avoid) ? (b.avoid as unknown[]).filter((k): k is string => typeof k === 'string') : [];
  return { level: profile?.experience ?? 'intermediate', equipment, sore, avoid };
}

export interface ImportResult {
  folderId: string;
  /** Exercises the member did not have, added as their own. */
  added: string[];
  /** Exercises that could not be added (no muscles in the file). */
  skipped: string[];
  /** RP-18: the file was imported before and that folder was updated (no second folder). */
  updated?: boolean;
}

/** RP-18: the folder this file was imported into before, or null. */
export function existingFileFolder(file: RoutineFile): Promise<Omit<Folder, 'routines'> | null> {
  return fileFolder(fileFingerprint(file));
}

/**
 * Import a shared file as a new folder. Each exercise lands on the member's library exercise
 * with the same library key, else the same name; one only the sender had is added as the
 * member's own (its name, how it is logged and its main muscles come with the file).
 */
export async function importRoutineFile(file: RoutineFile, opts: { existing?: ExistingChoice } = {}): Promise<ImportResult> {
  const all = file.routines.flatMap((r) => r.exercises);
  const byKey = await exerciseIdsForKeys(all.flatMap((e) => (e.catalogKey ? [e.catalogKey] : [])));
  // A name that is a library name (or one of its link names) lands on that library exercise.
  const libKeys = all.flatMap((e) => (byKey.has(e.catalogKey ?? '') ? [] : [catalogEntryByName(e.name)?.key ?? null])).filter((k): k is string => !!k);
  for (const [k, v] of await exerciseIdsForKeys(libKeys)) byKey.set(k, v);
  const byName = await exerciseIdsByName(all.map((e) => e.name));
  const added: string[] = [];
  const skipped: string[] = [];
  const made = new Map<string, string>();

  const idFor = async (e: SharedRoutine['exercises'][number]): Promise<string | null> => {
    if (e.catalogKey && byKey.has(e.catalogKey)) return byKey.get(e.catalogKey)!;
    const lib = catalogEntryByName(e.name);
    if (lib && byKey.has(lib.key)) return byKey.get(lib.key)!;
    if (byName.has(e.name)) return byName.get(e.name)!;
    const norm = e.name.trim().toLowerCase();
    if (made.has(norm)) return made.get(norm)!;
    if (e.primary.length === 0) {
      if (!skipped.includes(e.name)) skipped.push(e.name);
      return null;
    }
    const muscles: MuscleMap = { primary: [...e.primary], secondary: [] };
    const id = await createCustomExercise(
      {
        name: e.name,
        logType: e.logType,
        muscles,
        equipment: e.logType === 'reps' || e.logType === 'time' ? 'bodyweight' : 'other',
        isCompound: coarseOf(muscles) !== 'biceps' && coarseOf(muscles) !== 'triceps' && coarseOf(muscles) !== 'forearms',
        incrementKg: 2.5,
        countsBodyweight: false,
      },
      { uri: null, type: null },
    );
    made.set(norm, id);
    added.push(e.name);
    return id;
  };

  const routines: NewRoutine[] = [];
  for (const r of file.routines) {
    const exercises: NewRoutine['exercises'] = [];
    for (const e of r.exercises) {
      const exerciseId = await idFor(e);
      if (exerciseId) {
        exercises.push({
          exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          setList: e.setList ?? null,
          restSec: e.restSec ?? null,
          supersetGroup: e.supersetGroup ?? null,
          note: e.note ?? null,
        });
      }
    }
    routines.push({ name: r.name, dayType: r.dayType, exercises });
  }
  const name = file.folder ?? (file.routines.length === 1 ? file.routines[0].name : 'Shared routines');
  // RP-18: the same file again updates the folder it made (unless the member asked for a copy).
  const fromFile = fileFingerprint(file);
  const before = opts.existing === 'copy' ? null : await fileFolder(fromFile);
  if (before) {
    await refillFolder(before, before.name, routines, { fromFile }, { follow: false, todayISO: todayISO() });
    return { folderId: before.id, added, skipped, updated: true };
  }
  const folderId = await createFolderWithRoutines(opts.existing === 'copy' ? `${name} (copy)` : name, routines, { source: 'import', settings: { fromFile } });
  return { folderId, added, skipped };
}

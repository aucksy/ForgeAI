/**
 * Sharing routines — Phase 4. PURE.
 *
 * Hevy shares a routine by a web link. ForgeAI works offline and has no web service, so a
 * routine (or a whole folder) goes out the two ways a phone always has:
 *  - as TEXT, for WhatsApp or a note — readable by anyone, ForgeAI or not;
 *  - as a FILE ("…forgeai.json"), which another ForgeAI member opens from Routines →
 *    "Import a routine file" to get the same routines, sets and rep ranges.
 * The file names each exercise by its library key AND its name, so it lands on the same
 * library exercise; an exercise only the sender has (their own) comes back as a new one.
 */
import type { DayType } from '@/types/models';

import { isLogType, type LogType } from '../engine/logTypes';
import { isMuscle, type Muscle } from '../catalog/muscles';

export const ROUTINE_FILE_KIND = 'forgeai-routines';
export const ROUTINE_FILE_VERSION = 1;
/** 30 routines × 40 exercises is well under this; anything bigger is not a routine file. */
export const ROUTINE_FILE_MAX_BYTES = 1_000_000;

const DAY_TYPES: readonly DayType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full'];

const DAY_WORD: Record<DayType, string> = {
  push: 'Push Day',
  pull: 'Pull Day',
  legs: 'Leg Day',
  upper: 'Upper Body',
  lower: 'Lower Body',
  full: 'Full Body',
  rest: 'Rest Day',
};

export interface SharedExercise {
  name: string;
  /** Library key, when it is a library exercise. */
  catalogKey: string | null;
  logType: LogType;
  sets: number;
  repMin: number;
  repMax: number;
  /** The main muscles, so an exercise only the sender has can be made again. */
  primary: Muscle[];
}

export interface SharedRoutine {
  name: string;
  dayType: DayType;
  exercises: SharedExercise[];
}

export interface RoutineFile {
  kind: typeof ROUTINE_FILE_KIND;
  version: number;
  /** The folder's name when a whole folder was shared, else null. */
  folder: string | null;
  routines: SharedRoutine[];
}

export function makeRoutineFile(folder: string | null, routines: readonly SharedRoutine[]): RoutineFile {
  return { kind: ROUTINE_FILE_KIND, version: ROUTINE_FILE_VERSION, folder, routines: routines.map((r) => ({ ...r, exercises: [...r.exercises] })) };
}

export function routineFileJson(file: RoutineFile): string {
  return JSON.stringify(file, null, 2);
}

/** "upper-a.forgeai.json" — letters, digits and dashes. */
export function routineFileName(title: string): string {
  const clean = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${clean || 'routine'}.forgeai.json`;
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Read a shared file. Anything unusable is refused with a plain reason; odd numbers are
 * brought into range rather than refused (a routine from an older app must still open).
 */
export function parseRoutineFile(text: string): { ok: true; file: RoutineFile } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not a routine file.' };
  }
  const f = raw as Partial<Record<keyof RoutineFile, unknown>> | null;
  if (!f || f.kind !== ROUTINE_FILE_KIND) return { ok: false, reason: 'That file is not a ForgeAI routine file.' };
  if (num(f.version, 0) > ROUTINE_FILE_VERSION) return { ok: false, reason: 'That file comes from a newer ForgeAI. Update the app, then try again.' };
  if (!Array.isArray(f.routines) || f.routines.length === 0) return { ok: false, reason: 'That file has no routines in it.' };
  if (f.routines.length > 30) return { ok: false, reason: 'That file has too many routines (30 at most).' };
  const routines: SharedRoutine[] = [];
  for (const r of f.routines as unknown[]) {
    const rr = r as Partial<Record<keyof SharedRoutine, unknown>> | null;
    if (!rr || !isText(rr.name, 80) || !Array.isArray(rr.exercises)) return { ok: false, reason: 'A routine in that file is damaged.' };
    const exercises: SharedExercise[] = [];
    for (const e of (rr.exercises as unknown[]).slice(0, 40)) {
      const ee = e as Partial<Record<keyof SharedExercise, unknown>> | null;
      if (!ee || !isText(ee.name, 80)) return { ok: false, reason: 'An exercise in that file is damaged.' };
      const repMin = clamp(num(ee.repMin, 8), 1, 50);
      exercises.push({
        name: ee.name.trim(),
        catalogKey: typeof ee.catalogKey === 'string' && /^[a-z0-9_]{1,60}$/.test(ee.catalogKey) ? ee.catalogKey : null,
        logType: isLogType(ee.logType) ? ee.logType : 'weight_reps',
        sets: clamp(num(ee.sets, 3), 1, 12),
        repMin,
        repMax: clamp(num(ee.repMax, 12), repMin, 50),
        primary: Array.isArray(ee.primary) ? (ee.primary as unknown[]).filter(isMuscle).slice(0, 3) : [],
      });
    }
    routines.push({
      name: rr.name.trim(),
      dayType: DAY_TYPES.includes(rr.dayType as DayType) ? (rr.dayType as DayType) : 'full',
      exercises,
    });
  }
  const folder = isText(f.folder, 80) ? f.folder.trim() : null;
  return { ok: true, file: { kind: ROUTINE_FILE_KIND, version: ROUTINE_FILE_VERSION, folder, routines } };
}

/** Rep text for a line: "3 × 8–12", or "3 sets" for timed and distance work. */
function setsLine(e: Pick<SharedExercise, 'sets' | 'repMin' | 'repMax' | 'logType'>): string {
  const reps = e.logType === 'weight_reps' || e.logType === 'reps' || e.logType === 'weighted' || e.logType === 'assisted';
  if (!reps) return `${e.sets} ${e.sets === 1 ? 'set' : 'sets'}`;
  const range = e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`;
  return `${e.sets} × ${range}`;
}

/**
 * The routines as plain text for a message:
 *   Upper A · Upper Body
 *   1. Barbell Bench Press — 3 × 6–10
 *   …
 *   Made with ForgeAI
 */
export function routinesText(folder: string | null, routines: readonly SharedRoutine[]): string {
  const blocks: string[] = [];
  if (folder) blocks.push(folder);
  for (const r of routines) {
    const lines = [`${r.name} · ${DAY_WORD[r.dayType]}`];
    r.exercises.forEach((e, i) => lines.push(`${i + 1}. ${e.name} — ${setsLine(e)}`));
    if (r.exercises.length === 0) lines.push('(no exercises yet)');
    blocks.push(lines.join('\n'));
  }
  blocks.push('Made with ForgeAI');
  return blocks.join('\n\n');
}

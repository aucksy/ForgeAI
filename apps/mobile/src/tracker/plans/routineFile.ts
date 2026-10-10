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
import { MAX_ROUTINE_REPS, MAX_ROUTINE_SETS, parsePlanSets, planSetsJson, workingCount, type PlanSet } from './routineSets';

export const ROUTINE_FILE_KIND = 'forgeai-routines';
export const ROUTINE_FILE_VERSION = 1;
/**
 * RP-16: a file the app shares always opens again. The limits below are far beyond any real
 * folder (they only stop a file that is not a routine file); names are shortened, never refused.
 */
export const ROUTINE_FILE_MAX_BYTES = 5_000_000;
export const FILE_MAX_ROUTINES = 500;
export const FILE_MAX_EXERCISES = 200;
/** Longer names are cut to this length on import (the editor allows this much). */
export const ROUTINE_NAME_MAX = 120;

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
  /** RP-19 (optional, older files have none): set types and targets, rest, superset, note. */
  setList?: PlanSet[] | null;
  restSec?: number | null;
  supersetGroup?: number | null;
  note?: string | null;
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
  // A file name stays short whatever the routine is called (RP-16).
  return `${clean.slice(0, 60).replace(/-$/, '') || 'routine'}.forgeai.json`;
}

/** A non-empty name, cut to `max` characters (RP-16: a long name is shortened, never refused). */
const nameOf = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length === 0 ? null : t.slice(0, max).trim();
};
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
  if (f.routines.length > FILE_MAX_ROUTINES) return { ok: false, reason: `That file has too many routines (${FILE_MAX_ROUTINES} at most).` };
  const routines: SharedRoutine[] = [];
  for (const r of f.routines as unknown[]) {
    const rr = r as Partial<Record<keyof SharedRoutine, unknown>> | null;
    const rName = rr ? nameOf(rr.name, ROUTINE_NAME_MAX) : null;
    if (!rr || !rName || !Array.isArray(rr.exercises)) return { ok: false, reason: 'A routine in that file is damaged.' };
    if (rr.exercises.length > FILE_MAX_EXERCISES) return { ok: false, reason: `A routine in that file has too many exercises (${FILE_MAX_EXERCISES} at most).` };
    const exercises: SharedExercise[] = [];
    for (const e of rr.exercises as unknown[]) {
      const ee = e as Partial<Record<keyof SharedExercise, unknown>> | null;
      const eName = ee ? nameOf(ee.name, ROUTINE_NAME_MAX) : null;
      if (!ee || !eName) return { ok: false, reason: 'An exercise in that file is damaged.' };
      // RP-23: no 12-set / 50-rep caps — the same bounds as the editor.
      const repMin = clamp(num(ee.repMin, 8), 1, MAX_ROUTINE_REPS);
      const setList = Array.isArray(ee.setList) ? parsePlanSets(JSON.stringify(ee.setList)) : null;
      const rest = num(ee.restSec, -1);
      const group = num(ee.supersetGroup, 0);
      const note = typeof ee.note === 'string' && ee.note.trim() ? ee.note.trim().slice(0, 500) : null;
      exercises.push({
        name: eName,
        catalogKey: typeof ee.catalogKey === 'string' && /^[a-z0-9_]{1,60}$/.test(ee.catalogKey) ? ee.catalogKey : null,
        logType: isLogType(ee.logType) ? ee.logType : 'weight_reps',
        sets: setList ? Math.max(1, workingCount(setList)) : clamp(num(ee.sets, 3), 1, MAX_ROUTINE_SETS),
        repMin,
        repMax: clamp(num(ee.repMax, 12), repMin, MAX_ROUTINE_REPS),
        primary: Array.isArray(ee.primary) ? (ee.primary as unknown[]).filter(isMuscle).slice(0, 3) : [],
        ...(setList ? { setList } : {}),
        ...(rest >= 0 ? { restSec: Math.min(3600, Math.round(rest)) } : {}),
        ...(group >= 1 ? { supersetGroup: Math.round(group) } : {}),
        ...(note ? { note } : {}),
      });
    }
    routines.push({
      name: rName,
      dayType: DAY_TYPES.includes(rr.dayType as DayType) ? (rr.dayType as DayType) : 'full',
      exercises,
    });
  }
  const folder = nameOf(f.folder, ROUTINE_NAME_MAX);
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

/**
 * RP-18: a short fingerprint of what a file holds (its folder name and routines, not the file's
 * bytes), so the same file imported twice is recognised. Review fix: every part of a row counts
 * (rest, superset and note too), so a file that differs only there is a different file. FNV-1a,
 * twice. PURE.
 */
export function fileFingerprint(file: Pick<RoutineFile, 'folder' | 'routines'>): string {
  const canon = JSON.stringify({
    f: file.folder ?? null,
    r: file.routines.map((r) => ({
      n: r.name.toLowerCase(),
      d: r.dayType,
      x: r.exercises.map((e) => [
        e.catalogKey ?? e.name.toLowerCase(),
        e.sets,
        e.repMin,
        e.repMax,
        planSetsJson(e.setList ?? null),
        e.restSec ?? null,
        e.supersetGroup ?? null,
        e.note ?? null,
      ]),
    })),
  });
  const hash = (seed: number): string => {
    let h = seed >>> 0;
    for (let i = 0; i < canon.length; i++) {
      h ^= canon.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return `${hash(0x811c9dc5)}${hash(0x01234567)}`;
}

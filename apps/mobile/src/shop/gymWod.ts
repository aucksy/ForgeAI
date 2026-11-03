/**
 * F151 "The gym's workout of the day" — the PURE half. The gym's answer (member_gym_wod,
 * supabase/migrations/0051_gym_videos_and_wod.sql) carries today's workout as one routine in the app's own
 * routine-file shape; it is checked and cleaned by the same reader a shared file goes through
 * (parseRoutineFile), exactly as the gym's plans are (gymPlans.ts). tracker/services/gymWodSync.ts reads it and
 * starts it; tracker/components/GymWodCard.tsx shows it on the Workout tab.
 */
import { parseRoutineFile, ROUTINE_FILE_KIND, ROUTINE_FILE_VERSION, type RoutineFile } from '@/tracker/plans/routineFile';

import { videosInRoutines, type TrainerVideo } from './trainerVideo';

export interface GymWod {
  /** The India day it is for ('YYYY-MM-DD'). */
  day: string;
  name: string;
  note: string | null;
  /** Who set it ("Ravi"); null for an old owner key. */
  byName: string | null;
  /** When it was last changed (ms): a changed workout is saved again when started. */
  updatedAt: number;
  /** One routine. */
  file: RoutineFile;
  videos: TrainerVideo[];
}

export type GymWodAnswer =
  | { ok: true; gymId: string; gymName: string; today: string; wod: GymWod | null }
  | { ok: false; problem: 'NO_PHONE' | 'NOT_ON_ROSTER' | 'GYM_NOT_ONLINE' | 'NAME_MISMATCH' | 'SHARED_NUMBER'; gymName: string };

const PROBLEMS = ['NO_PHONE', 'NOT_ON_ROSTER', 'GYM_NOT_ONLINE', 'NAME_MISMATCH', 'SHARED_NUMBER'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The workout, or null when it can't be read (no card, never a broken one). PURE. */
export function gymWodFromRow(raw: unknown): GymWod | null {
  if (!isObj(raw)) return null;
  const day = str(raw.day);
  const name = str(raw.name).slice(0, 80);
  if (!DAY.test(day) || !name || !Array.isArray(raw.exercises) || raw.exercises.length === 0) return null;
  const routine = { name, dayType: typeof raw.dayType === 'string' ? raw.dayType : 'full', exercises: raw.exercises };
  const parsed = parseRoutineFile(JSON.stringify({ kind: ROUTINE_FILE_KIND, version: ROUTINE_FILE_VERSION, folder: null, routines: [routine] }));
  if (!parsed.ok || parsed.file.routines.length !== 1 || parsed.file.routines[0].exercises.length === 0) return null;
  const byName = str(raw.byName) || null;
  return {
    day,
    name,
    note: str(raw.note).slice(0, 500) || null,
    byName,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    file: parsed.file,
    videos: videosInRoutines([routine], byName),
  };
}

/** The server's answer, checked; null when it is not one. PURE. */
export function gymWodAnswerFromRow(raw: unknown): GymWodAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  const gymName = str(r.gymName) || 'Your gym';
  const problem = PROBLEMS.find((p) => p === r.error);
  if (problem) return { ok: false, problem, gymName };
  if (r.ok !== true || !str(r.gymId) || !DAY.test(str(r.today))) return null;
  const wod = r.wod == null ? null : gymWodFromRow(r.wod);
  // A workout for another day than the server's today is not today's (never shown).
  return { ok: true, gymId: str(r.gymId), gymName, today: str(r.today), wod: wod && wod.day === str(r.today) ? wod : null };
}

/** The card's heading: "Today at RAM'S FITNESS". PURE. */
export function wodHeading(gymName: string): string {
  return `Today at ${gymName.trim() || 'your gym'}`;
}

/** The card's small line: "6 exercises · from Ravi". PURE. */
export function wodSubLine(w: Pick<GymWod, 'byName' | 'file'>): string {
  const n = w.file.routines[0]?.exercises.length ?? 0;
  return `${n} ${n === 1 ? 'exercise' : 'exercises'}${w.byName ? ` · from ${w.byName}` : ''}`;
}

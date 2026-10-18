/**
 * Workout plans from the gym (OWNER-INBOX #6, 18 Oct 2026) — the PURE half. The gym's answer
 * (member_gym_plans, supabase/migrations/0024_workout_plans.sql) carries each plan's routines in the
 * app's own routine-file shape; every plan is checked and cleaned by the same reader a shared file
 * goes through (parseRoutineFile), so a plan can never hold what a file couldn't.
 * tracker/services/gymPlansSync.ts saves them as folders.
 */
import { parseRoutineFile, ROUTINE_FILE_KIND, ROUTINE_FILE_VERSION, type RoutineFile } from '@/tracker/plans/routineFile';

export interface GymPlan {
  id: string;
  /** The gym's row version: an unchanged plan is not saved again. */
  version: number;
  name: string;
  note: string | null;
  /** Who made it ("Ravi"); null for an old owner key. */
  byName: string | null;
  file: RoutineFile;
}

export type GymPlansAnswer =
  | { ok: true; gymId: string; gymName: string; plans: GymPlan[] }
  | { ok: false; problem: 'NO_PHONE' | 'NOT_ON_ROSTER' | 'GYM_NOT_ONLINE' | 'NAME_MISMATCH' | 'SHARED_NUMBER'; gymName: string };

const PROBLEMS = ['NO_PHONE', 'NOT_ON_ROSTER', 'GYM_NOT_ONLINE', 'NAME_MISMATCH', 'SHARED_NUMBER'] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** One plan, or null when it can't be read (skipped, never a broken folder). PURE. */
export function gymPlanFromRow(raw: unknown): GymPlan | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name).slice(0, 80);
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : NaN;
  if (!id || !name || !Number.isFinite(version) || !Array.isArray(raw.routines) || raw.routines.length === 0) return null;
  const parsed = parseRoutineFile(JSON.stringify({ kind: ROUTINE_FILE_KIND, version: ROUTINE_FILE_VERSION, folder: name, routines: raw.routines }));
  if (!parsed.ok || parsed.file.routines.length === 0) return null;
  return { id, version, name, note: str(raw.note) || null, byName: str(raw.byName) || null, file: parsed.file };
}

/** The server's answer, checked; null when it is not one. PURE. */
export function gymPlansFromRow(raw: unknown): GymPlansAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  const gymName = str(r.gymName) || 'Your gym';
  const problem = PROBLEMS.find((p) => p === r.error);
  if (problem) return { ok: false, problem, gymName };
  if (r.ok !== true || !str(r.gymId) || !Array.isArray(r.plans)) return null;
  const plans = r.plans.map(gymPlanFromRow).filter((p): p is GymPlan => p != null);
  return { ok: true, gymId: str(r.gymId), gymName, plans };
}

/** Under a folder from the gym: "From RAM'S FITNESS · Ravi", or that it is no longer sent. PURE. */
export function fromGymLine(g: { gymName: string; byName: string | null; gone?: boolean }): string {
  if (g.gone) return `No longer sent by ${g.gymName}`;
  return `From ${g.gymName}${g.byName ? ` · ${g.byName}` : ''}`;
}

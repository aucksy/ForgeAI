/**
 * F151 "The gym's workout of the day". PURE.
 *
 * One workout per India day for everyone at the gym. The trainer or owner picks a day from one of the gym's
 * workout plans (and may change it) or builds one, for today or a day in the next week. Members see it on
 * their Workout tab ("Today at <gym>") and start it with one tap. Saved on the gym's server
 * (supabase/migrations/0051_gym_videos_and_wod.sql: owner_gym_wods / owner_save_gym_wod / owner_clear_gym_wod);
 * the workout is one routine in the plans' shape, checked by the plans' own rules (`workoutPlanProblem`).
 */

import { addDays, formatDay, isValidDateISO, type DateISO } from './dates';
import { countOf } from './plural';
import { cleanDraft, DAY_TYPES, splitPlans, workoutPlanProblem, WP_NAME_MAX, WP_PLAN_NOTE_MAX } from './workoutPlans';
import type { WorkoutDayType, WorkoutExercise, WorkoutPlan, WorkoutRoutine } from '../types';

/** The server takes today and the next 7 days. */
export const WOD_DAYS_AHEAD = 7;

export interface GymWod {
  day: DateISO;
  name: string;
  dayType: WorkoutDayType;
  exercises: WorkoutExercise[];
  note: string | null;
  /** Who set it (null for an old owner key). */
  byName: string | null;
  updatedAt: number;
}

export interface GymWodsAnswer {
  /** India's today, as the server sees it. */
  today: DateISO;
  /** Today's and the coming days' workouts, earliest first. */
  wods: GymWod[];
}

export interface WodDraft {
  day: DateISO;
  routine: WorkoutRoutine;
  note: string | null;
}

/** What owner_save_gym_wod takes. */
export interface WodPayload {
  day: DateISO;
  name: string;
  dayType: WorkoutDayType;
  exercises: WorkoutExercise[];
  note: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** One workout from the server, or null when it can't be read. */
export function wodFromRow(raw: unknown): GymWod | null {
  if (!isObj(raw)) return null;
  const day = str(raw.day);
  const name = str(raw.name);
  if (!isValidDateISO(day) || !name || !Array.isArray(raw.exercises)) return null;
  const dayType = DAY_TYPES.includes(raw.dayType as WorkoutDayType) ? (raw.dayType as WorkoutDayType) : 'full';
  return {
    day,
    name,
    dayType,
    exercises: raw.exercises.filter(isObj) as unknown as WorkoutExercise[],
    note: str(raw.note) || null,
    byName: str(raw.byName) || null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

/** owner_gym_wods' answer, or null when it is not one. */
export function wodsFromRow(raw: unknown): GymWodsAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || !isValidDateISO(str(r.today)) || !Array.isArray(r.wods)) return null;
  const wods = r.wods.map(wodFromRow).filter((w): w is GymWod => w != null).sort((a, b) => (a.day < b.day ? -1 : 1));
  return { today: str(r.today), wods };
}

/** The workout of one day, or null. */
export function wodOn(answer: GymWodsAnswer | null, day: DateISO): GymWod | null {
  return answer?.wods.find((w) => w.day === day) ?? null;
}

/** "Today", "Tomorrow", else "5 Nov 2026". */
export function wodDayWords(day: DateISO, today: DateISO): string {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return formatDay(day);
}

/** The days a workout may be set for: today and the next week. */
export function wodDayChoices(today: DateISO): { value: DateISO; label: string }[] {
  return Array.from({ length: WOD_DAYS_AHEAD + 1 }, (_, i) => {
    const d = addDays(today, i);
    return { value: d, label: i < 2 ? `${wodDayWords(d, today)} (${formatDay(d)})` : formatDay(d) };
  });
}

/** Every day of the gym's open plans, to start from: "Beginner 3 days · Day 1". */
export function wodPlanChoices(plans: readonly WorkoutPlan[]): { value: string; label: string; routine: WorkoutRoutine }[] {
  return splitPlans(plans).open.flatMap((p) =>
    p.routines.map((r, i) => ({ value: `${p.id}:${i}`, label: `${p.name} · ${r.name.trim() || `Day ${i + 1}`}`, routine: r })),
  );
}

/** A deep copy of a plan's day, ready to change. */
export function copyRoutineForWod(r: WorkoutRoutine): WorkoutRoutine {
  return JSON.parse(JSON.stringify(r)) as WorkoutRoutine;
}

/** A new workout for this day: no name, no exercises yet. */
export function emptyWodDraft(day: DateISO): WodDraft {
  return { day, routine: { name: '', dayType: 'full', exercises: [] }, note: null };
}

/** A saved workout, ready to change. */
export function wodDraftOf(w: GymWod): WodDraft {
  return { day: w.day, routine: copyRoutineForWod({ name: w.name, dayType: w.dayType, exercises: w.exercises }), note: w.note };
}

/**
 * What Save sends, or why it can't be saved (plain words). The plans' own checks: names, 1-30 exercises,
 * numbers, video links, size.
 */
export function wodPayload(d: WodDraft): { payload: WodPayload; problem: null } | { payload: null; problem: string } {
  if (!isValidDateISO(d.day)) return { payload: null, problem: 'Pick the day for this workout.' };
  if (!d.routine.name.trim()) return { payload: null, problem: 'Give the workout a name, for example “Leg day”.' };
  if (d.routine.name.trim().length > WP_NAME_MAX) return { payload: null, problem: `Keep the workout name to ${WP_NAME_MAX} letters.` };
  const clean = cleanDraft({ name: d.routine.name, note: d.note, routines: [d.routine], assign: { memberIds: [], planIds: [] } });
  const routine = clean.routines[0];
  const problem = workoutPlanProblem(clean, { day: d.day, ...routine, note: clean.note });
  if (problem) return { payload: null, problem };
  const note = (clean.note ?? '').trim();
  return {
    payload: { day: d.day, name: routine.name, dayType: routine.dayType, exercises: routine.exercises, note: note ? note.slice(0, WP_PLAN_NOTE_MAX) : null },
    problem: null,
  };
}

/** "Leg day · 5 exercises · set by Ravi". */
export function wodLine(w: GymWod): string {
  return [w.name, countOf(w.exercises.length, 'exercise'), w.byName ? `set by ${w.byName}` : null].filter(Boolean).join(' · ');
}

/** Plain words for a refused save, or null when it is not one of these codes. */
export function wodErrorWords(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  if (/\bBAD_DATE\b/.test(msg)) return 'Pick today or a day in the next week.';
  if (/\bINVALID\b/.test(msg)) return 'Something in the workout is too long or not allowed. Check it and try again.';
  return null;
}

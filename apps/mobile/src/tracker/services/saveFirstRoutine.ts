/**
 * "Save these exercises as a routine" on the finish screen (owner backlog, Planned, 21 Oct 2026):
 * a member with no routines yet who just finished an empty workout gets one quiet button to keep
 * those exercises for next time. A button on the summary, never a pop-up over it. It goes into
 * "My routines" (never the followed plan, RP-08), with each exercise's working-set count.
 */
import { dateWithYear } from '@/lib/date';

import { listAllRoutines, createRoutineFromWorkout } from '../db/routineRepo';
import { sessionTitle, type SessionSummaryData } from './finishSummary';

export const SAVE_FIRST_ROUTINE = {
  line: 'Do this again next time? Keep these exercises as a routine and start it in one tap.',
  button: 'Save as routine',
  saved: 'Saved in My routines. Start it from the Workout tab next time.',
  failed: "Couldn't save the routine. Your workout is saved.",
} as const;

/**
 * The offer shows for a workout not started from a routine (its own saved link, review 21 Oct: the
 * name is empty for a routine deleted since), with exercises, when no routine exists. PURE.
 */
export function offersFirstRoutine(data: Pick<SessionSummaryData, 'routineName' | 'exerciseCount' | 'session'>, routineCount: number): boolean {
  return data.session?.routineId == null && data.routineName == null && data.exerciseCount > 0 && routineCount === 0;
}

/** The new routine's name and exercises from the finished workout. PURE. */
export function firstRoutineInput(data: SessionSummaryData): { name: string; items: { exerciseId: string; workingSets: number }[] } {
  const s = data.session;
  return {
    name: s.title?.trim() ? s.title.trim() : `${sessionTitle(s)} · ${dateWithYear(s.dateISO)}`,
    items: s.exercises.map((g) => ({ exerciseId: g.exercise.id, workingSets: Math.max(1, g.sets.filter((x) => !x.isWarmup).length) })),
  };
}

export async function routineCount(): Promise<number> {
  return (await listAllRoutines()).length;
}

export async function saveFirstRoutine(data: SessionSummaryData): Promise<string> {
  const { name, items } = firstRoutineInput(data);
  const s = data.session;
  return createRoutineFromWorkout({ name, dayType: s.dayType === 'rest' ? 'full' : s.dayType, items, folderId: null });
}

/**
 * R-132: the Profile's "Next" line — the Up next workout, its goal from the Targets (counted by the one
 * volume rule) against the previous time of the SAME exercises (R-499). Rules and words: `lib/todayGoal.ts`.
 */
import { getDb } from '@/db';
import { todayISO } from '@/lib/date';

import { todayGoalFrom, type GoalTarget, type TodayGoal } from '../lib/todayGoal';
import { getTodaysWorkoutWithTargets } from './coachTargets';
import { getLastRoutineTotals, setsKgCounter } from './volumeService';

/** The next workout's goal, or null when Up next has no routine (a rest day, or no routines yet). */
export async function getTodayGoal(): Promise<TodayGoal | null> {
  const tw = await getTodaysWorkoutWithTargets();
  if (!tw.planDayId || tw.targets.length === 0) return null;
  // coachTargets hands each Target its last time's working sets (`KgTarget.lastSets`).
  const targets = tw.targets as GoalTarget[];
  const [kgOf, routine] = await Promise.all([
    setsKgCounter(targets.map((t) => t.exerciseId)),
    // Only the routine's own time is read from its previous run (the Duration chip).
    getLastRoutineTotals(tw.planDayId, tw.dayName),
  ]);
  return todayGoalFrom(tw.dayName, targets, kgOf, routine ? { durationSec: routine.durationSec, dateISO: routine.dateISO } : null, todayISO());
}

/** How many workouts the member has logged (the chart's "No workouts yet" needs it). */
export async function getWorkoutCount(): Promise<number> {
  const r = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions');
  return Number(r?.n ?? 0);
}

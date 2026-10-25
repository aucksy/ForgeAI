/**
 * R-132: the Progress tab's "Today" card — today's Up next workout, its goal from the Targets (counted by
 * the one volume rule) and the last time this routine was done. Rules and words: `lib/todayGoal.ts`.
 */
import { getDb } from '@/db';

import { plannedSets, type TodayGoal } from '../lib/todayGoal';
import { getTodaysWorkoutWithTargets } from './coachTargets';
import { getLastRoutineTotals, plannedVolumeKg } from './volumeService';

/** Today's goal, or null when Up next has no routine (a rest day, or no routines yet). */
export async function getTodayGoal(): Promise<TodayGoal | null> {
  const tw = await getTodaysWorkoutWithTargets();
  if (!tw.planDayId || tw.targets.length === 0) return null;
  const planned = tw.targets.map((t) => ({ t, p: plannedSets(t) }));
  const weighed = planned.filter((x) => x.p.kgKnown && !x.t.free);
  // Today's sets are logged the exercise's current way ("kg each" or not): loadMode null = that way.
  const [volumeKg, last] = await Promise.all([
    plannedVolumeKg(weighed.map((x) => ({ exerciseId: x.t.exerciseId, loadMode: null, sets: x.p.sets }))),
    getLastRoutineTotals(tw.planDayId, tw.dayName),
  ]);
  return {
    routineName: tw.dayName,
    volumeKg,
    sets: planned.reduce((n, x) => n + x.p.sets.length, 0),
    uncounted: planned.filter((x) => !x.p.kgKnown).length,
    easy: tw.targets.some((t) => t.easy === true),
    last: last ? { volumeKg: last.volumeKg, sets: last.sets, durationSec: last.durationSec, dateISO: last.dateISO } : null,
  };
}

/** How many workouts the member has logged (the chart's "No workouts yet" needs it). */
export async function getWorkoutCount(): Promise<number> {
  const r = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions');
  return Number(r?.n ?? 0);
}

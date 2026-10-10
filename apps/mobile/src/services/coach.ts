/**
 * Coach service — today's workout + progressive-overload targets.
 *
 * Audit Phase 3 (owner decision D3 lifted the freeze here): WHICH routine is today's no longer
 * comes from guessing by day type and shared exercises over the last 10 workouts (RP-01,
 * RP-02, RP-12, RP-22). It is the ONE answer of `tracker/services/todayService` — the routine
 * each workout was started from, the followed plan's order — that every screen shares. This
 * function keeps its name and shape for its callers (Home's frozen dashboard, the coach).
 */
import { getExerciseHistory } from '@/db/repos/workoutRepo';
import { computeOverloadTarget } from '@/engine/overload';
import { todayISO } from '@/lib/date';
import { getTodayPlan, todaysWorkoutOf } from '@/tracker/services/todayService';
import type { TodaysWorkout } from '@/types/models';

/**
 * Today's workout. `opts.targets: false` skips the frozen Targets (each exercise's recent
 * history) for callers that work out their own (RP-22).
 */
export async function getTodaysWorkout(dateISO?: string, opts: { targets?: boolean } = {}): Promise<TodaysWorkout> {
  const today = dateISO ?? todayISO();
  const info = await getTodayPlan(today);
  const base = todaysWorkoutOf(info);
  const day = info.next;
  if (!day || opts.targets === false) return { ...base, targets: [] };

  const targets = await Promise.all(
    day.exercises.map(async (pe) => {
      const raw = await getExerciseHistory(pe.exerciseId, 5);
      // Prescribe from sessions completed BEFORE today so targets stay stable all day.
      const history = raw
        .filter((h) => h.dateISO < today)
        .slice(0, 4)
        .map((h) => ({
          dateISO: h.dateISO,
          sets: h.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
        }));
      return computeOverloadTarget({
        exercise: pe.exercise,
        target: { targetSets: pe.targetSets, repRangeMin: pe.repRangeMin, repRangeMax: pe.repRangeMax },
        history,
      });
    }),
  );
  return { ...base, targets };
}

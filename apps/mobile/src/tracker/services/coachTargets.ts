/**
 * Coach-at-logging targets (Phase C1) — surface the progressive-overload
 * prescription inside the active-workout screen, not just the Coach tab.
 *
 * Pure READ service: given the active workout's plan day, it drives the FROZEN
 * `computeOverloadTarget` with exactly the same inputs `services/coach.ts` uses
 * (history limit 5, only sessions BEFORE today, most-recent 4). So for today's
 * rotation day the numbers are byte-identical to the Coach tab, and for any other
 * routine day it's the correct prescription for THAT day's rep ranges.
 *
 * The history read is the SQL-bounded `getBoundedExerciseHistory` (parity-identical to
 * the frozen `getExerciseHistory`, without materialising the lift's whole history for
 * the 5 sessions we keep — this runs per plan exercise on the workout-start tap).
 * Otherwise reuses frozen pure/read functions only (`getActivePlan`,
 * `computeOverloadTarget`) — no frozen file is edited, no schema, zero network.
 * A target only exists for exercises that belong to the plan day (a rep range
 * lives in the plan): ad-hoc / Start-Empty exercises simply get no prescription.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { computeOverloadTarget } from '@/engine/overload';
import { getBoundedExerciseHistory } from '@/tracker/db/exerciseHistory';
import { todayISO } from '@/lib/date';
import type { OverloadTarget } from '@/types/models';

/**
 * Map of `exerciseId -> OverloadTarget` for the exercises of `planDayId`.
 * Empty when there's no plan day (Start-Empty / repeat-a-session / no plan).
 */
export async function getTargetsForPlanDay(
  planDayId: string | null,
): Promise<Map<string, OverloadTarget>> {
  const out = new Map<string, OverloadTarget>();
  if (!planDayId) return out;

  const active = await getActivePlan();
  const day = active?.days.find((d) => d.id === planDayId) ?? null;
  if (!day) return out;

  const today = todayISO();
  await Promise.all(
    day.exercises.map(async (pe) => {
      const raw = await getBoundedExerciseHistory(pe.exerciseId, 5);
      // Mirror services/coach.ts: prescribe from sessions completed BEFORE today
      // (targets stay stable all day) and cap at the most-recent 4.
      const history = raw
        .filter((h) => h.dateISO < today)
        .slice(0, 4)
        .map((h) => ({
          dateISO: h.dateISO,
          sets: h.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
        }));
      const target = computeOverloadTarget({
        exercise: pe.exercise,
        target: {
          targetSets: pe.targetSets,
          repRangeMin: pe.repRangeMin,
          repRangeMax: pe.repRangeMax,
        },
        history,
      });
      // A plan day normally lists an exercise once; if it appears twice, keep the
      // entry that resolves first so one target shows (identical history anyway).
      if (!out.has(pe.exerciseId)) out.set(pe.exerciseId, target);
    }),
  );
  return out;
}

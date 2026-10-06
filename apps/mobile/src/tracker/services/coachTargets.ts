/**
 * Coach targets — the "Target" line for each exercise of a plan day.
 *
 * Since the progression polish (Oct 2026) every Target the member sees comes from the
 * v2 engine `tracker/engine/progression.ts`, not the frozen `engine/overload.ts`:
 *  - the live workout screen (`getTargetsForPlanDay`), and
 *  - the chat coach's "today's workout" reply and tool (`getTodaysWorkoutWithTargets`),
 *    which take the FROZEN `getTodaysWorkout()` rotation as-is and only swap its targets,
 * so the two can never disagree. A target only exists for exercises in the plan day (the
 * rep range lives there); ad-hoc / Start-Empty exercises get none.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { todayISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';
import { getProgressionHistory } from '@/tracker/db/progressionHistory';
import { computeProgressionTarget, type ProgressionTarget } from '@/tracker/engine/progression';
import type { Exercise, PlanExercise, TodaysWorkout, UserProfile } from '@/types/models';

/** Sessions read per lift: 4 for the rules, the rest to learn the weight step. */
const HISTORY_SESSIONS = 12;

type PlanExerciseFull = PlanExercise & { exercise: Exercise };

async function experienceOrDefault(): Promise<UserProfile['experience']> {
  try {
    return (await getProfile()).experience;
  } catch {
    return 'intermediate'; // no profile yet — never the beginner fast lane
  }
}

/**
 * `includeToday`: the live workout counts a workout finished earlier today (its PREVIOUS
 * column already shows it; the open draft is not saved yet, so it never counts itself).
 * The chat's "today's workout" keeps sessions before today so it stays stable all day.
 */
async function targetsFor(exercises: PlanExerciseFull[], includeToday: boolean): Promise<ProgressionTarget[]> {
  const today = todayISO();
  const experience = await experienceOrDefault();
  return Promise.all(
    exercises.map(async (pe) => {
      const raw = await getProgressionHistory(pe.exerciseId, HISTORY_SESSIONS + 1);
      const history = raw
        .filter((h) => (includeToday ? h.dateISO <= today : h.dateISO < today))
        .slice(0, HISTORY_SESSIONS);
      return computeProgressionTarget({
        exercise: pe.exercise,
        target: { targetSets: pe.targetSets, repRangeMin: pe.repRangeMin, repRangeMax: pe.repRangeMax },
        history,
        todayISO: today,
        experience,
      });
    }),
  );
}

/**
 * Map of `exerciseId -> target` for the exercises of `planDayId`.
 * Empty when there's no plan day (Start-Empty / repeat-a-session / no plan).
 */
export async function getTargetsForPlanDay(
  planDayId: string | null,
): Promise<Map<string, ProgressionTarget>> {
  const out = new Map<string, ProgressionTarget>();
  if (!planDayId) return out;
  const active = await getActivePlan();
  const day = active?.days.find((d) => d.id === planDayId) ?? null;
  if (!day) return out;
  const targets = await targetsFor(day.exercises, true);
  // A plan day normally lists an exercise once; if twice, keep the first.
  for (const t of targets) if (!out.has(t.exerciseId)) out.set(t.exerciseId, t);
  return out;
}

/** The frozen `getTodaysWorkout()` with its targets recomputed by the v2 engine. */
export async function getTodaysWorkoutWithTargets(): Promise<Omit<TodaysWorkout, 'targets'> & { targets: ProgressionTarget[] }> {
  const tw = await getTodaysWorkout();
  if (!tw.planDayId || tw.targets.length === 0) return { ...tw, targets: [] };
  const active = await getActivePlan();
  const day = active?.days.find((d) => d.id === tw.planDayId) ?? null;
  if (!day) return { ...tw, targets: [] };
  return { ...tw, targets: await targetsFor(day.exercises, false) };
}

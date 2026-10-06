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
 *
 * Phase 2: the engine is told how each exercise is logged (timed holds, assisted, bodyweight
 * reps…), its caps, and its easier / harder versions with their row in the member's
 * library (so "Switch to …" can open it). Distance work and timed cardio get no Target — the
 * research gives no rule for them; the PREVIOUS column already shows last time. They stay in
 * today's workout (Home, chat) as `free` entries; the workout card shows no line for them.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { todayISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { getExerciseIdsByCatalogKey, getTrackerExercisesByIds, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { getProgressionHistory } from '@/tracker/db/progressionHistory';
import { getsTarget, repsPerSide, weightIsEach } from '@/tracker/engine/logTypes';
import { computeProgressionTarget, freeTarget, type ProgressionTarget, type VersionLink } from '@/tracker/engine/progression';
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

/** Phase 2 facts per exercise: its type and caps, and its linked versions in this library. */
async function extrasFor(exercises: PlanExerciseFull[]): Promise<{
  infos: Map<string, TrackerExercise>;
  versionIds: Map<string, string>;
}> {
  const infos = await getTrackerExercisesByIds(exercises.map((pe) => pe.exerciseId)).catch(
    () => new Map<string, TrackerExercise>(),
  );
  const keys: string[] = [];
  for (const info of infos.values()) {
    const e = catalogEntry(info.catalogKey);
    if (e?.easier) keys.push(e.easier);
    if (e?.harder) keys.push(e.harder);
  }
  const versionIds = await getExerciseIdsByCatalogKey(keys).catch(() => new Map<string, string>());
  return { infos, versionIds };
}

function link(key: string | undefined, ids: Map<string, string>): VersionLink | null {
  const e = catalogEntry(key);
  return e ? { id: ids.get(e.key) ?? null, name: e.name } : null;
}

/**
 * `includeToday`: the live workout counts a workout finished earlier today (its PREVIOUS
 * column already shows it; the open draft is not saved yet, so it never counts itself).
 * The chat's "today's workout" keeps sessions before today so it stays stable all day.
 */
async function targetsFor(exercises: PlanExerciseFull[], includeToday: boolean): Promise<ProgressionTarget[]> {
  const today = todayISO();
  const [experience, { infos, versionIds }] = await Promise.all([experienceOrDefault(), extrasFor(exercises)]);
  const targets = await Promise.all(
    exercises.map(async (pe): Promise<ProgressionTarget> => {
      const info = infos.get(pe.exerciseId);
      const logType = info?.logType ?? 'weight_reps';
      const target = { targetSets: pe.targetSets, repRangeMin: pe.repRangeMin, repRangeMax: pe.repRangeMax };
      // Distance work and timed cardio get no Target (the "+5 s" rule is for holds).
      if (!getsTarget(logType, info?.muscles.primary ?? [])) return freeTarget({ exercise: pe.exercise, target, logType });
      const entry = catalogEntry(info?.catalogKey);
      const raw = await getProgressionHistory(pe.exerciseId, HISTORY_SESSIONS + 1);
      const history = raw
        .filter((h) => (includeToday ? h.dateISO <= today : h.dateISO < today))
        .slice(0, HISTORY_SESSIONS);
      const t = computeProgressionTarget({
        exercise: pe.exercise,
        target,
        history,
        todayISO: today,
        experience,
        logType,
        repCap: entry?.repCap ?? null,
        holdCapSec: entry?.holdCapSec ?? null,
        harder: link(entry?.harder, versionIds),
        easier: link(entry?.easier, versionIds),
      });
      const mode = info?.loadMode ?? 'one';
      if (weightIsEach(mode)) t.each = true;
      if (repsPerSide(mode)) t.perSide = true;
      return t;
    }),
  );
  return targets;
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
  // A plan day normally lists an exercise once; if twice, keep the first. No line for free ones.
  for (const t of targets) if (!t.free && !out.has(t.exerciseId)) out.set(t.exerciseId, t);
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

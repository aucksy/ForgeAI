/**
 * Muscle tips on the Up next card (R-58, owner 22 Oct 2026; rebuilt for R-482, owner 13 Nov 2026:
 * "build all 5"). Design: docs/overhaul/research/R-muscle-balance.md; the rules are
 * `engine/muscleBalance` (pure, tested).
 *
 * R-482: the tip judges the member's ROUTINES (the plan), never the logs. "The member's week" is the
 * folder of the routine up next: its routines, each run (plan days a week / routines) times a week
 * (`planDaysPerWeek`; the member's own folder = each routine once a week). A skipped exercise is still
 * in the plan, so it never makes a tip.
 *
 * Two tips, one at a time, tip 1 first:
 *  1. "None of your routines trains your calves. Add 3 sets of Standing Calf Raise to your Legs
 *     routine?" [Add] [Not now] · I skip this on purpose — shown on that routine's Up next card.
 *  2. "Your routines give your shoulders 3 sets a week and your chest 12. Add 3 sets of Dumbbell
 *     Shoulder Press to your Push routine, or swap Incline Dumbbell Press for it?" [Add] [Swap] [Not now]
 *     · Keep as is. Swap = same sets, same place; Add (R-492, owner 14 Nov 2026) = 3 sets at the end,
 *     nothing taken out. Undo after either.
 * R-492: every tip is labelled "Smart suggestion" and carries an (i) whose sheet says why, with the
 * real numbers (`why`, engine `tipWhy`).
 *
 * Shown only when ALL hold (rules against FOMO, research section 5):
 *  - Settings → Workouts → Muscle tips is on, and this is not an easy week;
 *  - the folder is the member's own (never a plan from the gym's trainer or a ready program: their
 *    design is respected, and nothing is swapped inside them);
 *  - the plan is really in use (R-482 choice, `planSettled`): every routine finished at least once
 *    and the first of them 14+ days ago. This replaces R-58's "3 weeks and 4 workouts", which only
 *    made sense for the logs; a brand-new plan is never judged on day 1;
 *  - beginners see the big groups only; muted and snoozed groups stay quiet;
 *  - today's routine is the one the tip changes.
 * A NEW group shows at most once a week. Never during a workout, on the finish screen or as a
 * notification (this is only ever read by the Workout tab).
 */
import { getDb } from '@/db';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { daysBetween, todayISO } from '@/lib/date';

import { setShares } from '../catalog/muscles';
import { getExerciseIdsByCatalogKey, getTrackerExercisesByIds } from '../db/exerciseInfo';
import { folderOfRoutine, listFolders } from '../db/folderRepo';
import { addExerciseToRoutine, removeRoutineExercise, restoreRoutineRow, swapRoutineExerciseKeepingSets, type RoutineRowSnapshot } from '../db/routineRepo';
import {
  addLine,
  chooseSwap,
  groupSetsAWeek,
  homeRoutines,
  missingGroups,
  musclesOfGroup,
  planSettled,
  swapLine,
  timesPerWeekOf,
  tipWhy,
  underTrainedGroups,
  weekFromRoutines,
  whyRows,
  type BalanceGroup,
  type CompareGroup,
  type PlannedRoutine,
  type PlannedWeek,
  type SwapChoice,
  type TipWhyWords,
} from '../engine/muscleBalance';
import { muscleTipsLoaded, NEW_TIP_DAYS, quietGroups, useMuscleTips } from '../store/muscleTipsStore';
import { getPlanNow, planDaysPerWeek } from './planState';

// Kept where the screens and tests have always imported them from.
export { fitsDay, musclesOfGroup } from '../engine/muscleBalance';

/** The library's picks when the member has never done an exercise for the group (first that exists). */
export const DEFAULT_PICKS: Readonly<Record<BalanceGroup, readonly string[]>> = {
  legs: ['leg_press', 'goblet_squat'],
  back: ['lat_pulldown', 'seated_cable_row'],
  chest: ['barbell_bench_press', 'push_up'],
  hamstrings: ['lying_leg_curl', 'seated_leg_curl', 'romanian_deadlift'],
  glutes: ['barbell_hip_thrust'],
  quads: ['leg_press', 'goblet_squat'],
  core: ['plank', 'crunch'],
  shoulders: ['dumbbell_shoulder_press', 'overhead_press'],
  rear_shoulders: ['face_pull', 'rear_delt_fly'],
  side_shoulders: ['lateral_raise'],
  calves: ['standing_calf_raise', 'seated_calf_raise'],
  triceps: ['triceps_pushdown'],
  biceps: ['dumbbell_curl'],
};

/** A group the week asks for, and the routine its tip would change. */
export interface TipCandidate {
  group: BalanceGroup;
  routineId: string;
}

/**
 * The tip to show on today's routine: the group on show keeps its place while the week still asks
 * for it (on its own routine's day); a NEW group only when the last one shown is a week old. R-482:
 * that clock holds even when the last group is settled (added, swapped, put away with "Not now", "I
 * skip this on purpose" or "Keep as is"): judging the routines, "Add" itself settles a group, and the
 * next tip must not follow the same minute. Then the first candidate whose routine is up next today.
 * PURE.
 */
export function pickCandidate<C extends TipCandidate>(
  candidates: readonly C[],
  todayRoutineId: string,
  shown: { group: BalanceGroup; sinceISO: string } | null,
  today: string,
): C | null {
  if (candidates.length === 0) return null;
  if (shown && daysBetween(shown.sinceISO, today) < NEW_TIP_DAYS) {
    const same = candidates.find((c) => c.group === shown.group);
    return same && same.routineId === todayRoutineId ? same : null;
  }
  if (shown) {
    // A week on: the group on show still keeps its place, on its own routine's day.
    const same = candidates.find((c) => c.group === shown.group);
    if (same) return same.routineId === todayRoutineId ? same : null;
  }
  return candidates.find((c) => c.routineId === todayRoutineId) ?? null;
}

/**
 * The candidates of the week, tip 1 first: when any group has no routine training it, only those
 * (tip 1 wins); else the big groups far below the rest, each with a swap that keeps every group
 * trained. PURE.
 */
export function tipCandidates(
  week: PlannedWeek,
  opts: { beginner?: boolean; quiet?: ReadonlySet<BalanceGroup> } = {},
): ({ kind: 'add'; group: BalanceGroup; routineId: string } | { kind: 'swap'; group: CompareGroup; routineId: string; swap: SwapChoice; others: number })[] {
  const quiet = opts.quiet ?? new Set<BalanceGroup>();
  const planned = weekFromRoutines(week);
  const adds = missingGroups(planned, { beginner: opts.beginner, quiet }).flatMap((group) => {
    const home = homeRoutines(group, week.routines)[0];
    return home ? [{ kind: 'add' as const, group, routineId: home.id }] : [];
  });
  if (adds.length > 0) return adds;
  const counts = groupSetsAWeek(week);
  return underTrainedGroups(counts, planned, quiet).flatMap((u) => {
    const swap = chooseSwap(u.group, week, counts);
    return swap ? [{ kind: 'swap' as const, group: u.group, routineId: swap.routineId, swap, others: u.others }] : [];
  });
}

interface TipBase {
  group: BalanceGroup;
  routineId: string;
  routineName: string;
  /** The exercise that goes in. */
  exerciseId: string;
  exerciseName: string;
  /** Swap: the sets of the row it replaces (kept). Add: the sets it is added with. */
  sets: number;
  /** The sets "Add" gives the exercise (tip 1 = `sets`; tip 2's Add, R-492). */
  addSets: number;
  line: string;
  /** R-492: every line of the (i) "Why we suggest this" sheet, with the real numbers. */
  why: TipWhyWords;
}
export type MuscleTip =
  | (TipBase & { kind: 'add' })
  | (TipBase & { kind: 'swap'; group: CompareGroup; outRowId: string; outExerciseId: string; outName: string });

/** What the member pressed: tip 1 only ever adds; tip 2 adds or swaps (R-492). */
export type MuscleTipAction = 'add' | 'swap';

/** What "Add" or "Swap" did, so Undo can put it back. */
export type MuscleTipDone = { kind: 'add'; rowId: string } | { kind: 'swap'; before: RoutineRowSnapshot };

/** The member's most-done exercise whose MAIN muscle is in the group (all history), else null. */
async function membersOwnPick(group: BalanceGroup, exclude: ReadonlySet<string>): Promise<{ id: string; name: string } | null> {
  const rows = await getDb().getAllAsync<{ exercise_id: string; n: number }>(
    `SELECT se.exercise_id, COUNT(*) AS n FROM set_entries se
       JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE se.is_warmup = 0 AND ws.source != 'seed'
      GROUP BY se.exercise_id ORDER BY n DESC LIMIT 200`,
  );
  if (rows.length === 0) return null;
  const infos = await getTrackerExercisesByIds(rows.map((r) => r.exercise_id));
  const want = new Set(musclesOfGroup(group));
  for (const r of rows) {
    if (exclude.has(r.exercise_id)) continue;
    const info = infos.get(r.exercise_id);
    if (info && info.muscles.primary.some((m) => want.has(m))) return { id: info.id, name: info.name };
  }
  return null;
}

async function libraryPick(group: BalanceGroup, exclude: ReadonlySet<string>): Promise<{ id: string; name: string } | null> {
  const keys = DEFAULT_PICKS[group];
  const ids = await getExerciseIdsByCatalogKey([...keys]);
  for (const k of keys) {
    const id = ids.get(k);
    if (!id || exclude.has(id)) continue;
    const info = (await getTrackerExercisesByIds([id])).get(id);
    if (info) return { id, name: info.name };
  }
  return null;
}

/** The first day each routine was finished (a demo workout never counts). */
async function firstDoneByRoutine(routineIds: readonly string[]): Promise<Map<string, string | null>> {
  if (routineIds.length === 0) return new Map();
  const rows = await getDb().getAllAsync<{ routine_id: string; d: string | null }>(
    `SELECT routine_id, MIN(date_iso) AS d FROM workout_sessions
      WHERE source != 'seed' AND routine_id IN (${routineIds.map(() => '?').join(', ')})
      GROUP BY routine_id`,
    [...routineIds],
  );
  return new Map(rows.map((r) => [r.routine_id, r.d]));
}

/** The tip for this routine today, or null (most days). Never throws. */
export async function muscleTipFor(routine: Pick<PlanDayFull, 'id'>, today: string = todayISO()): Promise<MuscleTip | null> {
  try {
    await muscleTipsLoaded();
    const prefs = useMuscleTips.getState();
    if (!prefs.on) return null;
    const folder = await folderOfRoutine(routine.id);
    if (!folder || folder.settings.fromGym || folder.settings.program) return null;
    const plan = await getPlanNow(today).catch((e: unknown) => {
      console.warn('[ForgeErr] muscle tip: the plan week could not be read', e);
      return null;
    });
    if (plan?.easy) return null;
    const full = (await listFolders()).find((f) => f.id === folder.id);
    const used = (full?.routines ?? []).filter((r) => r.dayType !== 'rest' && r.exercises.length > 0);
    if (!used.some((r) => r.id === routine.id)) return null;
    if (!planSettled(await firstDoneByRoutine(used.map((r) => r.id)), used.map((r) => r.id), today)) return null;

    const infos = await getTrackerExercisesByIds([...new Set(used.flatMap((r) => r.exercises.map((x) => x.exerciseId)))]);
    const routines: PlannedRoutine[] = used.map((r) => ({
      id: r.id,
      name: r.name,
      dayType: r.dayType,
      exercises: r.exercises.flatMap((x) => {
        const info = infos.get(x.exerciseId);
        if (!info) return [];
        return [{ rowId: x.id, exerciseId: x.exerciseId, name: info.name, sets: x.targetSets, shares: setShares(info.muscles), compound: info.isCompound }];
      }),
    }));
    const week: PlannedWeek = { routines, timesPerWeek: timesPerWeekOf(planDaysPerWeek(folder.settings, routines.length), routines.length) };

    const profile = await getProfile().catch((e: unknown) => {
      console.warn('[ForgeErr] muscle tip: the profile could not be read', e);
      return null;
    });
    const beginner = profile?.experience === 'beginner';
    const quiet = quietGroups(prefs, today);
    const chosen = pickCandidate(tipCandidates(week, { beginner, quiet }), routine.id, prefs.shown, today);
    if (!chosen) return null;
    const target = routines.find((r) => r.id === chosen.routineId);
    if (!target) return null;
    // Never an exercise this routine already lists.
    const inRoutine = new Set(target.exercises.map((x) => x.exerciseId));
    const pick = (await membersOwnPick(chosen.group, inRoutine)) ?? (await libraryPick(chosen.group, inRoutine));
    if (!pick) return null;
    prefs.markShown(chosen.group, today);
    const n = beginner ? 2 : 3;
    const whyBase = {
      group: chosen.group,
      routineNames: routines.map((r) => r.name),
      timesPerWeek: week.timesPerWeek,
      rows: whyRows(chosen.group, week, chosen.kind),
      exerciseName: pick.name,
      routineName: target.name,
      addSets: n,
    };
    if (chosen.kind === 'add') {
      return {
        kind: 'add',
        group: chosen.group,
        routineId: target.id,
        routineName: target.name,
        exerciseId: pick.id,
        exerciseName: pick.name,
        sets: n,
        addSets: n,
        line: addLine(chosen.group, pick.name, n, target.name),
        why: tipWhy({ ...whyBase, kind: 'add' }),
      };
    }
    const s = chosen.swap;
    return {
      kind: 'swap',
      group: chosen.group,
      routineId: target.id,
      routineName: target.name,
      exerciseId: pick.id,
      exerciseName: pick.name,
      sets: s.out.sets,
      addSets: n,
      outRowId: s.out.rowId,
      outExerciseId: s.out.exerciseId,
      outName: s.out.name,
      line: swapLine(chosen.group, s.toSets, s.from, s.fromSets, s.out.name, pick.name, target.name, n),
      why: tipWhy({ ...whyBase, kind: 'swap', others: chosen.others, outName: s.out.name }),
    };
  } catch (e) {
    console.warn('[ForgeErr] muscle tip could not be worked out', e);
    return null;
  }
}

/**
 * "Add" (tip 1, and tip 2 since R-492): the exercise goes at the end of the routine with `addSets`
 * sets, nothing taken out. "Swap" (tip 2): it takes the other exercise's place with the same sets.
 * Null when the routine changed since the tip was worked out (nothing is written then). Only ever the
 * member's own routine (never a gym plan or ready program).
 */
export async function applyMuscleTip(tip: MuscleTip, how: MuscleTipAction = tip.kind): Promise<MuscleTipDone | null> {
  if (tip.kind === 'add' || how === 'add') {
    const rowId = await addExerciseToRoutine(tip.routineId, tip.exerciseId, { targetSets: tip.addSets });
    return { kind: 'add', rowId };
  }
  const before = await swapRoutineExerciseKeepingSets(tip.outRowId, tip.outExerciseId, tip.exerciseId);
  return before ? { kind: 'swap', before } : null;
}

/** Undo: the routine exactly as it was before "Add" or "Swap". */
export async function undoMuscleTip(done: MuscleTipDone): Promise<void> {
  if (done.kind === 'add') await removeRoutineExercise(done.rowId);
  else await restoreRoutineRow(done.before);
}

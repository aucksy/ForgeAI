/**
 * Missing-muscle suggestions (R-58, owner 22 Oct 2026): the one calm tip on the Up next card.
 * Design: docs/overhaul/research/R-muscle-balance.md, section 6. The check is `engine/muscleBalance`.
 *
 * Shown only when ALL hold (rules against FOMO, section 5):
 *  - Settings → Workouts → Muscle tips is on, and this is not an easy week;
 *  - the member has trained for 3 weeks (first workout 21+ days ago) with 4+ strength workouts in
 *    the last 3 weeks — before that the week says too little;
 *  - those 3 weeks leave a group close to zero (`missingGroups`), it is not muted or snoozed;
 *  - today's routine is that group's home (legs on a legs / lower / full day, back on a pull / upper
 *    / full day, …), and the routine does not already list an exercise for it;
 *  - the routine is not a plan from the gym's trainer or a ready program (their design is respected).
 * One group at a time: a NEW group shows at most once a week. Never during a workout, on the finish
 * screen or as a notification (this is only ever read by the Workout tab).
 */
import { getDb } from '@/db';
import type { PlanDayFull } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { addDays, daysBetween, todayISO } from '@/lib/date';
import type { DayType } from '@/types/models';

import type { Muscle } from '../catalog/muscles';
import { getExerciseIdsByCatalogKey, getTrackerExercisesByIds } from '../db/exerciseInfo';
import { folderOfRoutine } from '../db/folderRepo';
import { addExerciseToRoutine } from '../db/routineRepo';
import { GROUP_MUSCLES, missingGroups, todayLine, weekFromLogged, type BalanceGroup } from '../engine/muscleBalance';
import { NEW_TIP_DAYS, quietGroups, useMuscleTips } from '../store/muscleTipsStore';
import { getPlanNow } from './planState';
import { getBalanceSets } from './volumeService';

/** The muscles of a group ("legs" = quads, hamstrings and glutes). */
export function musclesOfGroup(group: BalanceGroup): readonly Muscle[] {
  return group === 'legs' ? [...GROUP_MUSCLES.quads, ...GROUP_MUSCLES.hamstrings, ...GROUP_MUSCLES.glutes] : GROUP_MUSCLES[group];
}

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

/** Which routine days are a group's home (core and calves fit any training day). PURE. */
export function fitsDay(group: BalanceGroup, day: DayType): boolean {
  if (day === 'rest') return false;
  if (day === 'full') return true;
  switch (group) {
    case 'legs':
    case 'quads':
    case 'hamstrings':
    case 'glutes':
      return day === 'legs' || day === 'lower';
    case 'back':
    case 'rear_shoulders':
    case 'biceps':
      return day === 'pull' || day === 'upper';
    case 'chest':
    case 'side_shoulders':
    case 'triceps':
    case 'shoulders':
      return day === 'push' || day === 'upper';
    case 'core':
    case 'calves':
    default:
      return true;
  }
}

/**
 * The group to show today: the first missing one whose home is this day — but a NEW group only when
 * the last one shown is a week old (or no longer missing). PURE.
 */
export function groupForDay(
  missing: readonly BalanceGroup[],
  day: DayType,
  shown: { group: BalanceGroup; sinceISO: string } | null,
  today: string,
): BalanceGroup | null {
  const fits = missing.filter((g) => fitsDay(g, day));
  if (fits.length === 0) return null;
  if (shown && missing.includes(shown.group)) {
    if (fits.includes(shown.group)) return shown.group;
    if (daysBetween(shown.sinceISO, today) < NEW_TIP_DAYS) return null;
  }
  return fits[0];
}

export interface MuscleTip {
  group: BalanceGroup;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  line: string;
}

/** The member's most-done exercise whose MAIN muscle is in the group (all history), else null. */
async function membersOwnPick(group: BalanceGroup): Promise<{ id: string; name: string } | null> {
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
    const info = infos.get(r.exercise_id);
    if (info && info.muscles.primary.some((m) => want.has(m))) return { id: info.id, name: info.name };
  }
  return null;
}

async function libraryPick(group: BalanceGroup): Promise<{ id: string; name: string } | null> {
  const keys = DEFAULT_PICKS[group];
  const ids = await getExerciseIdsByCatalogKey([...keys]);
  for (const k of keys) {
    const id = ids.get(k);
    if (!id) continue;
    const info = (await getTrackerExercisesByIds([id])).get(id);
    if (info) return { id, name: info.name };
  }
  return null;
}

/** The tip for this routine today, or null (most days). Never throws. */
export async function muscleTipFor(
  routine: Pick<PlanDayFull, 'id' | 'dayType' | 'exercises'>,
  today: string = todayISO(),
): Promise<MuscleTip | null> {
  try {
    const prefs = useMuscleTips.getState();
    if (!prefs.on) return null;
    const folder = await folderOfRoutine(routine.id);
    if (!folder || folder.settings.fromGym || folder.settings.program) return null;
    const plan = await getPlanNow(today).catch((e: unknown) => {
      console.warn('[ForgeErr] muscle tip: the plan week could not be read', e);
      return null;
    });
    if (plan?.easy) return null;
    const first = await getDb().getFirstAsync<{ d: string | null }>("SELECT MIN(date_iso) AS d FROM workout_sessions WHERE source != 'seed'");
    if (!first?.d || daysBetween(first.d, today) < 21) return null;
    const { sets, workouts } = await getBalanceSets(addDays(today, -21), addDays(today, -1));
    if (workouts < 4) return null;
    const profile = await getProfile().catch((e: unknown) => {
      console.warn('[ForgeErr] muscle tip: the profile could not be read', e);
      return null;
    });
    const beginner = profile?.experience === 'beginner';
    const missing = missingGroups(weekFromLogged(sets, 3), { beginner, quiet: quietGroups(prefs, today) });
    const group = groupForDay(missing, routine.dayType, prefs.shown, today);
    if (!group) return null;
    // The routine already lists an exercise for it (skipped lately): no tip, it is already planned.
    const want = new Set(musclesOfGroup(group));
    const infos = await getTrackerExercisesByIds(routine.exercises.map((x) => x.exerciseId));
    const listed = routine.exercises.some((x) => infos.get(x.exerciseId)?.muscles.primary.some((m) => want.has(m)) ?? false);
    if (listed) return null;
    const pick = (await membersOwnPick(group)) ?? (await libraryPick(group));
    if (!pick) return null;
    const n = beginner ? 2 : 3;
    prefs.markShown(group, today);
    return { group, exerciseId: pick.id, exerciseName: pick.name, sets: n, line: todayLine(group, pick.name, n) };
  } catch (e) {
    console.warn('[ForgeErr] muscle tip could not be worked out', e);
    return null;
  }
}

/** "Add": the exercise goes into the routine (the member's own routine; never a gym plan). */
export async function addMuscleTip(routineId: string, tip: MuscleTip): Promise<void> {
  await addExerciseToRoutine(routineId, tip.exerciseId, { targetSets: tip.sets });
}

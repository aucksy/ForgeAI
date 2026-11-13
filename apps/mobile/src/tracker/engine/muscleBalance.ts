/**
 * Missing-muscle suggestions (R-58, owner 22 Oct 2026; design: docs/overhaul/research/R-muscle-balance.md).
 * PURE: the one shared check of which muscle group a member's week leaves out.
 *
 * Rules against FOMO (research section 5), owner: "I do not want people to experience FOMO":
 *  - judge a whole week, never one routine or one day. Since R-482 (13 Nov 2026) the Up next tip judges
 *    the PLANNED week (the member's routines), never the logs: see the R-482 block below;
 *  - "missing" is close to zero only: under 2 counted sets a week AND no set where the group is the
 *    main muscle. Never "below ideal" (10 sets is a goal for size, not a bar);
 *  - one suggestion at a time, in a fixed order; related gaps merge into one ("Legs", not three);
 *  - beginners see the big groups only; muted and snoozed groups never show.
 * Counting is the app's usual one (`setShares`): a working set counts 1 for each main muscle and 0.5
 * for each helper.
 */
import type { DayType } from '@/types/models';

import type { Muscle } from '../catalog/muscles';

/** The groups that can be suggested (front shoulders, traps, lower back, forearms, inner and outer hips never are). */
export type BalanceGroup =
  | 'legs'
  | 'back'
  | 'chest'
  | 'hamstrings'
  | 'glutes'
  | 'quads'
  | 'core'
  | 'shoulders'
  | 'rear_shoulders'
  | 'side_shoulders'
  | 'calves'
  | 'triceps'
  | 'biceps';

/** The muscles each judged group is built from ("legs" is only ever a merge of the three below). */
export const GROUP_MUSCLES: Readonly<Record<Exclude<BalanceGroup, 'legs'>, readonly Muscle[]>> = {
  chest: ['chest'],
  back: ['lats', 'upper_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  core: ['abs', 'obliques'],
  rear_shoulders: ['rear_delts'],
  side_shoulders: ['side_delts'],
  calves: ['calves'],
  triceps: ['triceps'],
  biceps: ['biceps'],
};

/** The 7 big groups (ACSM / CDC "all major muscle groups"); "legs" counts as big. */
export const BIG_GROUPS: readonly BalanceGroup[] = ['legs', 'chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'core'];

/** Which one shows when several are missing (research section 6). */
export const BALANCE_ORDER: readonly BalanceGroup[] = [
  'legs',
  'back',
  'chest',
  'hamstrings',
  'glutes',
  'quads',
  'core',
  'shoulders',
  'rear_shoulders',
  'side_shoulders',
  'calves',
  'triceps',
  'biceps',
];

/** How a group reads in a sentence ("for your rear shoulders", "no hamstring work"). */
export const GROUP_WORDS: Readonly<Record<BalanceGroup, { your: string; work: string }>> = {
  legs: { your: 'legs', work: 'leg' },
  back: { your: 'back', work: 'back' },
  chest: { your: 'chest', work: 'chest' },
  hamstrings: { your: 'hamstrings', work: 'hamstring' },
  glutes: { your: 'glutes', work: 'glute' },
  quads: { your: 'quads', work: 'quad' },
  core: { your: 'core', work: 'core' },
  shoulders: { your: 'shoulders', work: 'shoulder' },
  rear_shoulders: { your: 'rear shoulders', work: 'rear shoulder' },
  side_shoulders: { your: 'side shoulders', work: 'side shoulder' },
  calves: { your: 'calves', work: 'calf' },
  triceps: { your: 'triceps', work: 'triceps' },
  biceps: { your: 'biceps', work: 'biceps' },
};

/** Under this many counted sets a week (and no main-muscle set) a group is "close to zero". */
export const NEAR_ZERO_SETS = 2;

export interface WeekSets {
  /** Counted sets a week per muscle (1 main, 0.5 helper), averaged over the weeks judged. */
  counted: ReadonlyMap<Muscle, number>;
  /** Sets a week where the muscle was a MAIN muscle. */
  main: ReadonlyMap<Muscle, number>;
}

export interface BalanceOptions {
  /** Beginners see the big groups only. */
  beginner?: boolean;
  /** Groups the member muted ("I skip this on purpose") or snoozed ("Not now", 4 weeks). */
  quiet?: ReadonlySet<BalanceGroup>;
}

/** Is this group close to zero this week? PURE. */
export function groupMissing(group: Exclude<BalanceGroup, 'legs'>, week: WeekSets): boolean {
  const muscles = GROUP_MUSCLES[group];
  const counted = muscles.reduce((a, m) => a + (week.counted.get(m) ?? 0), 0);
  const main = muscles.reduce((a, m) => a + (week.main.get(m) ?? 0), 0);
  return counted < NEAR_ZERO_SETS - 1e-9 && main <= 1e-9;
}

/**
 * The groups to suggest, most important first (usually one is shown). Quads, hamstrings and glutes
 * all missing become "legs"; a missing back covers its rear shoulders and biceps; a missing chest
 * covers its triceps and side shoulders. PURE.
 */
export function missingGroups(week: WeekSets, opts: BalanceOptions = {}): BalanceGroup[] {
  const raw = new Set<BalanceGroup>(
    (Object.keys(GROUP_MUSCLES) as Exclude<BalanceGroup, 'legs'>[]).filter((g) => groupMissing(g, week)),
  );
  if (raw.has('quads') && raw.has('hamstrings') && raw.has('glutes')) {
    raw.delete('quads');
    raw.delete('hamstrings');
    raw.delete('glutes');
    raw.add('legs');
  }
  if (raw.has('back')) {
    raw.delete('rear_shoulders');
    raw.delete('biceps');
  }
  if (raw.has('chest')) {
    raw.delete('triceps');
    raw.delete('side_shoulders');
  }
  // A missing "shoulders" already says the side and rear are.
  if (raw.has('shoulders')) {
    raw.delete('side_shoulders');
    raw.delete('rear_shoulders');
  }
  return BALANCE_ORDER.filter(
    (g) => raw.has(g) && !(opts.quiet?.has(g) ?? false) && (!opts.beginner || BIG_GROUPS.includes(g)),
  );
}

/** One logged workout's working sets, as the check counts them. */
export interface CountedSet {
  /** The day of the workout (YYYY-MM-DD). */
  dateISO: string;
  /** How much the set counts for each muscle (`setShares`: 1 main, 0.5 helper). */
  shares: ReadonlyMap<Muscle, number>;
}

/** The logged sets averaged into a week (`weeks` weeks judged). PURE. */
export function weekFromLogged(sets: readonly CountedSet[], weeks: number): WeekSets {
  const counted = new Map<Muscle, number>();
  const main = new Map<Muscle, number>();
  const n = Math.max(1, weeks);
  for (const s of sets) {
    for (const [m, share] of s.shares) {
      counted.set(m, (counted.get(m) ?? 0) + share / n);
      if (share >= 1) main.set(m, (main.get(m) ?? 0) + 1 / n);
    }
  }
  return { counted, main };
}

// ---------------------------------------------------------------- R-482: judge the routines, not the logs

/*
 * R-482 (owner, 13 Nov 2026: "build all 5"). The Up next tip judges the member's PLAN: the routines in
 * the folder of the routine up next, each run as often a week as the plan says. A skipped exercise is
 * still in the plan, so it never makes a tip (his case: Standing Calf Raise sits in his Legs routine,
 * he skips it, and Pull 2 told him to add it again).
 *
 * Two tips, one at a time, tip 1 first:
 *  1. A group no routine trains (close to zero, the R-58 rule above, on the planned week): add one
 *     exercise to the routine that is the group's home.
 *  2. A big group trained much less than the others: swap one exercise of the routine's most-trained
 *     group for one of the under-trained group, same sets, same place. "Much less" is a clear gap,
 *     never "below ideal" (the R-58 rule against FOMO stays):
 *       - the group gets under a third of the median of the other compared groups, AND
 *       - at least 6 counted sets a week fewer than that median.
 *     Why: about 6 sets a week keeps a muscle (RP, research section 3), so a group a full 6 sets AND
 *     two thirds behind the middle of the member's own week is a design gap, not taste. A gap like
 *     6 against 10 never fires; 3 against 12 does.
 *     Compared: chest, back, shoulders, quads, hamstrings, glutes (the big groups of research
 *     section 2 without core: core is trained with fewer sets by design and gets work from every big
 *     lift; a core with no exercise at all is still tip 1).
 *     The swap takes out an exercise only when every group it is the main exercise for keeps another
 *     exercise in that routine (nothing becomes untrained), and only when the taken-from group still
 *     gets at least as many sets as the under-trained one afterwards (no new gap the other way).
 */

/** Each group counted once per set (a row that works lats AND upper back is one back set, not two). */
export function groupShare(group: Exclude<BalanceGroup, 'legs'>, shares: ReadonlyMap<Muscle, number>): number {
  let best = 0;
  for (const m of GROUP_MUSCLES[group]) best = Math.max(best, shares.get(m) ?? 0);
  return best;
}

/** One exercise row of a routine as the plan check sees it. */
export interface PlannedExercise {
  /** The routine row (plan_exercises id). */
  rowId: string;
  exerciseId: string;
  name: string;
  /** Working sets planned (warm-ups never count). */
  sets: number;
  /** `setShares` of the exercise: 1 for each main muscle, 0.5 for each helper. */
  shares: ReadonlyMap<Muscle, number>;
  /** A big lift (several joints): kept over a single-joint exercise when one must go. */
  compound?: boolean;
}

export interface PlannedRoutine {
  id: string;
  name: string;
  dayType: DayType;
  exercises: readonly PlannedExercise[];
}

/** The member's week: the routines of the folder, each run `timesPerWeek` times a week. */
export interface PlannedWeek {
  routines: readonly PlannedRoutine[];
  timesPerWeek: number;
}

/** How often each routine runs a week: the plan's days a week shared over its routines. PURE. */
export function timesPerWeekOf(daysPerWeek: number | null, routineCount: number): number {
  if (routineCount <= 0) return 0;
  return Math.max(1, daysPerWeek ?? routineCount) / routineCount;
}

/** The planned week as the R-58 check reads it (counted sets and main sets per muscle). PURE. */
export function weekFromRoutines(week: PlannedWeek): WeekSets {
  const counted = new Map<Muscle, number>();
  const main = new Map<Muscle, number>();
  for (const r of week.routines) {
    for (const x of r.exercises) {
      const n = Math.max(0, x.sets) * week.timesPerWeek;
      for (const [m, share] of x.shares) {
        counted.set(m, (counted.get(m) ?? 0) + share * n);
        if (share >= 1) main.set(m, (main.get(m) ?? 0) + n);
      }
    }
  }
  return { counted, main };
}

/** The big groups tip 2 compares. */
export const COMPARE_GROUPS = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'] as const;
export type CompareGroup = (typeof COMPARE_GROUPS)[number];
/** Tip 2 fires only under this share of the median of the other compared groups... */
export const GAP_RATIO = 1 / 3;
/** ...AND at least this many counted sets a week below it. */
export const GAP_MIN_SETS = 6;
/**
 * R-483 (owner, 13 Nov 2026: "Yes count only shoulder exercises"): the shoulders are counted by their
 * DIRECT exercises only (a shoulder muscle is a main muscle: side raises, rear-delt work, an overhead
 * press). A bench or incline press no longer adds half a shoulder set; before, every press did, and a
 * plan with one lateral raise read as 12 shoulder sets a week. Direct work is a smaller share of any
 * plan than the presses were, so the shoulders have their own bar: AT MOST half the median of the
 * other big groups AND at least 3 sets a week below it (one 3-set lateral raise in a plan whose other
 * groups get 6+ is a tip; a side raise plus a rear-delt exercise is not).
 */
export const SHOULDER_GAP_RATIO = 1 / 2;
export const SHOULDER_GAP_MIN_SETS = 3;

/**
 * How much one set of an exercise counts for a compared group: the group's best share (1 main, 0.5
 * helper), except the shoulders, where only a main (direct) shoulder exercise counts (R-483). PURE.
 */
export function compareShare(group: CompareGroup, shares: ReadonlyMap<Muscle, number>): number {
  const s = groupShare(group, shares);
  return group === 'shoulders' ? (s >= 1 ? 1 : 0) : s;
}

/** Counted sets a week per compared group (1 main, 0.5 helper, each set once per group; shoulders direct only). PURE. */
export function groupSetsAWeek(week: PlannedWeek): Map<CompareGroup, number> {
  const out = new Map<CompareGroup, number>(COMPARE_GROUPS.map((g) => [g, 0]));
  for (const r of week.routines) {
    for (const x of r.exercises) {
      const n = Math.max(0, x.sets) * week.timesPerWeek;
      for (const g of COMPARE_GROUPS) out.set(g, (out.get(g) ?? 0) + compareShare(g, x.shares) * n);
    }
  }
  return out;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface UnderTrained {
  group: CompareGroup;
  /** Its counted sets a week. */
  sets: number;
  /** The median of the other compared groups. */
  others: number;
}

/**
 * Tip 2's groups: a compared group far below the rest of the member's week (see the rule above),
 * biggest gap first. A group close to zero is tip 1's, never here. Quiet groups never show. PURE.
 */
export function underTrainedGroups(
  counts: ReadonlyMap<CompareGroup, number>,
  week: WeekSets,
  quiet: ReadonlySet<BalanceGroup> = new Set(),
): UnderTrained[] {
  const out: UnderTrained[] = [];
  for (const g of COMPARE_GROUPS) {
    if (quiet.has(g) || groupMissing(g, week)) continue;
    const sets = counts.get(g) ?? 0;
    const others = median(COMPARE_GROUPS.filter((o) => o !== g).map((o) => counts.get(o) ?? 0));
    const far =
      g === 'shoulders'
        ? sets <= others * SHOULDER_GAP_RATIO + 1e-9 && others - sets >= SHOULDER_GAP_MIN_SETS - 1e-9
        : sets < others * GAP_RATIO - 1e-9 && others - sets >= GAP_MIN_SETS - 1e-9;
    if (far) out.push({ group: g, sets, others });
  }
  return out.sort((a, b) => b.others - b.sets - (a.others - a.sets));
}

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

const plannedSets = (r: PlannedRoutine): number => r.exercises.reduce((a, x) => a + Math.max(0, x.sets), 0);

/**
 * The routines a group's exercise may go into, best first: calves on a legs or lower day first;
 * core (and calves with no such day) in the shortest routine; every other group on its home day,
 * shortest first. No home day at all (an upper-body-only plan and legs): every routine, shortest
 * first (R-58: "Add Leg Press to Upper A?"). Empty routines and rest days never. PURE.
 */
export function homeRoutines(group: BalanceGroup, routines: readonly PlannedRoutine[]): PlannedRoutine[] {
  const usable = routines.filter((r) => r.dayType !== 'rest' && r.exercises.length > 0);
  const byShort = (list: PlannedRoutine[]): PlannedRoutine[] =>
    list.map((r, i) => ({ r, i })).sort((a, b) => plannedSets(a.r) - plannedSets(b.r) || a.i - b.i).map((x) => x.r);
  if (group === 'calves') {
    const legDays = usable.filter((r) => r.dayType === 'legs' || r.dayType === 'lower');
    if (legDays.length > 0) return [...byShort(legDays), ...byShort(usable.filter((r) => !legDays.includes(r)))];
  }
  const fit = usable.filter((r) => fitsDay(group, r.dayType));
  return byShort(fit.length > 0 ? fit : usable);
}

/** The muscles of a group ("legs" = quads, hamstrings and glutes). */
export function musclesOfGroup(group: BalanceGroup): readonly Muscle[] {
  return group === 'legs' ? [...GROUP_MUSCLES.quads, ...GROUP_MUSCLES.hamstrings, ...GROUP_MUSCLES.glutes] : GROUP_MUSCLES[group];
}

/** Is this exercise a MAIN exercise for the group? */
export function trainsAsMain(group: BalanceGroup, shares: ReadonlyMap<Muscle, number>): boolean {
  return musclesOfGroup(group).some((m) => (shares.get(m) ?? 0) >= 1);
}

const JUDGED_GROUPS = Object.keys(GROUP_MUSCLES) as Exclude<BalanceGroup, 'legs'>[];

export interface SwapChoice {
  routineId: string;
  routineName: string;
  /** The row that goes out (its place and sets are kept for the exercise coming in). */
  out: PlannedExercise;
  /** The group it is taken from, and that group's counted sets a week before the swap. */
  from: CompareGroup;
  fromSets: number;
  /** The under-trained group's counted sets a week before the swap. */
  toSets: number;
}

/**
 * Tip 2's swap for `under`: in a home routine of the group (best first), take the routine's
 * most-trained compared group and one of its exercises, when:
 *  - every group that exercise is a main exercise for keeps ANOTHER main exercise in this routine
 *    (nothing becomes untrained), and it is not a main exercise for `under` itself;
 *  - after the swap the taken-from group still gets at least as many sets a week as `under`.
 * Of the exercises that qualify: a single-joint one first (a big lift costs more to lose), then the
 * later one in the routine. Null when no swap keeps every group trained. PURE.
 */
export function chooseSwap(under: CompareGroup, week: PlannedWeek, counts: ReadonlyMap<CompareGroup, number>): SwapChoice | null {
  const toSets = counts.get(under) ?? 0;
  for (const r of homeRoutines(under, week.routines)) {
    const fromGroups = COMPARE_GROUPS.filter((g) => g !== under && r.exercises.some((x) => groupShare(g, x.shares) >= 1)).sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
    for (const from of fromGroups) {
      const fromSets = counts.get(from) ?? 0;
      if (fromSets <= toSets) continue;
      const candidates = r.exercises
        .map((x, index) => ({ x, index }))
        .filter(({ x }) => {
          if (groupShare(from, x.shares) < 1 || trainsAsMain(under, x.shares)) return false;
          const moved = Math.max(0, x.sets) * week.timesPerWeek;
          if (fromSets - moved < toSets + moved - 1e-9) return false;
          // Every group this row is a main exercise for keeps another one in the routine.
          return JUDGED_GROUPS.every(
            (g) => groupShare(g, x.shares) < 1 || r.exercises.some((y) => y.rowId !== x.rowId && groupShare(g, y.shares) >= 1),
          );
        })
        .sort((a, b) => Number(a.x.compound ?? false) - Number(b.x.compound ?? false) || b.index - a.index);
      if (candidates.length > 0) return { routineId: r.id, routineName: r.name, out: candidates[0].x, from, fromSets, toSets };
    }
  }
  return null;
}

/**
 * Tip 1 and 2 need a plan that is really in use (R-482 choice): every routine with exercises has
 * been finished at least once, and the first of them 14 or more days ago. A brand-new plan, or a
 * routine never tried yet, is not judged on day 1 (two weeks to settle any first edits). This
 * replaces R-58's "3 weeks and 4 workouts", which judged the logs. PURE.
 */
export const PLAN_SETTLED_DAYS = 14;
export function planSettled(firstDone: ReadonlyMap<string, string | null>, routineIds: readonly string[], today: string): boolean {
  if (routineIds.length === 0) return false;
  let first: string | null = null;
  for (const id of routineIds) {
    const d = firstDone.get(id) ?? null;
    if (!d) return false;
    if (first == null || d < first) first = d;
  }
  if (first == null) return false;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`);
  return Math.round(ms / 86_400_000) >= PLAN_SETTLED_DAYS;
}

// ---------------------------------------------------------------- the words (member-words, R-482)

/** "your Legs routine" (a name that already says "routine" is not doubled). */
export function routineWords(name: string): string {
  const n = name.trim() || 'next';
  return /\broutine\b/i.test(n) ? `your ${n}` : `your ${n} routine`;
}

const setsWord = (n: number): string => `${n} ${n === 1 ? 'set' : 'sets'}`;

/**
 * Tip 1 on Up next: "None of your routines trains your calves. Add 3 sets of Standing Calf Raise to
 * your Legs routine?" PURE.
 */
export function addLine(group: BalanceGroup, exercise: string, sets: number, routine: string): string {
  return `None of your routines trains your ${GROUP_WORDS[group].your}. Add ${setsWord(sets)} of ${exercise} to ${routineWords(routine)}?`;
}

/**
 * Tip 2 on Up next: "Your routines give your shoulders 3 sets a week and your chest 12. Swap Incline
 * Dumbbell Press for Dumbbell Shoulder Press in your Push routine?" The numbers are the planned
 * counted sets a week, rounded to whole sets ("Your routines give" says they are the plan, not the
 * logged workouts; Gemini's second opinion asked for "planned"). PURE.
 */
export function swapLine(under: CompareGroup, underSets: number, from: CompareGroup, fromSets: number, outName: string, inName: string, routine: string): string {
  const u = Math.round(underSets);
  const f = Math.round(fromSets);
  return (
    `Your routines give your ${GROUP_WORDS[under].your} ${setsWord(u)} a week and your ${GROUP_WORDS[from].your} ${f}. ` +
    `Swap ${outName} for ${inName} in ${routineWords(routine)}?`
  );
}

/** Routine list line (same words as tip 1, said as a fact): "None of your routines trains your hamstrings. Adding Lying Leg Curl to your Legs routine would cover it." PURE. */
export function planLine(group: BalanceGroup, exercise: string, routine: string): string {
  return `None of your routines trains your ${GROUP_WORDS[group].your}. Adding ${exercise} to ${routineWords(routine)} would cover it.`;
}

/** The short confirmation after "Add" (with Undo). PURE. */
export function addedLine(exercise: string, routine: string): string {
  return `${exercise} added to ${routineWords(routine)}.`;
}

/** The short confirmation after "Swap" (with Undo). PURE. */
export function swappedLine(inName: string, outName: string, routine: string): string {
  return `${inName} now replaces ${outName} in ${routineWords(routine)}.`;
}

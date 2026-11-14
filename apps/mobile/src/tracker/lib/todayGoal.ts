/**
 * R-132 (owner, 25 Oct 2026: "Because the app is focused on progressive overload, this section will also
 * show the total session volume to achieve in today's session"): the Profile's "Next" line. PURE.
 *
 * The next workout is the Workout tab's Up next (`getTodaysWorkoutWithTargets`, the same answer). Its goal
 * is every exercise's Target added up (each set's weight x its rep goal), counted by the ONE volume rule
 * the finish screen uses (dumbbells counted "each" count both, pull-ups and dips add body weight).
 *
 * R-499 (owner, 14 Nov 2026, his Profile: "3,780 kg to lift today. 1,840 kg more than last time
 * (1,940 kg)"): the goal used to be compared with the newest workout of the ROUTINE as a whole, while
 * the goal itself was every exercise of the routine as planned now, minus the ones not counted. Those
 * are two different lists: his Pull 2 days in his own history ran 3 to 6 exercises (Hevy export: 27 Jul
 * 2,080 kg on 3 exercises, 22 Aug 3,435 kg on 6), so a short previous Pull 2 against the full plan read
 * as "+95%". The 2 exercises left out of the goal were still inside the previous total too. Now it is
 * like for like: the SAME exercises on both sides, each one's previous being the very sets its Target
 * and its PREVIOUS column read (`lastSets`), and each one's goal never under its previous (R-351,
 * never-suggest-less-than-last-time), except in an easy week, which says so. A plan with more (or
 * fewer) sets than the previous time says that too, so the difference is never a mystery.
 *  - An exercise with nothing to compare (new to the member, a different weight each set, a switch to
 *    another version, counted another way last time) is left out of BOTH numbers and named.
 *  - Timed and distance work counts as sets, never kilos.
 * Never says "volume", "session", "today" or "last time" (member words; R-499: Next and Previous).
 */
import { fmtInt, fmtTotalTime } from '@/lib/format';
import { fmtVol, type UnitSystem } from '@/lib/units';

import type { ChartMetric } from '../engine/historyChart';
import { isBodyweightFamily } from '../engine/logTypes';
import type { ProgressionTarget } from '../engine/progression';
import { kgPlan, type KgSet } from './kgTarget';

export type ProgressMode = Extract<ChartMetric, 'volume' | 'sets' | 'duration'>;
export const PROGRESS_MODES: readonly ProgressMode[] = ['volume', 'sets', 'duration'];

/**
 * F199 (owner R-403, 8 Nov 2026): the Next line sits under the Profile chart and follows its chip.
 * Kg lifted -> the kilos to lift; Duration -> how long it took the previous time. Reps has no line (the
 * Targets give rep goals per exercise, not one total to beat, so the line is left out); the old
 * Progress tab's Sets mode has no chip any more. PURE.
 */
export function todayModeFor(metric: ChartMetric): ProgressMode | null {
  if (metric === 'volume') return 'volume';
  if (metric === 'duration') return 'duration';
  return null;
}

type TargetIn = Pick<
  ProgressionTarget,
  'targetWeightKg' | 'targetRepsMin' | 'targetSets' | 'repGoal' | 'setGoals' | 'last' | 'bodyweightOnly' | 'logType' | 'free'
> &
  Partial<Pick<ProgressionTarget, 'topSetOnly' | 'version'>>;

/**
 * One exercise's planned working sets, and whether its kilos can be counted. PURE.
 * Not counted (0.57.1 review): a weighted lift never done (no weight yet); a pyramid or heavy-top day
 * (the Target is for the top set only, so every set at the top weight would overstate it); a switch to
 * another version of the exercise (last time was a different lift). Their sets still count.
 */
export function plannedSets(t: TargetIn): { sets: { weightKg: number; reps: number }[]; kgKnown: boolean } {
  const n = Math.max(0, t.setGoals.length > 0 ? t.setGoals.length : t.targetSets);
  const repsAt = (i: number): number => Math.max(0, t.setGoals[i] ?? t.repGoal ?? t.targetRepsMin);
  if (t.free) return { sets: Array.from({ length: n }, () => ({ weightKg: 0, reps: 0 })), kgKnown: true };
  // Assisted moves keep their (negative) help: the rule counts body weight minus it, as last time did.
  const weightKg = t.bodyweightOnly ? 0 : isBodyweightFamily(t.logType) ? t.targetWeightKg : Math.max(0, t.targetWeightKg);
  const kgKnown = !((t.logType === 'weight_reps' && !t.bodyweightOnly && t.last == null) || t.topSetOnly === true || t.version != null);
  return { sets: Array.from({ length: n }, (_, i) => ({ weightKg, reps: repsAt(i) })), kgKnown };
}

/** A Target as the Up next answer hands it over (coachTargets adds `lastSets`). */
export type GoalTarget = TargetIn &
  Pick<ProgressionTarget, 'exerciseId' | 'action'> &
  Partial<Pick<ProgressionTarget, 'easy' | 'countingChanged' | 'targetRepsMax' | 'sameWeightKg'>> & {
    /** Last time's working sets of this exercise (warm-ups and drops out), in the Target's counting. */
    lastSets?: readonly KgSet[];
  };

/** One exercise of the next workout, both sides of the comparison. */
export interface GoalPart {
  exerciseId: string;
  /** The planned working sets (as the exercise card plans them, `kgPlan`, where it has a plan). */
  planned: KgSet[];
  /** The previous time's working sets of the SAME exercise; empty when there is none. */
  last: KgSet[];
  /** The day of `last` (its body weight counts on pull-ups and dips). */
  lastISO: string | null;
  /** In the kilos on both sides. False: nothing fair to compare (named as "not counted"). */
  counted: boolean;
  /** Timed or distance work: sets only. */
  free: boolean;
  /** An easy week's Target (fewer sets on purpose, so it may sit under the previous). */
  easy: boolean;
}

/** Each exercise's planned and previous sets, like for like (R-499). PURE. */
export function goalParts(targets: readonly GoalTarget[]): GoalPart[] {
  return targets.map((t): GoalPart => {
    const base = plannedSets(t);
    const last = (t.lastSets ?? []).filter((s) => Number.isFinite(s.reps) && s.reps > 0 && Number.isFinite(s.weightKg));
    const lastISO = t.last?.dateISO ?? null;
    if (t.free) return { exerciseId: t.exerciseId, planned: base.sets, last: [], lastISO: null, counted: false, free: true, easy: false };
    // The exercise card's own plan where it has one (a lighter back-off or a heavy top set last time
    // stays as it was, as the set rows hint it), else the Target's sets at its weight.
    const card = t.easy ? null : kgPlan({ ...t, topSetOnly: t.topSetOnly === true }, last);
    const planned = card ? card.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })) : base.sets;
    const counted = base.kgKnown && t.action !== 'start' && t.countingChanged !== true && last.length > 0 && lastISO != null;
    return { exerciseId: t.exerciseId, planned, last, lastISO, counted, free: false, easy: t.easy === true };
  });
}

/** Kilos of some sets of one exercise by the one volume rule, on a day (that day's body weight). */
export type KgOf = (exerciseId: string, sets: readonly KgSet[], dateISO: string) => number;

/** The previous run of the routine itself: only its time is used (the Duration chip). */
export interface RoutineLast {
  durationSec: number;
  dateISO: string;
}

/**
 * R-499: the next workout's goal against the previous time of the SAME exercises. Each counted
 * exercise's goal is never under its own previous (outside an easy week). `today`: the day the body
 * weight is read for the planned sets. PURE.
 */
export function todayGoalFrom(
  routineName: string,
  targets: readonly GoalTarget[],
  kgOf: KgOf,
  routine: RoutineLast | null,
  today: string,
): TodayGoal {
  const parts = goalParts(targets);
  let volumeKg = 0;
  let lastKg = 0;
  let plannedCounted = 0;
  let lastSets = 0;
  let newest: string | null = null;
  for (const p of parts) {
    if (!p.counted || p.lastISO == null) continue;
    const before = kgOf(p.exerciseId, p.last, p.lastISO);
    const next = kgOf(p.exerciseId, p.planned, today);
    volumeKg += p.easy ? next : Math.max(next, before);
    lastKg += before;
    plannedCounted += p.planned.length;
    lastSets += p.last.length;
    if (newest == null || p.lastISO > newest) newest = p.lastISO;
  }
  const anyLast = newest != null || routine != null;
  return {
    routineName,
    volumeKg,
    sets: parts.reduce((n, p) => n + p.planned.length, 0),
    uncounted: parts.filter((p) => !p.counted && !p.free).length,
    easy: targets.some((t) => t.easy === true),
    setDiff: newest != null ? plannedCounted - lastSets : 0,
    last: anyLast
      ? {
          volumeKg: lastKg,
          sets: lastSets,
          durationSec: routine?.durationSec ?? 0,
          dateISO: newest ?? routine?.dateISO ?? '',
        }
      : null,
  };
}

export interface TodayGoal {
  routineName: string;
  /** Kilos the Targets add up to (only the counted exercises). */
  volumeKg: number;
  /** Every planned working set. */
  sets: number;
  /** Exercises left out of the kilos (`goalParts`: new to the member, a different weight each set, a new version). */
  uncounted: number;
  easy: boolean;
  /** R-499: planned working sets minus the previous time's, over the counted exercises (0 = the same). */
  setDiff?: number;
  /**
   * The previous time: `volumeKg` and `sets` = the counted exercises' previous sets (the same
   * exercises as the goal); `durationSec` = the routine's own previous run (0 = none). null = nothing
   * done before.
   */
  last: { volumeKg: number; sets: number; durationSec: number; dateISO: string } | null;
}

export interface GoalText {
  /** The big number ("12,450 kg"), or a dash when there is nothing to show yet. */
  big: string;
  /** What the number is ("to lift"). */
  label: string;
  /** Compared with the previous time, or why there is no number yet. */
  line: string;
  /** Up, down or level against the previous time (null = nothing to compare). */
  trend: 'up' | 'down' | 'same' | null;
  /** A second, quieter line (new exercises, more sets, an easy week), or null. */
  note: string | null;
}

/** The line's title: "Next: Push A". PURE. */
export function goalTitle(g: Pick<TodayGoal, 'routineName'>): string {
  return `Next: ${g.routineName.trim() || 'your workout'}`;
}

const setsWord = (n: number): string => `${fmtInt(n)} ${n === 1 ? 'set' : 'sets'}`;

function noteOf(g: TodayGoal, mode: ProgressMode): string | null {
  const parts: string[] = [];
  if (mode === 'volume' && g.uncounted > 0) {
    parts.push(
      g.uncounted === 1
        ? 'Not counted: 1 exercise that is new to you or uses a different weight each set.'
        : `Not counted: ${g.uncounted} exercises that are new to you or use a different weight each set.`,
    );
  }
  // R-499: a plan with another number of sets than the previous time says so (the kilos follow it).
  const d = g.setDiff ?? 0;
  if (mode === 'volume' && d !== 0 && !g.easy && g.volumeKg > 0) {
    const n = Math.abs(d);
    parts.push(`The plan has ${fmtInt(n)} ${d > 0 ? 'more' : 'fewer'} ${n === 1 ? 'set' : 'sets'} than previous.`);
  }
  if (g.easy && mode !== 'duration') parts.push('This is an easy week, so the goal is lower.');
  return parts.length > 0 ? parts.join(' ') : null;
}

/** What the Next line says in each mode. PURE. */
export function goalText(g: TodayGoal, mode: ProgressMode, units: UnitSystem): GoalText {
  const note = noteOf(g, mode);
  if (mode === 'duration') {
    if (!g.last || g.last.durationSec <= 0) {
      return { big: '—', label: 'took the previous time', line: 'Your time shows after you finish this workout once.', trend: null, note: null };
    }
    return {
      big: fmtTotalTime(g.last.durationSec),
      label: 'took the previous time',
      line: 'How long this workout took the previous time you did it.',
      trend: null,
      note,
    };
  }
  if (mode === 'sets') {
    const big = setsWord(g.sets);
    if (!g.last) return { big, label: 'planned', line: 'Your first time doing this workout.', trend: null, note };
    const d = g.sets - g.last.sets;
    const lastText = setsWord(g.last.sets);
    if (d === 0) return { big, label: 'planned', line: `Same as previous (${lastText}).`, trend: 'same', note };
    return {
      big,
      label: 'planned',
      line: `${setsWord(Math.abs(d))} ${d > 0 ? 'more' : 'fewer'} than previous (${lastText}).`,
      trend: d > 0 ? 'up' : 'down',
      note,
    };
  }
  // Kilos.
  if (g.volumeKg <= 0) {
    // Done before but nothing to weigh (timed or body-weight work): never "do it once".
    if (g.last && g.uncounted === 0) {
      // F199: no Sets mode any more to point at.
      return { big: '—', label: 'to lift', line: 'This workout has no kilos to count.', trend: null, note: null };
    }
    return { big: '—', label: 'to lift', line: 'Finish this workout once to see your goal here.', trend: null, note };
  }
  const big = fmtVol(g.volumeKg, units);
  if (!g.last) return { big, label: 'to lift', line: 'Your first time doing this workout.', trend: null, note };
  if (g.last.volumeKg <= 0) return { big, label: 'to lift', line: 'No kilos counted the previous time, so there is nothing to compare yet.', trend: null, note };
  const d = g.volumeKg - g.last.volumeKg;
  // Under half a kilo either way reads as the same (rounding of lb and plates).
  if (Math.abs(d) < 0.5) return { big, label: 'to lift', line: `Same as previous (${fmtVol(g.last.volumeKg, units)}).`, trend: 'same', note };
  return {
    big,
    label: 'to lift',
    line: `${fmtVol(Math.abs(d), units)} ${d > 0 ? 'more' : 'less'} than previous (${fmtVol(g.last.volumeKg, units)}).`,
    trend: d > 0 ? 'up' : 'down',
    note,
  };
}

/**
 * F199: the words of the Next line under the Profile chart (after "Next: Push A."). Kilos: the goal,
 * then the previous time ("12,300 kg to lift. 300 kg more than previous (12,000 kg)."); time: "It took
 * 52 min the previous time."; nothing to show yet: why. PURE.
 */
export function todayLineWords(t: Pick<GoalText, 'big' | 'label' | 'line'>, mode: ProgressMode): string {
  if (t.big === '—') return t.line;
  if (mode === 'duration') return `It took ${t.big} the previous time.`;
  return `${t.big} ${t.label}. ${t.line}`;
}

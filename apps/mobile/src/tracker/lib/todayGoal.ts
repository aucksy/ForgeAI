/**
 * R-132 (owner, 25 Oct 2026: "Because the app is focused on progressive overload, this section will also
 * show the total session volume to achieve in today's session"): the Progress tab's "Today" card. PURE.
 *
 * Today's workout is the Workout tab's Up next (`getTodaysWorkoutWithTargets`, the same answer). Its goal
 * is every exercise's Target added up: weight x each set's rep goal (`setGoals`, else the rep goal, else
 * the low end of the range) for the Target's sets, counted by the ONE volume rule in the service. It is
 * compared with the last time this routine was done (the finish screen compares the same way, R-75).
 *  - An exercise done for the first time has no weight yet ("find a weight for 8-12 reps", 6 Oct): it is
 *    left out of the kilos and the card says so; its sets still count.
 *  - Body-weight moves add body weight only where the rule does (pull-ups, dips); timed and distance
 *    work counts as sets, never kilos.
 *  - An easy week's Targets are already the easy ones (half the sets), so its goal is lower: said so.
 * Never says "volume" or "session" (member words).
 */
import { fmtInt, fmtTotalTime } from '@/lib/format';
import { fmtVol, type UnitSystem } from '@/lib/units';

import type { ChartMetric } from '../engine/historyChart';
import { isBodyweightFamily } from '../engine/logTypes';
import type { ProgressionTarget } from '../engine/progression';

export type ProgressMode = Extract<ChartMetric, 'volume' | 'sets' | 'duration'>;
export const PROGRESS_MODES: readonly ProgressMode[] = ['volume', 'sets', 'duration'];

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

export interface TodayGoal {
  routineName: string;
  /** Kilos the Targets add up to (only the exercises with a known weight). */
  volumeKg: number;
  /** Every planned working set. */
  sets: number;
  /** Exercises left out of the kilos (`plannedSets`: new to the member, a different weight each set, a new version). */
  uncounted: number;
  easy: boolean;
  /** The last time this routine was done; null = never. */
  last: { volumeKg: number; sets: number; durationSec: number; dateISO: string } | null;
}

export interface GoalText {
  /** The big number ("12,450 kg"), or a dash when there is nothing to show yet. */
  big: string;
  /** What the number is ("to lift today"). */
  label: string;
  /** Compared with last time, or why there is no number yet. */
  line: string;
  /** Up, down or level against last time (null = nothing to compare). */
  trend: 'up' | 'down' | 'same' | null;
  /** A second, quieter line (new exercises, an easy week), or null. */
  note: string | null;
}

/** The card's title: "Today: Push A". PURE. */
export function goalTitle(g: Pick<TodayGoal, 'routineName'>): string {
  return `Today: ${g.routineName.trim() || 'your workout'}`;
}

function noteOf(g: TodayGoal, mode: ProgressMode): string | null {
  const parts: string[] = [];
  if (mode === 'volume' && g.uncounted > 0) {
    parts.push(
      g.uncounted === 1
        ? 'Not counted: 1 exercise that is new to you or uses a different weight each set.'
        : `Not counted: ${g.uncounted} exercises that are new to you or use a different weight each set.`,
    );
  }
  if (g.easy && mode !== 'duration') parts.push('This is an easy week, so the goal is lower.');
  return parts.length > 0 ? parts.join(' ') : null;
}

/** What the "Today" card says in each mode. PURE. */
export function goalText(g: TodayGoal, mode: ProgressMode, units: UnitSystem): GoalText {
  const note = noteOf(g, mode);
  if (mode === 'duration') {
    if (!g.last || g.last.durationSec <= 0) {
      return { big: '—', label: 'took last time', line: 'Your time shows after you finish this workout once.', trend: null, note: null };
    }
    return { big: fmtTotalTime(g.last.durationSec), label: 'took last time', line: 'How long this workout took the last time you did it.', trend: null, note };
  }
  if (mode === 'sets') {
    const big = `${fmtInt(g.sets)} ${g.sets === 1 ? 'set' : 'sets'}`;
    if (!g.last) return { big, label: 'planned today', line: 'Your first time doing this workout.', trend: null, note };
    const d = g.sets - g.last.sets;
    const lastText = `${fmtInt(g.last.sets)} ${g.last.sets === 1 ? 'set' : 'sets'}`;
    if (d === 0) return { big, label: 'planned today', line: `Same as last time (${lastText}).`, trend: 'same', note };
    return {
      big,
      label: 'planned today',
      line: `${fmtInt(Math.abs(d))} ${Math.abs(d) === 1 ? 'set' : 'sets'} ${d > 0 ? 'more' : 'fewer'} than last time (${lastText}).`,
      trend: d > 0 ? 'up' : 'down',
      note,
    };
  }
  // Kilos.
  if (g.volumeKg <= 0) {
    // Done before but nothing to weigh (timed or body-weight work): point at Sets, never "do it once".
    if (g.last && g.uncounted === 0) {
      return { big: '—', label: 'to lift today', line: 'This workout has no kilos to count. Tap Sets to see your goal.', trend: null, note: null };
    }
    return { big: '—', label: 'to lift today', line: 'Finish this workout once to see your goal here.', trend: null, note };
  }
  const big = fmtVol(g.volumeKg, units);
  if (!g.last) return { big, label: 'to lift today', line: 'Your first time doing this workout.', trend: null, note };
  if (g.last.volumeKg <= 0) return { big, label: 'to lift today', line: 'No kilos counted last time, so there is nothing to compare yet.', trend: null, note };
  const d = g.volumeKg - g.last.volumeKg;
  // Under half a kilo either way reads as the same (rounding of lb and plates).
  if (Math.abs(d) < 0.5) return { big, label: 'to lift today', line: `Same as last time (${fmtVol(g.last.volumeKg, units)}).`, trend: 'same', note };
  return {
    big,
    label: 'to lift today',
    line: `${fmtVol(Math.abs(d), units)} ${d > 0 ? 'more' : 'less'} than last time (${fmtVol(g.last.volumeKg, units)}).`,
    trend: d > 0 ? 'up' : 'down',
    note,
  };
}

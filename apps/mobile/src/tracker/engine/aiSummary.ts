/**
 * F61 "Ask your own AI" (OWNER-INBOX #58, item 11; Hevy has it). PURE.
 *
 * A short plain text of the member's last 4 weeks of workouts — each exercise's number of
 * workouts, best set and whether it is going up — the muscles that got few sets, and a ready
 * question at the end. The member shares it to ChatGPT, Gemini or any app with the phone's share
 * sheet; nothing is sent by us. It carries NO name, NO phone number and NO body weight (and no
 * totals that body weight could be worked out from): only exercises, sets and dates.
 */
import { estimatedOneRepMax } from '@/lib/e1rm';
import { tinyDateWithYear } from '@/lib/date';

import { MUSCLE_LABEL, MUSCLES, setShares, type Muscle, type MuscleMap } from '../catalog/muscles';
import { fmtSetCompact, type DistUnit, type LogType } from './logTypes';

/** The window, in days (4 weeks). */
export const AI_SUMMARY_DAYS = 28;
/** At most this many exercises are listed (most often done first). */
export const AI_SUMMARY_MAX_EXERCISES = 15;
/** A muscle under this many sets in the 4 weeks is named as getting few. */
export const FEW_SETS = 4;

export const AI_QUESTION =
  'My question: Based on these workouts, what should I change in the next 4 weeks to keep getting stronger? Please answer in short, simple steps.';

export interface SummarySet {
  weightKg: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
}

export interface SummaryWorkout {
  id: string;
  dateISO: string;
  exercises: {
    exerciseId: string;
    name: string;
    logType: LogType;
    distUnit?: DistUnit;
    muscles: MuscleMap;
    /** Working sets only (warm-ups left out). */
    sets: SummarySet[];
  }[];
}

/** How good a set is, by its log type (higher is better). */
export function setScore(s: SummarySet, t: LogType): number {
  switch (t) {
    case 'weight_reps':
      // The estimate stops counting reps past a point, so 35 kg x 14 tied 35 kg x 12 and the older
      // set was called the best (UAT run 41903972952). Ties go to more weight, then more reps.
      return s.weightKg > 0 ? estimatedOneRepMax(s.weightKg, s.reps) + s.weightKg * 1e-4 + s.reps * 1e-7 : s.reps / 100;
    case 'reps':
    case 'weighted':
    case 'assisted':
      // More added weight (less help), then more reps.
      return s.weightKg * 100 + s.reps;
    case 'time':
      return s.durationSec ?? 0;
    default:
      return s.distanceM ?? 0;
  }
}

function best(sets: readonly SummarySet[], t: LogType): SummarySet | null {
  let top: SummarySet | null = null;
  for (const s of sets) if (!top || setScore(s, t) > setScore(top, t)) top = s;
  return top;
}

function trendWord(first: number, last: number): string {
  if (!(first > 0)) return last > 0 ? 'Going up.' : 'About the same.';
  if (last > first * 1.01) return 'Going up.';
  if (last < first * 0.99) return 'Going down.';
  return 'About the same.';
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * The text to share. `workouts` are the window's workouts (any order); `today` is the last day;
 * set texts use the member's units (lib/units' display units).
 */
export function aiSummaryText(workouts: readonly SummaryWorkout[], today: string): string {
  const list = [...workouts].filter((w) => w.exercises.some((x) => x.sets.length > 0)).sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  const lines: string[] = [];
  if (list.length === 0) {
    lines.push('I logged no workouts in the last 4 weeks.', '', AI_QUESTION);
    return lines.join('\n');
  }
  const from = list[0].dateISO;
  lines.push(`My gym workouts from the last 4 weeks (${tinyDateWithYear(from, today)} to ${tinyDateWithYear(today, today)}).`);
  lines.push(`${plural(list.length, 'workout')} in 4 weeks, about ${Math.round((list.length / 4) * 10) / 10} a week.`);
  lines.push('');

  // Per exercise: its workouts in date order, each with its best set.
  const byEx = new Map<string, { name: string; t: LogType; unit: DistUnit; days: { dateISO: string; top: SummarySet }[] }>();
  const muscleSets = new Map<Muscle, number>();
  for (const w of list) {
    for (const x of w.exercises) {
      if (x.sets.length === 0) continue;
      for (const [m, share] of setShares(x.muscles)) muscleSets.set(m, (muscleSets.get(m) ?? 0) + share * x.sets.length);
      const top = best(x.sets, x.logType);
      if (!top) continue;
      const e = byEx.get(x.exerciseId) ?? { name: x.name, t: x.logType, unit: x.distUnit ?? 'km', days: [] };
      // Two cards of one exercise on one day count as one day with the better set.
      const lastDay = e.days[e.days.length - 1];
      const same = lastDay && lastDay.dateISO === w.dateISO ? lastDay : null;
      if (same) {
        if (setScore(top, x.logType) > setScore(same.top, x.logType)) same.top = top;
      } else {
        e.days.push({ dateISO: w.dateISO, top });
      }
      byEx.set(x.exerciseId, e);
    }
  }
  const exercises = [...byEx.values()].sort((a, b) => b.days.length - a.days.length || a.name.localeCompare(b.name));
  lines.push('Each exercise: how often I did it, my best set, and how it is going.');
  for (const e of exercises.slice(0, AI_SUMMARY_MAX_EXERCISES)) {
    const top = e.days.reduce((a, d) => (setScore(d.top, e.t) > setScore(a.top, e.t) ? d : a));
    let line = `- ${e.name}: ${plural(e.days.length, 'workout')}. Best set ${fmtSetCompact(top.top, e.t, e.unit)} (${tinyDateWithYear(top.dateISO, today)}).`;
    if (e.days.length >= 2) {
      const first = e.days[0];
      const last = e.days[e.days.length - 1];
      line += ` First: ${fmtSetCompact(first.top, e.t, e.unit)}. Latest: ${fmtSetCompact(last.top, e.t, e.unit)}. ${trendWord(setScore(first.top, e.t), setScore(last.top, e.t))}`;
    }
    lines.push(line);
  }
  const more = exercises.length - AI_SUMMARY_MAX_EXERCISES;
  if (more > 0) lines.push(`- And ${plural(more, 'more exercise')}, done less often.`);

  const few = MUSCLES
    .filter((m) => m !== 'cardio' && (muscleSets.get(m) ?? 0) < FEW_SETS)
    .map((m) => MUSCLE_LABEL[m]);
  if (few.length > 0) {
    lines.push('');
    lines.push(`Muscles with under ${FEW_SETS} sets in these 4 weeks: ${few.join(', ')}.`);
  }
  lines.push('');
  lines.push(AI_QUESTION);
  return lines.join('\n');
}

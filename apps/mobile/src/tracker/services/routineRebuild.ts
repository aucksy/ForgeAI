/**
 * v0.28.0 — the member's own Hevy / Strong ROUTINES, rebuilt from the workout export alone.
 *
 * Neither app exports its saved routines (Hevy's CSV and Strong's CSV are finished workouts
 * only), but a workout started from a routine keeps the routine's name as its title. So:
 *  - a ROUTINE is a title used 3+ times that is not an app's default name for a free workout
 *    ("Morning workout", "Evening Workout" … — an empty workout the member filled as they went);
 *  - its exercises come from the LAST workout of that name (ticked), plus up to 5 more done under
 *    that name, newest first (offered, not ticked) — Hevy keeps an exercise the member skips in
 *    the routine, and members often do another routine's exercise without saving it;
 *  - each exercise's sets and rep range are the working sets of the last time it was done under
 *    that name (Hevy counts warm-ups in a routine; ForgeAI suggests its own warm-ups).
 * Measured 8 Oct 2026 against the owner's saved Hevy folder "Jaipur" (6 routines, 36 exercises):
 * 34 of 36 shown, 22 of 24 ticked ones right, about 3 taps a routine — the best of 30+ rules
 * tried (`Resources/Hevy Backups/rebuild_routines_study.py`). No rule recovers a saved routine
 * exactly, so the member checks each one (`RoutineImportSteps`).
 * PURE: no database, no clock.
 */
import type { DayType } from '@/types/models';

/** The parts of a parsed export this needs (Hevy's and Strong's parsers both give it). */
export interface RebuildWorkout {
  title: string;
  dayType: DayType;
  dateISO: string;
  exercises: readonly {
    title: string;
    sets: readonly { reps: number; isWarmup: boolean }[];
  }[];
}

export interface FoundExercise {
  /** The app's exercise name, as in the file. */
  title: string;
  /** Working sets the last time it was done under this routine's name. */
  sets: number;
  /** Rep range of those sets; null for a timed or distance exercise. */
  repMin: number | null;
  repMax: number | null;
  /** The last day it was done under this name. */
  lastISO: string;
  /** In the last workout of this name: ticked. Otherwise offered ("Also done in …"). */
  ticked: boolean;
}

export interface FoundRoutine {
  title: string;
  dayType: DayType;
  uses: number;
  lastISO: string;
  /** Used in the year before the file's newest workout. Older names start unticked. */
  recent: boolean;
  /** Ticked ones first (in the last workout's order), then the offered ones, newest first. */
  exercises: FoundExercise[];
}

export const MIN_ROUTINE_USES = 3;
export const SUGGEST_MAX = 5;
const RECENT_DAYS = 365;

/**
 * An app's own name for a workout started empty: Hevy names it by the time of day ("Morning
 * workout ☀️", "Afternoon workout 💪" — the emoji is stripped on import), Strong the same
 * ("Evening Workout"); plain "Workout" / "New workout" / "Quick workout" too.
 */
export function isDefaultWorkoutName(title: string): boolean {
  const t = title.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    t === '' ||
    /^(early |late )?(morning|afternoon|evening|night|midday|noon|lunch|lunchtime|late night) workout$/.test(t) ||
    /^(workout|new workout|empty workout|quick workout|quick start|my workout)$/.test(t)
  );
}

const keyOf = (title: string): string => title.toLowerCase().trim().replace(/\s+/g, ' ');

function daysBetween(aISO: string, bISO: string): number {
  return Math.round((Date.parse(`${bISO}T00:00:00Z`) - Date.parse(`${aISO}T00:00:00Z`)) / 86_400_000);
}

function summary(ex: RebuildWorkout['exercises'][number]): { sets: number; repMin: number | null; repMax: number | null } {
  const working = ex.sets.filter((s) => !s.isWarmup);
  const counted = working.length > 0 ? working : ex.sets;
  const reps = counted.map((s) => s.reps).filter((r) => r > 0);
  return {
    sets: Math.max(1, counted.length),
    repMin: reps.length > 0 ? Math.min(...reps) : null,
    repMax: reps.length > 0 ? Math.max(...reps) : null,
  };
}

/**
 * The routines in an export, in the member's rotation (recent ones), then older names by last
 * use. `workouts` oldest first, as both parsers give them.
 */
export function findRoutines(
  workouts: readonly RebuildWorkout[],
  opts: { minUses?: number; suggest?: number } = {},
): FoundRoutine[] {
  const minUses = opts.minUses ?? MIN_ROUTINE_USES;
  const suggest = opts.suggest ?? SUGGEST_MAX;
  const sorted = [...workouts].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  if (sorted.length === 0) return [];
  const newestISO = sorted[sorted.length - 1].dateISO;

  const groups = new Map<string, RebuildWorkout[]>();
  for (const w of sorted) {
    if (isDefaultWorkoutName(w.title) || w.exercises.length === 0) continue;
    const k = keyOf(w.title);
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }

  const found: FoundRoutine[] = [];
  for (const uses of groups.values()) {
    if (uses.length < minUses) continue;
    const last = uses[uses.length - 1];
    // Each exercise: the last time it was done under this name.
    const lastDone = new Map<string, { at: number; iso: string; ex: RebuildWorkout['exercises'][number] }>();
    uses.forEach((w, i) => {
      for (const ex of w.exercises) if (ex.sets.length > 0) lastDone.set(ex.title, { at: i, iso: w.dateISO, ex });
    });
    const tickedTitles = last.exercises.filter((ex) => ex.sets.length > 0).map((ex) => ex.title);
    const toFound = (title: string, ticked: boolean): FoundExercise => {
      const d = lastDone.get(title)!;
      return { title, ...summary(d.ex), lastISO: d.iso, ticked };
    };
    const offered = [...lastDone.keys()]
      .filter((t) => !tickedTitles.includes(t))
      .sort((a, b) => lastDone.get(b)!.at - lastDone.get(a)!.at)
      .slice(0, suggest);
    found.push({
      title: last.title,
      dayType: last.dayType,
      uses: uses.length,
      lastISO: last.dateISO,
      recent: daysBetween(last.dateISO, newestISO) <= RECENT_DAYS,
      exercises: [...tickedTitles.map((t) => toFound(t, true)), ...offered.map((t) => toFound(t, false))],
    });
  }
  return orderRoutines(found, sorted, newestISO);
}

/**
 * The member's rotation: start from the routine used most in the last year, then each time the
 * routine that most often came next (ties: the more used), so Hevy's "Push 1, Pull 1, Push 2,
 * Pull 2" comes back in that order. Older names follow, the most recently used first.
 */
function orderRoutines(found: FoundRoutine[], sorted: readonly RebuildWorkout[], newestISO: string): FoundRoutine[] {
  const recent = found.filter((r) => r.recent);
  const older = found.filter((r) => !r.recent).sort((a, b) => (a.lastISO < b.lastISO ? 1 : a.lastISO > b.lastISO ? -1 : 0));
  const keys = new Set(recent.map((r) => keyOf(r.title)));
  const seq = sorted
    .filter((w) => daysBetween(w.dateISO, newestISO) <= RECENT_DAYS && keys.has(keyOf(w.title)))
    .map((w) => keyOf(w.title));
  const usesInYear = new Map<string, number>();
  const firstAt = new Map<string, number>();
  seq.forEach((k, i) => {
    usesInYear.set(k, (usesInYear.get(k) ?? 0) + 1);
    if (!firstAt.has(k)) firstAt.set(k, i);
  });
  const next = new Map<string, number>();
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) next.set(`${seq[i - 1]}>${seq[i]}`, (next.get(`${seq[i - 1]}>${seq[i]}`) ?? 0) + 1);

  // Most used first; a tie goes to the one the member did first in the year.
  const byUse = (a: FoundRoutine, b: FoundRoutine): number =>
    (usesInYear.get(keyOf(b.title)) ?? 0) - (usesInYear.get(keyOf(a.title)) ?? 0) ||
    (firstAt.get(keyOf(a.title)) ?? 0) - (firstAt.get(keyOf(b.title)) ?? 0);
  const left = [...recent].sort(byUse);
  const out: FoundRoutine[] = [];
  let cur = left.shift();
  while (cur) {
    out.push(cur);
    const from = keyOf(cur.title);
    let best = -1;
    let bestN = 0;
    left.forEach((r, i) => {
      const n = next.get(`${from}>${keyOf(r.title)}`) ?? 0;
      if (n > bestN) {
        bestN = n;
        best = i;
      }
    });
    cur = best >= 0 ? left.splice(best, 1)[0] : left.shift();
  }
  return [...out, ...older];
}

/**
 * The routine after the newest workout that was one of `order` (wrapping round): what "Today"
 * shows once the folder is followed. Null when none of them was ever done.
 */
export function nextUp(order: readonly string[], workouts: readonly Pick<RebuildWorkout, 'title' | 'dateISO'>[]): { next: string; after: string } | null {
  if (order.length === 0) return null;
  const keys = order.map(keyOf);
  let newest: { iso: string; idx: number } | null = null;
  for (const w of workouts) {
    const idx = keys.indexOf(keyOf(w.title));
    if (idx >= 0 && (!newest || w.dateISO >= newest.iso)) newest = { iso: w.dateISO, idx };
  }
  if (!newest) return null;
  return { next: order[(newest.idx + 1) % order.length], after: order[newest.idx] };
}

/** The routines the member kept, with the exercises they kept, ready to save. PURE. */
export function chosenRoutines(
  found: readonly FoundRoutine[],
  keep: ReadonlySet<string>,
  ticks: ReadonlyMap<string, ReadonlySet<string>>,
): { title: string; dayType: DayType; exercises: FoundExercise[] }[] {
  return found
    .filter((r) => keep.has(r.title))
    .map((r) => {
      const t = ticks.get(r.title);
      return { title: r.title, dayType: r.dayType, exercises: r.exercises.filter((e) => (t ? t.has(e.title) : e.ticked)) };
    })
    .filter((r) => r.exercises.length > 0);
}

/**
 * F58 Badge shelf (from #58). PURE. The ONE rule for every badge the Profile shows.
 *
 * Badges are DERIVED from the workouts on the phone, never stored, like records
 * (`records.ts`): editing or deleting a workout can never leave a wrong badge behind, and an
 * import of older workouts earns the badges those workouts earned, on their own dates.
 *
 * What other apps taught (research, 2 Nov 2026): Hevy gives only workout-count milestones;
 * Fitbit members complained about badges that mean nothing (themed badges for everyone), the
 * same badge given again and again, and a lower tier never given when a member jumped past it.
 * So here: 16 badges, each earned ONCE, each for something real a gym member does (workouts,
 * weeks in a row, heavy lifts, a big day, early starts, beating a best); a member who jumps
 * past a tier earns every tier on the same workout; a locked badge says how to earn it and,
 * where it is a count, how far along the member is.
 *
 * Body weight is NEVER shown (the share-picture rule, `liftedOnPicture`): the "bench your body
 * weight" badge says only yes or no, with no number and no progress.
 *
 * Later (not built, needs the server): a gym can give a real prize for a badge.
 */
import { addDays, weekStartISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { fmtVol } from '@/lib/units';
import type { UnitSystem } from '@/types/models';

import { bodyweightOn, type BodyweightPoint } from './volume';

export type BadgeId =
  | 'workouts_1'
  | 'workouts_10'
  | 'workouts_50'
  | 'workouts_100'
  | 'workouts_250'
  | 'workouts_500'
  | 'weeks_4'
  | 'weeks_12'
  | 'weeks_26'
  | 'record_1'
  | 'records_25'
  | 'bar_100'
  | 'bench_bodyweight'
  | 'day_5000'
  | 'day_10000'
  | 'early_5';

/** Which family a badge belongs to (the finish screen skips 'workouts': it already says "Your 50th workout"). */
export type BadgeFamily = 'workouts' | 'weeks' | 'records' | 'lift' | 'bench' | 'day' | 'early';

/** The icon each family shows (names from the app's own icon set, `components/ui/Icon`). */
export type BadgeIcon = 'dumbbell' | 'flame' | 'medal' | 'trophy' | 'target' | 'zap' | 'clock';

interface BadgeDef {
  id: BadgeId;
  family: BadgeFamily;
  icon: BadgeIcon;
  /** The count to reach (workouts, weeks, records, early starts) or the kg to reach. */
  goal: number;
}

/** Shelf order: the easiest first in each family, families in the order a new member meets them. */
export const BADGES: readonly BadgeDef[] = [
  { id: 'workouts_1', family: 'workouts', icon: 'dumbbell', goal: 1 },
  { id: 'workouts_10', family: 'workouts', icon: 'dumbbell', goal: 10 },
  { id: 'workouts_50', family: 'workouts', icon: 'dumbbell', goal: 50 },
  { id: 'workouts_100', family: 'workouts', icon: 'dumbbell', goal: 100 },
  { id: 'workouts_250', family: 'workouts', icon: 'dumbbell', goal: 250 },
  { id: 'workouts_500', family: 'workouts', icon: 'dumbbell', goal: 500 },
  { id: 'weeks_4', family: 'weeks', icon: 'flame', goal: 4 },
  { id: 'weeks_12', family: 'weeks', icon: 'flame', goal: 12 },
  { id: 'weeks_26', family: 'weeks', icon: 'flame', goal: 26 },
  { id: 'record_1', family: 'records', icon: 'medal', goal: 1 },
  { id: 'records_25', family: 'records', icon: 'medal', goal: 25 },
  { id: 'bar_100', family: 'lift', icon: 'trophy', goal: 100 },
  { id: 'bench_bodyweight', family: 'bench', icon: 'target', goal: 1 },
  { id: 'day_5000', family: 'day', icon: 'zap', goal: 5000 },
  { id: 'day_10000', family: 'day', icon: 'zap', goal: 10000 },
  { id: 'early_5', family: 'early', icon: 'clock', goal: 5 },
];

/** An early start: the workout began from 4:00 to 6:59 in the morning, the member's own time. */
export const EARLY_FROM_HOUR = 4;
export const EARLY_BEFORE_HOUR = 7;

/** One workout, as the badges read it. */
export interface BadgeWorkout {
  id: string;
  dateISO: string;
  /** Epoch ms: orders two workouts on one day. */
  startedAt: number;
  /** The hour it started, 0-23, in the member's own time (the service reads it from startedAt). */
  startHour: number;
  /** Kg lifted in the workout by the app's one rule (`volume.ts`; warm-ups never count). */
  kgLifted: number;
  /** Exercises in it that beat their best (the same count as the feed card's records). */
  recordLifts: number;
}

/** One working set of at least 1 rep with a weight on it, as the lift badges read it. */
export interface BadgeSet {
  sessionId: string;
  weightKg: number;
  reps: number;
  /** A barbell lift logged as weight × reps (bench press, squat, deadlift…). */
  barbell: boolean;
  /** The library's barbell bench press. */
  bench: boolean;
}

export interface BadgeInput {
  workouts: readonly BadgeWorkout[];
  sets: readonly BadgeSet[];
  /** Body weight log, oldest first. Only ever compared, never shown. */
  bodyweight: readonly BodyweightPoint[];
}

export interface BadgeState {
  id: BadgeId;
  family: BadgeFamily;
  icon: BadgeIcon;
  /** The workout that earned it, or null while it is still to earn. */
  earned: { sessionId: string; dateISO: string } | null;
  /** How far along (counts and kg only; never for the body-weight badge). null = no number to show. */
  progress: { have: number; goal: number } | null;
}

function order(a: BadgeWorkout, b: BadgeWorkout): number {
  return a.startedAt - b.startedAt || (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Every badge, earned or not, in shelf order. PURE. */
export function computeBadges(input: BadgeInput): BadgeState[] {
  const workouts = [...input.workouts].sort(order);
  const known = new Set(workouts.map((w) => w.id));

  // The heaviest barbell set and whether the bench beat body weight, per workout.
  const heaviestBar = new Map<string, number>();
  const benchBw = new Set<string>();
  const dateOf = new Map(workouts.map((w) => [w.id, w.dateISO]));
  for (const s of input.sets) {
    if (!known.has(s.sessionId) || !(s.reps >= 1) || !(s.weightKg > 0) || !s.barbell) continue;
    heaviestBar.set(s.sessionId, Math.max(heaviestBar.get(s.sessionId) ?? 0, s.weightKg));
    if (s.bench) {
      const bw = bodyweightOn(input.bodyweight, dateOf.get(s.sessionId) as string);
      if (bw != null && bw > 0 && s.weightKg >= bw) benchBw.add(s.sessionId);
    }
  }

  const earned = new Map<BadgeId, { sessionId: string; dateISO: string }>();
  const progress = new Map<BadgeFamily, number>();
  const give = (id: BadgeId, w: BadgeWorkout): void => {
    if (!earned.has(id)) earned.set(id, { sessionId: w.id, dateISO: w.dateISO });
  };
  const reach = (family: BadgeFamily, have: number, w: BadgeWorkout): void => {
    progress.set(family, Math.max(progress.get(family) ?? 0, have));
    for (const b of BADGES) if (b.family === family && have >= b.goal) give(b.id, w);
  };

  let count = 0;
  let records = 0;
  let early = 0;
  let run = 0;
  let lastWeek: string | null = null;
  for (const w of workouts) {
    count += 1;
    reach('workouts', count, w);

    // Weeks in a row (the app's one streak rule, `lib/streak`: Monday to Sunday, at least one
    // workout a week). The badge keeps the longest run ever, so a broken streak never takes it away.
    const week = weekStartISO(w.dateISO);
    if (week !== lastWeek) {
      run = lastWeek != null && addDays(lastWeek, 7) === week ? run + 1 : 1;
      lastWeek = week;
    }
    reach('weeks', run, w);

    records += Math.max(0, Math.floor(w.recordLifts));
    reach('records', records, w);

    if (w.startHour >= EARLY_FROM_HOUR && w.startHour < EARLY_BEFORE_HOUR) early += 1;
    reach('early', early, w);

    reach('day', Number.isFinite(w.kgLifted) ? Math.max(0, w.kgLifted) : 0, w);
    reach('lift', heaviestBar.get(w.id) ?? 0, w);
    if (benchBw.has(w.id)) give('bench_bodyweight', w);
  }

  return BADGES.map((b) => {
    const got = earned.get(b.id) ?? null;
    const have = progress.get(b.family) ?? 0;
    return {
      id: b.id,
      family: b.family,
      icon: b.icon,
      earned: got,
      progress: b.family === 'bench' ? null : { have: Math.min(have, b.goal), goal: b.goal },
    };
  });
}

/** The badges this workout earned (empty when none). PURE. */
export function badgesEarnedIn(badges: readonly BadgeState[], sessionId: string): BadgeState[] {
  return badges.filter((b) => b.earned?.sessionId === sessionId);
}

/** Earned badges, newest first (the shelf's first row). PURE. */
export function earnedNewestFirst(badges: readonly BadgeState[]): BadgeState[] {
  const idx = new Map(BADGES.map((b, i) => [b.id, i]));
  return badges
    .filter((b) => b.earned != null)
    .sort((a, b) => {
      const da = (a.earned as { dateISO: string }).dateISO;
      const db = (b.earned as { dateISO: string }).dateISO;
      // Newest day first; on one day the harder badge (later on the shelf) first.
      return da < db ? 1 : da > db ? -1 : (idx.get(b.id) ?? 0) - (idx.get(a.id) ?? 0);
    });
}

// ---------------------------------------------------------------- words

/** The badge's name, short enough for one line: "50 workouts", "100 kg on the bar". PURE. */
export function badgeName(id: BadgeId, units: UnitSystem = 'metric'): string {
  switch (id) {
    case 'workouts_1':
      return 'First workout';
    case 'workouts_10':
    case 'workouts_50':
    case 'workouts_100':
    case 'workouts_250':
    case 'workouts_500':
      return `${fmtInt(goalOf(id))} workouts`;
    case 'weeks_4':
    case 'weeks_12':
    case 'weeks_26':
      return `${goalOf(id)} weeks in a row`;
    case 'record_1':
      return 'First record';
    case 'records_25':
      return '25 records';
    case 'bar_100':
      return `${fmtVol(100, units)} on the bar`;
    case 'bench_bodyweight':
      return 'Bench your body weight';
    case 'day_5000':
    case 'day_10000':
      return `${fmtVol(goalOf(id), units)} in one workout`;
    case 'early_5':
      return 'Early bird';
  }
}

/** How to earn it, one complete sentence. PURE. */
export function badgeHowTo(id: BadgeId, units: UnitSystem = 'metric'): string {
  switch (id) {
    case 'workouts_1':
      return 'Finish your first workout.';
    case 'workouts_10':
    case 'workouts_50':
    case 'workouts_100':
    case 'workouts_250':
    case 'workouts_500':
      return `Finish ${fmtInt(goalOf(id))} workouts.`;
    case 'weeks_4':
    case 'weeks_12':
    case 'weeks_26':
      return `Work out at least once a week, ${goalOf(id)} weeks in a row.`;
    case 'record_1':
      return 'Beat your own best on any exercise.';
    case 'records_25':
      return 'Beat your own best 25 times.';
    case 'bar_100':
      return `Lift ${fmtVol(100, units)} or more on a barbell, for at least 1 rep.`;
    case 'bench_bodyweight':
      return 'Bench press your own body weight or more on a barbell. Log your body weight in Progress, under Body, so the app can check.';
    case 'day_5000':
    case 'day_10000':
      return `Lift ${fmtVol(goalOf(id), units)} in one workout. Every set's weight × reps is added up.`;
    case 'early_5':
      return 'Start 5 workouts before 7 in the morning.';
  }
}

/** "37 of 50 workouts", "Best so far: 3,200 kg", or null (nothing to count, or already earned). PURE. */
export function badgeProgressText(b: BadgeState, units: UnitSystem = 'metric'): string | null {
  if (b.earned || !b.progress || b.progress.have <= 0) return null;
  const { have, goal } = b.progress;
  switch (b.family) {
    case 'workouts':
      return `${fmtInt(have)} of ${fmtInt(goal)} workouts`;
    case 'weeks':
      return `Your longest run so far: ${have} ${have === 1 ? 'week' : 'weeks'}`;
    case 'records':
      return `${fmtInt(have)} of ${fmtInt(goal)} records`;
    case 'early':
      return `${have} of ${goal} early starts`;
    case 'day':
      return `Your best workout so far: ${fmtVol(have, units)}`;
    case 'lift':
      return `Your heaviest so far: ${fmtVol(have, units)}`;
    case 'bench':
      return null;
  }
}

/** "Earned 9 Oct" — the date given as the app writes dates elsewhere. PURE. */
export function earnedText(dateWords: string): string {
  return `Earned ${dateWords}`;
}

/** The finish screen's line: "New badge: Early bird", or null. Workout counts are left out (the milestone line says them). PURE. */
export function newBadgeLine(badges: readonly BadgeState[], units: UnitSystem = 'metric'): string | null {
  const names = badges.filter((b) => b.family !== 'workouts').map((b) => badgeName(b.id, units));
  if (names.length === 0) return null;
  return `${names.length === 1 ? 'New badge' : 'New badges'}: ${names.join(', ')}`;
}

function goalOf(id: BadgeId): number {
  return (BADGES.find((b) => b.id === id) as BadgeDef).goal;
}

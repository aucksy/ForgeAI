/**
 * F59 "Which muscles are ready today" (OWNER-INBOX #58, item 7; Fitbod charges for it). PURE.
 *
 * Worked out ONLY from the workouts the member logged — no sleep, soreness or heart data, and the
 * screen says so. Each logged workout puts each muscle it trained to rest for a while, longer for
 * more hard sets (the "about 48–72 hours between hard work on the same muscle" rule of thumb):
 *
 *   hard sets for the muscle in that workout   under 1   1–2   3    4    5    6 or more
 *   hours of rest                              24        48    54   60   66   72
 *
 * Hard sets count as everywhere else in the app (`setShares`): a working set is 1 set for each main
 * muscle and ½ for each helper; warm-ups never count. A muscle trained in several recent workouts
 * waits for the one that ends last. Three states, from how far through that rest it is:
 *   ready     the rest is over (or nothing trained it in the last few days)
 *   almost    over half of the rest is done
 *   resting   under half of it is done
 */
import { MUSCLES, setShares, type Muscle, type MuscleMap } from '../catalog/muscles';

export type ReadyState = 'ready' | 'almost' | 'resting';

/** Muscles the map shows (cardio is not a muscle on the body). */
export const READY_MUSCLES: readonly Muscle[] = MUSCLES.filter((m) => m !== 'cardio');

/** The longest rest any workout asks for, in hours (older workouts cannot matter). */
export const MAX_REST_HOURS = 72;
const HOUR = 3_600_000;

/** Hours of rest a muscle needs after this many hard sets in one workout. */
export function restHours(sets: number): number {
  if (!(sets > 0)) return 0;
  if (sets < 1) return 24;
  return Math.min(MAX_REST_HOURS, Math.max(48, 36 + 6 * Math.ceil(sets)));
}

/** One exercise in one logged workout: when the workout ended, its muscles and its working sets. */
export interface LoggedExercise {
  /** When the workout ended (its start when it has no end), ms since 1970. */
  at: number;
  workoutId: string;
  muscles: MuscleMap;
  /** Working sets (warm-ups never count). */
  working: number;
}

export interface MuscleReadiness {
  muscle: Muscle;
  state: ReadyState;
  /** When the rest is over (null: ready, nothing recent). */
  readyAt: number | null;
  /** Hard sets in the workout that set the rest (0 when nothing recent). */
  sets: number;
  /** When that workout ended (null when nothing recent). */
  workedAt: number | null;
}

/** Each muscle's readiness at `now`, top of the body to the bottom. */
export function muscleReadiness(logged: readonly LoggedExercise[], now: number): MuscleReadiness[] {
  // Hard sets per workout and muscle.
  const perWorkout = new Map<string, { at: number; sets: Map<Muscle, number> }>();
  for (const x of logged) {
    if (!(x.working > 0) || !(x.at <= now) || now - x.at > MAX_REST_HOURS * HOUR) continue;
    let w = perWorkout.get(x.workoutId);
    if (!w) {
      w = { at: x.at, sets: new Map() };
      perWorkout.set(x.workoutId, w);
    }
    w.at = Math.max(w.at, x.at);
    for (const [m, share] of setShares(x.muscles)) w.sets.set(m, (w.sets.get(m) ?? 0) + share * x.working);
  }
  return READY_MUSCLES.map((muscle) => {
    let best: { readyAt: number; sets: number; at: number; done: number } | null = null;
    for (const w of perWorkout.values()) {
      const sets = w.sets.get(muscle) ?? 0;
      const hours = restHours(sets);
      if (hours === 0) continue;
      const readyAt = w.at + hours * HOUR;
      if (readyAt <= now) continue;
      const done = (now - w.at) / (hours * HOUR);
      if (!best || readyAt > best.readyAt) best = { readyAt, sets, at: w.at, done };
    }
    if (!best) return { muscle, state: 'ready', readyAt: null, sets: 0, workedAt: null };
    return {
      muscle,
      state: best.done >= 0.5 ? 'almost' : 'resting',
      readyAt: best.readyAt,
      sets: Math.round(best.sets * 2) / 2,
      workedAt: best.at,
    };
  });
}

/** "in about 20 hours", "in about 2 days", "within the hour". */
export function readyInText(readyAt: number, now: number): string {
  const h = (readyAt - now) / HOUR;
  if (h <= 1) return 'within the hour';
  if (h < 24) return `in about ${Math.round(h)} hours`;
  const d = Math.round(h / 24);
  return d <= 1 ? 'in about a day' : `in about ${d} days`;
}

/** "Chest", "Chest and Lats", "Chest, Lats and Biceps", "Chest, Lats, Quads and 4 more". */
export function namesLine(names: readonly string[], max = 3): string {
  if (names.length <= max) {
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/**
 * The Workout tab's one line: what is still resting, else that everything is ready. Muscles that
 * are resting come first (they decide today), then the ones almost ready.
 */
export function readySummary(rows: readonly MuscleReadiness[], label: (m: Muscle) => string): { title: string; body: string } {
  const resting = rows.filter((r) => r.state === 'resting').map((r) => label(r.muscle));
  const almost = rows.filter((r) => r.state === 'almost').map((r) => label(r.muscle));
  if (resting.length === 0 && almost.length === 0) {
    return { title: 'Every muscle is rested', body: 'Your logged workouts leave nothing resting. Train what you like today.' };
  }
  const parts: string[] = [];
  if (resting.length > 0) parts.push(`Still resting: ${namesLine(resting)}.`);
  if (almost.length > 0) parts.push(`Almost ready: ${namesLine(almost)}.`);
  return { title: 'Muscles ready today', body: `${parts.join(' ')} Everything else is ready.` };
}

// ---------------------------------------------------------------- muscle groups (quick workout)

/** The six groups a member picks from (quick workout), each with the muscles it means. */
export type BodyPart = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export const BODY_PARTS: readonly BodyPart[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

export const BODY_PART_LABEL: Record<BodyPart, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Abs and core',
};

/** The muscles that decide whether a group is ready (its main ones). */
export const BODY_PART_MUSCLES: Record<BodyPart, readonly Muscle[]> = {
  chest: ['chest'],
  back: ['lats', 'upper_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  arms: ['biceps', 'triceps'],
  legs: ['quads', 'hamstrings', 'glutes'],
  core: ['abs', 'obliques'],
};

const RANK: Record<ReadyState, number> = { ready: 0, almost: 1, resting: 2 };

/** A group is as ready as its least rested main muscle. */
export function bodyPartState(part: BodyPart, rows: readonly MuscleReadiness[]): ReadyState {
  let worst: ReadyState = 'ready';
  for (const m of BODY_PART_MUSCLES[part]) {
    const r = rows.find((x) => x.muscle === m);
    if (r && RANK[r.state] > RANK[worst]) worst = r.state;
  }
  return worst;
}

/**
 * The groups a quick workout starts with: the ready ones, longest since trained first (never
 * trained last: often a group the member leaves out on purpose); two for a short workout, three
 * otherwise. With nothing ready, the most rested ones.
 */
export function defaultBodyParts(rows: readonly MuscleReadiness[], lastTrained: ReadonlyMap<Muscle, string>, minutes: number): BodyPart[] {
  const want = minutes <= 20 ? 2 : 3;
  const lastOf = (p: BodyPart): string | null => {
    let newest: string | null = null;
    for (const m of BODY_PART_MUSCLES[p]) {
      const d = lastTrained.get(m);
      if (d && (!newest || d > newest)) newest = d;
    }
    return newest;
  };
  const order = [...BODY_PARTS].sort((a, b) => {
    const s = RANK[bodyPartState(a, rows)] - RANK[bodyPartState(b, rows)];
    if (s !== 0) return s;
    const la = lastOf(a);
    const lb = lastOf(b);
    if (!la !== !lb) return la ? -1 : 1;
    if (la && lb && la !== lb) return la < lb ? -1 : 1;
    return BODY_PARTS.indexOf(a) - BODY_PARTS.indexOf(b);
  });
  // Abs never lead a short workout on their own: they come in only when nothing bigger is ready.
  const big = order.filter((p) => p !== 'core');
  const picked: BodyPart[] = big.filter((p) => bodyPartState(p, rows) === 'ready').slice(0, want);
  if (picked.length === 0) return order.slice(0, want);
  if (picked.length < want && bodyPartState('core', rows) === 'ready') picked.push('core');
  return BODY_PARTS.filter((p) => picked.includes(p));
}

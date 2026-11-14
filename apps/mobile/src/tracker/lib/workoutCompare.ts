/**
 * R-75 (owner, 22 Oct 2026, finish screen "18% less kg lifted than your last pull workout"): which
 * exercises went up and which went down against the workout compared with, and why, in a few words.
 * PURE. The comparison workout is chosen by `services/coachNote` (this routine's last time first).
 * Member words: never "volume", "PR" or "session".
 */

/** One exercise of a workout, as the finish screen holds it. */
export interface CompareExercise {
  exerciseId: string;
  name: string;
  /** kg lifted on it, by the one counting rule (warm-ups never count). */
  volumeKg: number;
  /** Its working sets (warm-ups out). */
  sets: readonly { weightKg: number; reps: number }[];
}

export type DeltaKind = 'up' | 'same' | 'down' | 'new' | 'skipped';

export interface ExerciseDelta {
  exerciseId: string;
  name: string;
  kind: DeltaKind;
  todayKg: number;
  lastKg: number;
  /** (today − last) / last by kg lifted (reps, or sets, for a move with no kilos), or null (new, skipped). */
  pct: number | null;
  /** "2 sets fewer", "2.5 kg heavier", "3 more reps" — the main reason, or null. */
  reason: string | null;
}

/** Changes under this share read as "about the same". */
export const SAME_SHARE = 0.05;

const num = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** The heaviest working weight of a list of sets (0 without one). */
const topKg = (sets: CompareExercise['sets']): number => sets.reduce((a, s) => Math.max(a, s.weightKg > 0 ? s.weightKg : 0), 0);
const reps = (sets: CompareExercise['sets']): number => sets.reduce((a, s) => a + (s.reps > 0 ? s.reps : 0), 0);

/**
 * The main reason an exercise moved, in the order a member thinks of it: sets, then weight, then
 * reps — the first one that moved the SAME way as the row (review fix: a row down 38% said "2.5 kg
 * heavier" when the reps fell). `dir`: +1 up, -1 down. `fmtKg` writes a weight in the member's unit
 * ("2.5 kg"). null when nothing moved that way. PURE.
 */
export function deltaReason(
  today: CompareExercise['sets'],
  last: CompareExercise['sets'],
  fmtKg: (kg: number) => string,
  dir: 1 | -1,
): string | null {
  const ds = today.length - last.length;
  if (Math.sign(ds) === dir) return `${Math.abs(ds)} ${Math.abs(ds) === 1 ? 'set' : 'sets'} ${ds > 0 ? 'more' : 'fewer'}`;
  const dw = topKg(today) - topKg(last);
  if (Math.abs(dw) > 1e-6 && Math.sign(dw) === dir) return `${fmtKg(Math.abs(dw))} ${dw > 0 ? 'heavier' : 'lighter'}`;
  const dr = reps(today) - reps(last);
  if (Math.sign(dr) === dir) return `${Math.abs(dr)} ${dr > 0 ? 'more' : 'fewer'} ${Math.abs(dr) === 1 ? 'rep' : 'reps'}`;
  return null;
}

/**
 * What a row is measured by: kg lifted when both workouts have some; else reps (a plank, a pull-up
 * logged without body weight: review fix, those always read "same"); else the number of sets. PURE.
 */
function measure(now: CompareExercise, was: CompareExercise): [number, number] {
  if (now.volumeKg > 0 && was.volumeKg > 0) return [now.volumeKg, was.volumeKg];
  const r = [reps(now.sets), reps(was.sets)] as const;
  if (r[0] > 0 && r[1] > 0) return [r[0], r[1]];
  return [now.sets.length, was.sets.length];
}

/**
 * Each exercise of today against the compared workout: today's order first, then those done last
 * time but not today ("skipped"). An exercise listed twice is added up. PURE.
 */
export function exerciseDeltas(
  today: readonly CompareExercise[],
  last: readonly CompareExercise[],
  fmtKg: (kg: number) => string = (kg) => `${num(kg)} kg`,
): ExerciseDelta[] {
  const merge = (list: readonly CompareExercise[]): Map<string, CompareExercise> => {
    const m = new Map<string, CompareExercise>();
    for (const e of list) {
      const had = m.get(e.exerciseId);
      m.set(e.exerciseId, had ? { ...had, volumeKg: had.volumeKg + e.volumeKg, sets: [...had.sets, ...e.sets] } : { ...e, sets: [...e.sets] });
    }
    return m;
  };
  const now = merge(today);
  const then = merge(last);
  const out: ExerciseDelta[] = [];
  for (const e of now.values()) {
    const was = then.get(e.exerciseId);
    if (!was) {
      out.push({ exerciseId: e.exerciseId, name: e.name, kind: 'new', todayKg: e.volumeKg, lastKg: 0, pct: null, reason: null });
      continue;
    }
    const [a, b] = measure(e, was);
    const pct = b > 0 ? (a - b) / b : null;
    const kind: DeltaKind = pct == null || Math.abs(pct) < SAME_SHARE ? 'same' : pct > 0 ? 'up' : 'down';
    out.push({
      exerciseId: e.exerciseId,
      name: e.name,
      kind,
      todayKg: e.volumeKg,
      lastKg: was.volumeKg,
      pct,
      reason: kind === 'same' ? null : deltaReason(e.sets, was.sets, fmtKg, kind === 'up' ? 1 : -1),
    });
  }
  for (const w of then.values()) {
    if (!now.has(w.exerciseId)) out.push({ exerciseId: w.exerciseId, name: w.name, kind: 'skipped', todayKg: 0, lastKg: w.volumeKg, pct: null, reason: null });
  }
  return out;
}

/**
 * What explains most of the total change: the exercise whose kilos moved most in the total's
 * direction ("Mostly Barbell Row: 2 sets fewer."). null when the total barely moved. PURE.
 */
export function mainCause(deltas: readonly ExerciseDelta[], totalDelta: number): string | null {
  if (Math.abs(totalDelta) < 1e-6) return null;
  const sign = Math.sign(totalDelta);
  let best: ExerciseDelta | null = null;
  for (const d of deltas) {
    const moved = d.todayKg - d.lastKg;
    if (Math.sign(moved) !== sign) continue;
    if (!best || Math.abs(moved) > Math.abs(best.todayKg - best.lastKg)) best = d;
  }
  if (!best) return null;
  const why = best.kind === 'skipped' ? 'not done this time' : best.kind === 'new' ? 'new this time' : best.reason;
  return why ? `Mostly ${best.name}: ${why}.` : `Mostly ${best.name}.`;
}

/** One row's right-hand words: "+8%", "−20%", "same", "new", "not done". PURE. */
export function deltaTag(d: ExerciseDelta): string {
  switch (d.kind) {
    case 'new':
      return 'new';
    case 'skipped':
      return 'not done';
    case 'same':
      return 'same';
    default:
      return `${d.kind === 'up' ? '+' : '−'}${Math.max(1, Math.round(Math.abs(d.pct ?? 0) * 100))}%`;
  }
}

/** What a screen reader says for a row's tag ("down 20 percent"). PURE. */
export function spokenTag(d: ExerciseDelta): string {
  switch (d.kind) {
    case 'new':
      return 'new this time';
    case 'skipped':
      return 'not done this time';
    case 'same':
      return 'about the same';
    default:
      return `${d.kind} ${deltaTag(d).slice(1).replace('%', ' percent')}`;
  }
}

/** A workout as `countingChangedNames` reads it: each exercise's sets with their ids. */
export interface CountedWorkout {
  exercises: readonly {
    exercise: { id: string; name: string };
    sets: readonly { id: string; isWarmup: boolean }[];
  }[];
}

/**
 * T76 (R-358 family, 5 Nov 2026): the exercises done in BOTH workouts whose Counting differs
 * between them ("Weight as typed" last time, "One side at a time" today). Their kg lifted is
 * counted once one time and twice the other, so a total across them is not a fair comparison:
 * the finish screen said "+340 kg more than last time" (or "Lighter than last time" and then
 * blamed last night's sleep) for the same work. Records and the kg to beat already compare only
 * sets of one Counting (R-358); the finish screen's comparison now does the same.
 * `setModes`: sets that keep their own counting (by set id); `current`: each exercise's counting
 * now (a set without its own was logged in it). Names in today's order. PURE.
 */
export function countingChangedNames(
  today: CountedWorkout,
  last: CountedWorkout,
  setModes: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): string[] {
  const modesOf = (w: CountedWorkout): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const e of w.exercises) {
      const id = e.exercise.id;
      for (const s of e.sets) {
        if (s.isWarmup) continue;
        const mode = setModes.get(s.id) ?? current.get(id) ?? 'one';
        const set = m.get(id) ?? new Set<string>();
        set.add(mode);
        m.set(id, set);
      }
    }
    return m;
  };
  const now = modesOf(today);
  const then = modesOf(last);
  const out: string[] = [];
  for (const e of today.exercises) {
    const a = now.get(e.exercise.id);
    const b = then.get(e.exercise.id);
    if (!a || !b || out.includes(e.exercise.name)) continue;
    const same = a.size === b.size && [...a].every((x) => b.has(x));
    if (!same) out.push(e.exercise.name);
  }
  return out;
}

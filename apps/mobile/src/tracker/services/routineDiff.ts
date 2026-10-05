/**
 * Routine vs finished workout — PURE (Phase 1, Hevy parity).
 *
 * Hevy asks "Update routine?" at the end of a workout that was started from a
 * routine and then changed: exercises added, removed or reordered, or a different
 * number of sets. Answering yes rewrites the routine to match what was done.
 *
 * Skipped-but-kept exercises (still on screen, no sets ticked) are NOT a removal:
 * only exercises the member took off the screen count as removed.
 */
export interface RoutineExerciseLite {
  exerciseId: string;
  name: string;
  targetSets: number;
}

export interface WorkoutExerciseLite {
  exerciseId: string;
  name: string;
  /** Working (non-warm-up) set rows on screen at finish. */
  workingSets: number;
}

export interface RoutineDiff {
  changed: boolean;
  added: string[];
  removed: string[];
  reordered: boolean;
  /** Names whose set count differs. */
  setsChanged: string[];
}

export function diffRoutine(routine: RoutineExerciseLite[], workout: WorkoutExerciseLite[]): RoutineDiff {
  // Key each row by lift + occurrence ("bench#0", "bench#1"), so a routine that
  // has the same exercise twice on purpose is compared copy by copy — the same
  // matching the routine update uses when it writes.
  const keyed = <T extends { exerciseId: string }>(xs: T[]): (T & { k: string })[] => {
    const seen = new Map<string, number>();
    return xs.map((x) => {
      const nth = seen.get(x.exerciseId) ?? 0;
      seen.set(x.exerciseId, nth + 1);
      return { ...x, k: `${x.exerciseId}#${nth}` };
    });
  };
  const r = keyed(routine);
  const w = keyed(workout);
  const rIds = new Set(r.map((x) => x.k));
  const wIds = new Set(w.map((x) => x.k));

  const added = w.filter((x) => !rIds.has(x.k)).map((x) => x.name);
  const removed = r.filter((x) => !wIds.has(x.k)).map((x) => x.name);

  const keptR = r.filter((x) => wIds.has(x.k)).map((x) => x.k);
  const keptW = w.filter((x) => rIds.has(x.k)).map((x) => x.k);
  const reordered = keptR.some((id, i) => keptW[i] !== id);

  const target = new Map(r.map((x) => [x.k, x.targetSets]));
  const setsChanged = w
    .filter((x) => target.has(x.k) && x.workingSets > 0 && target.get(x.k) !== x.workingSets)
    .map((x) => x.name);

  return {
    changed: added.length > 0 || removed.length > 0 || reordered || setsChanged.length > 0,
    added,
    removed,
    reordered,
    setsChanged,
  };
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** One or two short sentences for the prompt. */
export function describeDiff(d: RoutineDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`You added ${list(d.added)}.`);
  if (d.removed.length) parts.push(`You removed ${list(d.removed)}.`);
  if (d.setsChanged.length) {
    parts.push(
      d.setsChanged.length === 1
        ? `You did a different number of sets on ${d.setsChanged[0]}.`
        : `You did a different number of sets on ${d.setsChanged.length} exercises.`,
    );
  }
  if (d.reordered && parts.length === 0) parts.push('You changed the exercise order.');
  return parts.join(' ');
}

/**
 * A logged session → an editable draft. PURE (no DB) — Phase W4.
 *
 * Editing reuses the normal workout logger rather than a second, weaker editor, so
 * a correction gets the same set rows, plate calculator, warm-up ramp, RPE, set
 * types and supersets as the original. That only works if a saved session can be
 * turned back into exactly the draft that would have produced it — which is what
 * this does, including the additive Phase-5b/5c metadata.
 *
 * Every set comes back `done: true`: these are sets that genuinely happened, and a
 * half-ticked list would read as an unfinished workout.
 */
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { SessionDetail } from '@/types/models';

/** Last session's working sets per exercise, EXCLUDING the one being edited. */
export type PreviousByExercise = Record<string, { weightKg: number; reps: number }[]>;

export interface EditDraftDeps {
  /** Stable ids for draft rows — injected so tests are deterministic. */
  makeKey: () => string;
}

/**
 * Rebuild the draft for `session`. `meta` is `getSessionSetMeta(session.id)`; any
 * set missing from it (a seeded or pre-5b row) falls back to a plain working set.
 */
export function buildEditDraft(
  session: SessionDetail,
  meta: Record<string, SetMeta>,
  previous: PreviousByExercise,
  deps: EditDraftDeps,
): DraftExercise[] {
  return session.exercises.map((group) => {
    const sets: DraftSet[] = group.sets.map((s) => {
      const m = meta[s.id];
      const setType = m?.setType ?? 'normal';
      return {
        key: deps.makeKey(),
        weightKg: s.weightKg,
        reps: s.reps,
        isWarmup: s.isWarmup,
        done: true,
        rpe: s.isWarmup ? null : m?.rpe ?? null,
        // `is_warmup` stays authoritative: a warm-up row's type is carried by the
        // flag, and 'warmup' is not a valid DraftSet.setType.
        setType: s.isWarmup || setType === 'warmup' ? undefined : setType,
      };
    });

    // Phase 5c stores the per-exercise note and the superset group on the
    // exercise's rows; read the first set that actually carries one.
    const carried = group.sets.map((s) => meta[s.id]).filter((m): m is SetMeta => Boolean(m));
    const note = carried.find((m) => m.note !== null)?.note ?? undefined;
    const supersetGroup = carried.find((m) => m.supersetGroup !== null)?.supersetGroup ?? null;

    return {
      key: deps.makeKey(),
      exerciseId: group.exercise.id,
      name: group.exercise.name,
      muscleGroup: group.exercise.muscleGroup,
      equipment: group.exercise.equipment,
      incrementKg: group.exercise.incrementKg,
      supersetGroup,
      note,
      previousSets: previous[group.exercise.id] ?? [],
      sets,
    };
  });
}

/**
 * The PREVIOUS entry for an exercise while editing: the newest session for that
 * lift that happened BEFORE the one being edited.
 *
 * "Newest that isn't this one" is wrong here. Editing a workout from two weeks ago
 * would then quote the most RECENT session's numbers — and PREVIOUS is not just
 * decoration: ticking a blank set auto-fills from it, so a future workout's weight
 * would be written into a past session.
 */
export function previousExcludingSession(
  history: { sessionId: string; dateISO: string; sets: { weightKg: number; reps: number }[] }[],
  editingSessionId: string,
  beforeDateISO: string,
): { weightKg: number; reps: number }[] {
  const prior = history.find((h) => h.sessionId !== editingSessionId && h.dateISO < beforeDateISO);
  return (prior?.sets ?? []).map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
}

/**
 * Why this session can't be edited safely, or null when it can.
 *
 * `getSessionDetail` groups sets by exercise id, so two separate cards for the same
 * lift (allowed while logging) come back as ONE. Per-exercise metadata then has to
 * collapse to a single value — and since saving REPLACES every row, the other
 * card's note or superset would be destroyed. Rare, but silent, so refuse instead.
 */
export function uneditableReason(
  session: SessionDetail,
  meta: Record<string, SetMeta>,
): string | null {
  for (const group of session.exercises) {
    const carried = group.sets.map((s) => meta[s.id]).filter((m): m is SetMeta => Boolean(m));
    const notes = new Set(carried.map((m) => m.note).filter((n): n is string => n !== null));
    const groups = new Set(
      carried.map((m) => m.supersetGroup).filter((g): g is number => g !== null),
    );
    if (notes.size > 1 || groups.size > 1) {
      return `${group.exercise.name} was logged as two separate blocks in this workout. Editing would merge them, so this one can't be edited yet.`;
    }
  }
  return null;
}

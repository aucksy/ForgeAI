/**
 * A logged session → an editable draft. PURE (no DB) — Phase W4.
 *
 * Editing reuses the normal workout logger rather than a second, weaker editor, so
 * a correction gets the same set rows, plate calculator, warm-up ramp, RPE, set
 * types and supersets as the original. That only works if a saved session can be
 * turned back into exactly the draft that would have produced it — which is what
 * this does, including the additive Phase-5b/5c metadata and Phase 2's exercise types
 * (time, distance, and help on assisted moves shown as the positive number typed).
 *
 * Every set comes back `done: true`: these are sets that genuinely happened, and a
 * half-ticked list would read as an unfinished workout.
 */
import type { SetMeta } from '@/tracker/db/trackerSets';
import { hasReps, isLoggable, typedWeight, type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import type { DraftExercise, DraftSet, PrevSet } from '@/tracker/store/activeWorkoutStore';
import type { SessionDetail } from '@/types/models';

/** Last session's working sets per exercise, EXCLUDING the one being edited (typed form). */
export type PreviousByExercise = Record<string, PrevSet[]>;

/** Phase 2 settings per exercise id (absent → weight × reps, as typed). */
export type ExerciseKinds = Record<
  string,
  { logType: LogType; loadMode: LoadMode; distUnit: DistUnit; catalogKey: string | null }
>;

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
  kinds: ExerciseKinds = {},
): DraftExercise[] {
  return session.exercises.map((group) => {
    const kind = kinds[group.exercise.id];
    const lt: LogType = kind?.logType ?? 'weight_reps';
    const sets: DraftSet[] = group.sets.map((s) => {
      const m = meta[s.id];
      const setType = m?.setType ?? 'normal';
      const draft: DraftSet = {
        key: deps.makeKey(),
        weightKg: hasReps(lt) ? typedWeight(lt, s.weightKg) : null,
        reps: hasReps(lt) ? s.reps : null,
        isWarmup: s.isWarmup,
        done: true,
        rpe: s.isWarmup ? null : m?.rpe ?? null,
        // `is_warmup` stays authoritative: a warm-up row's type is carried by the
        // flag, and 'warmup' is not a valid DraftSet.setType.
        setType: s.isWarmup || setType === 'warmup' ? undefined : setType,
      };
      if (m?.durationSec != null) draft.durationSec = m.durationSec;
      if (m?.distanceM != null) draft.distanceM = m.distanceM;
      if (m?.loadMode != null) draft.loadMode = m.loadMode;
      // A stored row that doesn't fit this exercise's type is carried as it was: the
      // editor can't show it, and Save must not drop a set that happened.
      if (!isLoggable(lt, draft)) {
        draft.keep = { weightKg: s.weightKg, reps: s.reps, durationSec: m?.durationSec ?? null, distanceM: m?.distanceM ?? null };
      }
      return draft;
    });

    // Phase 5c stores the per-exercise note and the superset group on the
    // exercise's rows; read the first set that actually carries one.
    const carried = group.sets.map((s) => meta[s.id]).filter((m): m is SetMeta => Boolean(m));
    const note = carried.find((m) => m.note !== null)?.note ?? undefined;
    const supersetGroup = carried.find((m) => m.supersetGroup !== null)?.supersetGroup ?? null;

    const draft: DraftExercise = {
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
    if (kind) {
      draft.logType = kind.logType;
      draft.loadMode = kind.loadMode;
      draft.distUnit = kind.distUnit;
      draft.catalogKey = kind.catalogKey;
    }
    return draft;
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
export function previousExcludingSession<
  S extends { weightKg: number; reps: number; durationSec?: number | null; distanceM?: number | null },
>(
  history: { sessionId: string; dateISO: string; sets: S[] }[],
  editingSessionId: string,
  beforeDateISO: string,
): S[] {
  const prior = history.find((h) => h.sessionId !== editingSessionId && h.dateISO < beforeDateISO);
  return prior?.sets ?? [];
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

/**
 * Active-workout draft — the in-memory state of a workout being logged.
 *
 * The draft lives ONLY in this store while logging (so add/remove/edit/reorder are
 * free) and is autosaved to the frozen `meta(key,value)` table on every mutation for
 * crash/app-switch recovery. Nothing hits the domain tables until `finish()`, which
 * commits via the frozen `workoutRepo.createSession` + `addSets` (the latter already
 * auto-numbers sets AND runs PR detection). No schema change, no frozen file edited.
 */
import { create } from 'zustand';

import { getDb, getMeta, setMeta } from '@/db';
import { getActivePlan } from '@/db/repos/planRepo';
import { getRoutine } from '@/tracker/db/routineRepo';
import { addSetsWithMeta } from '@/tracker/db/trackerSets';
import type { RichSet } from '@/tracker/db/trackerSets';
import { createSession, getExerciseHistory } from '@/db/repos/workoutRepo';
import { toISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import { getTodaysWorkout } from '@/services/coach';
import type { DayType, Exercise, MuscleGroup, SessionDetail } from '@/types/models';

const DRAFT_KEY = 'activeWorkoutDraft';

export interface DraftSet {
  key: string;
  /** null = not entered yet (the row shows the PREVIOUS value as a placeholder). */
  weightKg: number | null;
  reps: number | null;
  isWarmup: boolean;
  done: boolean;
  /** Advanced (opt-in) set logging — Phase 5b. Optional so older drafts still load. */
  rpe?: number | null;
  /** Working-set variant; warm-up is carried by `isWarmup`, not here. */
  setType?: 'normal' | 'drop' | 'failure';
}

export interface DraftExercise {
  key: string;
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Exercise['equipment'];
  /** Weight increment for warm-up rounding. Optional so older persisted drafts load. */
  incrementKg?: number;
  /** Superset grouping (Phase 5c) — same int = same superset. Optional for old drafts. */
  supersetGroup?: number | null;
  /** Per-exercise note (Phase 5c) — persisted on the exercise's first set. */
  note?: string;
  /** Last session's working sets — powers the PREVIOUS column + auto-fill. */
  previousSets: { weightKg: number; reps: number }[];
  sets: DraftSet[];
}

interface DraftSnapshot {
  startedAt: number;
  dayType: DayType;
  planDayId: string | null;
  exercises: DraftExercise[];
}

export interface ActiveWorkoutState {
  hydrated: boolean;
  active: boolean;
  /** True while finish() is committing to SQLite — blocks double-submit. */
  committing: boolean;
  startedAt: number | null;
  dayType: DayType;
  planDayId: string | null;
  exercises: DraftExercise[];
  /** Most recently swipe-deleted set, for the undo snackbar (not persisted). */
  lastDeleted: { exKey: string; index: number; set: DraftSet } | null;

  /** Load a persisted draft (call once on launch / when entering the Workout tab). */
  hydrate: () => Promise<void>;
  startEmpty: () => void;
  /** Seed from the coach's rotated plan day (full-body fallback when no plan / rest). */
  startFromPlan: () => Promise<void>;
  /** Start a workout from a SPECIFIC routine (plan day) chosen by the user. */
  startFromPlanDay: (dayId: string) => Promise<void>;
  /** Start a fresh workout pre-filled from a past session (repeat-this-workout). */
  startFromSession: (session: SessionDetail) => Promise<void>;
  addExercise: (ex: Exercise) => Promise<void>;
  removeExercise: (exKey: string) => void;
  addSet: (exKey: string) => void;
  removeSet: (exKey: string, setKey: string) => void;
  updateSet: (exKey: string, setKey: string, patch: Partial<Pick<DraftSet, 'weightKg' | 'reps'>>) => void;
  toggleWarmup: (exKey: string, setKey: string) => void;
  toggleDone: (exKey: string, setKey: string) => void;
  /** Advanced set logging (opt-in). Set the set's type; 'warmup' toggles isWarmup. */
  setSetType: (exKey: string, setKey: string, type: 'normal' | 'warmup' | 'drop' | 'failure') => void;
  /** Advanced set logging (opt-in). Record/clear a set's RPE. */
  setRpe: (exKey: string, setKey: string, rpe: number | null) => void;
  /** Superset grouping (Phase 5c). Assign/join a group, or null to ungroup. */
  setSupersetGroup: (exKey: string, group: number | null) => void;
  /** Per-exercise note (Phase 5c). */
  setExerciseNote: (exKey: string, note: string) => void;
  /** Prepend computed warm-up rows (isWarmup) to an exercise. */
  insertWarmupSets: (exKey: string, rows: { weightKg: number; reps: number }[]) => void;
  /** Remove a set but stash it for undo (drives the snackbar). */
  deleteSetWithUndo: (exKey: string, setKey: string) => void;
  undoDelete: () => void;
  dismissUndo: () => void;
  /** Commit to SQLite; returns the new session id, or null if nothing loggable. */
  finish: (note?: string | null) => Promise<string | null>;
  discard: () => Promise<void>;
  /** Number of sets that would actually be logged (positive reps + a weight). */
  committableSetCount: () => number;
}

function isCommittable(s: DraftSet): boolean {
  return s.reps != null && s.reps > 0 && s.weightKg != null && s.weightKg >= 0;
}

async function persistDraft(s: ActiveWorkoutState): Promise<void> {
  if (!s.active || s.startedAt == null) {
    await setMeta(DRAFT_KEY, '');
    return;
  }
  const snap: DraftSnapshot = {
    startedAt: s.startedAt,
    dayType: s.dayType,
    planDayId: s.planDayId,
    exercises: s.exercises,
  };
  await setMeta(DRAFT_KEY, JSON.stringify(snap));
}

async function buildDraftExercise(
  ex: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'equipment' | 'incrementKg'>,
  targetSets: number,
): Promise<DraftExercise> {
  const hist = await getExerciseHistory(ex.id, 1);
  const previousSets = (hist[0]?.sets ?? []).map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
  const count = Math.max(targetSets, previousSets.length, 1);
  const sets: DraftSet[] = Array.from({ length: count }, () => ({
    key: uuid(),
    weightKg: null,
    reps: null,
    isWarmup: false,
    done: false,
  }));
  return {
    key: uuid(),
    exerciseId: ex.id,
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    equipment: ex.equipment,
    incrementKg: ex.incrementKg,
    previousSets,
    sets,
  };
}

/**
 * PREVIOUS entry for a set, matched by WORKING-set ordinal. `previousSets` holds
 * last session's working sets only (getExerciseHistory excludes warm-ups), so
 * warm-up rows have no PREVIOUS and never shift the mapping of the working rows.
 */
export function prevForSet(
  ex: DraftExercise,
  setKey: string,
): { weightKg: number; reps: number } | null {
  let working = 0;
  for (const s of ex.sets) {
    if (s.key === setKey) return s.isWarmup ? null : ex.previousSets[working] ?? null;
    if (!s.isWarmup) working += 1;
  }
  return null;
}

export const useActiveWorkout = create<ActiveWorkoutState>()((set, get) => {
  /** Apply an exercise-list transform, then persist. */
  const mutate = (fn: (exercises: DraftExercise[]) => DraftExercise[]): void => {
    set((s) => ({ exercises: fn(s.exercises) }));
    void persistDraft(get());
  };

  return {
    hydrated: false,
    active: false,
    committing: false,
    startedAt: null,
    dayType: 'full',
    planDayId: null,
    exercises: [],
    lastDeleted: null,

    hydrate: async () => {
      // Already hydrated, or a workout already begun in-memory — nothing to restore.
      if (get().hydrated || get().active) {
        set({ hydrated: true });
        return;
      }
      const raw = await getMeta(DRAFT_KEY);
      // A workout may have been started (start-tap) during the await — don't clobber it.
      if (get().active || get().hydrated) {
        set({ hydrated: true });
        return;
      }
      if (raw) {
        try {
          const snap = JSON.parse(raw) as DraftSnapshot;
          if (snap && typeof snap.startedAt === 'number' && Array.isArray(snap.exercises)) {
            set({
              active: true,
              startedAt: snap.startedAt,
              dayType: snap.dayType,
              planDayId: snap.planDayId ?? null,
              exercises: snap.exercises,
            });
          }
        } catch {
          // corrupt draft — ignore, start clean
        }
      }
      set({ hydrated: true });
    },

    startEmpty: () => {
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: Date.now(),
        dayType: 'full',
        planDayId: null,
        exercises: [],
        lastDeleted: null,
      });
      void persistDraft(get());
    },

    startFromPlan: async () => {
      const [tw, active] = await Promise.all([getTodaysWorkout(), getActivePlan()]);
      let dayType: DayType = 'full';
      let planDayId: string | null = null;
      let exercises: DraftExercise[] = [];
      if (active && tw.planDayId) {
        const day = active.days.find((d) => d.id === tw.planDayId);
        if (day) {
          dayType = day.dayType;
          planDayId = day.id;
          exercises = await Promise.all(
            day.exercises.map((pe) => buildDraftExercise(pe.exercise, pe.targetSets)),
          );
        }
      }
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: Date.now(),
        dayType,
        planDayId,
        exercises,
        lastDeleted: null,
      });
      void persistDraft(get());
    },

    startFromPlanDay: async (dayId) => {
      const day = await getRoutine(dayId);
      let dayType: DayType = 'full';
      let planDayId: string | null = null;
      let exercises: DraftExercise[] = [];
      if (day) {
        dayType = day.dayType;
        planDayId = day.id;
        exercises = await Promise.all(
          day.exercises.map((pe) => buildDraftExercise(pe.exercise, pe.targetSets)),
        );
      }
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: Date.now(),
        dayType,
        planDayId,
        exercises,
        lastDeleted: null,
      });
      void persistDraft(get());
    },

    startFromSession: async (session) => {
      const exercises = await Promise.all(
        session.exercises.map((g) => {
          const working = g.sets.filter((s) => !s.isWarmup).length;
          return buildDraftExercise(g.exercise, working > 0 ? working : 1);
        }),
      );
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: Date.now(),
        dayType: session.dayType,
        planDayId: null,
        exercises,
        lastDeleted: null,
      });
      void persistDraft(get());
    },

    addExercise: async (ex) => {
      const draftEx = await buildDraftExercise(ex, 1);
      mutate((list) => [...list, draftEx]);
    },

    removeExercise: (exKey) => {
      // Kill a pending undo for this exercise (its set list is going away).
      if (get().lastDeleted?.exKey === exKey) set({ lastDeleted: null });
      mutate((list) => list.filter((e) => e.key !== exKey));
    },

    addSet: (exKey) => {
      mutate((list) =>
        list.map((e) =>
          e.key === exKey
            ? { ...e, sets: [...e.sets, { key: uuid(), weightKg: null, reps: null, isWarmup: false, done: false }] }
            : e,
        ),
      );
    },

    removeSet: (exKey, setKey) => {
      mutate((list) =>
        list.map((e) => (e.key === exKey ? { ...e, sets: e.sets.filter((s) => s.key !== setKey) } : e)),
      );
    },

    insertWarmupSets: (exKey, rows) => {
      if (rows.length === 0) return;
      // Prepending shifts array indices — invalidate any pending undo for this exercise.
      if (get().lastDeleted?.exKey === exKey) set({ lastDeleted: null });
      const warm: DraftSet[] = rows.map((r) => ({
        key: uuid(),
        weightKg: r.weightKg,
        reps: r.reps,
        isWarmup: true,
        done: false,
      }));
      mutate((list) => list.map((e) => (e.key === exKey ? { ...e, sets: [...warm, ...e.sets] } : e)));
    },

    deleteSetWithUndo: (exKey, setKey) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      if (!ex) return;
      const index = ex.sets.findIndex((s) => s.key === setKey);
      if (index < 0) return;
      set({ lastDeleted: { exKey, index, set: ex.sets[index] } });
      mutate((list) =>
        list.map((e) => (e.key === exKey ? { ...e, sets: e.sets.filter((s) => s.key !== setKey) } : e)),
      );
    },

    undoDelete: () => {
      const ld = get().lastDeleted;
      if (!ld) return;
      mutate((list) =>
        list.map((e) => {
          if (e.key !== ld.exKey) return e;
          const sets = [...e.sets];
          sets.splice(Math.min(ld.index, sets.length), 0, ld.set);
          return { ...e, sets };
        }),
      );
      set({ lastDeleted: null });
    },

    dismissUndo: () => set({ lastDeleted: null }),

    updateSet: (exKey, setKey, patch) => {
      mutate((list) =>
        list.map((e) =>
          e.key === exKey
            ? { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }
            : e,
        ),
      );
    },

    toggleWarmup: (exKey, setKey) => {
      mutate((list) =>
        list.map((e) =>
          e.key === exKey
            ? { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, isWarmup: !s.isWarmup } : s)) }
            : e,
        ),
      );
    },

    setSetType: (exKey, setKey, t) => {
      mutate((list) =>
        list.map((e) =>
          e.key === exKey
            ? {
                ...e,
                sets: e.sets.map((s) =>
                  s.key === setKey
                    ? { ...s, isWarmup: t === 'warmup', setType: t === 'warmup' ? undefined : t }
                    : s,
                ),
              }
            : e,
        ),
      );
    },

    setRpe: (exKey, setKey, rpe) => {
      mutate((list) =>
        list.map((e) =>
          e.key === exKey
            ? { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, rpe } : s)) }
            : e,
        ),
      );
    },

    setSupersetGroup: (exKey, group) => {
      mutate((list) => list.map((e) => (e.key === exKey ? { ...e, supersetGroup: group } : e)));
    },

    setExerciseNote: (exKey, note) => {
      mutate((list) => list.map((e) => (e.key === exKey ? { ...e, note } : e)));
    },

    toggleDone: (exKey, setKey) => {
      mutate((list) =>
        list.map((e) => {
          if (e.key !== exKey) return e;
          const prev = prevForSet(e, setKey);
          return {
            ...e,
            sets: e.sets.map((s) => {
              if (s.key !== setKey) return s;
              if (s.done) return { ...s, done: false };
              // Completing: auto-fill blanks from the PREVIOUS value.
              const reps = s.reps ?? prev?.reps ?? null;
              // Nothing to log (blank set with no PREVIOUS) — don't fake a "done"
              // state that finish() would silently drop (isCommittable needs reps > 0).
              if (reps == null || reps <= 0) return s;
              return {
                ...s,
                done: true,
                weightKg: s.weightKg ?? prev?.weightKg ?? 0,
                reps,
              };
            }),
          };
        }),
      );
    },

    finish: async (note) => {
      const s = get();
      // Guard re-entry (double-tap): committing is set synchronously below, before
      // the first await, so a second concurrent call bails here.
      if (!s.active || s.startedAt == null || s.committing) return null;
      const flat: RichSet[] = [];
      for (const ex of s.exercises) {
        const exNote = ex.note?.trim() ? ex.note.trim() : null;
        let firstOfExercise = true;
        for (const st of ex.sets) {
          if (isCommittable(st)) {
            flat.push({
              exerciseId: ex.exerciseId,
              weightKg: st.weightKg as number,
              reps: st.reps as number,
              isWarmup: st.isWarmup,
              rpe: st.isWarmup ? null : st.rpe ?? null,
              setType: st.isWarmup ? undefined : st.setType ?? 'normal',
              supersetGroup: ex.supersetGroup ?? null,
              // A per-exercise note lives on the exercise's first committed set.
              note: firstOfExercise ? exNote : null,
            });
            firstOfExercise = false;
          }
        }
      }
      // Need at least one working set — a warm-up-only session would be invisible
      // to history/PREVIOUS (getExerciseHistory excludes warm-ups).
      if (flat.length === 0 || !flat.some((f) => !f.isWarmup)) return null;
      set({ committing: true });
      try {
        // The session belongs to the day it STARTED, not the commit instant — a
        // workout crossing midnight must not split from its own started_at.
        const startedAt = s.startedAt; // narrowed to number by the guard above
        const dateISO = toISO(new Date(startedAt));
        const endedAt = Date.now();
        // Commit the whole workout atomically: createSession + addSetsWithMeta +
        // the draft-clear all run inside ONE transaction on the shared getDb()
        // connection (non-exclusive, like hevyImport — the frozen repos join it).
        // A kill/error mid-commit now rolls back cleanly instead of leaving an
        // orphan session + a surviving draft that would duplicate it on retry.
        let sessionId = '';
        await getDb().withTransactionAsync(async () => {
          const session = await createSession({
            dateISO,
            dayType: s.dayType,
            notes: note ?? null,
            source: 'manual',
            startedAt,
            endedAt,
          });
          sessionId = session.id;
          await addSetsWithMeta(session.id, flat); // auto set_number + PR detection + rpe/type
          await setMeta(DRAFT_KEY, '');
        });
        set({
          active: false,
          committing: false,
          hydrated: true,
          startedAt: null,
          dayType: 'full',
          planDayId: null,
          exercises: [],
          lastDeleted: null,
        });
        return sessionId;
      } catch (e) {
        set({ committing: false }); // let the user retry
        throw e;
      }
    },

    discard: async () => {
      await setMeta(DRAFT_KEY, '');
      set({
        active: false,
        committing: false,
        hydrated: true,
        startedAt: null,
        dayType: 'full',
        planDayId: null,
        exercises: [],
        lastDeleted: null,
      });
    },

    committableSetCount: () => {
      let n = 0;
      for (const ex of get().exercises) for (const s of ex.sets) if (isCommittable(s)) n += 1;
      return n;
    },
  };
});

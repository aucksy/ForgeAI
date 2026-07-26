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
import { getBoundedExerciseHistory } from '@/tracker/db/exerciseHistory';
import { getRoutine } from '@/tracker/db/routineRepo';
import { saveSessionEdits } from '@/tracker/db/sessionEdit';
import { addSetsWithMeta, getSessionSetMeta } from '@/tracker/db/trackerSets';
import { buildEditDraft, previousExcludingSession, uneditableReason } from '@/tracker/services/editDraft';
import type { PreviousByExercise } from '@/tracker/services/editDraft';
import { computeEditedTiming } from '@/tracker/services/sessionTiming';
import { draftToRichSets, hasWorkingSet, isCommittable } from '@/tracker/services/draftSets';
import { createSession } from '@/db/repos/workoutRepo';
import { toISO, todayISO } from '@/lib/date';
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
  /** Phase W4 — set when this draft is a CORRECTION to an existing session. */
  editingSessionId?: string | null;
  /** Edit mode only: the day the session claims (may be moved by the user). */
  dateISO?: string | null;
  /** Edit mode only: the session's notes. */
  notes?: string | null;
  /** Edit mode only: the session's original end time. */
  endedAt?: number | null;
  /** Edit mode only: the day the session was stored under BEFORE any move. */
  originalDateISO?: string | null;
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
  /** Phase W4: id of the session being CORRECTED, or null for a new workout. */
  editingSessionId: string | null;
  /** Edit mode only — the day the corrected session will claim. */
  editDateISO: string | null;
  /** Edit mode only — the session's notes. */
  editNotes: string | null;
  /** Edit mode only — the original end time, shifted with the date. */
  editEndedAt: number | null;
  /**
   * Edit mode only — the `date_iso` the session was STORED under. A date move is
   * measured from this, never from the local day of `started_at`: the two disagree
   * for every Hevy-imported workout (imported timestamps are UTC-based), so
   * measuring from the timestamp would shift a no-op save by a whole day.
   */
  editOriginalDateISO: string | null;

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
  /** Phase W4: load a logged session into the draft to correct it. */
  startEditingSession: (session: SessionDetail) => Promise<void>;
  /** Edit mode: move the workout to another day (clamped to today). */
  setEditDate: (dateISO: string) => void;
  /** Edit mode: change the session's day type. */
  setEditDayType: (dayType: DayType) => void;
  /** Edit mode: change the session's notes. */
  setEditNotes: (notes: string) => void;
  /** Edit mode: write the corrections back. Returns the session id, or null. */
  saveEdits: () => Promise<string | null>;
  /**
   * False when the last save committed but its personal-record reconciliation
   * failed — the workout IS saved, the PR list may lag. Reset on each save.
   */
  lastSaveReconciled: boolean;
  discard: () => Promise<void>;
  /** Number of sets that would actually be logged (positive reps + a weight). */
  committableSetCount: () => number;
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
    editingSessionId: s.editingSessionId,
    dateISO: s.editDateISO,
    notes: s.editNotes,
    endedAt: s.editEndedAt,
    originalDateISO: s.editOriginalDateISO,
  };
  await setMeta(DRAFT_KEY, JSON.stringify(snap));
}

async function buildDraftExercise(
  ex: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'equipment' | 'incrementKg'>,
  targetSets: number,
): Promise<DraftExercise> {
  // Bounded in SQL: start-from-plan builds one draft per plan exercise, and the frozen
  // read would materialise each lift's ENTIRE working-set history just to keep its last
  // session. Parity-identical (newest-first, working sets only).
  const hist = await getBoundedExerciseHistory(ex.id, 1);
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
 * last session's working sets only (the history read excludes warm-ups), so
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
    editingSessionId: null,
    editDateISO: null,
    editNotes: null,
    editEndedAt: null,
    editOriginalDateISO: null,
    lastSaveReconciled: true,

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
              // Pre-W4 drafts have none of these — they restore as a new workout.
              editingSessionId: snap.editingSessionId ?? null,
              editDateISO: snap.dateISO ?? null,
              editNotes: snap.notes ?? null,
              editEndedAt: snap.endedAt ?? null,
              editOriginalDateISO: snap.originalDateISO ?? null,
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
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
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
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
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
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
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
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
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
      // An edit must go through saveEdits — finishing would create a SECOND session
      // and leave the original untouched.
      if (s.editingSessionId) return null;
      const flat = draftToRichSets(s.exercises);
      // Need at least one working set — a warm-up-only session would be invisible
      // to history/PREVIOUS (the history read excludes warm-ups).
      if (!hasWorkingSet(flat)) return null;
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

    startEditingSession: async (session) => {
      // PREVIOUS must show the session BEFORE this one, not the workout its own
      // numbers — nor a NEWER one, which ticking a blank set would then auto-fill
      // into the past. Pull a few and take the newest that predates this session.
      const [meta, histories] = await Promise.all([
        getSessionSetMeta(session.id),
        Promise.all(
          session.exercises.map(async (g) => ({
            exerciseId: g.exercise.id,
            history: await getBoundedExerciseHistory(g.exercise.id, 4),
          })),
        ),
      ]);
      const previous: PreviousByExercise = {};
      for (const h of histories) {
        previous[h.exerciseId] = previousExcludingSession(h.history, session.id, session.dateISO);
      }
      const exercises = buildEditDraft(session, meta, previous, { makeKey: uuid });
      set({
        active: true,
        hydrated: true,
        committing: false,
        // Keep the ORIGINAL start time: it anchors the session's place in history
        // and is what PR detection compares against.
        startedAt: session.startedAt,
        dayType: session.dayType,
        planDayId: null,
        exercises,
        lastDeleted: null,
        editingSessionId: session.id,
        editDateISO: session.dateISO,
        editNotes: session.notes,
        editEndedAt: session.endedAt,
        editOriginalDateISO: session.dateISO,
      });
      void persistDraft(get());
    },

    setEditDate: (dateISO) => {
      // A workout can't have happened in the future. Clamped here as well as in the
      // header so a stale draft (device clock moved on) can't carry one through.
      if (!get().editingSessionId || dateISO > todayISO()) return;
      set({ editDateISO: dateISO });
      void persistDraft(get());
    },

    setEditDayType: (dayType) => {
      if (!get().editingSessionId) return;
      set({ dayType });
      void persistDraft(get());
    },

    setEditNotes: (notes) => {
      if (!get().editingSessionId) return;
      set({ editNotes: notes });
      void persistDraft(get());
    },

    saveEdits: async () => {
      const s = get();
      // Same re-entry guard as finish(): `committing` is set synchronously below.
      if (!s.active || !s.editingSessionId || s.startedAt == null || s.committing) return null;
      const flat = draftToRichSets(s.exercises);
      // Emptying a workout is a DELETE, not a save — the screen offers that instead.
      if (!hasWorkingSet(flat)) return null;

      const sessionId = s.editingSessionId;
      const fallbackDate = toISO(new Date(s.startedAt));
      const timing = computeEditedTiming({
        originalDateISO: s.editOriginalDateISO ?? s.editDateISO ?? fallbackDate,
        dateISO: s.editDateISO ?? fallbackDate,
        startedAt: s.startedAt,
        endedAt: s.editEndedAt,
        now: Date.now(),
      });

      set({ committing: true });
      try {
        const { reconciled } = await saveSessionEdits(sessionId, {
          dateISO: timing.dateISO,
          dayType: s.dayType,
          notes: s.editNotes?.trim() ? s.editNotes.trim() : null,
          startedAt: timing.startedAt,
          endedAt: timing.endedAt,
          sets: flat,
        });
        set({ lastSaveReconciled: reconciled });
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
          editingSessionId: null,
          editDateISO: null,
          editNotes: null,
        });
        return sessionId;
      } catch (e) {
        set({ committing: false }); // let the user retry; nothing was committed
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
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
      });
    },

    committableSetCount: () => {
      let n = 0;
      for (const ex of get().exercises) for (const s of ex.sets) if (isCommittable(s)) n += 1;
      return n;
    },
  };
});

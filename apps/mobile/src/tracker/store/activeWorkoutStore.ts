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
import { getBoundedExerciseHistory, type TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import {
  getTrackerExercise,
  getTrackerExercisesByIds,
  setExerciseLoadMode,
  type TrackerExercise,
} from '@/tracker/db/exerciseInfo';
import { isLoggable, typedWeight, type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { getCarriedNote, getExerciseRestSec, getPriorBests, setExerciseRestSec } from '@/tracker/db/exercisePrefs';
import type { PriorBests } from '@/tracker/services/liveRecords';
import { getRoutine } from '@/tracker/db/routineRepo';
import { saveSessionEdits } from '@/tracker/db/sessionEdit';
import { easySets } from '@/tracker/plans/easyWeek';
import { getPlanNow, isEasyForRoutine } from '@/tracker/services/planState';
import { addSetsWithMeta, getSessionSetMeta } from '@/tracker/db/trackerSets';
import { buildEditDraft, previousExcludingSession } from '@/tracker/services/editDraft';
import type { ExerciseKinds, PreviousByExercise } from '@/tracker/services/editDraft';
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
  /**
   * null = not entered yet (the row shows the PREVIOUS value as a placeholder). The
   * TYPED value: help on an assisted move is positive here and stored negative on save.
   */
  weightKg: number | null;
  reps: number | null;
  /** Phase 2: seconds on a time exercise (null = not entered). */
  durationSec?: number | null;
  /** Phase 2: metres on a distance exercise (null = not entered). */
  distanceM?: number | null;
  isWarmup: boolean;
  done: boolean;
  /** Advanced (opt-in) set logging — Phase 5b. Optional so older drafts still load. */
  rpe?: number | null;
  /** Working-set variant; warm-up is carried by `isWarmup`, not here. */
  setType?: 'normal' | 'drop' | 'failure';
  /**
   * Phase 1: which fields the tick filled from a hint (not typed). Unticking clears
   * them again — every row with numbers is saved, so a mistaken tick-untick on a
   * blank row must leave it blank.
   */
  autoFilled?: { weight?: boolean; reps?: boolean; duration?: boolean; distance?: boolean };
  /**
   * Editing a saved workout: the set's own counting (logged before the member changed the
   * exercise's counting) — written back unchanged so an edit never re-reads it.
   */
  loadMode?: LoadMode | null;
  /**
   * Editing a saved workout: the row as stored, when it doesn't fit the exercise's type
   * (a timed Hevy row on a weight × reps exercise, reps logged by chat on a timed one).
   * The editor can't show it, so Save writes it back exactly as it was — never drops it.
   */
  keep?: { weightKg: number; reps: number; durationSec?: number | null; distanceM?: number | null };
}

/** Last time's numbers for one set row, in TYPED form (help positive). */
export interface PrevSet {
  weightKg: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
}

/** What a tick fills into a blank row (and what its inputs show greyed). */
export type SetFill = PrevSet;

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
  /** Last session's working sets — powers the PREVIOUS column + auto-fill (typed form). */
  previousSets: PrevSet[];
  sets: DraftSet[];
  /**
   * Phase 2 — how this exercise is logged and counted. Optional so drafts saved before
   * Phase 2 still load (absent = weight × reps, weight as typed).
   */
  logType?: LogType;
  loadMode?: LoadMode;
  distUnit?: DistUnit;
  /** Catalogue entry (picture, steps, easier/harder versions). */
  catalogKey?: string | null;
  /** The member's own photo or video for this exercise. */
  mediaUri?: string | null;
  mediaType?: 'image' | 'video' | null;
  /** Finer main muscle for the card's tag ("Side shoulders"); absent → the coarse group. */
  muscleLabel?: string;
  /**
   * Phase 1: this exercise's own rest length in seconds. null/absent = the default
   * rest, 0 = no timer. Saved per exercise, so it carries to the next workout.
   */
  restSec?: number | null;
  /** Phase 1: best weight / e1RM before this workout, for live record alerts. */
  bests?: PriorBests | null;
  /**
   * Phase 1: working set rows when the exercise was put on screen. "Update routine?"
   * only counts a set change when the member added or removed rows — leaving planned
   * sets blank is skipping, not re-planning (Hevy behaves the same way).
   */
  startRows?: number;
}

interface DraftSnapshot {
  startedAt: number;
  dayType: DayType;
  planDayId: string | null;
  /** Phase 4: started in an easy week of the followed plan. Absent on older drafts. */
  easyWeek?: boolean;
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
  /**
   * Phase 4: this workout is an easy week of the followed plan — half the sets, the same
   * weights; saved marked, so records and the Target leave it out.
   */
  easyWeek: boolean;
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
  updateSet: (
    exKey: string,
    setKey: string,
    patch: Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>>,
  ) => void;
  toggleWarmup: (exKey: string, setKey: string) => void;
  /** `fill` = what the row is hinting (its Target-aware fill); omitted → computed from PREVIOUS. */
  toggleDone: (exKey: string, setKey: string, fill?: SetFill | null) => void;
  /** Phase 2 (hold timer): write a measured time into a set and tick it. */
  completeTimedSet: (exKey: string, setKey: string, durationSec: number) => void;
  /** Phase 2: how this exercise's weight counts (dumbbells). Remembered for the exercise. */
  setLoadMode: (exKey: string, mode: LoadMode) => void;
  /**
   * Phase 2 ("try a harder / easier version"): put another exercise in this card's place.
   * Only while none of its sets is ticked — logged sets belong to the exercise they were done on.
   */
  swapExercise: (exKey: string, ex: Exercise) => Promise<boolean>;
  /** Advanced set logging (opt-in). Set the set's type; 'warmup' toggles isWarmup. */
  setSetType: (exKey: string, setKey: string, type: 'normal' | 'warmup' | 'drop' | 'failure') => void;
  /** Advanced set logging (opt-in). Record/clear a set's RPE. */
  setRpe: (exKey: string, setKey: string, rpe: number | null) => void;
  /** Superset grouping (Phase 5c). Assign/join a group, or null to ungroup. */
  setSupersetGroup: (exKey: string, group: number | null) => void;
  /** Per-exercise note (Phase 5c). */
  setExerciseNote: (exKey: string, note: string) => void;
  /** Phase 1: this exercise's rest length (null = default, 0 = off). Remembered per exercise. */
  setRestSec: (exKey: string, restSec: number | null) => void;
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
  /** Edit mode (Phase 1): set the workout's length in whole minutes. */
  setEditDuration: (minutes: number) => void;
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
    easyWeek: s.easyWeek,
    exercises: s.exercises,
    editingSessionId: s.editingSessionId,
    dateISO: s.editDateISO,
    notes: s.editNotes,
    endedAt: s.editEndedAt,
    originalDateISO: s.editOriginalDateISO,
  };
  await setMeta(DRAFT_KEY, JSON.stringify(snap));
}

/** A stored history set in the form the set row shows and types (help positive). PURE. */
export function toPrevSet(s: Pick<TrackedSetEntry, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>, logType: LogType): PrevSet {
  const p: PrevSet = { weightKg: typedWeight(logType, s.weightKg), reps: s.reps };
  if (s.durationSec != null) p.durationSec = s.durationSec;
  if (s.distanceM != null) p.distanceM = s.distanceM;
  return p;
}

async function buildDraftExercise(
  ex: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'equipment' | 'incrementKg'>,
  targetSets: number,
  opts: { exactSets?: boolean } = {},
): Promise<DraftExercise> {
  // Bounded in SQL: start-from-plan builds one draft per plan exercise, and the frozen
  // read would materialise each lift's ENTIRE working-set history just to keep its last
  // session. Parity-identical (newest-first, working sets only). Phase 4: PREVIOUS is the
  // last NORMAL workout — an easy week's lighter, shorter sets are not what to beat.
  const [hist, restSec, note, bests, info] = await Promise.all([
    getBoundedExerciseHistory(ex.id, 1, { skipEasy: true }),
    // Phase 1 extras never block starting a workout: a failed read just means
    // default rest, no carried note, no live record alert.
    getExerciseRestSec(ex.id).catch(() => null),
    getCarriedNote(ex.id).catch(() => null),
    getPriorBests(ex.id).catch(() => null),
    // Phase 2: how it is logged. A failed read logs it as weight × reps, as before.
    getTrackerExercise(ex.id).catch(() => null),
  ]);
  const logType: LogType = info?.logType ?? 'weight_reps';
  const previousSets = (hist[0]?.sets ?? []).map((s) => toPrevSet(s, logType));
  // An easy week asks for exactly half the sets, even when last time had more rows.
  const count = opts.exactSets ? Math.max(1, targetSets) : Math.max(targetSets, previousSets.length, 1);
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
    restSec,
    bests,
    startRows: count,
    logType,
    loadMode: info?.loadMode ?? 'one',
    distUnit: info?.distUnit ?? 'km',
    catalogKey: info?.catalogKey ?? null,
    mediaUri: info?.mediaUri ?? null,
    mediaType: info?.mediaType ?? null,
    ...(info?.muscles.primary[0] ? { muscleLabel: MUSCLE_LABEL[info.muscles.primary[0]] } : {}),
    // Notes carry forward from the last workout with this exercise (Hevy-style).
    ...(note ? { note } : {}),
  };
}

/**
 * PREVIOUS entry for a set, matched by WORKING-set ordinal. `previousSets` holds
 * last session's working sets only (the history read excludes warm-ups), so
 * warm-up rows have no PREVIOUS and never shift the mapping of the working rows.
 */
export function prevForSet(ex: DraftExercise, setKey: string): PrevSet | null {
  let working = 0;
  for (const s of ex.sets) {
    if (s.key === setKey) return s.isWarmup ? null : ex.previousSets[working] ?? null;
    if (!s.isWarmup) working += 1;
  }
  return null;
}

/** The fill has what this exercise's type needs (a usable hint / tick value). */
function fillUsable(lt: LogType, f: PrevSet | null): boolean {
  if (!f) return false;
  if (lt === 'time') return (f.durationSec ?? 0) > 0;
  if (lt === 'distance') return (f.distanceM ?? 0) > 0;
  if (lt === 'time_distance') return (f.distanceM ?? 0) > 0 || (f.durationSec ?? 0) > 0;
  return f.reps > 0;
}

/**
 * What a blank set is filled with when ticked, and what its inputs show greyed:
 * last workout's matching set (PREVIOUS), or — for a set beyond last time's count —
 * the nearest working set ABOVE it that has numbers (Phase 1: an extra set is one
 * tap, as in Hevy). Only hints: nothing is written into the row until it is ticked,
 * because every row with numbers is saved on finish.
 */
export function fillForSet(
  ex: DraftExercise,
  setKey: string,
  /** The exercise's Target (progression v2): when present, normal and failure rows hint
   *  its weight and rep goal (or, timed, its hold) instead of last time's numbers, so the
   *  rows agree with the Target line. A weight the member already typed higher up wins
   *  (the line never argues). Warm-up and drop rows keep the old hints. */
  target?: SetFill | null,
): SetFill | null {
  const lt: LogType = ex.logType ?? 'weight_reps';
  const repsType = lt === 'weight_reps' || lt === 'reps' || lt === 'weighted' || lt === 'assisted';
  const idx = ex.sets.findIndex((s) => s.key === setKey);
  if (target && idx >= 0 && !ex.sets[idx].isWarmup && ex.sets[idx].setType !== 'drop') {
    if (lt === 'time') {
      return target.durationSec != null && target.durationSec > 0
        ? { weightKg: 0, reps: 0, durationSec: target.durationSec }
        : null;
    }
    if (repsType) {
      for (let i = idx - 1; i >= 0; i--) {
        const s = ex.sets[i];
        if (s.isWarmup || s.setType === 'drop') continue;
        if (s.weightKg != null) return { weightKg: s.weightKg, reps: target.reps };
      }
      return { weightKg: target.weightKg, reps: target.reps };
    }
  }
  const prev = prevForSet(ex, setKey);
  if (prev && fillUsable(lt, prev)) return prev;
  if (idx < 0 || ex.sets[idx].isWarmup) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const s = ex.sets[i];
    if (s.isWarmup) continue;
    const prevAbove = prevForSet(ex, s.key);
    if (repsType) {
      // A bodyweight move's blank weight is "no added weight", not "missing".
      const w = s.weightKg ?? prevAbove?.weightKg ?? (lt === 'weight_reps' ? null : 0);
      const r = s.reps ?? prevAbove?.reps ?? null;
      if (w != null && r != null && r > 0) return { weightKg: w, reps: r };
      continue;
    }
    const d = s.durationSec ?? prevAbove?.durationSec ?? null;
    const m = s.distanceM ?? prevAbove?.distanceM ?? null;
    const cand: SetFill = { weightKg: 0, reps: 0 };
    if (d != null && (lt === 'time' || lt === 'time_distance')) cand.durationSec = d;
    if (m != null && (lt === 'distance' || lt === 'time_distance')) cand.distanceM = m;
    if (fillUsable(lt, cand)) return cand;
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
    easyWeek: false,
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
              easyWeek: snap.easyWeek === true,
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
        easyWeek: false,
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
      const [tw, active, plan] = await Promise.all([getTodaysWorkout(), getActivePlan(), getPlanNow().catch(() => null)]);
      let dayType: DayType = 'full';
      let planDayId: string | null = null;
      let exercises: DraftExercise[] = [];
      // Phase 4: today's routine always comes from the followed plan — in its easy week,
      // half the sets.
      const easy = plan?.easy === true;
      if (active && tw.planDayId) {
        const day = active.days.find((d) => d.id === tw.planDayId);
        if (day) {
          dayType = day.dayType;
          planDayId = day.id;
          exercises = await Promise.all(
            day.exercises.map((pe) =>
              buildDraftExercise(pe.exercise, easy ? easySets(pe.targetSets) : pe.targetSets, { exactSets: easy }),
            ),
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
        easyWeek: easy && planDayId != null,
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
      const [day, easy] = await Promise.all([getRoutine(dayId), isEasyForRoutine(dayId).catch(() => false)]);
      let dayType: DayType = 'full';
      let planDayId: string | null = null;
      let exercises: DraftExercise[] = [];
      if (day) {
        dayType = day.dayType;
        planDayId = day.id;
        exercises = await Promise.all(
          day.exercises.map((pe) =>
            buildDraftExercise(pe.exercise, easy ? easySets(pe.targetSets) : pe.targetSets, { exactSets: easy }),
          ),
        );
      }
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: Date.now(),
        dayType,
        planDayId,
        easyWeek: easy && planDayId != null,
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
        easyWeek: false,
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
      // Correcting a past workout: a note carried from a LATER session would be wrong.
      if (get().editingSessionId) delete draftEx.note;
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
            ? {
                ...e,
                sets: e.sets.map((s) =>
                  s.key === setKey
                    ? {
                        ...s,
                        ...patch,
                        autoFilled: s.autoFilled
                          ? {
                              weight: 'weightKg' in patch ? false : s.autoFilled.weight,
                              reps: 'reps' in patch ? false : s.autoFilled.reps,
                              duration: 'durationSec' in patch ? false : s.autoFilled.duration,
                              distance: 'distanceM' in patch ? false : s.autoFilled.distance,
                            }
                          : undefined,
                      }
                    : s,
                ),
              }
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

    setRestSec: (exKey, restSec) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      if (!ex) return;
      // Same lift twice in one workout shares the setting, as it will next time.
      mutate((list) => list.map((e) => (e.exerciseId === ex.exerciseId ? { ...e, restSec } : e)));
      void setExerciseRestSec(ex.exerciseId, restSec).catch(() => undefined);
    },

    toggleDone: (exKey, setKey, fill) => {
      mutate((list) =>
        list.map((e) => {
          if (e.key !== exKey) return e;
          // The row passes the exact fill it is hinting, so the hint and the tick never disagree.
          const prev = fill !== undefined ? fill : fillForSet(e, setKey);
          const lt: LogType = e.logType ?? 'weight_reps';
          return {
            ...e,
            sets: e.sets.map((s) => {
              if (s.key !== setKey) return s;
              if (s.done) {
                const af = s.autoFilled;
                return {
                  ...s,
                  done: false,
                  weightKg: af?.weight ? null : s.weightKg,
                  reps: af?.reps ? null : s.reps,
                  durationSec: af?.duration ? null : s.durationSec,
                  distanceM: af?.distance ? null : s.distanceM,
                  autoFilled: undefined,
                };
              }
              if (lt === 'time' || lt === 'distance' || lt === 'time_distance') {
                // Time / distance: fill what this type needs, tick only when there is
                // something to save (finish() would silently drop an empty row).
                const durationSec =
                  lt === 'distance' ? s.durationSec ?? null : s.durationSec ?? prev?.durationSec ?? null;
                const distanceM = lt === 'time' ? s.distanceM ?? null : s.distanceM ?? prev?.distanceM ?? null;
                const next = { ...s, durationSec, distanceM };
                if (!isLoggable(lt, next)) return s;
                return {
                  ...next,
                  done: true,
                  autoFilled: {
                    duration: s.durationSec == null && durationSec != null,
                    distance: s.distanceM == null && distanceM != null,
                  },
                };
              }
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
                autoFilled: { weight: s.weightKg == null, reps: s.reps == null },
              };
            }),
          };
        }),
      );
    },

    completeTimedSet: (exKey, setKey, durationSec) => {
      const sec = Math.round(durationSec);
      if (!Number.isFinite(sec) || sec <= 0) return;
      mutate((list) =>
        list.map((e) =>
          e.key === exKey
            ? {
                ...e,
                sets: e.sets.map((s) =>
                  s.key === setKey ? { ...s, durationSec: sec, done: true, autoFilled: undefined } : s,
                ),
              }
            : e,
        ),
      );
    },

    setLoadMode: (exKey, mode) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      if (!ex) return;
      // Same lift twice in one workout shares the setting, as it will next time.
      mutate((list) => list.map((e) => (e.exerciseId === ex.exerciseId ? { ...e, loadMode: mode } : e)));
      void setExerciseLoadMode(ex.exerciseId, mode).catch(() => undefined);
    },

    swapExercise: async (exKey, next) => {
      const cur = get().exercises.find((e) => e.key === exKey);
      if (!cur || cur.sets.some((s) => s.done)) return false;
      // Phase 4: in an easy week the halved set count stays (not last time's full count).
      const draftEx = await buildDraftExercise(next, cur.sets.filter((s) => !s.isWarmup).length || 1, { exactSets: get().easyWeek });
      if (get().editingSessionId) delete draftEx.note;
      // Re-check after the await: a tick may have landed meanwhile.
      const still = get().exercises.find((e) => e.key === exKey);
      if (!still || still.sets.some((s) => s.done)) return false;
      mutate((list) =>
        list.map((e) => (e.key === exKey ? { ...draftEx, key: exKey, supersetGroup: e.supersetGroup ?? null } : e)),
      );
      return true;
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
          // Phase 4: an easy-week workout is marked, so records and the Target leave it out —
          // also the frozen PR log that Home's PR count, the strength score and the coach read.
          if (s.easyWeek) {
            await getDb().runAsync('UPDATE workout_sessions SET easy_week = 1 WHERE id = ?', [session.id]);
            await getDb().runAsync('DELETE FROM personal_records WHERE session_id = ?', [session.id]);
          }
          await setMeta(DRAFT_KEY, '');
        });
        set({
          active: false,
          committing: false,
          hydrated: true,
          startedAt: null,
          dayType: 'full',
          planDayId: null,
          easyWeek: false,
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
      const [meta, histories, infos] = await Promise.all([
        getSessionSetMeta(session.id),
        Promise.all(
          session.exercises.map(async (g) => ({
            exerciseId: g.exercise.id,
            history: await getBoundedExerciseHistory(g.exercise.id, 4),
          })),
        ),
        // No fallback: without each exercise's type, Save would drop timed and assisted sets.
        // A failed read refuses the edit (the screen says "Could not open the editor").
        getTrackerExercisesByIds(session.exercises.map((g) => g.exercise.id)),
      ]);
      const kinds: ExerciseKinds = {};
      for (const [id, info] of infos) {
        kinds[id] = { logType: info.logType, loadMode: info.loadMode, distUnit: info.distUnit, catalogKey: info.catalogKey };
      }
      const previous: PreviousByExercise = {};
      for (const h of histories) {
        const lt = kinds[h.exerciseId]?.logType ?? 'weight_reps';
        previous[h.exerciseId] = previousExcludingSession(h.history, session.id, session.dateISO).map((s) =>
          toPrevSet(s, lt),
        );
      }
      const exercises = buildEditDraft(session, meta, previous, { makeKey: uuid }, kinds);
      set({
        active: true,
        hydrated: true,
        committing: false,
        // Keep the ORIGINAL start time: it anchors the session's place in history
        // and is what PR detection compares against.
        startedAt: session.startedAt,
        dayType: session.dayType,
        planDayId: null,
        easyWeek: false,
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

    setEditDuration: (minutes) => {
      const s = get();
      if (!s.editingSessionId || s.startedAt == null) return;
      const mins = Math.max(1, Math.min(600, Math.round(minutes)));
      set({ editEndedAt: s.startedAt + mins * 60_000 });
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
          easyWeek: false,
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
        easyWeek: false,
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
      for (const ex of get().exercises) for (const s of ex.sets) if (isCommittable(s, ex.logType ?? 'weight_reps')) n += 1;
      return n;
    },
  };
});

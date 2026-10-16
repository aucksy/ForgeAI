/**
 * Active-workout draft — the in-memory state of a workout being logged.
 *
 * The draft lives ONLY in this store while logging (so add/remove/edit/reorder are
 * free) and is autosaved to the frozen `meta(key,value)` table on every mutation for
 * crash/app-switch recovery. Nothing hits the domain tables until `finish()`, which
 * commits via the frozen `workoutRepo.createSession` + `addSets` (the latter already
 * auto-numbers sets AND runs PR detection). No schema change, no frozen file edited.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';

import {
  clearAllSaveProblems,
  clearSaveProblem,
  reportActionProblem,
  reportSaveProblem,
  retryDelayMs,
} from '@/components/saveProblemStore';
import { getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import {
  getBoundedExerciseHistories,
  getBoundedExerciseHistory,
  getWarmupSets,
  type ExerciseHistoryEntry,
  type HistoryBefore,
  type TrackedSetEntry,
  type WarmupsBySession,
} from '@/tracker/db/exerciseHistory';
import {
  getTrackerExercise,
  getTrackerExercisesByIds,
  setExerciseLoadMode,
  type TrackerExercise,
} from '@/tracker/db/exerciseInfo';
import { typedWeight, type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import { warmupWeightKg, type WarmScale } from '@/tracker/engine/progression';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import {
  getCarriedNote,
  getCarriedNotes,
  getExerciseRestSec,
  getExerciseRestSecs,
  getPriorBests,
  getPriorBestsMany,
  setExerciseRestSec,
} from '@/tracker/db/exercisePrefs';
import { historyScopeOrAll, routineIdByName, type HistoryScope } from '@/tracker/db/historyScope';
import { getWorkoutSourceNames } from '@/tracker/db/workoutSourceNames';
import { bestSetOf } from '@/tracker/lib/previousSource';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import type { PriorBests } from '@/tracker/services/liveRecords';
import { getRoutine } from '@/tracker/db/routineRepo';
import { saveSessionEditsUnqueued } from '@/tracker/db/sessionEdit';
import { easySets } from '@/tracker/plans/easyWeek';
import { typesOf, type PlanSetType } from '@/tracker/plans/routineSets';
import type { RoutineExerciseExtras } from '@/tracker/db/folderRepo';
import { getPlanNow, isEasyForRoutine } from '@/tracker/services/planState';
import { addSetsWithMeta, getSessionSetMeta } from '@/tracker/db/trackerSets';
import { buildEditDraft, previousExcludingSession } from '@/tracker/services/editDraft';
import type { ExerciseKinds, PreviousByExercise } from '@/tracker/services/editDraft';
import { computeEditedTiming, dayDeltaMs } from '@/tracker/services/sessionTiming';
import { NO_PAUSE, pauseAt, pauseFromDraft, resumeAt, savedEnd, type PauseSpan } from '@/tracker/services/workoutPause';
import { reconcilePrsForExercises } from '@/tracker/services/prRebuild';
import { checkMinutes, checkStartTime } from '@/tracker/services/editFields';
import { draftToRichSets, hasWorkingSet, isCommittable, withoutUntickedSaved } from '@/tracker/services/draftSets';
import { tickValues, type TickMissing } from '@/tracker/services/setTick';
import {
  applyCopy,
  copyTargets,
  copyValues,
  stepPatch,
  undoCopyRows,
  type CopyBefore,
  type EntryField,
  type EntryValues,
} from '@/tracker/services/setEntry';
import { displayUnits } from '@/lib/units';
import { createSession } from '@/db/repos/workoutRepo';
import { fromISO, toISO, todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import { getTodaysWorkout } from '@/services/coach';
import { phoneAfterWorkout } from '@/tracker/phone/phoneSync';
// Packet C (TG-03 / TG-06 / TG-08 / TG-11): Targets loaded with the cards, counting conversion.
import { convertCounting } from '@/tracker/engine/logTypes';
import { loadTargets, preloadTargets, seedTargets, targetQuery } from '@/tracker/store/targetStore';
import { useTrackerPrefs, type PreviousFrom } from '@/tracker/store/trackerPrefsStore';
// Packet E (LW-12 / LW-26 / LW-31): order, supersets and the swap split.
import { dropCard, joinSuperset, moveCard, nextSupersetGroup, swapSplit, tidySupersets } from '@/tracker/services/workoutOrder';
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
  /**
   * Phase 2 (LW-07): when the row was ticked (epoch ms). Finish offers "ended at the last
   * tick" for a workout left open for hours. Absent on older drafts and unticked rows.
   */
  doneAt?: number;
  /**
   * Review fix (#6): when a number in the row was last typed (epoch ms). Finish's suggested end
   * follows the last thing the member did — a tick OR typing — not only the last tick.
   */
  editedAt?: number;
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
  /**
   * 16 Oct 2026 audit (C1-4): editing a saved workout — this row is one of the workout's saved
   * sets (it opens ticked). Unticked by the member, it is left out of the save. Rows added while
   * editing do not carry it: a number typed there is saved as before.
   */
  saved?: true;
}

/** Last time's numbers for one set row, in TYPED form (help positive). */
export interface PrevSet {
  weightKg: number;
  reps: number;
  durationSec?: number | null;
  distanceM?: number | null;
  /**
   * 13 Oct 2026: last time's RPE on a working set (absent = none logged; warm-ups never carry
   * one). PREVIOUS shows it under the numbers when "Track RPE" is on. Never a hint or a fill:
   * `fillForSet` builds its fills afresh, so a tick never copies it.
   */
  rpe?: number;
  /**
   * 16 Oct 2026 audit (C1-3): 'drop' when last time's set was a drop set (absent = a normal or
   * failure set, or a draft saved before). `prevForSet` matches drop rows to last time's drops
   * and every other working row to last time's other sets, so a routine of 3 normal sets never
   * reads last time's drop as its set 2. Never a hint or a fill.
   */
  setType?: 'drop';
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
  /**
   * 13 Oct 2026: last time's warm-ups (typed form), from the SAME workout and card as
   * `previousSets` — the warm-up rows' PREVIOUS, matched by warm-up order. Kept apart so nothing
   * that reads working sets (Targets, records, "vs last time") ever sees them. Optional so drafts
   * saved before still load (absent = none).
   */
  previousWarmups?: PrevSet[];
  /**
   * 13 Oct 2026 (idea 1): the workout PREVIOUS comes from — its day and its name (its title,
   * else its routine's name; null = no name) — for the card's "Last: 3 Oct · Push 1A" line. It
   * is the workout of the "Previous values" scope, as PREVIOUS is. Absent: no previous, or a
   * draft saved before (the line is then left out).
   */
  lastFrom?: { dateISO: string; name: string | null };
  /**
   * 13 Oct 2026 (idea 2): "Same routine" / "Same folder" found nothing for this card, but the
   * exercise was done in another workout — that workout's day and its best working set (typed
   * form, in the card's counting). Information only ("First time in this folder · last
   * anywhere 100 kg × 5, 3 Oct"): never PREVIOUS, a hint, a fill or a Target. Optional (older
   * drafts).
   */
  elsewhere?: { scope: 'routine' | 'folder'; dateISO: string; set: PrevSet };
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
  /**
   * Phase 2 (LW-09): the routine's exercise this card was swapped from ("for this workout
   * only. Your routine stays."). "Update routine?" compares the routine against this one.
   */
  swappedFrom?: { exerciseId: string; name: string; card?: number };
  /**
   * Review fix (#10): this card's number among the workout's cards of the SAME exercise (heavy
   * Bench 0, back-off 1), given when the card is made and never taken from screen order — so
   * moving back-off above heavy keeps each card's history, Target and saved `card_index`.
   * Absent on drafts saved before (their place on screen decides, as before).
   */
  card?: number;
  /**
   * Phase 2 (LW-31): this card continues the card with this key after a swap mid-exercise (the
   * ticked sets stayed there). "Update routine?" counts the two as one routine exercise.
   */
  splitFrom?: string;
  /**
   * Audit Phase 4 (RP-19): the rows' types when the card came from a routine (warm-up, normal,
   * drop, failure). "Update routine?" saves the types only when the member changed them.
   */
  startTypes?: PlanSetType[];
  /** RP-19: the rest the card started with (from the routine or the exercise); see startTypes. */
  startRestSec?: number | null;
  /** RP-19: the note the card started with (the routine's, else the carried one). */
  startNote?: string | null;
}

/** Phase 2: what the Finish sheet decided. */
export interface FinishOptions {
  /** Save rows that hold numbers but were never ticked (default: leave them out). */
  keepUnticked?: boolean;
  /** When the workout ended (default: now). Kept between its start and now. */
  endedAt?: number | null;
  /** The workout's name (blank: none — history then shows its day type). */
  name?: string | null;
}

interface DraftSnapshot {
  startedAt: number;
  dayType: DayType;
  planDayId: string | null;
  /** See `ActiveWorkoutState.routineId`. Absent on older drafts (they saved '' at Finish). */
  routineId?: string | null;
  workoutName?: string | null;
  /** 13 Oct 2026: the "Previous values" choice frozen at the start (absent: older drafts). */
  previousFrom?: PreviousFrom | null;
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
  /** 15 Oct 2026 (pause the workout): absent on older drafts = never paused. See workoutPause.ts. */
  pausedAt?: number | null;
  pausedTotalMs?: number;
  pauses?: PauseSpan[];
  /** The running pause was started by the app itself after an hour with no sets (idlePauseAt). */
  pausedAuto?: boolean;
  /** The last finished auto-pause (the member can still "Count it"). */
  autoSpan?: PauseSpan | null;
  /** C1-2: the end of the last auto-pause the member counted (absent on older drafts). */
  countedUntil?: number | null;
}

/** "Log a past workout": the routine it was (its id, name and day type). */
export interface PastRoutine {
  id: string;
  name: string;
  dayType: DayType;
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
   * The routine this workout counts as when it was NOT started from one (`planDayId` null),
   * saved as its `routine_id` (tracker schema v11): a Repeat copies its source's, a past log the
   * routine picked. `''` = known to have none (an empty workout — never moves "Today"); null =
   * not known (a past log with nothing picked — "Today" places it by its name and exercises).
   * Editing a saved workout: its saved routine, read only for "Previous values" (Save leaves the
   * saved `routine_id` alone).
   */
  routineId: string | null;
  /** The name this workout starts with (a Repeat: its source's; a past log: the routine picked). */
  workoutName: string | null;
  /**
   * 13 Oct 2026 review fix: the "Previous values" choice frozen when this workout started, so
   * PREVIOUS, warm-ups, carried notes and the Target all read ONE scope for the whole workout; a
   * change in Settings applies from the next workout. null = not frozen (no workout, or a draft
   * saved before): the setting as it is now.
   */
  previousFrom: PreviousFrom | null;
  /**
   * Phase 4: this workout is an easy week of the followed plan — half the sets, the same
   * weights; saved marked, so records and the Target leave it out.
   */
  easyWeek: boolean;
  exercises: DraftExercise[];
  /** Most recently swipe-deleted set, for the undo snackbar (not persisted). */
  lastDeleted: { exKey: string; index: number; set: DraftSet } | null;
  /**
   * The last "Copy to sets below", for its Undo bar (not persisted): the card, what each row
   * held before, and what was written. `id` gives every copy a fresh Undo clock.
   */
  lastCopy: { id: number; exKey: string; count: number; before: CopyBefore[]; values: EntryValues } | null;
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
  /**
   * Phase 3 packet C ("Log a past workout"): a NEW workout for a day gone by, typed in the
   * editor (date, start, length, then the exercises) and saved as a manual workout. Like an
   * edit, it is never "a workout in progress": it is not kept across an app restart.
   */
  pastLog: boolean;
  /**
   * 15 Oct 2026 — the workout timer is paused (Hevy's "Pause Workout Timer"): when the running
   * pause began, or null. Live workouts only; kept in the draft, so a restart stays paused.
   */
  pausedAt: number | null;
  /** The finished pauses, added up (ms) — never counted in the workout's duration. */
  pausedTotalMs: number;
  /** The finished pauses themselves (for an "Ended at" earlier than now; workoutPause.ts). */
  pauses: PauseSpan[];
  /** The running pause was started by the app after an hour with no sets (forgotten Finish). */
  pausedAuto: boolean;
  /** The last auto-pause once the member was back: shown with "Count it" until Finish. */
  autoSpan: PauseSpan | null;
  /**
   * 16 Oct 2026 audit (C1-2): the end of the last auto-pause the member counted ("Count it").
   * Counting removes the pause, so the idle check measures from here — else it paused again a
   * minute later from the same old tick and took the counted hour back.
   */
  countedUntil: number | null;

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
  /** LW-15: add several at once, in the order picked. All or none: a failed read adds nothing. */
  addExercises: (list: Exercise[]) => Promise<void>;
  removeExercise: (exKey: string) => void;
  /** LW-12: Move up (-1) / Move down (1). A superset moves as one block (see workoutOrder). */
  moveExercise: (exKey: string, dir: -1 | 1) => void;
  /** 15 Oct 2026: press, hold and drag — the cards in the dropped order (superset rules: workoutOrder.dropCard). */
  reorderExercises: (keys: string[], dragged: string) => void;
  /** LW-26: start a new superset of exactly these two cards. */
  pairSuperset: (exKey: string, otherKey: string) => void;
  addSet: (exKey: string) => void;
  removeSet: (exKey: string, setKey: string) => void;
  updateSet: (
    exKey: string,
    setKey: string,
    patch: Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>>,
  ) => void;
  /**
   * Entry bar: one step of a box (weight ± the exercise's step, reps ± 1, time ± 15 s), from the
   * typed number or — in an empty box — the row's hint `fill`. Returns false when nothing changed.
   */
  stepSetValue: (exKey: string, setKey: string, field: EntryField, dir: 1 | -1, fill: SetFill | null) => boolean;
  /**
   * Entry bar: copy what this row shows (typed, else its hint) into every row below of the same
   * kind that is not ticked. Returns how many rows it filled (0 = none; nothing changes).
   */
  copySetDown: (exKey: string, setKey: string, fill: SetFill | null) => number;
  /** Put the rows of the last copy back as they were (numbers typed since are kept). */
  undoCopy: () => void;
  /**
   * Audit Phase 9 review: "Start records fresh" / "Count all records again" changed what this
   * exercise's records count from — the open workout's record pop-ups read its bests again.
   * A correction or past log has none (it never pops up) and is left alone.
   */
  refreshBests: (exerciseId: string) => Promise<void>;
  /** The copy's Undo bar ran out (only that copy's: `id`). */
  dismissCopy: (id: number) => void;
  toggleWarmup: (exKey: string, setKey: string) => void;
  /**
   * `fill` = what the row is hinting (its Target-aware fill); omitted → computed without a
   * Target. Packet B (LW-13): returns what is missing when a tick had nothing to save (the row
   * stays unticked and says so), else null.
   */
  /** `at` (v0.37.1 review): when the set was really ticked — a tap the phone kept with the app closed. */
  toggleDone: (exKey: string, setKey: string, fill?: SetFill | null, at?: number) => TickMissing | null;
  /** Phase 2 (hold timer): write a measured time into a set and tick it. */
  completeTimedSet: (exKey: string, setKey: string, durationSec: number) => void;
  /** Phase 2: how this exercise's weight counts (dumbbells). Remembered for the exercise. */
  setLoadMode: (exKey: string, mode: LoadMode) => void;
  /**
   * Phase 2 ("try a harder / easier version", Swap): put another exercise in this card's place.
   * LW-31: also after a tick — the ticked sets stay with the exercise they were done on (its
   * card keeps them) and the new exercise gets the open rows on a card right below.
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
  setRestSec: (exKey: string, restSec: number | null) => Promise<boolean>;
  /** Prepend computed warm-up rows (isWarmup) to an exercise. */
  insertWarmupSets: (exKey: string, rows: { weightKg: number; reps: number }[]) => void;
  /** Remove a set but stash it for undo (drives the snackbar). */
  deleteSetWithUndo: (exKey: string, setKey: string) => void;
  undoDelete: () => void;
  dismissUndo: () => void;
  /**
   * Commit to SQLite; returns the new session id, or null if nothing loggable. Phase 2 (the
   * calm Finish): rows never ticked are left out unless `keepUnticked`; `endedAt` is the end
   * the member picked for a workout left open; `name` is the workout's own name.
   */
  finish: (note?: string | null, opts?: FinishOptions) => Promise<string | null>;
  /** Phase W4: load a logged session into the draft to correct it. */
  startEditingSession: (session: SessionDetail) => Promise<void>;
  /** Edit mode: move the workout to another day (clamped to today). */
  setEditDate: (dateISO: string) => void;
  /** Edit mode: change the session's day type. */
  setEditDayType: (dayType: DayType) => void;
  /** Edit mode: change the session's notes. */
  setEditNotes: (notes: string) => void;
  /** Edit mode (Phase 1): set the workout's length in whole minutes (1–600; else ignored). */
  setEditDuration: (minutes: number) => void;
  /**
   * Edit mode / past log (HI-18): set the start time on the workout's day, keeping its length.
   * Returns why it was refused (a time still to come today), or null when set.
   */
  setEditStartTime: (hour: number, minute: number) => string | null;
  /**
   * "Log a past workout": open the editor for a NEW workout on `dateISO` at hour:minute lasting
   * `minutes`. Returns why it was refused (a time still to come), or null when opened.
   */
  startPastWorkout: (o: { dateISO: string; hour: number; minute: number; minutes: number; routine?: PastRoutine | 'none' | null }) => string | null;
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
  /** Pause the workout timer now (a live workout only; already paused: nothing changes). */
  pauseWorkout: () => void;
  /** Resume the workout timer — now, or at `at` (a tick's own moment). Not paused: nothing. */
  resumeWorkout: (at?: number) => void;
  /** The app pauses the timer itself at `at` (an hour with no sets; finishCheck.idlePauseAt). */
  autoPause: (at: number) => void;
  /** "Count it": the last auto-pause counts as workout time after all. */
  countAutoPause: () => void;
}

/**
 * HI-07: correcting the past (an edit, a past log) is never "a workout in progress". Its draft
 * is not written to disk, so an abandoned edit can't come back after a restart as "Resume
 * workout" on Home or hijack Start. PURE.
 */
export function isCorrecting(s: Pick<ActiveWorkoutState, 'editingSessionId' | 'pastLog'>): boolean {
  return s.editingSessionId != null || s.pastLog === true;
}

/**
 * HI-02 / HI-16: for a past workout being edited or logged, the history its new cards may
 * quote — only workouts BEFORE it (its day as it now stands, its start moved with that day).
 * null for a live workout. PURE.
 */
export function correctingBefore(
  s: Pick<ActiveWorkoutState, 'editingSessionId' | 'pastLog' | 'startedAt' | 'editDateISO' | 'editOriginalDateISO'>,
): HistoryBefore | null {
  if (!isCorrecting(s) || s.startedAt == null) return null;
  const original = s.editOriginalDateISO ?? s.editDateISO ?? toISO(new Date(s.startedAt));
  const day = s.editDateISO ?? original;
  return { dateISO: day, startedAt: s.startedAt + dayDeltaMs(original, day), excludeSessionId: s.editingSessionId };
}

/**
 * "Previous values": the routine whose scope this workout's past numbers come from — the one it
 * was started from, else the one it counts as (a Repeat's, a past log's pick, an edited workout's).
 * null = none (an empty workout reads every workout). PURE.
 */
export function historyRoutineOf(s: Pick<ActiveWorkoutState, 'planDayId' | 'routineId'>): string | null {
  return s.planDayId || s.routineId || null;
}

/** The live workout's "Previous values" scope (null = every workout). Never throws. */
function scopeOfWorkout(s: Pick<ActiveWorkoutState, 'planDayId' | 'routineId'> & { previousFrom?: PreviousFrom | null }): Promise<HistoryScope | null> {
  return historyScopeOrAll(historyRoutineOf(s), s.previousFrom ?? undefined);
}

/** The "Previous values" choice a workout starting now freezes (the setting as it is). */
function previousFromNow(): PreviousFrom {
  return useTrackerPrefs.getState().previousFrom;
}

async function persistDraft(s: ActiveWorkoutState): Promise<void> {
  if (!s.active || s.startedAt == null || isCorrecting(s)) {
    await setMeta(DRAFT_KEY, '');
    return;
  }
  const snap: DraftSnapshot = {
    startedAt: s.startedAt,
    dayType: s.dayType,
    planDayId: s.planDayId,
    routineId: s.routineId,
    workoutName: s.workoutName,
    previousFrom: s.previousFrom,
    easyWeek: s.easyWeek,
    exercises: s.exercises,
    editingSessionId: s.editingSessionId,
    dateISO: s.editDateISO,
    notes: s.editNotes,
    endedAt: s.editEndedAt,
    originalDateISO: s.editOriginalDateISO,
    pausedAt: s.pausedAt,
    pausedTotalMs: s.pausedTotalMs,
    pauses: s.pauses,
    pausedAuto: s.pausedAt != null && s.pausedAuto,
    autoSpan: s.autoSpan,
    countedUntil: s.countedUntil,
  };
  await setMeta(DRAFT_KEY, JSON.stringify(snap));
}

// ---------------------------------------------------------------- draft autosave (DS-09, LW-01, LW-08)
//
// Typing saves the draft 300 ms after the LAST keystroke (one write, not one per key); a tick,
// a start, Finish and the app going to the background save at once. Every draft write runs in
// the ONE app-wide write queue, so it can never land inside another transaction (DS-04).
//
// LW-08: Finish clears the draft inside its own queued job and bumps `draftGen`. A draft write
// that was asked for while Finish was running reaches the queue AFTER it, sees the generation
// changed and does nothing, so a tick during the save can't resurrect a ghost workout.
//
// A failed write raises the app-wide SaveProblemBanner and retries by itself (2 s, 4 s ... 30 s);
// the next successful write clears the banner.

export const DRAFT_SAVE_DEBOUNCE_MS = 300;
let draftGen = 0;
/** Each "Copy to sets below" gets its own number (its Undo bar's clock follows it). */
let copySeq = 0;
let draftDirty = false;
let draftTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let readState: (() => ActiveWorkoutState) | null = null;

function cancelDraftTimers(): void {
  if (draftTimer) clearTimeout(draftTimer);
  if (retryTimer) clearTimeout(retryTimer);
  draftTimer = null;
  retryTimer = null;
}

/** Save the draft ~300 ms after the last change (typing). */
function scheduleDraftSave(): void {
  draftDirty = true;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = null;
    void flushDraft();
  }, DRAFT_SAVE_DEBOUNCE_MS);
}

/**
 * Write any pending draft change NOW (a tick, a start, the app going to the background).
 * Never rejects: a failure shows the banner and retries by itself.
 */
export function flushDraft(): Promise<void> {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = null;
  if (!draftDirty || !readState) return Promise.resolve();
  draftDirty = false;
  const gen = draftGen;
  const read = readState;
  return enqueueWrite(async () => {
    // The workout ended (Finish / Save / Discard) after this write was asked for: that job
    // already cleared the draft. Writing now would bring back a ghost (LW-08).
    if (gen !== draftGen) return;
    await persistDraft(read());
  }).then(
    () => clearSaveProblem(),
    (e: unknown) => {
      // Still unsaved: keep it dirty and try again shortly (newer changes ride along).
      if (gen === draftGen) draftDirty = true;
      const failures = reportSaveProblem(e);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushDraft();
      }, retryDelayMs(failures));
    },
  );
}

/** Inside a queued job that ends the workout: later draft writes must not bring it back. */
function endDraftInJob(): void {
  draftGen += 1;
  draftDirty = false;
  cancelDraftTimers();
}

// The app going to the background must not lose the last 300 ms of typing.
try {
  AppState.addEventListener('change', (next) => {
    if (next !== 'active') void flushDraft();
  });
} catch {
  // No AppState (unit tests): nothing to listen to.
}

/** A stored history set in the form the set row shows and types (help positive). PURE. */
export function toPrevSet(
  s: Pick<TrackedSetEntry, 'weightKg' | 'reps' | 'durationSec' | 'distanceM' | 'loadMode'> & {
    rpe?: number | null;
    isWarmup?: boolean;
    setType?: 'drop' | 'failure' | 'normal' | null;
  },
  logType: LogType,
  /** TG-03: the card's counting — a set logged "as typed" reads as each dumbbell, and back. */
  mode?: LoadMode,
): PrevSet {
  const kg = mode ? convertCounting(s.weightKg, s.loadMode, mode) : s.weightKg;
  const p: PrevSet = { weightKg: typedWeight(logType, kg), reps: s.reps };
  if (s.durationSec != null) p.durationSec = s.durationSec;
  if (s.distanceM != null) p.distanceM = s.distanceM;
  // 13 Oct 2026: last time's RPE rides along for PREVIOUS (working sets only).
  if (s.rpe != null && Number.isFinite(s.rpe) && !s.isWarmup) p.rpe = s.rpe;
  // C1-3: a drop set stays a drop set, so PREVIOUS matches drops to drops.
  if (s.setType === 'drop' && !s.isWarmup) p.setType = 'drop';
  return p;
}

/**
 * LW-05 / LW-28: the sets of the `card`-th card of one exercise in a saved workout (sets keep
 * their card since tracker schema v10; older sets read as the first card). PURE.
 */
export function setsOfCard<S extends { cardIndex?: number | null }>(sets: readonly S[], card: number): S[] {
  return sets.filter((s) => (s.cardIndex ?? 0) === card);
}

/** Each card's place among the cards of the same exercise, in order (0, 0, 1 for A, B, A). PURE. */
export function cardOccurrences(exerciseIds: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return exerciseIds.map((id) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n;
  });
}

/** Sessions a later card reads back through to find its own last sets (#11). */
const CARD_LOOKBACK = 12;

/**
 * PREVIOUS for the `card`-th card of a lift: its own sets from the newest workout that had that
 * card. Review fix (#11): a later card (1, 2…) that never had sets of its own — every set saved
 * before cards were numbered reads as card 0 — falls back to the first card of the newest
 * workout, instead of an empty "first time". `hist` is newest first. PURE.
 */
export function lastSetsOfCard<S extends { cardIndex?: number | null }>(
  hist: readonly { sets: readonly S[] }[],
  card: number,
): S[] {
  if (card <= 0) return setsOfCard(hist[0]?.sets ?? [], 0);
  for (const h of hist) {
    const own = setsOfCard(h.sets, card);
    if (own.length > 0) return own;
  }
  return setsOfCard(hist[0]?.sets ?? [], 0);
}

/**
 * Where `lastSetsOfCard(hist, card)` takes its sets from: that workout and card (null = no
 * history). The warm-ups' PREVIOUS reads this same workout and card. PURE.
 */
export function lastCardSource<S extends { cardIndex?: number | null }>(
  hist: readonly { sessionId: string; sets: readonly S[] }[],
  card: number,
): { sessionId: string; card: number } | null {
  if (card > 0) {
    for (const h of hist) {
      if (setsOfCard(h.sets, card).length > 0) return { sessionId: h.sessionId, card };
    }
  }
  return hist[0] ? { sessionId: hist[0].sessionId, card: 0 } : null;
}

/**
 * Last time's warm-ups for a card: the warm-ups of `source`'s card, from `getWarmupSets`
 * (`[]`: no history; undefined: that workout was not read). PURE.
 */
export function warmupsOfSource<S extends { cardIndex?: number | null }>(
  warm: ReadonlyMap<string, ReadonlyMap<string, readonly S[]>>,
  exerciseId: string,
  source: { sessionId: string; card: number } | null,
): S[] | undefined {
  if (!source) return [];
  const all = warm.get(source.sessionId)?.get(exerciseId);
  return all ? setsOfCard(all, source.card) : undefined;
}

/** `getWarmupSets` that never throws: a failed read is none (warm-up rows then show no PREVIOUS). */
async function readWarmups(pairs: readonly { sessionId: string; exerciseId: string }[]): Promise<WarmupsBySession> {
  if (pairs.length === 0) return new Map();
  try {
    return await getWarmupSets(pairs);
  } catch {
    return new Map();
  }
}

/**
 * #10: the number a NEW card of `exerciseId` gets: the lowest one no other card of that exercise
 * holds (0 when it is the only one, 1 for a second Bench…). Cards without a number (an older
 * draft) hold their place-on-screen number. PURE.
 */
export function nextCardNumber(list: readonly Pick<DraftExercise, 'exerciseId' | 'card'>[], exerciseId: string): number {
  const used = new Set<number>();
  let place = 0;
  for (const e of list) {
    if (e.exerciseId !== exerciseId) continue;
    used.add(e.card ?? place);
    place += 1;
  }
  let n = 0;
  while (used.has(n)) n += 1;
  return n;
}

/**
 * Audit Phase 8: what every card of a new workout reads, fetched for ALL cards at once — one
 * statement per kind (last time, rest, carried note, record bests, how it is logged) instead
 * of five or more per card (a 7-card routine made ~35 reads and checked the records' version
 * seven times). Same values as the per-card reads.
 */
interface CardFacts {
  hist: Map<string, ExerciseHistoryEntry[]>;
  rest: Map<string, number | null>;
  notes: Map<string, string | null>;
  bests: Map<string, PriorBests | null>;
  infos: Map<string, TrackerExercise>;
  /** Last time's warm-ups (`getWarmupSets`) of each card's workout; empty when they could not be read. */
  warm: WarmupsBySession;
  /** The name of each card's PREVIOUS workout (`getWorkoutSourceNames`); empty when it could not be read. */
  names: Map<string, string | null>;
  /**
   * Idea 2: for exercises with nothing in the "Previous values" scope, the last workout ANYWHERE
   * (no scope, limit 1, easy weeks skipped). Empty under "Any workout" or when it could not be read.
   */
  elsewhere: Map<string, ExerciseHistoryEntry[]>;
}

/** `getWorkoutSourceNames` that never throws: a failed read is no names (the line shows the day alone). */
async function readSourceNames(ids: readonly string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  try {
    return await getWorkoutSourceNames(ids);
  } catch {
    return new Map();
  }
}

/**
 * Idea 2: the last workout anywhere for exercises with no history in `scope` — read only under
 * "Same routine" / "Same folder", only for those exercises. Never throws (a failed read is none).
 */
async function readElsewhere(
  exerciseIds: readonly string[],
  scope: HistoryScope | null,
  before: HistoryBefore | null,
): Promise<Map<string, ExerciseHistoryEntry[]>> {
  if (!scope?.kind || exerciseIds.length === 0) return new Map();
  try {
    return await getBoundedExerciseHistories(exerciseIds, 1, { skipEasy: true, before: before ?? undefined });
  } catch {
    return new Map();
  }
}

/**
 * Idea 2: the card's "first time in this routine / folder" facts from the last workout anywhere
 * (`elsewhere`, newest first): its day and its best working set, typed and in the card's
 * counting. undefined when there is nothing to say (no scope kind, no workout). PURE.
 */
export function elsewhereOf(
  scope: HistoryScope | null,
  elsewhere: readonly ExerciseHistoryEntry[] | undefined,
  logType: LogType,
  mode: LoadMode,
): DraftExercise['elsewhere'] {
  const last = elsewhere?.[0];
  if (!scope?.kind || !last) return undefined;
  const best = bestSetOf(
    last.sets.map((s) => toPrevSet(s, logType, mode)),
    logType,
  );
  return best ? { scope: scope.kind, dateISO: last.dateISO, set: best } : undefined;
}

/**
 * The facts for these cards; null when last time cannot be read in one go (each card then
 * reads its own, as before). The extras never block a start: a failed read is "none".
 * `scope` ("Previous values"): last time and the carried note come from those workouts only.
 */
async function prefetchCardFacts(
  cards: readonly { exerciseId: string; card: number }[],
  before: HistoryBefore | null = null,
  scope: HistoryScope | null = null,
): Promise<CardFacts | null> {
  if (cards.length === 0) return null;
  const ids = [...new Set(cards.map((c) => c.exerciseId))];
  // A later card (back-off) may need to look past last time for its own sets (#11).
  const deep = new Set(cards.filter((c) => c.card > 0).map((c) => c.exerciseId));
  const shallow = ids.filter((id) => !deep.has(id));
  const opts = { skipEasy: true, before: before ?? undefined, scope };
  const none = <V,>(): Map<string, V> => new Map<string, V>();
  try {
    const [h1, h12, rest, notes, bests, infos] = await Promise.all([
      shallow.length > 0 ? getBoundedExerciseHistories(shallow, 1, opts) : Promise.resolve(none<ExerciseHistoryEntry[]>()),
      deep.size > 0 ? getBoundedExerciseHistories([...deep], CARD_LOOKBACK, opts) : Promise.resolve(none<ExerciseHistoryEntry[]>()),
      getExerciseRestSecs(ids).catch(() => none<number | null>()),
      before ? Promise.resolve(none<string | null>()) : getCarriedNotes(ids, { scope }).catch(() => none<string | null>()),
      before ? Promise.resolve(none<PriorBests | null>()) : getPriorBestsMany(ids).catch(() => none<PriorBests | null>()),
      getTrackerExercisesByIds(ids).catch(() => none<TrackerExercise>()),
    ]);
    const hist = new Map([...h1, ...h12]);
    // Warm-ups on PREVIOUS: one more read for every card, from the workout each card's PREVIOUS
    // comes from. A failed read never blocks a start (the warm-up rows then show no PREVIOUS).
    const sources = cards.flatMap((c) => {
      const src = lastCardSource(hist.get(c.exerciseId) ?? [], c.card);
      return src ? [{ sessionId: src.sessionId, exerciseId: c.exerciseId }] : [];
    });
    // The "Last: 3 Oct · Push 1A" line names each card's PREVIOUS workout; idea 2 reads the last
    // workout anywhere for exercises the scope found nothing for. Beside the warm-ups, never
    // blocking a start.
    const empty = ids.filter((id) => (hist.get(id) ?? []).length === 0);
    const [warm, names, elsewhere] = await Promise.all([
      readWarmups(sources),
      readSourceNames(sources.map((x) => x.sessionId)),
      readElsewhere(empty, scope, before),
    ]);
    return { hist, rest, notes, bests, infos, warm, names, elsewhere };
  } catch {
    return null;
  }
}

async function buildDraftExercise(
  ex: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'equipment' | 'incrementKg'>,
  targetSets: number,
  /**
   * `card`: this card's place among the workout's cards of the SAME exercise (0 = first).
   * `routine`: the card comes from a routine — its sets as saved (RP-19), its rest and note.
   * `facts`: every card's reads made at once (`prefetchCardFacts`); absent = this card reads its own.
   * `scope`: the workout's "Previous values" scope (absent / null = every workout).
   */
  opts: {
    exactSets?: boolean;
    card?: number;
    before?: HistoryBefore | null;
    routine?: RoutineExerciseExtras | null;
    facts?: CardFacts | null;
    scope?: HistoryScope | null;
  } = {},
): Promise<DraftExercise> {
  // Bounded in SQL: start-from-plan builds one draft per plan exercise, and the frozen
  // read would materialise each lift's ENTIRE working-set history just to keep its last
  // session. Parity-identical (newest-first, working sets only). Phase 4: PREVIOUS is the
  // last NORMAL workout — an easy week's lighter, shorter sets are not what to beat.
  const card = opts.card ?? 0;
  // HI-02: a card added to a PAST workout (edit or past log) reads only workouts before it —
  // never a later one's numbers, which a tick would write into the past — and carries no
  // note or live-record bests from today.
  const before = opts.before ?? undefined;
  const facts = opts.facts;
  const scope = opts.scope ?? null;
  const [hist, restSec, note, bests, info] = facts
    ? [
        facts.hist.get(ex.id) ?? [],
        facts.rest.get(ex.id) ?? null,
        before ? null : facts.notes.get(ex.id) ?? null,
        before ? null : facts.bests.get(ex.id) ?? null,
        facts.infos.get(ex.id) ?? null,
      ]
    : await Promise.all([
    // A later card (back-off) may need to look past last time for its own sets (#11).
    getBoundedExerciseHistory(ex.id, card > 0 ? CARD_LOOKBACK : 1, { skipEasy: true, before, scope }),
    // Phase 1 extras never block starting a workout: a failed read just means
    // default rest, no carried note, no live record alert.
    getExerciseRestSec(ex.id).catch(() => null),
    before ? Promise.resolve(null) : getCarriedNote(ex.id, { scope }).catch(() => null),
    before ? Promise.resolve(null) : getPriorBests(ex.id).catch(() => null),
    // Phase 2: how it is logged. A failed read logs it as weight × reps, as before.
    getTrackerExercise(ex.id).catch(() => null),
  ]);
  const logType: LogType = info?.logType ?? 'weight_reps';
  // TG-03: last time read in today's counting (a set with no counting of its own was logged
  // under the exercise's saved one, which is today's).
  const mode: LoadMode = info?.loadMode ?? 'one';
  // LW-05: heavy + back-off cards of one lift each read their OWN card of last time.
  const lastSets = lastSetsOfCard(hist, card);
  const previousSets = lastSets.map((s) => toPrevSet(s, logType, mode));
  // Warm-ups on PREVIOUS (13 Oct 2026): last time's warm-ups of the same workout and card, in
  // the same counting. Read with every card's (facts), else on their own; a failed read is none.
  const source = lastCardSource(hist, card);
  let lastWarm = facts ? warmupsOfSource(facts.warm, ex.id, source) : undefined;
  if (lastWarm === undefined) {
    const warm = source ? await readWarmups([{ sessionId: source.sessionId, exerciseId: ex.id }]) : new Map();
    lastWarm = warmupsOfSource(warm, ex.id, source) ?? [];
  }
  const previousWarmups = lastWarm.map((s) => toPrevSet(s, logType, mode));
  // 13 Oct 2026 (idea 1): where PREVIOUS comes from — that workout's day and name.
  let lastFrom: DraftExercise['lastFrom'];
  if (source && previousSets.length > 0) {
    const dateISO = hist.find((h) => h.sessionId === source.sessionId)?.dateISO;
    const names = facts ? facts.names : await readSourceNames([source.sessionId]);
    if (dateISO) lastFrom = { dateISO, name: names.get(source.sessionId) ?? null };
  }
  // Idea 2: nothing in this routine / folder — say when it was last done anywhere (info only).
  let elsewhere: DraftExercise['elsewhere'];
  if (hist.length === 0 && scope?.kind) {
    const other = facts ? facts.elsewhere.get(ex.id) : (await readElsewhere([ex.id], scope, opts.before ?? null)).get(ex.id);
    elsewhere = elsewhereOf(scope, other, logType, mode);
  }
  // An easy week asks for exactly half the sets, even when last time had more rows.
  // TG-08: last time's drop sets come back AS drop sets, in their place (their PREVIOUS is the
  // drop), and only normal sets count toward the routine's set count.
  const lastTypes: ('normal' | 'drop')[] = opts.exactSets ? [] : lastSets.map((s) => (s.setType === 'drop' ? 'drop' : 'normal'));
  const routine = opts.routine ?? null;
  const planned = routine?.sets && routine.sets.length > 0 ? routine.sets : null;
  let rowTypes: PlanSetType[];
  if (opts.exactSets) {
    // An easy week: exactly half the working sets (plain), after the routine's warm-ups.
    const warm = (planned ?? []).filter((x) => x.type === 'warmup').map(() => 'warmup' as const);
    rowTypes = [...warm, ...Array.from({ length: Math.max(1, targetSets) }, () => 'normal' as const)];
  } else if (planned) {
    // RP-19: the routine's sets exactly as saved — warm-ups as warm-ups, drops as drops.
    rowTypes = typesOf(planned);
  } else if (routine) {
    // RP-21: from a routine the ROUTINE decides how many sets (lowering it is respected even
    // when last time had more); last time's drop sets still come back after their set (TG-08).
    rowTypes = [];
    let normals = 0;
    for (const t of lastTypes) {
      if (t === 'drop') {
        if (normals > 0 && normals <= targetSets) rowTypes.push('drop');
      } else if (++normals <= targetSets) rowTypes.push('normal');
    }
    for (let i = Math.min(normals, targetSets); i < targetSets; i++) rowTypes.push('normal');
  } else {
    // Added mid-workout or repeating a workout: as many rows as last time, at least the target.
    const normalLast = lastTypes.filter((t) => t !== 'drop').length;
    const extra = Math.max(0, targetSets - normalLast);
    rowTypes = [...lastTypes, ...Array.from({ length: extra }, () => 'normal' as const)];
  }
  if (!rowTypes.some((t) => t !== 'warmup')) rowTypes.push('normal');
  const sets: DraftSet[] = rowTypes.map((t) => ({
    key: uuid(),
    weightKg: null,
    reps: null,
    isWarmup: t === 'warmup',
    done: false,
    ...(t === 'drop' ? { setType: 'drop' as const } : t === 'failure' ? { setType: 'failure' as const } : {}),
  }));
  // The routine's own rest and note win over the exercise's (RP-19).
  const cardRest = routine?.restSec != null ? routine.restSec : restSec;
  const cardNote = routine?.note?.trim() ? routine.note.trim() : note;
  return {
    key: uuid(),
    exerciseId: ex.id,
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    equipment: ex.equipment,
    incrementKg: ex.incrementKg,
    previousSets,
    previousWarmups,
    ...(lastFrom ? { lastFrom } : {}),
    ...(elsewhere ? { elsewhere } : {}),
    sets,
    restSec: cardRest,
    bests,
    // #3: drop rows are not routine sets ("Update routine?" never counts them); nor warm-ups.
    startRows: rowTypes.filter((t) => t === 'normal' || t === 'failure').length,
    ...(routine
      ? {
          startTypes: rowTypes,
          startRestSec: cardRest ?? null,
          startNote: cardNote ?? null,
          ...(routine.supersetGroup != null ? { supersetGroup: routine.supersetGroup } : {}),
        }
      : {}),
    card,
    logType,
    loadMode: info?.loadMode ?? 'one',
    distUnit: info?.distUnit ?? 'km',
    catalogKey: info?.catalogKey ?? null,
    mediaUri: info?.mediaUri ?? null,
    mediaType: info?.mediaType ?? null,
    ...(info?.muscles.primary[0] ? { muscleLabel: MUSCLE_LABEL[info.muscles.primary[0]] } : {}),
    // Notes carry forward from the last workout with this exercise (Hevy-style); a routine's
    // own note comes first.
    ...(cardNote ? { note: cardNote } : {}),
  };
}

/**
 * TG-11: a routine's cards and their Targets, built TOGETHER (the Target reads run beside the
 * draft build) and stored before the workout opens, so the first frame shows each card's
 * Target and its hints. A failed Target read never blocks the start (the screen retries).
 */
async function cardsWithTargets(
  planDayId: string,
  rows: readonly ({ exerciseId: string; targetSets: number; exercise: Exercise } & RoutineExerciseExtras)[],
  easy: boolean,
): Promise<DraftExercise[]> {
  const effort = useTrackerPrefs.getState().advancedSets;
  // "Previous values": PREVIOUS, notes and Targets all read this routine's scope.
  const previousFrom = useTrackerPrefs.getState().previousFrom;
  const scope = await historyScopeOrAll(planDayId, previousFrom);
  // LW-05: the same lift twice (heavy, then back-off) — each card reads its own card of last time.
  const cards = cardOccurrences(rows.map((pe) => pe.exerciseId));
  const [exercises, early] = await Promise.all([
    prefetchCardFacts(rows.map((pe, i) => ({ exerciseId: pe.exerciseId, card: cards[i] })), null, scope).then((facts) =>
      Promise.all(
        rows.map((pe, i) =>
          buildDraftExercise(pe.exercise, easy ? easySets(pe.targetSets) : pe.targetSets, {
            exactSets: easy,
            card: cards[i],
            routine: { sets: pe.sets ?? null, restSec: pe.restSec ?? null, note: pe.note ?? null, supersetGroup: pe.supersetGroup ?? null },
            facts,
            scope,
          }),
        ),
      ),
    ),
    preloadTargets(
      planDayId,
      rows.map((pe) => pe.exerciseId),
      { easy, effort, previousFrom },
    ),
  ]);
  try {
    seedTargets(targetQuery(planDayId, exercises, { easy, effort, previousFrom }), early);
  } catch {
    // The screen loads them itself.
  }
  // RP-19: the routine's supersets, numbered 1, 2… (a lone member is not a superset).
  return tidySupersets(exercises);
}

/** How long a restore waits for the Targets before showing the workout anyway. */
export const RESTORE_TARGETS_WAIT_MS = 3000;

/**
 * TG-11, the reopen path: a draft restored after the app was closed computes its cards'
 * Targets BEFORE it opens, so the first hints are the Target's, never last time's. A slow or
 * failed read never keeps the workout shut (the screen loads them itself after the wait).
 */
async function targetsBeforeHints(planDayId: string, exercises: DraftExercise[], easy: boolean, previousFrom?: PreviousFrom | null): Promise<void> {
  try {
    const effort = useTrackerPrefs.getState().advancedSets;
    let timer: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([
      loadTargets(targetQuery(planDayId, exercises, { easy, effort, previousFrom: previousFrom ?? undefined })),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, RESTORE_TARGETS_WAIT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
  } catch {
    // No Targets yet: the screen loads them.
  }
}

/**
 * PREVIOUS entry for a set, matched by WORKING-set ordinal. `previousSets` holds
 * last session's working sets only (the history read excludes warm-ups), so
 * warm-up rows never shift the mapping of the working rows. 13 Oct 2026: a warm-up row
 * reads last time's warm-ups instead (`previousWarmups`, same workout and card), matched by
 * warm-up order: the 1st W row ↔ last time's 1st warm-up.
 */
export function prevForSet(ex: DraftExercise, setKey: string): PrevSet | null {
  const row = ex.sets.find((s) => s.key === setKey);
  if (!row) return null;
  if (row.isWarmup) {
    let warm = 0;
    for (const s of ex.sets) {
      if (s.key === setKey) break;
      if (s.isWarmup) warm += 1;
    }
    return ex.previousWarmups?.[warm] ?? null;
  }
  // 16 Oct 2026 audit (C1-3): a drop row reads last time's drops in order, every other working
  // row last time's other sets in order — "set 2" is last time's set 2 even when last time had
  // a drop set after set 1 that today's routine does not.
  const drop = row.setType === 'drop';
  let n = 0;
  for (const s of ex.sets) {
    if (s.key === setKey) break;
    if (!s.isWarmup && (s.setType === 'drop') === drop) n += 1;
  }
  let seen = 0;
  for (const p of ex.previousSets) {
    if ((p.setType === 'drop') !== drop) continue;
    if (seen === n) return p;
    seen += 1;
  }
  return null;
}

/** A number worth hinting: a weight of any size (0 = bodyweight), reps / time / distance above 0. */
const positive = (v: number | null | undefined): number | null => (v != null && v > 0 ? v : null);
const present = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

/**
 * Phase 2 (LW-04, LW-19, LW-22, TG-09) — ONE rule for the grey hint of a set row, and so for
 * what a tick on an empty box saves (the row passes this exact fill to the tick):
 *   1. the number typed or ticked in a working set ABOVE in this card (this workout);
 *   2. else the card's Target (its weight and rep goal; a hold on a timed move);
 *   3. else last time's same set (PREVIOUS);
 *   4. else, for an extra set beyond last time's count, last time's numbers of the nearest
 *      set above (an extra set is one tap, as in Hevy).
 * Each number follows the rule on its own: a weight typed above with no reps takes the
 * Target's rep goal. A warm-up row follows rule 3 only, with last time's same warm-up
 * (`prevForSet`): no warm-up last time, no hint. A drop row hints its own last-time drop first
 * and never the Target. A reps-only move never hints a weight (LW-19). A weight × reps row
 * with no weight to hint gets no hint at all — a tick then asks for the weight (TG-07).
 * Only hints: nothing is written into the row until it is ticked.
 *
 * Oct 2026 (owner, per-set goals): with a Target, a working row's REPS are its own goal — the
 * Target's goal for its working-set number (`setReps`: 11, 9, 8) — but never more than the reps
 * done in the nearest working row above at the same weight, so a hint never asks for more than
 * was just done at that weight. The weight still follows rule 1 (a weight typed above carries
 * down).
 *
 * Review fix (Oct 2026): when the Target moves the working weight (`warm`), a warm-up row's
 * last-time weight scales by the same ratio (40 kg for 60 -> 42.5 kg for 65), rounded down to a
 * weight that can be loaded, never under the empty bar, never above the new working weight; its
 * reps stay last time's. The same working weight = last time's warm-ups as they were.
 */
export function fillForSet(
  ex: DraftExercise,
  setKey: string,
  /** The card's Target fill (`targetFill`), or null off-plan / before it is known. */
  target?: (SetFill & { setReps?: readonly number[]; warm?: WarmScale }) | null,
): SetFill | null {
  const lt: LogType = ex.logType ?? 'weight_reps';
  const idx = ex.sets.findIndex((s) => s.key === setKey);
  if (idx < 0) return null;
  const row = ex.sets[idx];
  // 13 Oct 2026: a warm-up row hints last time's same warm-up (its PREVIOUS) and nothing else —
  // never a working set's numbers, a row above, or the Target.
  const warmup = row.isWarmup;
  const drop = !warmup && row.setType === 'drop';
  const own = prevForSet(ex, setKey);
  // Working rows above, nearest first. A normal row never copies a drop row's lighter numbers.
  const above = warmup
    ? []
    : ex.sets
        .slice(0, idx)
        .reverse()
        .filter((s) => !s.isWarmup && (drop || s.setType !== 'drop'));
  const tgt = drop || warmup ? null : target ?? null;
  const pick = (
    typedOf: (s: DraftSet) => number | null,
    prevOf: (p: PrevSet | null | undefined) => number | null,
  ): number | null => {
    let typed: number | null = null;
    for (const s of above) {
      typed = typedOf(s);
      if (typed != null) break;
    }
    let abovePrev: number | null = null;
    for (const s of above) {
      abovePrev = prevOf(prevForSet(ex, s.key));
      if (abovePrev != null) break;
    }
    return drop ? prevOf(own) ?? typed ?? abovePrev : typed ?? prevOf(tgt) ?? prevOf(own) ?? abovePrev;
  };

  if (lt === 'time' || lt === 'distance' || lt === 'time_distance') {
    const durationSec = lt === 'distance' ? null : pick((s) => positive(s.durationSec), (p) => positive(p?.durationSec));
    const distanceM = lt === 'time' ? null : pick((s) => positive(s.distanceM), (p) => positive(p?.distanceM));
    if (durationSec == null && distanceM == null) return null;
    const out: SetFill = { weightKg: 0, reps: 0 };
    if (durationSec != null) out.durationSec = durationSec;
    if (distanceM != null) out.distanceM = distanceM;
    return out;
  }
  let weightKg = lt === 'reps' ? 0 : pick((s) => present(s.weightKg), (p) => present(p?.weightKg));
  // Review fix: a warm-up follows a moved working weight (last time's warm-up x new / last).
  if (warmup && lt === 'weight_reps' && weightKg != null && weightKg > 0 && target?.warm && target.weightKg > 0) {
    weightKg = warmupWeightKg(weightKg, target.weightKg, target.warm);
  }
  // The row's own goal: the Target's goal for its working-set number (warm-ups and drops not counted).
  let goal: number | null = null;
  if (tgt) {
    const n = ex.sets.slice(0, idx).filter((s) => !s.isWarmup && s.setType !== 'drop').length;
    const list = tgt.setReps;
    goal = positive(list && list.length > 0 ? list[Math.min(n, list.length - 1)] : tgt.reps);
  }
  let reps: number | null;
  if (goal != null) {
    // Never more than the nearest working row above at the same weight just did.
    const done = above.find(
      (s) => positive(s.reps) != null && (lt === 'reps' || (weightKg != null && s.weightKg != null && Math.abs(s.weightKg - weightKg) < 1e-6)),
    );
    reps = done?.reps != null ? Math.min(goal, done.reps) : goal;
  } else {
    reps = pick((s) => positive(s.reps), (p) => positive(p?.reps));
  }
  if (reps == null) return null;
  if (lt === 'reps') return { weightKg: 0, reps };
  if (weightKg == null) return lt === 'weight_reps' ? null : { weightKg: 0, reps };
  return { weightKg, reps };
}

/**
 * LW-25: a new warm-up ramp REPLACES the warm-up rows not yet ticked (asking twice never gives
 * two ramps). Ticked warm-ups stay — they happened — and the new ramp goes after them, before
 * the first working set. PURE.
 */
export function withWarmups(
  sets: readonly DraftSet[],
  rows: readonly { weightKg: number; reps: number }[],
  makeKey: () => string,
): DraftSet[] {
  const warm: DraftSet[] = rows.map((r) => ({ key: makeKey(), weightKg: r.weightKg, reps: r.reps, isWarmup: true, done: false }));
  const kept = sets.filter((s) => !s.isWarmup || s.done);
  const firstWorking = kept.findIndex((s) => !s.isWarmup);
  const at = firstWorking < 0 ? kept.length : firstWorking;
  return [...kept.slice(0, at), ...warm, ...kept.slice(at)];
}

/** The saved "Count it" span, only when it is still one of the workout's pauses. PURE. */
function autoSpanFromDraft(raw: unknown, pauses: readonly PauseSpan[] | undefined): PauseSpan | null {
  const s = raw as { from?: unknown; to?: unknown } | null | undefined;
  if (!s || typeof s.from !== 'number' || typeof s.to !== 'number') return null;
  return (pauses ?? []).some((p) => p.from === s.from && p.to === s.to) ? { from: s.from, to: s.to } : null;
}

/** A pause as the store keeps it (the finished pauses always an array). PURE. */
function withSpans(p: { pausedAt: number | null; pausedTotalMs: number; pauses?: readonly PauseSpan[] }): {
  pausedAt: number | null;
  pausedTotalMs: number;
  pauses: PauseSpan[];
} {
  return { pausedAt: p.pausedAt, pausedTotalMs: p.pausedTotalMs, pauses: [...(p.pauses ?? [])] };
}

/**
 * v0.28.1 — a live workout's start never falls on a whole second. Imported workouts do (their
 * clock time is kept as UTC), and Health Connect tells the two apart that way (`realStart`): a
 * live start at exactly .000 was sent hours off, about 1 time in 1,000.
 */
export function liveStart(now: number = Date.now()): number {
  return now % 1000 === 0 ? now + 1 : now;
}

export const useActiveWorkout = create<ActiveWorkoutState>()((set, get) => {
  readState = get;
  /** Persist the draft soon (typing), or now (a tick, a start). */
  const persistSoon = (): void => scheduleDraftSave();
  const persistNow = (): void => {
    draftDirty = true;
    void flushDraft();
  };
  /** Apply an exercise-list transform, then persist (after the typing pause, or `now`). */
  const mutate = (fn: (exercises: DraftExercise[]) => DraftExercise[], now = false): void => {
    set((s) => ({ exercises: fn(s.exercises) }));
    if (now) persistNow();
    else persistSoon();
  };

  /**
   * "Log a past workout" Save: a NEW manual workout on the day and time picked, its length
   * kept (computeEditedTiming, as an edit), every row with numbers saved (nothing was trained
   * live, so nothing waits for a tick). Records for later workouts are worked out again: a
   * workout slotted into the past can change which later lifts were records.
   */
  const savePastWorkout = async (s: ActiveWorkoutState, flat: ReturnType<typeof draftToRichSets>): Promise<string | null> => {
    const startedAt = s.startedAt as number;
    const day = s.editDateISO ?? toISO(new Date(startedAt));
    const timing = computeEditedTiming({
      originalDateISO: s.editOriginalDateISO ?? day,
      dateISO: day,
      startedAt,
      endedAt: s.editEndedAt,
      now: Date.now(),
    });
    set({ committing: true });
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = null;
    try {
      const id = await enqueueWrite(async () => {
        let made = '';
        await getDb().withTransactionAsync(async () => {
          const session = await createSession({
            dateISO: timing.dateISO,
            dayType: s.dayType,
            notes: s.editNotes?.trim() ? s.editNotes.trim() : null,
            source: 'manual',
            startedAt: timing.startedAt,
            endedAt: timing.endedAt,
          });
          made = session.id;
          // The routine picked (tracker schema v11) — it moves "Today" like any workout of that
          // routine; "None" = '' (never moves it); nothing picked = NULL (placed by its exercises).
          await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [
            s.routineId,
            s.workoutName?.trim() ? s.workoutName.trim().slice(0, 60) : null,
            session.id,
          ]);
          await addSetsWithMeta(session.id, flat);
          await setMeta(DRAFT_KEY, '');
        });
        endDraftInJob();
        return made;
      });
      let reconciled = true;
      try {
        await enqueueWrite(() => reconcilePrsForExercises([...new Set(flat.filter((f) => !f.isWarmup).map((f) => f.exerciseId))]));
      } catch {
        reconciled = false;
      }
      set({
        active: false,
        committing: false,
        hydrated: true,
        startedAt: null,
        dayType: 'full',
        planDayId: null,
        routineId: '',
        workoutName: null,
        previousFrom: null,
        easyWeek: false,
        exercises: [],
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
        pastLog: false,
        ...NO_PAUSE,
        lastSaveReconciled: reconciled,
      });
      clearAllSaveProblems();
      void phoneAfterWorkout(id);
      return id;
    } catch (e) {
      set({ committing: false });
      reportActionProblem('save', e);
      throw e;
    }
  };

  return {
    hydrated: false,
    active: false,
    committing: false,
    startedAt: null,
    dayType: 'full',
    planDayId: null,
    routineId: '',
    workoutName: null,
    previousFrom: null,
    easyWeek: false,
    exercises: [],
    lastDeleted: null,
    lastCopy: null,
    editingSessionId: null,
    editDateISO: null,
    editNotes: null,
    editEndedAt: null,
    editOriginalDateISO: null,
    pastLog: false,
    pausedAt: null,
    pausedTotalMs: 0,
    pauses: [],
    pausedAuto: false,
    autoSpan: null,
    countedUntil: null,
    lastSaveReconciled: true,

    hydrate: async () => {
      // Already hydrated, or a workout already begun in-memory — nothing to restore.
      if (get().hydrated || get().active) {
        set({ hydrated: true });
        return;
      }
      // v0.26.1 review: a failed read still ends the restore, or the start-up clean-up (and the
      // watch card's catch-up) would wait for it for ever. A broken read = no saved workout.
      const raw = await getMeta(DRAFT_KEY).catch(() => null);
      // A workout may have been started (start-tap) during the await — don't clobber it.
      if (get().active || get().hydrated) {
        set({ hydrated: true });
        return;
      }
      if (raw) {
        try {
          const snap = JSON.parse(raw) as DraftSnapshot;
          // HI-07: an edit left open by an older version is not a workout in progress — drop it.
          if (snap && snap.editingSessionId) {
            void enqueueWrite(() => setMeta(DRAFT_KEY, '')).catch(() => undefined);
          } else if (snap && typeof snap.startedAt === 'number' && Array.isArray(snap.exercises)) {
            // TG-11 (reopening mid-workout): the Targets are ready before the rows show hints.
            if (snap.planDayId && !snap.editingSessionId) {
              await targetsBeforeHints(snap.planDayId, snap.exercises, snap.easyWeek === true, snap.previousFrom ?? null);
              // A workout may have been started while they loaded — don't clobber it.
              if (get().active || get().hydrated) {
                set({ hydrated: true });
                return;
              }
            }
            set({
              active: true,
              startedAt: snap.startedAt,
              dayType: snap.dayType,
              planDayId: snap.planDayId ?? null,
              routineId: snap.routineId === undefined ? '' : snap.routineId,
              workoutName: snap.workoutName ?? null,
              previousFrom: snap.previousFrom ?? null,
              easyWeek: snap.easyWeek === true,
              // LW-26: a draft saved by an older version may hold a superset of one.
              exercises: tidySupersets(snap.exercises),
              // Pre-W4 drafts have none of these — they restore as a new workout.
              editingSessionId: snap.editingSessionId ?? null,
              editDateISO: snap.dateISO ?? null,
              editNotes: snap.notes ?? null,
              editEndedAt: snap.endedAt ?? null,
              editOriginalDateISO: snap.originalDateISO ?? null,
              pastLog: false,
              // A workout paused when the app was closed is still paused (its clock stood still).
              ...withSpans(pauseFromDraft(snap, snap.startedAt)),
              pausedAuto: snap.pausedAuto === true && pauseFromDraft(snap, snap.startedAt).pausedAt != null,
              autoSpan: autoSpanFromDraft(snap.autoSpan, pauseFromDraft(snap, snap.startedAt).pauses),
              countedUntil:
                typeof snap.countedUntil === 'number' && Number.isFinite(snap.countedUntil) && snap.countedUntil >= snap.startedAt
                  ? snap.countedUntil
                  : null,
            });
          }
        } catch (e) {
          // corrupt draft — ignore, start clean
          console.warn('[ForgeErr] The saved workout could not be read back, so it was not reopened.', e);
        }
      }
      set({ hydrated: true });
    },

    startEmpty: () => {
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: liveStart(),
        dayType: 'full',
        planDayId: null,
        routineId: '',
        workoutName: null,
        previousFrom: previousFromNow(),
        easyWeek: false,
        exercises: [],
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
        pastLog: false,
        ...NO_PAUSE,
      });
      persistNow();
    },

    startFromPlan: async () => {
      // Audit Phase 3: the one "Today" answer (its `planDayId` is the routine Start starts —
      // the next one once today's is done). Screens that SHOW a routine start that routine by
      // id instead (`startFromPlanDay`, RP-03); this is for a Start with no routine on screen.
      const [tw, plan] = await Promise.all([getTodaysWorkout(undefined, { targets: false }), getPlanNow().catch(() => null)]);
      let dayType: DayType = 'full';
      let planDayId: string | null = null;
      let exercises: DraftExercise[] = [];
      // Phase 4: today's routine always comes from the followed plan — in its easy week,
      // half the sets.
      const easy = plan?.easy === true;
      if (tw.planDayId) {
        // RP-19: read with everything the routine keeps (set types, rest, supersets, notes).
        const day = await getRoutine(tw.planDayId);
        if (day) {
          dayType = day.dayType;
          planDayId = day.id;
          exercises = await cardsWithTargets(day.id, day.exercises, easy);
        }
      }
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: liveStart(),
        dayType,
        planDayId,
        routineId: '',
        workoutName: null,
        previousFrom: previousFromNow(),
        easyWeek: easy && planDayId != null,
        exercises,
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
        pastLog: false,
        ...NO_PAUSE,
      });
      persistNow();
    },

    startFromPlanDay: async (dayId) => {
      const [day, easy] = await Promise.all([getRoutine(dayId), isEasyForRoutine(dayId).catch(() => false)]);
      let dayType: DayType = 'full';
      let planDayId: string | null = null;
      let exercises: DraftExercise[] = [];
      if (day) {
        dayType = day.dayType;
        planDayId = day.id;
        exercises = await cardsWithTargets(day.id, day.exercises, easy);
      }
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: liveStart(),
        dayType,
        planDayId,
        routineId: '',
        workoutName: null,
        previousFrom: previousFromNow(),
        easyWeek: easy && planDayId != null,
        exercises,
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
        pastLog: false,
        ...NO_PAUSE,
      });
      persistNow();
    },

    startFromSession: async (session) => {
      const cards = cardOccurrences(session.exercises.map((g) => g.exercise.id));
      // "Previous values": a Repeat counts as its source's routine, so it reads that scope. An
      // imported source (no routine id) counts as the routine of its name (13 Oct 2026 audit, A2).
      const ownRoutine = session.routineId ?? (await routineIdByName(session.title, session.notes).catch(() => null));
      const scope = await scopeOfWorkout({ planDayId: null, routineId: ownRoutine });
      const facts = await prefetchCardFacts(session.exercises.map((g, i) => ({ exerciseId: g.exercise.id, card: cards[i] })), null, scope);
      const exercises = await Promise.all(
        session.exercises.map((g, i) => {
          const working = g.sets.filter((s) => !s.isWarmup).length;
          return buildDraftExercise(g.exercise, working > 0 ? working : 1, { card: cards[i], facts, scope });
        }),
      );
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: liveStart(),
        dayType: session.dayType,
        planDayId: null,
        routineId: ownRoutine,
        workoutName: session.title?.trim() ? session.title.trim() : null,
        previousFrom: previousFromNow(),
        easyWeek: false,
        exercises,
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
        pastLog: false,
        ...NO_PAUSE,
      });
      persistNow();
    },

    addExercise: async (ex) => {
      // #10: a second Bench added mid-workout is card 1, given now (not from screen order).
      const draftEx = await buildDraftExercise(ex, 1, {
        card: nextCardNumber(get().exercises, ex.id),
        before: correctingBefore(get()),
        scope: await scopeOfWorkout(get()),
      });
      // Correcting a past workout: a note carried from a LATER session would be wrong.
      if (isCorrecting(get())) delete draftEx.note;
      mutate((list) => [...list, draftEx]);
    },

    addExercises: async (picked) => {
      if (picked.length === 0) return;
      // #10: each new card's number among the cards of its exercise, the picked ones included.
      const numbered: Pick<DraftExercise, 'exerciseId' | 'card'>[] = [...get().exercises];
      const cards = picked.map((ex) => {
        const card = nextCardNumber(numbered, ex.id);
        numbered.push({ exerciseId: ex.id, card });
        return card;
      });
      const before = correctingBefore(get());
      const scope = await scopeOfWorkout(get());
      const facts = picked.length > 1 ? await prefetchCardFacts(picked.map((ex, i) => ({ exerciseId: ex.id, card: cards[i] })), before, scope) : null;
      const built = await Promise.all(picked.map((ex, i) => buildDraftExercise(ex, 1, { card: cards[i], before, facts, scope })));
      if (isCorrecting(get())) for (const d of built) delete d.note;
      mutate((list) => [...list, ...built], true);
    },

    removeExercise: (exKey) => {
      // Kill a pending undo for this exercise (its set list is going away).
      if (get().lastDeleted?.exKey === exKey) set({ lastDeleted: null });
      if (get().lastCopy?.exKey === exKey) set({ lastCopy: null });
      // LW-26: a partner left alone is no longer a superset.
      mutate((list) => tidySupersets(list.filter((e) => e.key !== exKey)));
    },

    moveExercise: (exKey, dir) => {
      mutate((list) => tidySupersets(moveCard(list, exKey, dir)), true);
    },

    reorderExercises: (keys, dragged) => {
      mutate((list) => dropCard(list, keys, dragged), true);
    },

    pairSuperset: (exKey, otherKey) => {
      if (exKey === otherKey) return;
      mutate((list) => {
        const g = nextSupersetGroup(list);
        return tidySupersets(list.map((e) => (e.key === exKey || e.key === otherKey ? { ...e, supersetGroup: g } : e)));
      });
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
      mutate((list) => list.map((e) => (e.key === exKey ? { ...e, sets: withWarmups(e.sets, rows, uuid) } : e)));
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
      // Review: typing a number is training again, like a tick (only the member's typing calls this).
      if (get().pausedAuto) get().resumeWorkout(Date.now());
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
                        editedAt: Date.now(),
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

    stepSetValue: (exKey, setKey, field, dir, fill) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      const row = ex?.sets.find((s) => s.key === setKey);
      if (!ex || !row) return false;
      const patch = stepPatch(row, fill, field, dir, {
        logType: ex.logType ?? 'weight_reps',
        incrementKg: ex.incrementKg,
        units: displayUnits(),
      });
      if (!patch) return false;
      // The same path as typing: the draft saves after the short typing pause.
      get().updateSet(exKey, setKey, patch);
      return true;
    },

    copySetDown: (exKey, setKey, fill) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      const row = ex?.sets.find((s) => s.key === setKey);
      if (!ex || !row) return 0;
      const targets = copyTargets(ex.sets, setKey);
      const values = copyValues(row, fill, ex.logType ?? 'weight_reps');
      if (targets.length === 0 || !values) return 0;
      const done = applyCopy(ex.sets, targets, values, Date.now());
      if (done.before.length === 0) return 0;
      copySeq += 1;
      set({ lastCopy: { id: copySeq, exKey, count: done.before.length, before: done.before, values } });
      mutate((list) => list.map((e) => (e.key === exKey ? { ...e, sets: done.sets } : e)), true);
      return done.before.length;
    },

    refreshBests: async (exerciseId) => {
      const s = get();
      if (!s.active || isCorrecting(s) || !s.exercises.some((e) => e.exerciseId === exerciseId)) return;
      const bests = await getPriorBests(exerciseId).catch(() => undefined);
      if (bests === undefined) return;
      const now = get();
      if (!now.active || isCorrecting(now)) return;
      set({ exercises: now.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, bests } : e)) });
      persistSoon();
    },

    undoCopy: () => {
      const lc = get().lastCopy;
      if (!lc) return;
      set({ lastCopy: null });
      mutate(
        (list) => list.map((e) => (e.key === lc.exKey ? { ...e, sets: undoCopyRows(e.sets, lc.before, lc.values) } : e)),
        true,
      );
    },

    dismissCopy: (id) => {
      if (get().lastCopy?.id === id) set({ lastCopy: null });
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
      // LW-26: leaving a pair dissolves it; letters follow the screen. #13: joining a superset
      // moves the card next to its group.
      mutate((list) => tidySupersets(joinSuperset(list, exKey, group)));
    },

    setExerciseNote: (exKey, note) => {
      mutate((list) => list.map((e) => (e.key === exKey ? { ...e, note } : e)));
    },

    setRestSec: async (exKey, restSec) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      if (!ex) return false;
      // Same lift twice in one workout shares the setting, as it will next time.
      mutate((list) => list.map((e) => (e.exerciseId === ex.exerciseId ? { ...e, restSec } : e)));
      // HI-08: while correcting a past workout, nothing is "remembered for next time" - the
      // change lives in this draft only and goes with Discard.
      if (isCorrecting(get())) return true;
      // Phase 2 (RT-11): report whether it was kept for next time (it applies to this workout
      // either way), so the picker never claims "Remembered" for a write that failed.
      try {
        await setExerciseRestSec(ex.exerciseId, restSec);
        return true;
      } catch {
        return false;
      }
    },

    toggleDone: (exKey, setKey, fill, at) => {
      // Phase 2 (RT-03 / LW-29): the STORED state, as the toggle itself reads it — so the second
      // tap of a quick double tap (an untick) cancels the rest the first tap started.
      const doneNow = (): boolean =>
        get().exercises.find((e) => e.key === exKey)?.sets.find((s) => s.key === setKey)?.done === true;
      const wasDone = doneNow();
      // Packet B: a row with nothing to save stays unticked and says what is missing (LW-13).
      let missing: TickMissing | null = null;
      // A tick saves at once (not after the typing pause).
      mutate((list) =>
        list.map((e) => {
          if (e.key !== exKey) return e;
          // The row passes the exact fill it is hinting, so the hint and the tick never disagree.
          const hint = fill !== undefined ? fill : fillForSet(e, setKey);
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
                  doneAt: undefined,
                  weightKg: af?.weight ? null : s.weightKg,
                  reps: af?.reps ? null : s.reps,
                  durationSec: af?.duration ? null : s.durationSec,
                  distanceM: af?.distance ? null : s.distanceM,
                  autoFilled: undefined,
                };
              }
              // Exactly what the row shows: typed boxes, else the grey hint (setTick).
              const out = tickValues(lt, s, hint);
              if (!out.ok) {
                missing = out.missing;
                return s;
              }
              const next: DraftSet = {
                ...s,
                done: true,
                // A tick the phone kept with the app closed keeps its own moment (review fix): a
                // workout logged from the shade or a watch keeps its real length and end time.
                doneAt: at != null && Number.isFinite(at) && at > 0 && at <= Date.now() ? at : Date.now(),
                weightKg: out.weightKg,
                reps: out.reps,
                autoFilled: out.autoFilled,
              };
              if (out.durationSec != null || s.durationSec !== undefined) next.durationSec = out.durationSec;
              if (out.distanceM != null || s.distanceM !== undefined) next.distanceM = out.distanceM;
              return next;
            }),
          };
        }),
        true,
      );
      // The rest belongs to the set whose tick started it; unticking that set cancels it.
      const isDone = doneNow();
      // No rest timer while correcting the past (nothing is being trained).
      if (isCorrecting(get())) return missing;
      if (wasDone && !isDone) useRestTimer.getState().cancelIfStartedBy(exKey, setKey);
      else if (!wasDone && isDone) {
        useRestTimer.getState().noteTick(exKey, setKey);
        // 15 Oct 2026: a tick while paused means training again — the workout resumes at the
        // tick's own moment (a tap kept by the phone with the app closed keeps its time).
        if (get().pausedAt != null) {
          const doneAt = get().exercises.find((e) => e.key === exKey)?.sets.find((x) => x.key === setKey)?.doneAt;
          get().resumeWorkout(doneAt ?? Date.now());
        }
      }
      return missing;
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
                  s.key === setKey ? { ...s, durationSec: sec, done: true, doneAt: Date.now(), autoFilled: undefined } : s,
                ),
              }
            : e,
        ),
        true,
      );
      if (!isCorrecting(get())) {
        useRestTimer.getState().noteTick(exKey, setKey); // RT-03: a rest started now belongs to this set
        if (get().pausedAt != null) get().resumeWorkout(); // a timed set done while paused: training again
      }
    },

    setLoadMode: (exKey, mode) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      if (!ex) return;
      // Same lift twice in one workout shares the setting, as it will next time. TG-03: PREVIOUS
      // is re-read in the new counting (50 as typed → 25 each), the same physical load; the
      // Target follows through the card's counting (targetStore).
      // HI-08: correcting a past workout, the counting is THIS workout's - each of its sets is
      // saved with it, and the exercise's own counting (every future workout) stays. Discard
      // throws it away with the rest of the edit.
      const correcting = isCorrecting(get());
      mutate((list) =>
        list.map((e) =>
          e.exerciseId === ex.exerciseId
            ? {
                ...e,
                loadMode: mode,
                previousSets: e.previousSets.map((p) => ({ ...p, weightKg: convertCounting(p.weightKg, e.loadMode ?? 'one', mode) })),
                ...(e.previousWarmups
                  ? { previousWarmups: e.previousWarmups.map((p) => ({ ...p, weightKg: convertCounting(p.weightKg, e.loadMode ?? 'one', mode) })) }
                  : {}),
                // Idea 2's set reads in the card's counting too.
                ...(e.elsewhere
                  ? {
                      elsewhere: {
                        ...e.elsewhere,
                        set: { ...e.elsewhere.set, weightKg: convertCounting(e.elsewhere.set.weightKg, e.loadMode ?? 'one', mode) },
                      },
                    }
                  : {}),
                ...(correcting ? { sets: e.sets.map((st) => ({ ...st, loadMode: mode })) } : {}),
              }
            : e,
        ),
      );
      if (!correcting) void setExerciseLoadMode(ex.exerciseId, mode).catch(() => undefined);
    },

    swapExercise: async (exKey, next) => {
      const cur = get().exercises.find((e) => e.key === exKey);
      if (!cur) return false;
      // LW-31: after a tick, the new exercise gets exactly the open rows (the ticked ones stay).
      const openRows = (e: DraftExercise): number => e.sets.filter((s) => !s.done && !s.isWarmup).length || 1;
      const split = cur.sets.some((s) => s.done);
      // #10: the new exercise's card number — beside the old card after a split, in its place
      // otherwise (the old card is gone then, so its number is free).
      const others = split ? get().exercises : get().exercises.filter((e) => e.key !== exKey);
      // Phase 4: in an easy week the halved set count stays (not last time's full count).
      const draftEx = await buildDraftExercise(
        next,
        split ? openRows(cur) : cur.sets.filter((s) => !s.isWarmup).length || 1,
        {
          exactSets: split || get().easyWeek,
          card: nextCardNumber(others, next.id),
          before: correctingBefore(get()),
          scope: await scopeOfWorkout(get()),
        },
      );
      if (isCorrecting(get())) delete draftEx.note;
      // Re-check after the await: the card may be gone, or a tick may have landed meanwhile.
      const still = get().exercises.find((e) => e.key === exKey);
      if (!still) return false;
      if (still.sets.some((s) => s.done) && draftEx.sets.length > openRows(still)) {
        draftEx.sets = draftEx.sets.slice(0, openRows(still));
      }
      if (get().lastDeleted?.exKey === exKey) set({ lastDeleted: null });
      // LW-09: the new card remembers the routine's own exercise (the first one, across repeat
      // swaps); swapping back to it is no swap at all. LW-31: ticked sets keep their card.
      mutate((list) => list.flatMap((e) => (e.key === exKey ? swapSplit(e, draftEx) : [e])), true);
      return true;
    },

    finish: async (note, opts = {}) => {
      const s = get();
      // Guard re-entry (double-tap): committing is set synchronously below, before
      // the first await, so a second concurrent call bails here.
      if (!s.active || s.startedAt == null || s.committing) return null;
      // An edit must go through saveEdits — finishing would create a SECOND session
      // and leave the original untouched.
      if (s.editingSessionId || s.pastLog) return null;
      // LW-03: a row that was never ticked is saved only when the member chose "Save them".
      const flat = draftToRichSets(s.exercises, { tickedOnly: opts.keepUnticked !== true });
      // Need at least one working set — a warm-up-only session would be invisible
      // to history/PREVIOUS (the history read excludes warm-ups).
      if (!hasWorkingSet(flat)) return null;
      // A Repeat keeps its source's name when the sheet gives none.
      const title = (opts.name ?? s.workoutName)?.replace(/\s+/g, ' ').trim().slice(0, 60) || null;
      set({ committing: true });
      // Finish writes the whole workout itself; a pending typing-pause save is not needed.
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = null;
      try {
        // The session belongs to the day it STARTED, not the commit instant — a
        // workout crossing midnight must not split from its own started_at.
        const startedAt = s.startedAt; // narrowed to number by the guard above
        const dateISO = toISO(new Date(startedAt));
        // LW-07: the end the member picked for a workout left open (never before the start).
        const now = Date.now();
        const endedAt = opts.endedAt != null ? Math.min(now, Math.max(startedAt, opts.endedAt)) : now;
        // 15 Oct 2026: paused time never counts. The start stays the real moment; the end saved is
        // start + the time trained, so every reader's `ended_at − started_at` is the real
        // duration (history, summary, stats, share picture, Health Connect). workoutPause.ts.
        const savedEndedAt = savedEnd(startedAt, s, endedAt);
        // Commit the whole workout atomically: createSession + addSetsWithMeta +
        // the draft-clear all run inside ONE transaction on the shared getDb()
        // connection (non-exclusive, like hevyImport — the frozen repos join it).
        // A kill/error mid-commit now rolls back cleanly instead of leaving an
        // orphan session + a surviving draft that would duplicate it on retry.
        //
        // DS-04 / LW-08: the transaction AND the store reset run as ONE job in the app-wide
        // write queue. No other transaction can interleave, and a draft write asked for
        // during the save (a tick while it spins) runs after it and finds the workout ended.
        const sessionId = await enqueueWrite(async () => {
        let id = '';
        await getDb().withTransactionAsync(async () => {
          const session = await createSession({
            dateISO,
            dayType: s.dayType,
            notes: note ?? null,
            source: 'manual',
            startedAt,
            endedAt: savedEndedAt,
          });
          id = session.id;
          // LW-10: the workout's own name (additive column, tracker schema v9).
          if (title) await getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', [title, session.id]);
          // Audit Phase 3 (RP-01 / RP-02, tracker schema v11): the routine it was started from,
          // so "Today" tells Push 1 from Push 2; '' = none (an empty workout never moves Today).
          // A Repeat counts as its source's routine (null = not known: placed by name).
          await getDb().runAsync('UPDATE workout_sessions SET routine_id = ? WHERE id = ?', [s.planDayId ?? s.routineId, session.id]);
          await addSetsWithMeta(session.id, flat); // auto set_number + PR detection + rpe/type
          // Phase 4: an easy-week workout is marked, so records and the Target leave it out —
          // also the frozen PR log that Home's PR count, the strength score and the coach read.
          if (s.easyWeek) {
            await getDb().runAsync('UPDATE workout_sessions SET easy_week = 1 WHERE id = ?', [session.id]);
            await getDb().runAsync('DELETE FROM personal_records WHERE session_id = ?', [session.id]);
          }
          await setMeta(DRAFT_KEY, '');
        });
        endDraftInJob();
        set({
          active: false,
          committing: false,
          hydrated: true,
          startedAt: null,
          dayType: 'full',
          planDayId: null,
          routineId: '',
          workoutName: null,
          previousFrom: null,
          easyWeek: false,
          exercises: [],
          lastDeleted: null,
          lastCopy: null,
          ...NO_PAUSE,
        });
        return id;
        });
        clearAllSaveProblems();
        // v0.27.0: Health Connect, widgets and reminders follow (quiet, never in the way).
        void phoneAfterWorkout(sessionId);
        return sessionId;
      } catch (e) {
        set({ committing: false }); // let the user retry; the workout stays open
        // LW-01: say why on the app-wide banner. Finish is NOT retried by itself, so the line asks
        // for another tap (not "we'll keep trying"); it stays up until Finish works or the workout
        // is discarded — an autosave that works meanwhile neither clears it nor adds to the
        // autosave's back-off.
        reportActionProblem('finish', e);
        // Make sure the draft (with anything typed during the attempt) is on disk; the autosave
        // retries by itself until it is.
        draftDirty = true;
        void flushDraft();
        throw e;
      }
    },

    startEditingSession: async (session) => {
      // PREVIOUS must show the session BEFORE this one, not the workout its own
      // numbers — nor a NEWER one, which ticking a blank set would then auto-fill
      // into the past. Pull a few and take the newest that predates this session.
      // HI-16: read straight "the newest workout with this exercise BEFORE this one" (one per
      // exercise) - not the 4 newest, which a workout from 6 weeks ago never reaches.
      const before: HistoryBefore = { dateISO: session.dateISO, startedAt: session.startedAt, excludeSessionId: session.id };
      // "Previous values": the edited workout's own routine decides the scope (an import: the
      // routine of its name, A2).
      const scope = await scopeOfWorkout({
        planDayId: null,
        routineId: session.routineId ?? (await routineIdByName(session.title, session.notes).catch(() => null)),
      });
      const [meta, histories, infos] = await Promise.all([
        getSessionSetMeta(session.id),
        Promise.all(
          session.exercises.map(async (g) => ({
            exerciseId: g.exercise.id,
            history: await getBoundedExerciseHistory(g.exercise.id, 1, { before, scope }),
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
      // Warm-ups on PREVIOUS: the warm-ups of the workout each exercise's PREVIOUS comes from.
      const sources: { sessionId: string; exerciseId: string }[] = [];
      for (const h of histories) {
        const lt = kinds[h.exerciseId]?.logType ?? 'weight_reps';
        const prior = previousExcludingSession(h.history, session.id, session.dateISO);
        previous[h.exerciseId] = prior.map((s) => toPrevSet(s, lt));
        if (prior[0]) sources.push({ sessionId: prior[0].sessionId, exerciseId: h.exerciseId });
      }
      // A failed read never refuses the edit: the warm-up rows then show no PREVIOUS, the card
      // no "Last:" name, and no "First time in this folder" line.
      const priorOf = new Map(histories.map((h) => [h.exerciseId, previousExcludingSession(h.history, session.id, session.dateISO)]));
      const dayOf = new Map(histories.flatMap((h) => h.history.map((x) => [x.sessionId, x.dateISO] as const)));
      const empty = histories.filter((h) => (priorOf.get(h.exerciseId) ?? []).length === 0).map((h) => h.exerciseId);
      const [warm, names, other] = await Promise.all([
        readWarmups(sources),
        readSourceNames(sources.map((x) => x.sessionId)),
        readElsewhere(empty, scope, before),
      ]);
      const warmOf = (exerciseId: string): PrevSet[] => {
        const src = sources.find((x) => x.exerciseId === exerciseId);
        const lt = kinds[exerciseId]?.logType ?? 'weight_reps';
        return src ? (warm.get(src.sessionId)?.get(exerciseId) ?? []).map((s) => toPrevSet(s, lt)) : [];
      };
      const fromOf = (exerciseId: string): Pick<DraftExercise, 'lastFrom' | 'elsewhere'> => {
        const src = sources.find((x) => x.exerciseId === exerciseId);
        const dateISO = src ? dayOf.get(src.sessionId) : undefined;
        if (src && dateISO) return { lastFrom: { dateISO, name: names.get(src.sessionId) ?? null } };
        const lt = kinds[exerciseId]?.logType ?? 'weight_reps';
        const found = elsewhereOf(scope, other.get(exerciseId), lt, kinds[exerciseId]?.loadMode ?? 'one');
        return found ? { elsewhere: found } : {};
      };
      const exercises = buildEditDraft(session, meta, previous, { makeKey: uuid }, kinds).map((e) => ({
        ...e,
        previousWarmups: warmOf(e.exerciseId),
        ...fromOf(e.exerciseId),
      }));
      set({
        active: true,
        hydrated: true,
        committing: false,
        // Keep the ORIGINAL start time: it anchors the session's place in history
        // and is what PR detection compares against.
        startedAt: session.startedAt,
        dayType: session.dayType,
        planDayId: null,
        // Its own routine: exercises added while editing read the same "Previous values" scope.
        routineId: session.routineId ?? '',
        workoutName: null,
        previousFrom: previousFromNow(),
        easyWeek: false,
        exercises,
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: session.id,
        editDateISO: session.dateISO,
        editNotes: session.notes,
        editEndedAt: session.endedAt,
        editOriginalDateISO: session.dateISO,
        ...NO_PAUSE,
      });
      persistNow();
    },

    setEditDate: (dateISO) => {
      // A workout can't have happened in the future. Clamped here as well as in the
      // header so a stale draft (device clock moved on) can't carry one through.
      if (!isCorrecting(get()) || dateISO > todayISO()) return;
      set({ editDateISO: dateISO });
      persistSoon();
    },

    setEditDayType: (dayType) => {
      if (!isCorrecting(get())) return;
      set({ dayType });
      persistSoon();
    },

    setEditNotes: (notes) => {
      if (!isCorrecting(get())) return;
      set({ editNotes: notes });
      persistSoon();
    },

    setEditDuration: (minutes) => {
      const s = get();
      if (!isCorrecting(s) || s.startedAt == null) return;
      // HI-18: no silent clamp - the field refuses 0 and > 600 with a message (checkMinutes);
      // anything that still gets here out of range changes nothing.
      const c = checkMinutes(String(Math.round(minutes)));
      if (c.minutes == null) return;
      set({ editEndedAt: s.startedAt + c.minutes * 60_000 });
      persistSoon();
    },

    setEditStartTime: (hour, minute) => {
      const s = get();
      if (!isCorrecting(s) || s.startedAt == null) return null;
      const original = s.editOriginalDateISO ?? s.editDateISO ?? toISO(new Date(s.startedAt));
      const day = s.editDateISO ?? original;
      const length = s.editEndedAt != null ? Math.max(0, s.editEndedAt - s.startedAt) : null;
      // A start that would push the end past now is refused here, with the reason (it used to be
      // slid back quietly at Save).
      const why = checkStartTime(day, hour, minute, Date.now(), length == null ? null : Math.round(length / 60_000));
      if (why) return why;
      // The new start on the stored day (the date move is applied at Save, as before). A start
      // typed here is real clock time, so it never falls on a whole second (see `liveStart`).
      const d = fromISO(original);
      const startedAt = liveStart(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime());
      set({ startedAt, editEndedAt: length == null ? null : startedAt + length });
      persistSoon();
      return null;
    },

    startPastWorkout: ({ dateISO, hour, minute, minutes, routine }) => {
      const mins = checkMinutes(String(minutes)).minutes ?? 60;
      const why = checkStartTime(dateISO, hour, minute, Date.now(), mins);
      if (why) return why;
      const d = fromISO(dateISO);
      const startedAt = liveStart(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime());
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt,
        dayType: routine && routine !== 'none' ? routine.dayType : 'full',
        planDayId: null,
        routineId: routine === 'none' ? '' : routine ? routine.id : null,
        workoutName: routine && routine !== 'none' ? routine.name : null,
        previousFrom: previousFromNow(),
        easyWeek: false,
        exercises: [],
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: dateISO,
        editNotes: null,
        editEndedAt: startedAt + mins * 60_000,
        editOriginalDateISO: dateISO,
        pastLog: true,
        ...NO_PAUSE,
      });
      return null;
    },

    saveEdits: async () => {
      const s = get();
      // Same re-entry guard as finish(): `committing` is set synchronously below.
      if (!s.active || !isCorrecting(s) || s.startedAt == null || s.committing) return null;
      // Review fix: the card's counting goes on every row (rows added after a Counting change too).
      // 16 Oct 2026 audit (C1-4): an edit opens with every saved set ticked, so a saved set the
      // member UNticks is left out of the save (the screen says how many). Rows typed while
      // correcting are saved, ticked or not, as before ("Type a set to save").
      const flat = draftToRichSets(withoutUntickedSaved(s.exercises), { stampLoadMode: true });
      // Emptying a workout is a DELETE, not a save — the screen offers that instead.
      if (!hasWorkingSet(flat)) return null;
      if (s.pastLog) return savePastWorkout(s, flat);

      const sessionId = s.editingSessionId as string;
      const fallbackDate = toISO(new Date(s.startedAt));
      const timing = computeEditedTiming({
        originalDateISO: s.editOriginalDateISO ?? s.editDateISO ?? fallbackDate,
        dateISO: s.editDateISO ?? fallbackDate,
        startedAt: s.startedAt,
        endedAt: s.editEndedAt,
        now: Date.now(),
      });

      set({ committing: true });
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = null;
      try {
        // One queued job: the edit, the draft-clear (inside the edit's transaction) and the
        // store reset; the same guarantees as finish() (DS-04 / LW-08).
        await enqueueWrite(async () => {
        const { reconciled } = await saveSessionEditsUnqueued(
          sessionId,
          {
            dateISO: timing.dateISO,
            dayType: s.dayType,
            notes: s.editNotes?.trim() ? s.editNotes.trim() : null,
            startedAt: timing.startedAt,
            endedAt: timing.endedAt,
            sets: flat,
          },
          { inTransaction: () => setMeta(DRAFT_KEY, '') },
        );
        endDraftInJob();
        set({ lastSaveReconciled: reconciled });
        set({
          active: false,
          committing: false,
          hydrated: true,
          startedAt: null,
          dayType: 'full',
          planDayId: null,
          routineId: '',
          workoutName: null,
          previousFrom: null,
          easyWeek: false,
          exercises: [],
          lastDeleted: null,
          lastCopy: null,
          editingSessionId: null,
          editDateISO: null,
          editNotes: null,
          editEndedAt: null,
          editOriginalDateISO: null,
          pastLog: false,
          ...NO_PAUSE,
        });
        });
        clearAllSaveProblems();
        // v0.27.0: Health Connect, widgets and reminders follow (quiet, never in the way).
        void phoneAfterWorkout(sessionId);
        return sessionId;
      } catch (e) {
        set({ committing: false }); // let the user retry; nothing was committed
        // A deleted workout is not a storage problem; the screen explains that one itself.
        // Otherwise, like Finish: nothing retries the save, so the line asks for another tap.
        const gone = e instanceof Error && e.name === 'SessionGoneError';
        if (!gone) reportActionProblem('save', e);
        draftDirty = true;
        void flushDraft();
        throw e;
      }
    },

    discard: async () => {
      await enqueueWrite(async () => {
        await setMeta(DRAFT_KEY, '');
        endDraftInJob();
      });
      clearAllSaveProblems(); // the workout is gone: nothing is waiting to be saved
      set({
        active: false,
        committing: false,
        hydrated: true,
        startedAt: null,
        dayType: 'full',
        planDayId: null,
        routineId: '',
        workoutName: null,
        previousFrom: null,
        easyWeek: false,
        exercises: [],
        lastDeleted: null,
        lastCopy: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
        pastLog: false,
        ...NO_PAUSE,
      });
    },

    pauseWorkout: () => {
      const s = get();
      // Only a live workout has a running clock (an edit or a past log shows none).
      if (!s.active || s.startedAt == null || isCorrecting(s) || s.committing || s.pausedAt != null) return;
      set({ ...withSpans(pauseAt(s, Date.now())), pausedAuto: false });
      persistNow();
    },

    resumeWorkout: (at) => {
      const s = get();
      if (s.pausedAt == null) return;
      const now = Date.now();
      // Never before the pause began, never in the future.
      const when = at != null && Number.isFinite(at) ? Math.min(now, Math.max(s.pausedAt, at)) : now;
      const next = withSpans(resumeAt(s, when));
      // An auto-pause that ends becomes the span the member may still "Count it".
      const autoSpan = s.pausedAuto ? (next.pauses[next.pauses.length - 1] ?? null) : s.autoSpan;
      set({ ...next, pausedAuto: false, autoSpan });
      persistNow();
    },

    countAutoPause: () => {
      const s = get();
      const span = s.autoSpan;
      if (!span) return;
      const i = s.pauses.findIndex((p) => p.from === span.from && p.to === span.to);
      if (i < 0) {
        set({ autoSpan: null });
        return;
      }
      set({
        pauses: s.pauses.filter((_, j) => j !== i),
        pausedTotalMs: Math.max(0, s.pausedTotalMs - (span.to - span.from)),
        autoSpan: null,
        // C1-2: a counted span stays counted — the next idle hour is measured from its end.
        countedUntil: Math.max(s.countedUntil ?? 0, span.to),
      });
      persistNow();
    },

    autoPause: (at) => {
      const s = get();
      if (!s.active || s.startedAt == null || isCorrecting(s) || s.committing || s.pausedAt != null || !Number.isFinite(at)) return;
      set({ ...withSpans(pauseAt(s, Math.min(Date.now(), Math.max(s.startedAt, at)))), pausedAuto: true });
      persistNow();
    },

    committableSetCount: () => {
      let n = 0;
      for (const ex of get().exercises) for (const s of ex.sets) if (isCommittable(s, ex.logType ?? 'weight_reps')) n += 1;
      return n;
    },
  };
});

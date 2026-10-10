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
import { getActivePlan } from '@/db/repos/planRepo';
import { getBoundedExerciseHistory, type TrackedSetEntry } from '@/tracker/db/exerciseHistory';
import {
  getTrackerExercise,
  getTrackerExercisesByIds,
  setExerciseLoadMode,
  type TrackerExercise,
} from '@/tracker/db/exerciseInfo';
import { typedWeight, type DistUnit, type LoadMode, type LogType } from '@/tracker/engine/logTypes';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { getCarriedNote, getExerciseRestSec, getPriorBests, setExerciseRestSec } from '@/tracker/db/exercisePrefs';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import type { PriorBests } from '@/tracker/services/liveRecords';
import { getRoutine } from '@/tracker/db/routineRepo';
import { saveSessionEditsUnqueued } from '@/tracker/db/sessionEdit';
import { easySets } from '@/tracker/plans/easyWeek';
import { getPlanNow, isEasyForRoutine } from '@/tracker/services/planState';
import { addSetsWithMeta, getSessionSetMeta } from '@/tracker/db/trackerSets';
import { buildEditDraft, previousExcludingSession } from '@/tracker/services/editDraft';
import type { ExerciseKinds, PreviousByExercise } from '@/tracker/services/editDraft';
import { computeEditedTiming } from '@/tracker/services/sessionTiming';
import { draftToRichSets, hasWorkingSet, isCommittable } from '@/tracker/services/draftSets';
import { tickValues, type TickMissing } from '@/tracker/services/setTick';
import { createSession } from '@/db/repos/workoutRepo';
import { toISO, todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import { getTodaysWorkout } from '@/services/coach';
import { phoneAfterWorkout } from '@/tracker/phone/phoneSync';
// Packet C (TG-03 / TG-06 / TG-08 / TG-11): Targets loaded with the cards, counting conversion.
import { convertCounting } from '@/tracker/engine/logTypes';
import { loadTargets, preloadTargets, seedTargets, targetQuery } from '@/tracker/store/targetStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
// Packet E (LW-12 / LW-26 / LW-31): order, supersets and the swap split.
import { joinSuperset, moveCard, nextSupersetGroup, swapSplit, tidySupersets } from '@/tracker/services/workoutOrder';
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
  /** LW-15: add several at once, in the order picked. All or none: a failed read adds nothing. */
  addExercises: (list: Exercise[]) => Promise<void>;
  removeExercise: (exKey: string) => void;
  /** LW-12: Move up (-1) / Move down (1). A superset moves as one block (see workoutOrder). */
  moveExercise: (exKey: string, dir: -1 | 1) => void;
  /** LW-26: start a new superset of exactly these two cards. */
  pairSuperset: (exKey: string, otherKey: string) => void;
  addSet: (exKey: string) => void;
  removeSet: (exKey: string, setKey: string) => void;
  updateSet: (
    exKey: string,
    setKey: string,
    patch: Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM'>>,
  ) => void;
  toggleWarmup: (exKey: string, setKey: string) => void;
  /**
   * `fill` = what the row is hinting (its Target-aware fill); omitted → computed without a
   * Target. Packet B (LW-13): returns what is missing when a tick had nothing to save (the row
   * stays unticked and says so), else null.
   */
  toggleDone: (exKey: string, setKey: string, fill?: SetFill | null) => TickMissing | null;
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
  s: Pick<TrackedSetEntry, 'weightKg' | 'reps' | 'durationSec' | 'distanceM' | 'loadMode'>,
  logType: LogType,
  /** TG-03: the card's counting — a set logged "as typed" reads as each dumbbell, and back. */
  mode?: LoadMode,
): PrevSet {
  const kg = mode ? convertCounting(s.weightKg, s.loadMode, mode) : s.weightKg;
  const p: PrevSet = { weightKg: typedWeight(logType, kg), reps: s.reps };
  if (s.durationSec != null) p.durationSec = s.durationSec;
  if (s.distanceM != null) p.distanceM = s.distanceM;
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

async function buildDraftExercise(
  ex: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'equipment' | 'incrementKg'>,
  targetSets: number,
  /** `card`: this card's place among the workout's cards of the SAME exercise (0 = first). */
  opts: { exactSets?: boolean; card?: number } = {},
): Promise<DraftExercise> {
  // Bounded in SQL: start-from-plan builds one draft per plan exercise, and the frozen
  // read would materialise each lift's ENTIRE working-set history just to keep its last
  // session. Parity-identical (newest-first, working sets only). Phase 4: PREVIOUS is the
  // last NORMAL workout — an easy week's lighter, shorter sets are not what to beat.
  const card = opts.card ?? 0;
  const [hist, restSec, note, bests, info] = await Promise.all([
    // A later card (back-off) may need to look past last time for its own sets (#11).
    getBoundedExerciseHistory(ex.id, card > 0 ? CARD_LOOKBACK : 1, { skipEasy: true }),
    // Phase 1 extras never block starting a workout: a failed read just means
    // default rest, no carried note, no live record alert.
    getExerciseRestSec(ex.id).catch(() => null),
    getCarriedNote(ex.id).catch(() => null),
    getPriorBests(ex.id).catch(() => null),
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
  // An easy week asks for exactly half the sets, even when last time had more rows.
  // TG-08: last time's drop sets come back AS drop sets, in their place (their PREVIOUS is the
  // drop), and only normal sets count toward the routine's set count.
  const lastTypes = opts.exactSets ? [] : lastSets.map((s) => (s.setType === 'drop' ? 'drop' : 'normal'));
  const normalLast = lastTypes.filter((t) => t !== 'drop').length;
  const extra = Math.max(0, targetSets - normalLast);
  const rowTypes: ('normal' | 'drop')[] = opts.exactSets
    ? Array.from({ length: Math.max(1, targetSets) }, () => 'normal' as const)
    : [...lastTypes, ...Array.from({ length: extra }, () => 'normal' as const)];
  if (rowTypes.length === 0) rowTypes.push('normal');
  const sets: DraftSet[] = rowTypes.map((t) => ({
    key: uuid(),
    weightKg: null,
    reps: null,
    isWarmup: false,
    done: false,
    ...(t === 'drop' ? { setType: 'drop' as const } : {}),
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
    // #3: drop rows are not routine sets ("Update routine?" never counts them).
    startRows: rowTypes.filter((t) => t !== 'drop').length,
    card,
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
 * TG-11: a routine's cards and their Targets, built TOGETHER (the Target reads run beside the
 * draft build) and stored before the workout opens, so the first frame shows each card's
 * Target and its hints. A failed Target read never blocks the start (the screen retries).
 */
async function cardsWithTargets(
  planDayId: string,
  rows: readonly { exerciseId: string; targetSets: number; exercise: Exercise }[],
  easy: boolean,
): Promise<DraftExercise[]> {
  const effort = useTrackerPrefs.getState().advancedSets;
  // LW-05: the same lift twice (heavy, then back-off) — each card reads its own card of last time.
  const cards = cardOccurrences(rows.map((pe) => pe.exerciseId));
  const [exercises, early] = await Promise.all([
    Promise.all(
      rows.map((pe, i) =>
        buildDraftExercise(pe.exercise, easy ? easySets(pe.targetSets) : pe.targetSets, { exactSets: easy, card: cards[i] }),
      ),
    ),
    preloadTargets(
      planDayId,
      rows.map((pe) => pe.exerciseId),
      { easy, effort },
    ),
  ]);
  try {
    seedTargets(targetQuery(planDayId, exercises, { easy, effort }), early);
  } catch {
    // The screen loads them itself.
  }
  return exercises;
}

/** How long a restore waits for the Targets before showing the workout anyway. */
export const RESTORE_TARGETS_WAIT_MS = 3000;

/**
 * TG-11, the reopen path: a draft restored after the app was closed computes its cards'
 * Targets BEFORE it opens, so the first hints are the Target's, never last time's. A slow or
 * failed read never keeps the workout shut (the screen loads them itself after the wait).
 */
async function targetsBeforeHints(planDayId: string, exercises: DraftExercise[], easy: boolean): Promise<void> {
  try {
    const effort = useTrackerPrefs.getState().advancedSets;
    let timer: ReturnType<typeof setTimeout> | null = null;
    await Promise.race([
      loadTargets(targetQuery(planDayId, exercises, { easy, effort })),
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
 * Target's rep goal. Warm-up rows get no hint. A drop row hints its own last-time drop first
 * and never the Target. A reps-only move never hints a weight (LW-19). A weight × reps row
 * with no weight to hint gets no hint at all — a tick then asks for the weight (TG-07).
 * Only hints: nothing is written into the row until it is ticked.
 */
export function fillForSet(
  ex: DraftExercise,
  setKey: string,
  /** The card's Target fill (`targetFill`), or null off-plan / before it is known. */
  target?: SetFill | null,
): SetFill | null {
  const lt: LogType = ex.logType ?? 'weight_reps';
  const idx = ex.sets.findIndex((s) => s.key === setKey);
  if (idx < 0) return null;
  const row = ex.sets[idx];
  if (row.isWarmup) return null;
  const drop = row.setType === 'drop';
  const own = prevForSet(ex, setKey);
  // Working rows above, nearest first. A normal row never copies a drop row's lighter numbers.
  const above = ex.sets
    .slice(0, idx)
    .reverse()
    .filter((s) => !s.isWarmup && (drop || s.setType !== 'drop'));
  const tgt = drop ? null : target ?? null;
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
  const reps = pick((s) => positive(s.reps), (p) => positive(p?.reps));
  if (reps == null) return null;
  if (lt === 'reps') return { weightKg: 0, reps };
  const weightKg = pick((s) => present(s.weightKg), (p) => present(p?.weightKg));
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
          if (snap && typeof snap.startedAt === 'number' && Array.isArray(snap.exercises)) {
            // TG-11 (reopening mid-workout): the Targets are ready before the rows show hints.
            if (snap.planDayId && !snap.editingSessionId) {
              await targetsBeforeHints(snap.planDayId, snap.exercises, snap.easyWeek === true);
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
              easyWeek: snap.easyWeek === true,
              // LW-26: a draft saved by an older version may hold a superset of one.
              exercises: tidySupersets(snap.exercises),
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
        startedAt: liveStart(),
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
      persistNow();
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
        easyWeek: easy && planDayId != null,
        exercises,
        lastDeleted: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
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
        easyWeek: easy && planDayId != null,
        exercises,
        lastDeleted: null,
        editingSessionId: null,
        editDateISO: null,
        editNotes: null,
        editEndedAt: null,
        editOriginalDateISO: null,
      });
      persistNow();
    },

    startFromSession: async (session) => {
      const cards = cardOccurrences(session.exercises.map((g) => g.exercise.id));
      const exercises = await Promise.all(
        session.exercises.map((g, i) => {
          const working = g.sets.filter((s) => !s.isWarmup).length;
          return buildDraftExercise(g.exercise, working > 0 ? working : 1, { card: cards[i] });
        }),
      );
      set({
        active: true,
        hydrated: true,
        committing: false,
        startedAt: liveStart(),
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
      persistNow();
    },

    addExercise: async (ex) => {
      // #10: a second Bench added mid-workout is card 1, given now (not from screen order).
      const draftEx = await buildDraftExercise(ex, 1, { card: nextCardNumber(get().exercises, ex.id) });
      // Correcting a past workout: a note carried from a LATER session would be wrong.
      if (get().editingSessionId) delete draftEx.note;
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
      const built = await Promise.all(picked.map((ex, i) => buildDraftExercise(ex, 1, { card: cards[i] })));
      if (get().editingSessionId) for (const d of built) delete d.note;
      mutate((list) => [...list, ...built], true);
    },

    removeExercise: (exKey) => {
      // Kill a pending undo for this exercise (its set list is going away).
      if (get().lastDeleted?.exKey === exKey) set({ lastDeleted: null });
      // LW-26: a partner left alone is no longer a superset.
      mutate((list) => tidySupersets(list.filter((e) => e.key !== exKey)));
    },

    moveExercise: (exKey, dir) => {
      mutate((list) => tidySupersets(moveCard(list, exKey, dir)), true);
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
      // Phase 2 (RT-11): report whether it was kept for next time (it applies to this workout
      // either way), so the picker never claims "Remembered" for a write that failed.
      try {
        await setExerciseRestSec(ex.exerciseId, restSec);
        return true;
      } catch {
        return false;
      }
    },

    toggleDone: (exKey, setKey, fill) => {
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
                doneAt: Date.now(),
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
      if (wasDone && !isDone) useRestTimer.getState().cancelIfStartedBy(exKey, setKey);
      else if (!wasDone && isDone) useRestTimer.getState().noteTick(exKey, setKey);
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
      useRestTimer.getState().noteTick(exKey, setKey); // RT-03: a rest started now belongs to this set
    },

    setLoadMode: (exKey, mode) => {
      const ex = get().exercises.find((e) => e.key === exKey);
      if (!ex) return;
      // Same lift twice in one workout shares the setting, as it will next time. TG-03: PREVIOUS
      // is re-read in the new counting (50 as typed → 25 each), the same physical load; the
      // Target follows through the card's counting (targetStore).
      mutate((list) =>
        list.map((e) =>
          e.exerciseId === ex.exerciseId
            ? {
                ...e,
                loadMode: mode,
                previousSets: e.previousSets.map((p) => ({ ...p, weightKg: convertCounting(p.weightKg, e.loadMode ?? 'one', mode) })),
              }
            : e,
        ),
      );
      void setExerciseLoadMode(ex.exerciseId, mode).catch(() => undefined);
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
        { exactSets: split || get().easyWeek, card: nextCardNumber(others, next.id) },
      );
      if (get().editingSessionId) delete draftEx.note;
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
      if (s.editingSessionId) return null;
      // LW-03: a row that was never ticked is saved only when the member chose "Save them".
      const flat = draftToRichSets(s.exercises, { tickedOnly: opts.keepUnticked !== true });
      // Need at least one working set — a warm-up-only session would be invisible
      // to history/PREVIOUS (the history read excludes warm-ups).
      if (!hasWorkingSet(flat)) return null;
      const title = opts.name?.replace(/\s+/g, ' ').trim().slice(0, 60) || null;
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
            endedAt,
          });
          id = session.id;
          // LW-10: the workout's own name (additive column, tracker schema v9).
          if (title) await getDb().runAsync('UPDATE workout_sessions SET title = ? WHERE id = ?', [title, session.id]);
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
          easyWeek: false,
          exercises: [],
          lastDeleted: null,
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
      persistNow();
    },

    setEditDate: (dateISO) => {
      // A workout can't have happened in the future. Clamped here as well as in the
      // header so a stale draft (device clock moved on) can't carry one through.
      if (!get().editingSessionId || dateISO > todayISO()) return;
      set({ editDateISO: dateISO });
      persistSoon();
    },

    setEditDayType: (dayType) => {
      if (!get().editingSessionId) return;
      set({ dayType });
      persistSoon();
    },

    setEditNotes: (notes) => {
      if (!get().editingSessionId) return;
      set({ editNotes: notes });
      persistSoon();
    },

    setEditDuration: (minutes) => {
      const s = get();
      if (!s.editingSessionId || s.startedAt == null) return;
      const mins = Math.max(1, Math.min(600, Math.round(minutes)));
      set({ editEndedAt: s.startedAt + mins * 60_000 });
      persistSoon();
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
          easyWeek: false,
          exercises: [],
          lastDeleted: null,
          editingSessionId: null,
          editDateISO: null,
          editNotes: null,
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

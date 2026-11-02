/**
 * Balance check and focus block (F52, owner idea R-201, 30 Oct 2026). PURE.
 *
 * After 4 weeks of workouts the Charts page can say "Rear shoulders: 2 sets a week (most muscles
 * get 10)". Tapping it offers ONE swap in the member's own routines: an exercise for a muscle that
 * already gets a lot goes out, the best exercise for the weak muscle comes in (or one of the next
 * two). The swap lasts 8 weeks; then the app asks "keep it, or go back". Going back puts the old
 * exercise back where it was (the old list is kept with the block).
 *
 * Counting is the app's usual one (`setShares`: a working set counts 1 for each main muscle, ½ for
 * each helper), averaged over the 4 weeks, so the numbers match the body map and "Sets per muscle".
 *
 * Calm on purpose (same spirit as `muscleBalance`'s rules against FOMO):
 *  - only muscles with real room to grow: under 4 sets a week while the member's own typical muscle
 *    gets at least 4 more (a member who trains everything lightly sees nothing);
 *  - one muscle at a time, one block at a time; "Not now" keeps that muscle quiet for 4 weeks;
 *  - a swap, never an extra exercise: the workout does not get longer.
 *
 * Not built in v1 (would double the size): the free "pick a focus" mode (more shoulders, less
 * biceps) without a weak muscle found by the app.
 */
import type { DayType } from '@/types/models';

import { CATALOG } from '../catalog/exerciseCatalog';
import { MUSCLE_LABEL, setShares, type Muscle } from '../catalog/muscles';
import type { CatalogEntry } from '../catalog/types';
import { fits, type FitContext } from '../plans/fit';
import { slotChoices, type Level, type SlotId } from '../plans/builder';

/** Weeks of workouts judged. */
export const BALANCE_WEEKS = 4;
/** Fewest strength workouts in those weeks before the check says anything. */
export const MIN_WORKOUTS = 6;
/** A muscle under this many sets a week can be "weak"... */
export const LOW_SETS = 4;
/** ...when the member's typical muscle gets at least this many more. */
export const GAP_SETS = 4;
/** How long a swap lasts before the app asks "keep it or go back". */
export const BLOCK_DAYS = 56;
export const BLOCK_WEEKS = BLOCK_DAYS / 7;
/** "Not now" keeps a muscle quiet this long; going back after a block, this long. */
export const SNOOZE_DAYS = 28;
export const AFTER_BLOCK_DAYS = 56;

/**
 * The muscles judged, top of the body to the bottom. Left out: front shoulders (every press works
 * them), traps, lower back, forearms, inner and outer hips, obliques (trained by the big lifts and
 * rarely a goal of their own), cardio.
 */
export const JUDGED: readonly Muscle[] = [
  'chest',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'biceps',
  'triceps',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];

/** The plan builder's movement slots that train each judged muscle best, best first. */
const MUSCLE_SLOTS: Readonly<Record<Muscle, readonly SlotId[]>> = {
  chest: ['h_push', 'incline_push', 'chest_iso'],
  front_delts: ['v_push'],
  side_delts: ['side_delt'],
  rear_delts: ['rear_delt'],
  lats: ['v_pull'],
  upper_back: ['h_pull'],
  traps: [],
  lower_back: ['back_ext'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: [],
  abs: ['core'],
  obliques: ['core'],
  glutes: ['glute', 'hinge'],
  quads: ['squat', 'quad_iso', 'lunge'],
  hamstrings: ['leg_curl', 'hinge'],
  adductors: [],
  abductors: [],
  calves: ['calves'],
  cardio: [],
};

// ---------------------------------------------------------------- the check

/** Is there enough history to judge (first workout 4+ weeks ago, 6+ strength workouts in them)? */
export function enoughHistory(firstISO: string | null, todayISO: string, workouts: number): boolean {
  if (!firstISO) return false;
  const days = Math.round((Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${firstISO}T00:00:00Z`)) / 86_400_000);
  return days >= BALANCE_WEEKS * 7 && workouts >= MIN_WORKOUTS;
}

/** Sets a week per muscle from the judged weeks' counted sets (each set's `setShares`). */
export function weeklyFromShares(sets: readonly { shares: ReadonlyMap<Muscle, number> }[], weeks = BALANCE_WEEKS): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  const n = Math.max(1, weeks);
  for (const s of sets) for (const [m, share] of s.shares) out.set(m, (out.get(m) ?? 0) + share / n);
  return out;
}

/** The member's typical muscle: the middle of the judged muscles' sets a week, to the whole set. */
export function typicalSets(weekly: ReadonlyMap<Muscle, number>): number {
  const v = JUDGED.map((m) => weekly.get(m) ?? 0).sort((a, b) => a - b);
  const mid = v.length / 2;
  const median = v.length % 2 === 0 ? (v[mid - 1] + v[mid]) / 2 : v[Math.floor(mid)];
  return Math.round(median);
}

export interface WeakSpot {
  muscle: Muscle;
  /** Sets a week, to the whole set. */
  sets: number;
  /** The typical muscle's sets a week. */
  typical: number;
}

/** The one muscle to show (fewest sets first, ties top of the body first), or null. */
export function weakSpot(weekly: ReadonlyMap<Muscle, number>, quiet: ReadonlySet<Muscle> = new Set()): WeakSpot | null {
  const typical = typicalSets(weekly);
  let best: WeakSpot | null = null;
  for (const m of JUDGED) {
    if (quiet.has(m)) continue;
    const raw = weekly.get(m) ?? 0;
    if (raw >= LOW_SETS || typical - raw < GAP_SETS) continue;
    if (!best || raw < (weekly.get(best.muscle) ?? 0) - 1e-9) best = { muscle: m, sets: Math.round(raw), typical };
  }
  return best;
}

// ---------------------------------------------------------------- what to take out

/** Which routine days are a muscle's home (abs fit any training day; a full-body day fits all). */
export function muscleFitsDay(muscle: Muscle, day: DayType): boolean {
  if (day === 'rest') return false;
  if (day === 'full') return true;
  switch (muscle) {
    case 'chest':
    case 'front_delts':
    case 'side_delts':
    case 'triceps':
      return day === 'push' || day === 'upper';
    case 'lats':
    case 'upper_back':
    case 'rear_delts':
    case 'biceps':
    case 'traps':
      return day === 'pull' || day === 'upper';
    case 'quads':
    case 'hamstrings':
    case 'glutes':
    case 'calves':
    case 'adductors':
    case 'abductors':
    case 'lower_back':
      return day === 'legs' || day === 'lower';
    default:
      return true;
  }
}

export interface RoutineRowIn {
  /** The routine row (plan_exercises id). */
  peId: string;
  exerciseId: string;
  name: string;
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  compound: boolean;
  catalogKey: string | null;
}

export interface RoutineIn {
  id: string;
  name: string;
  dayType: DayType;
  /** In the followed folder (the routines the member is doing now). */
  following: boolean;
  rows: readonly RoutineRowIn[];
}

export interface SwapOut {
  routineId: string;
  routineName: string;
  peId: string;
  exerciseId: string;
  name: string;
  /** Where it sits in the routine (0-based), to put it back there later. */
  index: number;
  /** Its busiest main muscle and that muscle's sets a week ("Biceps: 14 sets a week"). */
  heavy: Muscle;
  heavySets: number;
}

/**
 * The exercise to take out for `weak`: one whose every main muscle already gets more than the
 * typical muscle, that does not train the weak muscle at all. Preferred: a routine on the weak
 * muscle's home day, in the followed folder, a single-joint exercise (losing a big lift costs
 * more), the most spare sets. A routine keeps at least 2 exercises. Null when nothing fits. PURE.
 */
export function pickSwapOut(routines: readonly RoutineIn[], weekly: ReadonlyMap<Muscle, number>, typical: number, weak: Muscle): SwapOut | null {
  let best: { score: number; out: SwapOut } | null = null;
  for (const r of routines) {
    if (r.rows.length < 2) continue;
    r.rows.forEach((x, index) => {
      if (x.primary.length === 0 || x.primary.includes('cardio')) return;
      if ((setShares({ primary: [...x.primary], secondary: [...x.secondary] }).get(weak) ?? 0) > 0) return;
      const spare = Math.min(...x.primary.map((m) => (weekly.get(m) ?? 0) - typical));
      if (!(spare > 0)) return;
      const heavy = [...x.primary].sort((a, b) => (weekly.get(b) ?? 0) - (weekly.get(a) ?? 0))[0];
      const score = (muscleFitsDay(weak, r.dayType) ? 1000 : 0) + (r.following ? 100 : 0) + (x.compound ? 0 : 50) + Math.min(spare, 40);
      if (!best || score > best.score) {
        best = {
          score,
          out: {
            routineId: r.id,
            routineName: r.name,
            peId: x.peId,
            exerciseId: x.exerciseId,
            name: x.name,
            index,
            heavy,
            heavySets: Math.round(weekly.get(heavy) ?? 0),
          },
        };
      }
    });
  }
  return best ? (best as { score: number; out: SwapOut }).out : null;
}

// ---------------------------------------------------------------- what to put in

export interface BestPick {
  key: string;
  name: string;
  equipment: CatalogEntry['equipment'];
}

/**
 * The best exercises for a muscle, best first: the plan builder's own preference lists for the
 * muscle's movement slots (for the member's level, kit, sore areas and "never" list), then any
 * library exercise with it as the first main muscle. Never one in `exclude`. PURE.
 */
export function bestFor(muscle: Muscle, level: Level, ctx: FitContext, exclude: readonly string[] = [], max = 3): BestPick[] {
  const out: CatalogEntry[] = [];
  const take = (e: CatalogEntry) => {
    if (out.length >= max || exclude.includes(e.key) || out.some((o) => o.key === e.key)) return;
    if (!e.primary.includes(muscle)) return;
    out.push(e);
  };
  for (const slot of MUSCLE_SLOTS[muscle]) for (const e of slotChoices(slot, level, ctx)) take(e);
  for (const e of CATALOG) {
    if (e.primary[0] === muscle && e.type !== 'distance' && e.type !== 'time_distance' && fits(e, ctx)) take(e);
  }
  return out.map((e) => ({ key: e.key, name: e.name, equipment: e.equipment }));
}

const EQUIPMENT_WORD: Record<CatalogEntry['equipment'], string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Body weight',
  other: 'Other',
};

export function equipmentWord(e: CatalogEntry['equipment']): string {
  return EQUIPMENT_WORD[e];
}

// ---------------------------------------------------------------- the block (saved state)

export interface BalanceBlock {
  muscle: Muscle;
  routineId: string;
  routineName: string;
  /** The routine row that was swapped. */
  peId: string;
  oldExerciseId: string;
  oldName: string;
  /** Where the old exercise sat (0-based) and its sets and reps, to put it back as it was. */
  oldIndex: number;
  oldSets: number;
  oldRepMin: number;
  oldRepMax: number;
  /** The routine's exercise list before the swap (ids, in order). */
  oldList: string[];
  newExerciseId: string;
  newName: string;
  startISO: string;
  endISO: string;
  /** The weak muscle's sets a week when the block started. */
  before: number;
}

export interface BalanceState {
  block: BalanceBlock | null;
  /** Muscle -> the first day it may show again. */
  snoozed: Partial<Record<Muscle, string>>;
}

export const EMPTY_STATE: BalanceState = { block: null, snoozed: {} };

const isMuscle = (m: unknown): m is Muscle => typeof m === 'string' && m in MUSCLE_LABEL;
const isStr = (s: unknown): s is string => typeof s === 'string' && s.length > 0;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function parseBlock(b: unknown): BalanceBlock | null {
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  if (!isMuscle(o.muscle) || !isStr(o.routineId) || !isStr(o.peId) || !isStr(o.oldExerciseId) || !isStr(o.newExerciseId)) return null;
  if (!isStr(o.startISO) || !isStr(o.endISO)) return null;
  return {
    muscle: o.muscle,
    routineId: o.routineId,
    routineName: typeof o.routineName === 'string' ? o.routineName : '',
    peId: o.peId,
    oldExerciseId: o.oldExerciseId,
    oldName: typeof o.oldName === 'string' ? o.oldName : '',
    oldIndex: isNum(o.oldIndex) ? o.oldIndex : 0,
    oldSets: isNum(o.oldSets) ? o.oldSets : 3,
    oldRepMin: isNum(o.oldRepMin) ? o.oldRepMin : 8,
    oldRepMax: isNum(o.oldRepMax) ? o.oldRepMax : 12,
    oldList: Array.isArray(o.oldList) ? o.oldList.filter(isStr) : [],
    newExerciseId: o.newExerciseId,
    newName: typeof o.newName === 'string' ? o.newName : '',
    startISO: o.startISO,
    endISO: o.endISO,
    before: isNum(o.before) ? o.before : 0,
  };
}

/** The saved state from its JSON (anything broken reads as empty, never throws). */
export function parseBalanceState(raw: string | null | undefined): BalanceState {
  if (!raw) return { block: null, snoozed: {} };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const snoozed: Partial<Record<Muscle, string>> = {};
    if (o.snoozed && typeof o.snoozed === 'object') {
      for (const [m, d] of Object.entries(o.snoozed as Record<string, unknown>)) if (isMuscle(m) && isStr(d)) snoozed[m] = d;
    }
    return { block: parseBlock(o.block), snoozed };
  } catch {
    // quiet: a broken saved value just means "no block, nothing snoozed".
    return { block: null, snoozed: {} };
  }
}

/** Muscles that may not show today. */
export function quietMuscles(state: BalanceState, todayISO: string): Set<Muscle> {
  const out = new Set<Muscle>();
  for (const [m, until] of Object.entries(state.snoozed) as [Muscle, string][]) if (until > todayISO) out.add(m);
  return out;
}

export function withSnooze(state: BalanceState, muscle: Muscle, untilISO: string): BalanceState {
  return { ...state, snoozed: { ...state.snoozed, [muscle]: untilISO } };
}

/** Week of the block, 1 to 8. */
export function blockWeek(block: Pick<BalanceBlock, 'startISO'>, todayISO: string): number {
  const days = Math.round((Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${block.startISO}T00:00:00Z`)) / 86_400_000);
  return Math.max(1, Math.min(BLOCK_WEEKS, Math.floor(Math.max(0, days) / 7) + 1));
}

export function blockDue(block: Pick<BalanceBlock, 'endISO'>, todayISO: string): boolean {
  return todayISO >= block.endISO;
}

/**
 * The routine's row order with the put-back row at its old place: `ids` is the order now (the
 * put-back row last, as a new row is added at the end). PURE.
 */
export function restoreOrder(ids: readonly string[], peId: string, index: number): string[] {
  const rest = ids.filter((id) => id !== peId);
  const at = Math.max(0, Math.min(rest.length, Math.round(index)));
  return [...rest.slice(0, at), peId, ...rest.slice(at)];
}

// ---------------------------------------------------------------- words

const lower = (m: Muscle) => MUSCLE_LABEL[m].toLowerCase();
const setsWord = (n: number) => `${n} ${n === 1 ? 'set' : 'sets'}`;

/** "Rear shoulders: 2 sets a week (most muscles get 10)". */
export function weakLine(spot: WeakSpot): string {
  return `${MUSCLE_LABEL[spot.muscle]}: ${setsWord(spot.sets)} a week (most muscles get ${spot.typical})`;
}

/** Sheet title: "Train your rear shoulders more". */
export function sheetTitle(muscle: Muscle): string {
  return `Train your ${lower(muscle)} more`;
}

/** "Your biceps already get 14 sets a week." */
export function heavyLine(out: Pick<SwapOut, 'heavy' | 'heavySets'>): string {
  const m = out.heavy;
  const verb = m === 'chest' || m === 'upper_back' || m === 'lower_back' ? 'gets' : 'get';
  return `Your ${lower(m)} already ${verb} ${setsWord(out.heavySets)} a week.`;
}

/** Card while the block runs: "Rear shoulders: week 3 of 8". */
export function runningTitle(block: Pick<BalanceBlock, 'muscle' | 'startISO'>, todayISO: string): string {
  return `${MUSCLE_LABEL[block.muscle]}: week ${blockWeek(block, todayISO)} of ${BLOCK_WEEKS}`;
}

/** "Face Pull is in Pull day instead of Barbell Curl." */
export function swapLine(block: Pick<BalanceBlock, 'newName' | 'oldName' | 'routineName'>): string {
  return `${block.newName} is in ${block.routineName} instead of ${block.oldName}.`;
}

/** "Your rear shoulders now get 6 sets a week (it was 2)." — null without a whole week of the block yet. */
export function progressLine(muscle: Muscle, now: number | null, before: number): string | null {
  if (now == null) return null;
  const verb = muscle === 'chest' || muscle === 'upper_back' || muscle === 'lower_back' ? 'gets' : 'get';
  return `Your ${lower(muscle)} now ${verb} ${setsWord(Math.round(now))} a week (it was ${before}).`;
}

/** Due card title: "Your 8 weeks of Face Pull are done". */
export function dueTitle(block: Pick<BalanceBlock, 'newName'>): string {
  return `Your ${BLOCK_WEEKS} weeks of ${block.newName} are done`;
}

/** "Keep Face Pull in Pull day, or go back to Barbell Curl?" */
export function dueQuestion(block: Pick<BalanceBlock, 'newName' | 'oldName' | 'routineName'>): string {
  return `Keep ${block.newName} in ${block.routineName}, or go back to ${block.oldName}?`;
}

/**
 * Coach targets — the "Target" line for each exercise of a plan day.
 *
 * Since the progression polish (Oct 2026) every Target the member sees comes from the
 * v2 engine `tracker/engine/progression.ts`, not the frozen `engine/overload.ts`:
 *  - the live workout screen (`getTargetsForPlanDay`), and
 *  - the chat coach's "today's workout" reply and tool (`getTodaysWorkoutWithTargets`),
 *    which take the FROZEN `getTodaysWorkout()` rotation as-is and only swap its targets,
 * so the two can never disagree. A target only exists for exercises in the plan day (the
 * rep range lives there); ad-hoc / Start-Empty exercises get none.
 *
 * Phase 2: the engine is told how each exercise is logged (timed holds, assisted, bodyweight
 * reps…), its caps, and its easier / harder versions with their row in the member's
 * library (so "Switch to …" can open it). Distance work and timed cardio get no Target — the
 * research gives no rule for them; the PREVIOUS column already shows last time. They stay in
 * today's workout (Home, chat) as `free` entries; the workout card shows no line for them.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { todayISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { getExerciseIdsByCatalogKey, getTrackerExercisesByIds, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { getRoutineAnywhere } from '@/tracker/db/folderRepo';
import { getProgressionHistoryMany, getWeightLadders, type LadderWeight } from '@/tracker/db/progressionHistory';
import { convertCounting, getsTarget, repsPerSide, weightIsEach, type LoadMode } from '@/tracker/engine/logTypes';
import { computeProgressionTarget, freeTarget, toEasyTarget, withEffort, type ProgressionTarget, type VersionLink } from '@/tracker/engine/progression';
import { EASY_REASON, easySets } from '@/tracker/plans/easyWeek';
import { effortReason, STALL_RULES } from '@/tracker/plans/effort';
import { getPlanNow, planNowOf } from '@/tracker/services/planState';
import { trainingVersion } from '@/tracker/db/trainingVersion';
import { onWriteFailed, quietSince, writeQueueMark } from '@/db/writeQueue';
import { displayUnits } from '@/lib/units';
import { folderOfRoutine } from '@/tracker/db/folderRepo';
import type { Exercise, PlanExercise, TodaysWorkout, UserProfile } from '@/types/models';

/** Sessions read per lift: 4 for the rules, the rest to learn the weight step. */
const HISTORY_SESSIONS = 12;

type PlanExerciseFull = PlanExercise & { exercise: Exercise };

/**
 * One Target to compute: a routine row's sets and rep range, for the exercise actually on the
 * card (after a swap or "Switch to", TG-06) in the card's counting (TG-03).
 */
interface TargetItem {
  pe: PlanExerciseFull;
  /** The exercise on the card when it differs from the routine row's. */
  exerciseId?: string;
  /** The card's counting; absent = the exercise's saved one. */
  loadMode?: LoadMode;
  /** TG-05: the card's number among the cards of this exercise; its Target reads only that card's sets. */
  card?: number;
}

async function experienceOrDefault(): Promise<UserProfile['experience']> {
  try {
    return (await getProfile()).experience;
  } catch {
    return 'intermediate'; // no profile yet — never the beginner fast lane
  }
}

/** Phase 2 facts per exercise: its type and caps, and its linked versions in this library. */
async function extrasFor(exerciseIds: string[]): Promise<{
  infos: Map<string, TrackerExercise>;
  versionIds: Map<string, string>;
}> {
  const infos = await getTrackerExercisesByIds(exerciseIds).catch(
    () => new Map<string, TrackerExercise>(),
  );
  const keys: string[] = [];
  for (const info of infos.values()) {
    const e = catalogEntry(info.catalogKey);
    if (e?.easier) keys.push(e.easier);
    if (e?.harder) keys.push(e.harder);
  }
  const versionIds = await getExerciseIdsByCatalogKey(keys).catch(() => new Map<string, string>());
  return { infos, versionIds };
}

function link(key: string | undefined, ids: Map<string, string>): VersionLink | null {
  const e = catalogEntry(key);
  return e ? { id: ids.get(e.key) ?? null, name: e.name } : null;
}

/** The ladder (TG-01) in the card's counting; absent when its read failed (the history's own weights are used). */
function ladderIn(rows: readonly LadderWeight[] | undefined, dbMode: LoadMode, cardMode: LoadMode): number[] | undefined {
  return rows?.map((r) => convertCounting(r.weightKg, r.loadMode ?? dbMode, cardMode));
}

/**
 * `includeToday`: the live workout counts a workout finished earlier today (its PREVIOUS
 * column already shows it; the open draft is not saved yet, so it never counts itself).
 * The chat's "today's workout" keeps sessions before today so it stays stable all day.
 */
async function targetsFor(items: TargetItem[], includeToday: boolean): Promise<ProgressionTarget[]> {
  const today = todayISO();
  const ids = items.map((it) => it.exerciseId ?? it.pe.exerciseId);
  // Audit Phase 8: the same Targets asked again with nothing changed (the Workout tab on every
  // visit, a routine started twice) come from memory. They depend on the training data (its
  // version moves with every set, workout, exercise or body-weight change — never a draft),
  // the day, the member's experience and the items themselves.
  // Audit Phase 8 review: a read while a queued write runs (its rows uncommitted, its version
  // possibly rolled back) is worked out for this caller only, never remembered.
  const mark = writeQueueMark();
  const [experience, version] = await Promise.all([experienceOrDefault(), trainingVersion()]);
  // A version below one remembered: that one was a rolled-back write's (or another database's).
  if (version != null && version < targetMemoTop) forgetTargetMemo();
  const key = version == null ? null : memoKey(version, today, includeToday, experience, items, ids);
  const hit = key != null ? targetMemo.get(key) : undefined;
  if (hit) return [...hit];
  const [{ infos, versionIds }, histories, ladders] = await Promise.all([
    extrasFor(ids),
    // One statement for every lift's history (two when some cards read their own sets), and
    // one for every ladder — instead of two per lift.
    getProgressionHistoryMany(
      items.map((it, i) => (it.card != null ? { exerciseId: ids[i], card: it.card } : { exerciseId: ids[i] })),
      HISTORY_SESSIONS + 1,
    ),
    // The ladder is never in the way of a Target: a failed read uses the history's own weights.
    (async () => getWeightLadders(ids))().catch(() => null),
  ]);
  const targets = items.map((it, i): ProgressionTarget => {
    const { pe } = it;
    const id = ids[i];
    const info = infos.get(id);
    // The routine row's exercise, or (swapped in) the card's own (TG-06).
    const exercise: Exercise = id === pe.exerciseId ? pe.exercise : info ?? pe.exercise;
    const logType = info?.logType ?? 'weight_reps';
    const target = { targetSets: pe.targetSets, repRangeMin: pe.repRangeMin, repRangeMax: pe.repRangeMax };
    // Distance work and timed cardio get no Target (the "+5 s" rule is for holds).
    if (!getsTarget(logType, info?.muscles.primary ?? [])) return freeTarget({ exercise, target, logType });
    const entry = catalogEntry(info?.catalogKey);
    // TG-03: every old set is read in the card's counting (50 as typed = 25 each), so a
    // Counting change never doubles or halves the Target. A set with no counting of its own
    // was logged under the exercise's saved one.
    const dbMode: LoadMode = info?.loadMode ?? 'one';
    const mode: LoadMode = it.loadMode ?? dbMode;
    const ladder = ladders ? ladderIn(ladders.get(id), dbMode, mode) : undefined;
    const history = histories[i]
      .filter((h) => (includeToday ? h.dateISO <= today : h.dateISO < today))
      .slice(0, HISTORY_SESSIONS)
      .map((h) => ({
        ...h,
        sets: h.sets.map((x) => ({ ...x, weightKg: convertCounting(x.weightKg, x.loadMode ?? dbMode, mode) })),
      }));
    const t = computeProgressionTarget({
      exercise: { ...exercise, id },
      target,
      history,
      todayISO: today,
      experience,
      logType,
      repCap: entry?.repCap ?? null,
      holdCapSec: entry?.holdCapSec ?? null,
      harder: link(entry?.harder, versionIds),
      easier: link(entry?.easier, versionIds),
      ...(ladder ? { ladder } : {}),
    });
    if (weightIsEach(mode)) t.each = true;
    if (repsPerSide(mode)) t.perSide = true;
    return t;
  });
  if (key != null && version != null && quietSince(mark)) {
    targetMemo.set(key, targets);
    targetMemoTop = Math.max(targetMemoTop, version);
    while (targetMemo.size > TARGET_MEMO_SIZE) targetMemo.delete(targetMemo.keys().next().value as string);
  }
  return [...targets];
}

/** The last few Target computations (Workout tab, Home, the routine being started). */
const TARGET_MEMO_SIZE = 8;
const targetMemo = new Map<string, readonly ProgressionTarget[]>();
/** The highest training version a remembered Target was worked out at. */
let targetMemoTop = -1;

/** Drop the remembered Targets (tests; a failed write). */
export function forgetTargetMemo(): void {
  targetMemo.clear();
  targetMemoTop = -1;
}

// A failed (rolled-back) write: nothing read while it ran is trusted.
onWriteFailed(forgetTargetMemo);

function memoKey(
  version: number,
  today: string,
  includeToday: boolean,
  experience: string,
  items: readonly TargetItem[],
  ids: readonly string[],
): string {
  // Display units shape the ladder's rungs (kg / lb).
  const parts = items.map((it, i) => {
    const { pe } = it;
    return [ids[i], pe.exerciseId, pe.targetSets, pe.repRangeMin, pe.repRangeMax, it.loadMode ?? '', it.card ?? ''].join(':');
  });
  return JSON.stringify([version, today, includeToday, experience, displayUnits(), parts]);
}

/** One card of the live workout, as the Target sees it. */
export interface TargetCard {
  /** The card's key: the result map is keyed by it. */
  key: string;
  exerciseId: string;
  /** TG-06: the routine exercise this card stands in for after a swap / "Switch to". */
  planExerciseId?: string | null;
  /** TG-03: the card's counting (absent = the exercise's saved one). */
  loadMode?: LoadMode;
  /** #10: the card's own number among the workout's cards of its exercise (absent: its place). */
  card?: number;
  /** #2 / #10: the number of the routine card a swapped card stands in for (absent: its place). */
  planCard?: number;
  /** #2: the card this one continues after a swap mid-exercise. */
  splitFrom?: string;
}

async function effortRir(planDayId: string, opts: { easy?: boolean; effort?: boolean }): Promise<number | null> {
  if (!opts.effort || opts.easy) return null;
  const folder = await folderOfRoutine(planDayId).catch(() => null);
  return folder ? planNowOf(folder, todayISO())?.effortRir ?? null : null;
}

/**
 * The live workout's Targets, one per CARD (keyed by card key). A card gets the routine row of
 * its exercise, or (swapped in) of the exercise it replaced. TG-06: "Switch to" and "Swap"
 * keep a Target: the new exercise's own history, else its calm first-time line. A card that
 * is not in the routine (added on the spot) gets none. In an easy week every Target is the
 * easy one; with `effort` this plan week's RPE.
 *
 * TG-05: a routine listing the same lift twice (Bench heavy, then Bench back-off) gives the
 * n-th card of that lift the routine's n-th row of it, and a Target from that card's own sets
 * (cards are stored with their sets since tracker schema v10). A card beyond the routine's rows
 * of that lift (added on the spot) gets none.
 */
export async function getTargetsForCards(
  planDayId: string | null,
  cards: readonly TargetCard[],
  opts: { easy?: boolean; effort?: boolean } = {},
): Promise<Map<string, ProgressionTarget>> {
  const out = new Map<string, ProgressionTarget>();
  if (!planDayId || cards.length === 0) return out;
  const day = await getRoutineAnywhere(planDayId);
  if (!day) return out;
  const keys: string[] = [];
  const items: TargetItem[] = [];
  // Which routine row each card stands for: its lift and that lift's n-th row.
  const byKey = new Map(cards.map((c) => [c.key, c]));
  const rowOf = new Map<string, { rowId: string; rowCard: number }>();
  // Cards without a number (a draft saved before #10) count in screen order, as before.
  const seen = new Map<string, number>();
  const resolve = (c: TargetCard, depth: number): { rowId: string; rowCard: number } => {
    const known = rowOf.get(c.key);
    if (known) return known;
    // #2: a card continuing a card still on screen (a swap after a tick) IS that routine row —
    // never the lift's next row (that stole the back-off's Target, or found none at all).
    const parent = c.splitFrom != null && depth < cards.length ? byKey.get(c.splitFrom) : undefined;
    let r: { rowId: string; rowCard: number };
    if (parent && parent.key !== c.key) {
      r = resolve(parent, depth + 1);
    } else {
      const rowId = c.planExerciseId ?? c.exerciseId;
      const place = seen.get(rowId) ?? 0;
      // #10: the number the card was given (or the routine card it stands in for).
      const rowCard = (c.planExerciseId != null ? c.planCard : c.card) ?? place;
      seen.set(rowId, Math.max(place, rowCard) + 1);
      r = { rowId, rowCard };
    }
    rowOf.set(c.key, r);
    return r;
  };
  for (const c of cards) {
    const { rowId, rowCard } = resolve(c, 0);
    const pe = day.exercises.filter((r) => r.exerciseId === rowId)[rowCard];
    if (!pe) continue;
    keys.push(c.key);
    items.push({
      pe,
      ...(c.exerciseId !== pe.exerciseId ? { exerciseId: c.exerciseId } : {}),
      ...(c.loadMode ? { loadMode: c.loadMode } : {}),
      // The history the Target reads: this card's own sets of the exercise on it.
      card: c.card ?? (c.exerciseId === rowId ? rowCard : 0),
    });
  }
  if (items.length === 0) return out;
  const [targets, rir] = await Promise.all([targetsFor(items, true), effortRir(planDayId, opts)]);
  targets.forEach((t, i) => {
    if (t.free) return; // no line for distance work and timed cardio
    out.set(keys[i], opts.easy ? toEasyTarget(t, EASY_REASON, easySets) : withEffort(t, rir, rir != null ? effortReason(rir) : ''));
  });
  return out;
}

/**
 * Map of `exerciseId -> target` for the exercises of `planDayId`.
 * Empty when there's no plan day (Start-Empty / repeat-a-session / no plan).
 *
 * Phase 4: the routine can sit in any folder (not only the followed plan), and in an easy
 * week of the followed plan every Target becomes the easy one (half the sets, same weight).
 * With `effort` (members who log RPE), a routine of the followed plan also gets this plan
 * week's effort ("· RPE 8").
 */
export async function getTargetsForPlanDay(
  planDayId: string | null,
  opts: { easy?: boolean; effort?: boolean } = {},
): Promise<Map<string, ProgressionTarget>> {
  const out = new Map<string, ProgressionTarget>();
  if (!planDayId) return out;
  const day = await getRoutineAnywhere(planDayId);
  if (!day) return out;
  // A plan day normally lists an exercise once; if twice, keep the first. No line for free ones.
  const seen = new Set<string>();
  const cards = day.exercises
    .filter((pe) => !seen.has(pe.exerciseId) && seen.add(pe.exerciseId))
    .map((pe) => ({ key: pe.exerciseId, exerciseId: pe.exerciseId }));
  return getTargetsForCards(planDayId, cards, opts);
}

/**
 * How many lifts of the followed plan are stalled right now (the Target's stall rules), for
 * the early easy-week offer. 0 with no plan or no plan weeks.
 */
export async function stalledLiftsInPlan(): Promise<number> {
  const now = await getPlanNow().catch(() => null);
  if (!now || now.week == null || now.easy) return 0;
  const active = await getActivePlan();
  if (!active) return 0;
  const seen = new Set<string>();
  const exercises = active.days.flatMap((d) => d.exercises).filter((pe) => !seen.has(pe.exerciseId) && seen.add(pe.exerciseId));
  const targets = await targetsFor(exercises.map((pe) => ({ pe })), true);
  return targets.filter((t) => !t.free && STALL_RULES.has(t.rule)).length;
}

/**
 * The frozen `getTodaysWorkout()` with its targets recomputed by the v2 engine. Phase 4: in
 * an easy week, the easy Targets — Home and the coach say the same as the workout screen.
 */
export async function getTodaysWorkoutWithTargets(): Promise<Omit<TodaysWorkout, 'targets'> & { targets: ProgressionTarget[] }> {
  // Audit Phase 3 / RP-22: the one "Today" answer, without the frozen Targets it used to
  // work out (each exercise's history) only to throw them away here.
  const tw = await getTodaysWorkout(undefined, { targets: false });
  if (!tw.planDayId) return { ...tw, targets: [] };
  const active = await getActivePlan();
  const day = active?.days.find((d) => d.id === tw.planDayId) ?? null;
  if (!day) return { ...tw, targets: [] };
  const [targets, now] = await Promise.all([targetsFor(day.exercises.map((pe) => ({ pe })), false), getPlanNow().catch(() => null)]);
  return { ...tw, targets: now?.easy ? targets.map((t) => toEasyTarget(t, EASY_REASON, easySets)) : targets };
}

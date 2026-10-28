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
 *
 * Oct 2026 (owner): every Target here follows the member's two settings — "Weight jumps" (how
 * far an Up goes) and "Rep range" (review fix: "Match my goal" keeps each row's own range, any
 * other choice sets every row's) — and, when he set up Plates and bars, the gym's bar and plates
 * (every barbell weight is one they can load). They come with the call (the live workout's
 * query) or, for Home, the chat and the stall count, from the saved settings; all of them are in
 * the memo key, so a change never serves an old answer.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getProfile } from '@/db/repos/userRepo';
import { todayISO } from '@/lib/date';
import { getTodaysWorkout } from '@/services/coach';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { getExerciseIdsByCatalogKey, getTrackerExercisesByIds, type TrackerExercise } from '@/tracker/db/exerciseInfo';
import { getRoutineAnywhere } from '@/tracker/db/folderRepo';
import { bodyWeightAnyWorkout, historyScopeOrAll, scopeFor, scopeKey, type HistoryScope } from '@/tracker/db/historyScope';
import { getProgressionHistoryMany, getWeightLadders, type LadderWeight } from '@/tracker/db/progressionHistory';
import { convertCounting, getsTarget, repsPerSide, weightIsEach, type LoadMode } from '@/tracker/engine/logTypes';
import {
  computeProgressionTarget,
  DEFAULT_JUMP,
  freeTarget,
  isWeightJump,
  toEasyTarget,
  withEffort,
  type ProgressionTarget,
  type VersionLink,
  type WeightJump,
} from '@/tracker/engine/progression';
import { isRepRangeChoice, rangeForRow, type RepRangeChoice } from '@/tracker/engine/repRanges';
import { EASY_REASON, easySets } from '@/tracker/plans/easyWeek';
import { effortReason, STALL_RULES } from '@/tracker/plans/effort';
import { getPlanNow, planNowOf } from '@/tracker/services/planState';
import { trainingVersion } from '@/tracker/db/trainingVersion';
import { onWriteFailed, quietSince, writeQueueMark } from '@/db/writeQueue';
import { displayUnits } from '@/lib/units';
import { folderOfRoutine } from '@/tracker/db/folderRepo';
import { gymKey, gymPlatesFor, type GymPlates } from '@/tracker/services/plateMath';
import { usePlateSetup } from '@/tracker/store/plateSetupStore';
import { useTrackerPrefs, type PreviousFrom } from '@/tracker/store/trackerPrefsStore';
import type { KgSet } from '@/tracker/lib/kgTarget';
import type { Exercise, Goal, PlanExercise, TodaysWorkout, UserProfile } from '@/types/models';

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

/** The member's experience and goal (the goal decides which rep range is a row's default). */
async function profileFacts(): Promise<{ experience: UserProfile['experience']; goal: Goal | null }> {
  try {
    const p = await getProfile();
    return { experience: p.experience, goal: p.goal ?? null };
  } catch {
    return { experience: 'intermediate', goal: null }; // no profile yet — never the beginner fast lane
  }
}

/** The settings a Target follows (Oct 2026). */
export interface TargetPrefs {
  jump: WeightJump;
  repRange: RepRangeChoice;
  /**
   * The gym's bar and plates (kg) — only when the member set up Plates and bars (`gymPlatesFor`);
   * null = his own steps from his history, as before (review fix).
   */
  gym: GymPlates | null;
}

/** The saved settings, with any given ones on top. Never throws (a store that cannot be read = the defaults). */
export function targetPrefs(given: Partial<TargetPrefs> = {}): TargetPrefs {
  let jump: WeightJump = DEFAULT_JUMP;
  let repRange: RepRangeChoice = 'goal';
  let gym: GymPlates | null = null;
  try {
    const p = useTrackerPrefs.getState();
    if (isWeightJump(p.weightJump)) jump = p.weightJump;
    if (isRepRangeChoice(p.repRange)) repRange = p.repRange;
  } catch {
    // quiet: an unreadable settings store means the defaults; nothing the member typed is lost
  }
  if (given.gym === undefined) {
    try {
      const u = displayUnits();
      const st = usePlateSetup.getState();
      gym = gymPlatesFor(u === 'imperial' ? st.imperial : st.metric, u);
    } catch (e) {
      console.warn('[ForgeErr] targets: the plates and bars setup could not be read', e);
      gym = null;
    }
  }
  return {
    jump: given.jump && isWeightJump(given.jump) ? given.jump : jump,
    repRange: given.repRange && isRepRangeChoice(given.repRange) ? given.repRange : repRange,
    gym: given.gym !== undefined ? given.gym : gym,
  };
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
 * `scope` ("Previous values"): the history read is only that routine's / folder's workouts
 * (null = every workout).
 */
async function targetsFor(
  items: TargetItem[],
  includeToday: boolean,
  scope: HistoryScope | null,
  prefs: TargetPrefs = targetPrefs(),
  /** R-61 review: each lift's newest day in ANY workout (the break clock under "Same routine"). */
  breakFrom: readonly (string | null)[] | null = null,
): Promise<ProgressionTarget[]> {
  const today = todayISO();
  const ids = items.map((it) => it.exerciseId ?? it.pe.exerciseId);
  // Audit Phase 8: the same Targets asked again with nothing changed (the Workout tab on every
  // visit, a routine started twice) come from memory. They depend on the training data (its
  // version moves with every set, workout, exercise or body-weight change — never a draft),
  // the day, the member's experience, the items themselves and the "Previous values" scope (a
  // remembered answer must never cross a setting change).
  // Audit Phase 8 review: a read while a queued write runs (its rows uncommitted, its version
  // possibly rolled back) is worked out for this caller only, never remembered.
  const mark = writeQueueMark();
  const [{ experience, goal }, version] = await Promise.all([profileFacts(), trainingVersion()]);
  // A version below one remembered: that one was a rolled-back write's (or another database's).
  if (version != null && version < targetMemoTop) forgetTargetMemo();
  // R-136: body-weight moves read every workout while the switch is on (`scopeFor`).
  const allForBodyWeight = bodyWeightAnyWorkout();
  const key =
    version == null ? null : memoKey(version, today, includeToday, experience, items, ids, scope, goal, prefs, breakFrom, scope ? allForBodyWeight : true);
  const hit = key != null ? targetMemo.get(key) : undefined;
  if (hit) return [...hit];
  const extras = extrasFor(ids);
  const requests = items.map((it, i) => (it.card != null ? { exerciseId: ids[i], card: it.card } : { exerciseId: ids[i] }));
  const [{ infos, versionIds }, histories, ladders] = await Promise.all([
    extras,
    // One statement for every lift's history (two when some cards read their own sets), and
    // one for every ladder — instead of two per lift. R-136: under a scope, body-weight moves are
    // read apart, from every workout (how each lift is logged is read first).
    (async () => {
      if (!scope) return getProgressionHistoryMany(requests, HISTORY_SESSIONS + 1, { scope });
      const { infos: known } = await extras;
      const scopes = items.map((it, i) => scopeFor(scope, known.get(ids[i]) ?? (ids[i] === it.pe.exerciseId ? it.pe.exercise : null), allForBodyWeight));
      return historiesByScope(requests, scopes);
    })(),
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
    const row = { repRangeMin: pe.repRangeMin, repRangeMax: pe.repRangeMax };
    // "Rep range": "Match my goal" keeps the row's range; any other choice sets it (never a hold's).
    const range = logType === 'time' ? row : rangeForRow(row, exercise, prefs.repRange);
    const target = { targetSets: pe.targetSets, ...range };
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
      jump: prefs.jump,
      gym: prefs.gym,
      // R-61: a two-dumbbell move (the library's counting) typed as one total.
      pair: (entry?.loadMode === 'both' || entry?.loadMode === 'both_side') && !weightIsEach(mode),
      ...(breakFrom?.[i] ? { breakFromISO: breakFrom[i] } : {}),
    });
    if (weightIsEach(mode)) t.each = true;
    if (repsPerSide(mode)) t.perSide = true;
    // OWNER-INBOX #9: last time's working sets (warm-ups and drops out), so "kg to beat" can say
    // "+6% on last time" before the workout (tracker/lib/kgTarget.ts). Same counting as the Target.
    const lastSession = t.last ? history.find((h) => h.dateISO === t.last?.dateISO) : undefined;
    if (lastSession) {
      (t as KgTarget).lastSets = lastSession.sets
        .filter((x) => (x.setType === 'normal' || x.setType === 'failure') && x.reps > 0)
        .map((x) => ({ weightKg: x.weightKg, reps: x.reps }));
    }
    return t;
  });
  if (key != null && version != null && quietSince(mark)) {
    targetMemo.set(key, targets);
    targetMemoTop = Math.max(targetMemoTop, version);
    while (targetMemo.size > TARGET_MEMO_SIZE) targetMemo.delete(targetMemo.keys().next().value as string);
  }
  return [...targets];
}

/**
 * R-136: `getProgressionHistoryMany` with a scope per request — one read per distinct scope (the
 * workout's, and every workout for body-weight moves), answers back in request order.
 */
async function historiesByScope(
  requests: readonly { exerciseId: string; card?: number }[],
  scopes: readonly (HistoryScope | null)[],
): Promise<Awaited<ReturnType<typeof getProgressionHistoryMany>>> {
  const groups = new Map<string, { scope: HistoryScope | null; at: number[] }>();
  scopes.forEach((s, i) => {
    const k = s ? `s${scopeKey(s)}` : 'all';
    const g = groups.get(k);
    if (g) g.at.push(i);
    else groups.set(k, { scope: s, at: [i] });
  });
  const out: Awaited<ReturnType<typeof getProgressionHistoryMany>> = requests.map(() => []);
  await Promise.all(
    [...groups.values()].map(async (g) => {
      const rows = await getProgressionHistoryMany(
        g.at.map((i) => requests[i]),
        HISTORY_SESSIONS + 1,
        { scope: g.scope },
      );
      g.at.forEach((i, j) => {
        out[i] = rows[j];
      });
    }),
  );
  return out;
}

/** A Target with last time's working sets (OWNER-INBOX #9, "kg to beat"); the engine's type is unchanged. */
export type KgTarget = ProgressionTarget & { lastSets?: KgSet[] };

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
  scope: HistoryScope | null,
  goal: Goal | null,
  prefs: TargetPrefs,
  breakFrom: readonly (string | null)[] | null = null,
  allForBodyWeight = true,
): string {
  // Display units shape the ladder's rungs (kg / lb).
  const parts = items.map((it, i) => {
    const { pe } = it;
    return [ids[i], pe.exerciseId, pe.targetSets, pe.repRangeMin, pe.repRangeMax, it.loadMode ?? '', it.card ?? ''].join(':');
  });
  // The member's goal (a row's default range), the two settings and the gym's plates (Oct 2026).
  return JSON.stringify([
    version,
    today,
    includeToday,
    experience,
    goal ?? '',
    prefs.jump,
    prefs.repRange,
    gymKey(prefs.gym),
    displayUnits(),
    scopeKey(scope),
    allForBodyWeight,
    parts,
    breakFrom ?? '',
  ]);
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
 *
 * "Previous values": the Targets read the history of this routine's scope (`previousFrom`;
 * absent = the member's setting now).
 */
export async function getTargetsForCards(
  planDayId: string | null,
  cards: readonly TargetCard[],
  opts: { easy?: boolean; effort?: boolean; previousFrom?: PreviousFrom } & Partial<TargetPrefs> = {},
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
  const scope = await historyScopeOrAll(planDayId, opts.previousFrom);
  const prefs = targetPrefs({ jump: opts.jump, repRange: opts.repRange, gym: opts.gym });
  const [targets, rir] = await Promise.all([scopedTargets(items, true, scope, prefs), effortRir(planDayId, opts)]);
  targets.forEach((t, i) => {
    if (t.free) return; // no line for distance work and timed cardio
    out.set(keys[i], opts.easy ? toEasyTarget(t, EASY_REASON, easySets) : withEffort(t, rir, rir != null ? effortReason(rir) : ''));
  });
  return out;
}

/**
 * The Targets of a routine's workout, from the SAME workouts its PREVIOUS column shows.
 *
 * R-138 (owner, 27 Oct 2026: the "kg to beat" read a different last time than PREVIOUS): under
 * "Any workout" (no scope) the Target used to read the routine's OWN last time first (16 Oct audit
 * C3-3, kept by R-61 for a folder's heavy and light days) while PREVIOUS read the newest workout
 * anywhere. Push 1 and Push 2 of one folder then disagreed on one card: PREVIOUS 20 Oct Push 1
 * (19, 16, 15, 14), the Target 13 Oct Push 2 (19, 15, 15, 14), and a "kg to beat" equal to what
 * PREVIOUS already showed. Now "Any workout" reads every workout for both, and "Same routine" keeps
 * both on the routine's own workouts (the choice for separate heavy and light days).
 *
 * R-61 (kept): under "Same routine" a break is a break from the LIFT — its break clock counts from
 * the newest day anywhere (`breakFromISO`), while its weights stay this routine's own, as PREVIOUS
 * and the grey hints show them.
 */
async function scopedTargets(
  items: TargetItem[],
  includeToday: boolean,
  scope: HistoryScope | null,
  prefs: TargetPrefs = targetPrefs(),
): Promise<ProgressionTarget[]> {
  if (scope == null) return targetsFor(items, includeToday, null, prefs);
  return targetsFor(items, includeToday, scope, prefs, await newestAnywhere(items, includeToday));
}

/** R-61 review: each lift's newest day in any workout (null when none, or the read failed). */
async function newestAnywhere(items: readonly TargetItem[], includeToday: boolean): Promise<(string | null)[]> {
  const today = todayISO();
  try {
    const rows = await getProgressionHistoryMany(
      items.map((it) => ({ exerciseId: it.exerciseId ?? it.pe.exerciseId })),
      // Review: a lift done twice today must still find the day before.
      6,
      { scope: null },
    );
    return rows.map((h) => h.find((s) => (includeToday ? s.dateISO <= today : s.dateISO < today))?.dateISO ?? null);
  } catch (e) {
    console.warn('[ForgeErr] targets: the newest workout of each lift could not be read', e);
    return items.map(() => null);
  }
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
  opts: { easy?: boolean; effort?: boolean; previousFrom?: PreviousFrom } & Partial<TargetPrefs> = {},
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
  // Every workout: the stall count is about the plan as a whole, not one routine's history.
  const targets = await targetsFor(exercises.map((pe) => ({ pe })), true, null);
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
  // Redesign review fix: Up next can come from a folder that is NOT followed (the routine after
  // the last one done), so the routine is read wherever it lives — not only from the followed plan,
  // which left "See exercises" with no exercises and no Start.
  const active = await getActivePlan();
  const day = active?.days.find((d) => d.id === tw.planDayId) ?? (await getRoutineAnywhere(tw.planDayId).catch(() => null));
  if (!day) return { ...tw, targets: [] };
  // "Previous values": the Up next routine's scope, as the workout it starts will read.
  const scope = await historyScopeOrAll(day.id);
  // 16 Oct 2026 audit (C3-11): a lift listed twice (heavy, then back-off) — each row reads its own
  // card of last time, as the workout screen does (both rows said the heavy weight here).
  const seen = new Map<string, number>();
  const items = day.exercises.map((pe) => {
    const card = seen.get(pe.exerciseId) ?? 0;
    seen.set(pe.exerciseId, card + 1);
    return { pe, card };
  });
  const [targets, now, rir] = await Promise.all([
    scopedTargets(items, false, scope),
    getPlanNow().catch(() => null),
    // C3-11: this plan week's effort for members who log RPE, as on the workout screen.
    effortRir(day.id, { effort: useTrackerPrefs.getState().advancedSets }).catch((e: unknown) => {
      console.warn('[ForgeErr] today: the plan week effort could not be read', e);
      return null;
    }),
  ]);
  return {
    ...tw,
    targets: now?.easy
      ? targets.map((t) => toEasyTarget(t, EASY_REASON, easySets))
      : targets.map((t) => withEffort(t, rir, rir != null ? effortReason(rir) : '')),
  };
}

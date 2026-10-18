/**
 * Workout plans from the gym or trainer (18 Oct 2026, OWNER-INBOX #6). PURE.
 *
 * A plan is routines the gym sends to members; the member's ForgeAI app shows them "From <gym> ·
 * <trainer>" after the member has checked in at the gym once. The routines are the member app's
 * routine-file shape (apps/mobile/src/tracker/plans/routineFile.ts), so the phone imports them with
 * the code it already has.
 *
 * `workoutPlanProblem` makes the same checks as the server (`_workout_plan_ok` in
 * supabase/migrations/0024_workout_plans.sql, plus crm_push's 20 KB cap), in words a trainer reads,
 * so a plan is never refused as "INVALID" after Save. The number limits (sets, reps, rest) are the
 * builder's own: well inside what the phone accepts, and what a real plan needs.
 *
 * Starting numbers (18 Oct 2026): a trainer may give each exercise a starting weight (or, for a
 * timed hold, a time). It is saved as the routine file's `setList`, one normal set per working
 * set, which the phone reads as each set's target (routineSets.ts `PlanSet`). The phone fills a
 * set's boxes from it only while the member has no numbers of their own for that exercise
 * (activeWorkoutStore.ts `fillForSet`), so after the first workout their own progress leads.
 * For a 'weighted' exercise (weighted pull-up, dip belt) the kg is the weight ADDED to body weight,
 * as the phone logs it (logTypes.ts: "+KG x REPS").
 *
 * Ready plans: the member app's gym programs (programTemplates.json, generated from
 * apps/mobile/src/tracker/plans/programs.ts by its test), so a trainer can start from one.
 */

import { catalogExercise, EXERCISE_CATALOG, type CatalogExercise } from './exerciseCatalog';
import READY_PLAN_FILE from './programTemplates.json';
import { countOf } from './plural';
import type { DateISO } from './dates';
import type {
  Membership,
  Plan,
  WorkoutDayType,
  WorkoutExercise,
  WorkoutLogType,
  WorkoutPlan,
  WorkoutPlanDraft,
  WorkoutRoutine,
  WorkoutSet,
} from '../types';

/** The server's limits (0024 `_workout_plan_ok`). */
export const WP_NAME_MAX = 80;
export const WP_MAX_ROUTINES = 14;
export const WP_MAX_EXERCISES = 30;
export const WP_MAX_MEMBERS = 2000;
export const WP_MAX_PLANS = 100;
/** crm_push refuses a record bigger than this (bytes of its JSON). */
export const WP_MAX_BYTES = 20_000;
/** The member app keeps this much of an exercise's note. */
export const WP_NOTE_MAX = 500;
/** The plan's own note (shown at the top of the plan on the phone). */
export const WP_PLAN_NOTE_MAX = 500;
/** The builder's number limits. */
export const WP_MAX_SETS = 20;
export const WP_MAX_REPS = 100;
export const WP_MAX_REST_SEC = 600;
/** A starting weight, in kg (for a 'weighted' exercise: the kg added to body weight). */
export const WP_MIN_KG = 0.5;
export const WP_MAX_KG = 500;
/** A timed hold's starting time, in seconds. */
export const WP_MIN_HOLD_SEC = 5;
export const WP_MAX_HOLD_SEC = 600;

export const LOG_TYPES: readonly WorkoutLogType[] = ['weight_reps', 'reps', 'weighted', 'assisted', 'time'];
const SET_TYPES: readonly WorkoutSet['type'][] = ['warmup', 'normal', 'drop', 'failure'];

export const DAY_TYPES: readonly WorkoutDayType[] = ['full', 'push', 'pull', 'legs', 'upper', 'lower'];

const DAY_LABEL: Record<WorkoutDayType, string> = {
  full: 'Full body',
  push: 'Push (chest, shoulders, triceps)',
  pull: 'Pull (back, biceps)',
  legs: 'Legs',
  upper: 'Upper body',
  lower: 'Lower body',
};

export function dayTypeLabel(t: WorkoutDayType): string {
  return DAY_LABEL[t] ?? 'Full body';
}

export function dayTypeOptions(): { value: WorkoutDayType; label: string }[] {
  return DAY_TYPES.map((t) => ({ value: t, label: dayTypeLabel(t) }));
}

// ---------------------------------------------------------------- building

/** A new routine for the builder: "Day 2", full body, no exercises yet. */
export function emptyRoutine(index: number): WorkoutRoutine {
  return { name: `Day ${index + 1}`, dayType: 'full', exercises: [] };
}

/** A new plan for the builder, sent to these members (Member detail's "Send a plan"). */
export function emptyWorkoutDraft(memberIds: readonly string[] = []): WorkoutPlanDraft {
  return { name: '', note: null, routines: [emptyRoutine(0)], assign: { memberIds: [...memberIds], planIds: [] } };
}

/** A saved plan, ready to edit (a deep copy: the builder never changes the snapshot). */
export function draftOf(plan: WorkoutPlan): WorkoutPlanDraft {
  return JSON.parse(
    JSON.stringify({ id: plan.id, name: plan.name, note: plan.note, routines: plan.routines, assign: plan.assign, baseUpdatedAt: plan.updatedAt }),
  ) as WorkoutPlanDraft;
}

/** A library exercise with the usual starting numbers: 3 sets of 8-12, logged the library's way. */
export function exerciseFromCatalog(e: CatalogExercise): WorkoutExercise {
  return {
    name: e.name,
    catalogKey: e.key,
    logType: e.logType,
    sets: 3,
    repMin: 8,
    repMax: 12,
    primary: [...e.primary],
    restSec: null,
    note: null,
  };
}

/** An exercise that is not in the list, typed by hand (the phone makes it as a new exercise). */
export function customExercise(name: string): WorkoutExercise {
  return {
    name: name.replace(/\s+/g, ' ').trim().slice(0, WP_NAME_MAX),
    catalogKey: null,
    logType: 'weight_reps',
    sets: 3,
    repMin: 8,
    repMax: 12,
    primary: [],
    restSec: null,
    note: null,
  };
}

// ---------------------------------------------------------------- starting numbers

/**
 * What the exercise's "start" box holds: kg ('weight_reps'), kg added to body weight ('weighted'),
 * seconds ('time'), or nothing (reps only, or a machine that helps: the member finds their own).
 */
export function startKind(t: WorkoutLogType): 'kg' | 'addedKg' | 'seconds' | null {
  if (t === 'weight_reps') return 'kg';
  if (t === 'weighted') return 'addedKg';
  if (t === 'time') return 'seconds';
  return null;
}

/** The starting weight (or time) the exercise's sets carry, or null. A mistyped box reads as NaN. */
export function startOf(e: Pick<WorkoutExercise, 'logType' | 'setList'>): number | null {
  const kind = startKind(e.logType);
  if (!kind || !Array.isArray(e.setList)) return null;
  const first = e.setList.find((s) => s && (s.type === 'normal' || s.type === 'failure'));
  const v = kind === 'seconds' ? first?.durationSec : first?.weightKg;
  return typeof v === 'number' ? v : null;
}

/**
 * The sets the phone gets for a starting weight (or time): one normal set per working set, each
 * with the lowest reps of the range and the weight ({reps, weightKg}), or for a timed hold the time
 * ({durationSec}). Null when there is no start (the phone then reads plain "N sets"). Sets not yet
 * typed count as 1, so a weight typed first is kept (Save checks the sets anyway).
 */
export function buildSetList(logType: WorkoutLogType, sets: number, repMin: number, start: number | null): WorkoutSet[] | null {
  const kind = startKind(logType);
  if (!kind || start === null) return null;
  const n = wholeIn(sets, 1, WP_MAX_SETS) ? sets : 1;
  const one: WorkoutSet =
    kind === 'seconds'
      ? { type: 'normal', durationSec: start }
      : { type: 'normal', ...(wholeIn(repMin, 1, WP_MAX_REPS) ? { reps: repMin } : {}), weightKg: start };
  return Array.from({ length: n }, () => ({ ...one }));
}

/** The exercise with this starting weight (or time); null takes it off. */
export function withStart(e: WorkoutExercise, start: number | null): WorkoutExercise {
  const setList = buildSetList(e.logType, e.sets, e.repMin, start);
  const { setList: _old, ...rest } = e;
  return setList ? { ...rest, setList } : rest;
}

/** A kg typed to the hundredth at most (the phone keeps 2 decimals). NaN stays NaN (Save says so). */
const roundKg = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? v : Math.round(v * 100) / 100);

// ---------------------------------------------------------------- copies

/** "Push day (copy)", kept inside the name limit. */
export function copyName(name: string): string {
  const tail = ' (copy)';
  // Review fix: a copy of a copy is "Push (copy)", never "Push (copy) (copy)".
  const base = name.replace(/\s+/g, ' ').trim().replace(/(\s*\(copy\))+$/i, '') || 'Day';
  return `${base.slice(0, WP_NAME_MAX - tail.length).trim()}${tail}`;
}

/** A new plan made from this one: same days and exercises, "<name> (copy)", sent to nobody yet. */
export function copyOfPlan(plan: WorkoutPlan): WorkoutPlanDraft {
  const d = draftOf(plan);
  return { name: copyName(plan.name), note: d.note, routines: d.routines, assign: { memberIds: [], planIds: [] } };
}

/** The same day again ("Push (copy)"), to change a little (a deep copy). */
export function copyRoutine(r: WorkoutRoutine): WorkoutRoutine {
  const c = JSON.parse(JSON.stringify(r)) as WorkoutRoutine;
  return { ...c, name: copyName(r.name) };
}

// ---------------------------------------------------------------- ready plans

export interface ReadyPlan {
  key: string;
  name: string;
  /** "Beginner · 3 days a week". */
  meta: string;
  summary: string;
  routines: { name: string; dayType: WorkoutDayType; exercises: { key: string; sets: number; repMin: number; repMax: number }[] }[];
}

/** The member app's gym programs, ready to start a plan from. */
export const READY_PLANS: readonly ReadyPlan[] = READY_PLAN_FILE as ReadyPlan[];

/**
 * A new plan filled from a ready plan: its days, and each exercise from the list (name, muscles,
 * how it is logged) with the ready plan's sets and rep range. No weights yet: the trainer may type
 * them. A key not in the list is left out with a log line (the parity test keeps that from happening).
 */
export function draftFromReadyPlan(t: ReadyPlan, memberIds: readonly string[] = []): WorkoutPlanDraft {
  return {
    name: t.name,
    note: null,
    routines: t.routines.map((r) => ({
      name: r.name,
      dayType: DAY_TYPES.includes(r.dayType) ? r.dayType : 'full',
      exercises: r.exercises.flatMap((x) => {
        const c = catalogExercise(x.key);
        if (!c) {
          console.warn('[ForgeErr] ready plan: exercise not in the list, left out', t.key, x.key);
          return [];
        }
        return [{ ...exerciseFromCatalog(c), sets: x.sets, repMin: x.repMin, repMax: x.repMax }];
      }),
    })),
    assign: { memberIds: [...memberIds], planIds: [] },
  };
}

// ---------------------------------------------------------------- sending to one member

/**
 * The plan with this member added (Member detail's one-tap "Send"). An edit of the saved plan
 * (its `baseUpdatedAt`), so a change another desk made meanwhile is refused, never dropped.
 */
export function withMember(plan: WorkoutPlan, memberId: string): WorkoutPlanDraft {
  const d = draftOf(plan);
  return { ...d, assign: { ...d.assign, memberIds: [...new Set([...d.assign.memberIds, memberId])] } };
}

/** The plan with this member taken off again (the Undo after a one-tap send). */
export function withoutMember(plan: WorkoutPlan, memberId: string): WorkoutPlanDraft {
  const d = draftOf(plan);
  return { ...d, assign: { ...d.assign, memberIds: d.assign.memberIds.filter((id) => id !== memberId) } };
}

/**
 * The gym's open plans for Member detail's "Send a plan", each marked when the member already gets
 * it (by name, or through a membership plan they have today: then there is nothing to send).
 */
export function sendChoices(
  list: readonly WorkoutPlan[],
  memberId: string,
  memberships: readonly Pick<Membership, 'memberId' | 'planId' | 'startsOn' | 'endsOn' | 'cancelled'>[],
  today: DateISO,
): { plan: WorkoutPlan; already: boolean }[] {
  const gets = new Set(plansForMember(list, memberId, memberships, today).map((p) => p.id));
  return splitPlans(list).open.map((plan) => ({ plan, already: gets.has(plan.id) }));
}

/** The list with item `index` moved `by` places (-1 up, +1 down). Out of range: unchanged. */
export function moveItem<T>(list: readonly T[], index: number, by: number): T[] {
  const to = index + by;
  const out = [...list];
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return out;
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item);
  return out;
}

/** Names tidied, blank notes made null, ids not repeated: what Save sends. */
export function cleanDraft(d: WorkoutPlanDraft): WorkoutPlanDraft {
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
  const noteOf = (s: string | null | undefined, max: number) => {
    const t = (s ?? '').trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    ...(d.id ? { id: d.id } : {}),
    name: tidy(d.name),
    note: noteOf(d.note, WP_PLAN_NOTE_MAX),
    routines: d.routines.map((r) => ({
      name: tidy(r.name),
      dayType: DAY_TYPES.includes(r.dayType) ? r.dayType : 'full',
      exercises: r.exercises.map((e) => {
        const catalogKey = e.catalogKey || null;
        // A library exercise is logged the library's way (a plan saved before 18 Oct had every
        // exercise as weight and reps); one typed by hand is weight and reps.
        const logType = catalogExercise(catalogKey)?.logType ?? (LOG_TYPES.includes(e.logType) ? e.logType : 'weight_reps');
        // The sets are made again from the start box, so they match the sets and reps typed last.
        // A start of another kind (kg on what is now a timed hold) is dropped.
        const start = startKind(e.logType) === startKind(logType) ? roundKg(startOf(e)) : null;
        const setList = buildSetList(logType, e.sets, e.repMin, start);
        return {
          name: tidy(e.name),
          catalogKey,
          logType,
          ...(setList ? { setList } : {}),
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          primary: [...e.primary],
          restSec: e.restSec ?? null,
          note: noteOf(e.note, WP_NOTE_MAX),
        };
      }),
    })),
    assign: { memberIds: [...new Set(d.assign.memberIds)], planIds: [...new Set(d.assign.planIds)] },
  };
}

// ---------------------------------------------------------------- checking

const lengthOk = (s: unknown, max: number): boolean =>
  typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= max;
const wholeIn = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

/**
 * Bytes of the record as the server measures it: `octet_length(jsonb::text)`, UTF-8. Postgres
 * writes jsonb with a space after every `:` and `,`, about 10% more than JSON.stringify (review
 * fix: a plan the panel passed was refused as INVALID, and blocked putting a gym online).
 */
export function recordBytes(record: unknown): number {
  const json = JSON.stringify(record) ?? '';
  let extra = 0;
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === ':' || c === ',') extra += 1;
  }
  return new TextEncoder().encode(json).length + extra;
}

/** What is wrong with an exercise's starting numbers, in plain words; null when nothing is. */
function setListProblem(e: WorkoutExercise, what: string): string | null {
  if (e.setList === null || e.setList === undefined) return null;
  const damaged = `${what} looks damaged. Remove it and add it again.`;
  if (!Array.isArray(e.setList) || e.setList.length === 0 || e.setList.length > WP_MAX_SETS * 3) return damaged;
  const kgWord = e.logType === 'weighted' ? 'added weight' : 'starting weight';
  for (const s of e.setList) {
    if (!s || typeof s !== 'object' || !SET_TYPES.includes(s.type)) return damaged;
    if (s.weightKg !== null && s.weightKg !== undefined) {
      const kg = s.weightKg;
      if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < WP_MIN_KG || kg > WP_MAX_KG) {
        return `${what}: the ${kgWord} must be from ${WP_MIN_KG} to ${WP_MAX_KG} kg.`;
      }
    }
    if (s.durationSec !== null && s.durationSec !== undefined && !wholeIn(s.durationSec, WP_MIN_HOLD_SEC, WP_MAX_HOLD_SEC)) {
      return `${what}: seconds must be a whole number from ${WP_MIN_HOLD_SEC} to ${WP_MAX_HOLD_SEC}.`;
    }
    if (s.reps !== null && s.reps !== undefined && !wholeIn(s.reps, 1, WP_MAX_REPS)) {
      return `${what}: reps must be whole numbers from 1 to ${WP_MAX_REPS}.`;
    }
  }
  return null;
}

/**
 * Why this plan cannot be saved, in plain words; null when it can. The same outline the server
 * checks, plus sane numbers. `record` (optional): the whole row as it will be saved, for the size cap.
 */
export function workoutPlanProblem(d: WorkoutPlanDraft, record?: unknown): string | null {
  if (!lengthOk(d.name, WP_NAME_MAX)) {
    return d.name.trim() ? `Keep the plan name to ${WP_NAME_MAX} letters.` : 'Give the plan a name.';
  }
  if (d.note !== null && typeof d.note !== 'string') return 'The plan note looks wrong. Type it again.';
  if (d.routines.length === 0) return 'Add at least one day to the plan.';
  if (d.routines.length > WP_MAX_ROUTINES) return `A plan can have at most ${WP_MAX_ROUTINES} days.`;
  for (const [i, r] of d.routines.entries()) {
    const day = r.name.trim() || `Day ${i + 1}`;
    if (!lengthOk(r.name, WP_NAME_MAX)) {
      return r.name.trim() ? `Keep the name of ${day} to ${WP_NAME_MAX} letters.` : `Give day ${i + 1} a name.`;
    }
    if (!DAY_TYPES.includes(r.dayType)) return `Pick what kind of day ${day} is.`;
    if (r.exercises.length === 0) return `Add at least one exercise to ${day}.`;
    if (r.exercises.length > WP_MAX_EXERCISES) return `${day} can have at most ${WP_MAX_EXERCISES} exercises.`;
    for (const e of r.exercises) {
      const what = `${e.name.trim() || 'An exercise'} (${day})`;
      if (!lengthOk(e.name, WP_NAME_MAX)) {
        return e.name.trim() ? `Keep the name of ${what} to ${WP_NAME_MAX} letters.` : `An exercise in ${day} has no name.`;
      }
      // The phone uses a key only of this shape (routineFile.ts); the server takes 1-64 letters.
      if (e.catalogKey !== null && !(typeof e.catalogKey === 'string' && /^[a-z0-9_]{1,60}$/.test(e.catalogKey))) {
        return `${what} looks damaged. Remove it and add it again.`;
      }
      // Release review: the phone can only make an exercise typed by hand when it knows its main
      // muscle (plansService resolveSharedRoutines), else it was left out of the member's routine.
      if (e.catalogKey === null && e.primary.length === 0) return `Pick the main muscle for ${what}.`;
      if (!wholeIn(e.sets, 1, WP_MAX_SETS)) return `${what}: sets must be a whole number from 1 to ${WP_MAX_SETS}.`;
      if (!wholeIn(e.repMin, 1, WP_MAX_REPS) || !wholeIn(e.repMax, 1, WP_MAX_REPS)) {
        return `${what}: reps must be whole numbers from 1 to ${WP_MAX_REPS}.`;
      }
      if (e.repMin > e.repMax) return `${what}: the lowest reps can’t be more than the highest.`;
      if (!LOG_TYPES.includes(e.logType)) return `${what} looks damaged. Remove it and add it again.`;
      const setProblem = setListProblem(e, what);
      if (setProblem) return setProblem;
      if (e.restSec !== null && e.restSec !== undefined && !wholeIn(e.restSec, 0, WP_MAX_REST_SEC)) {
        return `${what}: rest must be from 0 to ${WP_MAX_REST_SEC} seconds.`;
      }
      if (typeof e.note === 'string' && e.note.trim().length > WP_NOTE_MAX) {
        return `${what}: keep the note to ${WP_NOTE_MAX} letters.`;
      }
    }
  }
  const { memberIds, planIds } = d.assign;
  if (memberIds.length > WP_MAX_MEMBERS) return `A plan can go to at most ${WP_MAX_MEMBERS} members by name. Send it to a membership plan instead.`;
  if (planIds.length > WP_MAX_PLANS) return `A plan can go to at most ${WP_MAX_PLANS} membership plans.`;
  if ([...memberIds, ...planIds].some((id) => !lengthOk(id, 64))) return 'Someone in “Send to” looks damaged. Untick them and tick them again.';
  if (recordBytes(record ?? d) >= WP_MAX_BYTES) {
    return 'This plan is too big to send. Split it into two plans, or shorten the notes.';
  }
  return null;
}

// ---------------------------------------------------------------- reading

/** "Sent to 3 members · Gold plan"; "Not sent to anyone yet". Plans no longer in the gym are left out. */
export function assignSummary(plan: Pick<WorkoutPlan, 'assign'>, plans: readonly Pick<Plan, 'id' | 'name'>[]): string {
  const parts: string[] = [];
  const n = new Set(plan.assign.memberIds).size;
  if (n > 0) parts.push(countOf(n, 'member'));
  const names = plan.assign.planIds
    .map((id) => plans.find((p) => p.id === id)?.name.trim())
    .filter((s): s is string => Boolean(s));
  if (names.length > 0) {
    const joined = names.join(', ');
    parts.push(/\bplans?$/i.test(joined) ? joined : `${joined} ${names.length === 1 ? 'plan' : 'plans'}`);
  }
  return parts.length ? `Sent to ${parts.join(' · ')}` : 'Not sent to anyone yet';
}

/** "3 days · 18 exercises". */
export function planSizeWords(plan: { routines: readonly { exercises: readonly unknown[] }[] }): string {
  const exercises = plan.routines.reduce((n, r) => n + r.exercises.length, 0);
  return `${countOf(plan.routines.length, 'day')} · ${countOf(exercises, 'exercise')}`;
}

/** Open plans first, newest change first; withdrawn ones separately. */
export function splitPlans(list: readonly WorkoutPlan[]): { open: WorkoutPlan[]; withdrawn: WorkoutPlan[] } {
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
  return { open: sorted.filter((p) => !p.withdrawn), withdrawn: sorted.filter((p) => p.withdrawn) };
}

/**
 * The plans this member gets (not withdrawn): sent to them by name, or to a membership plan they
 * have on `today`, exactly as the server picks them (member_gym_plans in 0024).
 */
export function plansForMember(
  list: readonly WorkoutPlan[],
  memberId: string,
  memberships: readonly Pick<Membership, 'memberId' | 'planId' | 'startsOn' | 'endsOn' | 'cancelled'>[],
  today: DateISO,
): WorkoutPlan[] {
  const mine = new Set(
    memberships
      .filter((m) => m.memberId === memberId && !m.cancelled && m.startsOn <= today && m.endsOn >= today)
      .map((m) => m.planId),
  );
  return splitPlans(list).open.filter(
    (p) => p.assign.memberIds.includes(memberId) || p.assign.planIds.some((id) => mine.has(id)),
  );
}

// ---------------------------------------------------------------- exercise search

/** Lower case, punctuation as spaces (Devanagari vowel signs kept: they are part of the word). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

const SEARCH_INDEX = EXERCISE_CATALOG.map((e) => ({ e, name: norm(e.name), aliases: e.aliases.map(norm) }));

/**
 * The library exercises that match what the trainer typed: the name or any other name ("chhati
 * press", "dole", "बैठक"), any case, every word typed found. Best first: a name that starts with it,
 * then an exact other name, then the rest in list order. Nothing typed: the whole list.
 */
export function searchExercises(query: string, limit = 12): CatalogExercise[] {
  const q = norm(query);
  if (!q) return EXERCISE_CATALOG.slice(0, limit);
  const words = q.split(' ');
  const scored: { e: CatalogExercise; score: number; i: number }[] = [];
  SEARCH_INDEX.forEach(({ e, name, aliases }, i) => {
    const texts = [name, ...aliases];
    if (!texts.some((t) => words.every((w) => t.includes(w)))) return;
    let score = 4;
    if (name === q) score = 0;
    else if (aliases.includes(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (aliases.some((a) => a.startsWith(q))) score = 3;
    scored.push({ e, score, i });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.e);
}

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
 */

import { EXERCISE_CATALOG, type CatalogExercise } from './exerciseCatalog';
import { countOf } from './plural';
import type { DateISO } from './dates';
import type {
  Membership,
  Plan,
  WorkoutDayType,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutPlanDraft,
  WorkoutRoutine,
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

/** A library exercise with the usual starting numbers: 3 sets of 8-12. */
export function exerciseFromCatalog(e: CatalogExercise): WorkoutExercise {
  return {
    name: e.name,
    catalogKey: e.key,
    logType: 'weight_reps',
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
      exercises: r.exercises.map((e) => ({
        name: tidy(e.name),
        catalogKey: e.catalogKey || null,
        logType: 'weight_reps' as const,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        primary: [...e.primary],
        restSec: e.restSec ?? null,
        note: noteOf(e.note, WP_NOTE_MAX),
      })),
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
      if (!wholeIn(e.sets, 1, WP_MAX_SETS)) return `${what}: sets must be a whole number from 1 to ${WP_MAX_SETS}.`;
      if (!wholeIn(e.repMin, 1, WP_MAX_REPS) || !wholeIn(e.repMax, 1, WP_MAX_REPS)) {
        return `${what}: reps must be whole numbers from 1 to ${WP_MAX_REPS}.`;
      }
      if (e.repMin > e.repMax) return `${what}: the lowest reps can’t be more than the highest.`;
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
export function planSizeWords(plan: Pick<WorkoutPlan, 'routines'>): string {
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

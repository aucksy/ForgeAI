/**
 * F201 (owner rule R-471, 12 Nov 2026): the AI plan writer, the browser side. A workout plan costs 3 credits ONLY
 * because the AI WRITES it for that member, from the goal, level and days a week the owner gave and the gym's OWN
 * exercise list (POST /api/assist/plan, deploy/panel/assistPlan.js). A ready-made template is never sold as AI:
 * nothing in the assistant opens one.
 *
 * PURE: what the card starts with (from the AI's draft_workout_plan request), the exercise list sent with it (the
 * library, plus the exercises the gym typed itself into its plans, marked custom), and the check on what comes back.
 * Diet plans stay "not yet" (03-design, "AI plan writer (server)": calories need weight and height we never send).
 */
import { EXERCISE_CATALOG } from '../logic/exerciseCatalog';
import { cleanDraft, workoutPlanProblem } from '../logic/workoutPlans';
import type { WorkoutPlan, WorkoutPlanDraft } from '../types';
import type { ToolInputs } from './catalogue';

export type PlanGoal = 'muscle' | 'fat_loss' | 'strength' | 'general';
export type PlanLevel = 'beginner' | 'intermediate' | 'advanced';

/** What the owner sets on the card before "Write the plan". */
export interface PlanAsk {
  goal: PlanGoal;
  level: PlanLevel;
  /** 2 to 6. */
  days: number;
  /** Injuries, equipment or anything else he said (masked before it leaves the browser). */
  focus: string;
}

export const PLAN_GOALS: readonly PlanGoal[] = ['muscle', 'fat_loss', 'strength', 'general'];
export const PLAN_LEVELS: readonly PlanLevel[] = ['beginner', 'intermediate', 'advanced'];
export const PLAN_DAYS = [2, 3, 4, 5, 6] as const;
/** The server's limits (assistPlan.js MAX_LIST, MAX_FOCUS). */
export const PLAN_LIST_MAX = 500;
export const PLAN_FOCUS_MAX = 200;

/** The words on the card for each choice (drawn through t()). */
export const GOAL_WORDS: Record<PlanGoal, string> = { muscle: 'Muscle gain', fat_loss: 'Fat loss', strength: 'Strength', general: 'General fitness' };
export const LEVEL_WORDS: Record<PlanLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** The card's starting choices, from what the AI understood ("beginner" as a goal = general fitness, beginner). PURE. */
export function planAskFrom(input: Partial<ToolInputs['draft_workout_plan']> | null | undefined): PlanAsk {
  const i: Partial<ToolInputs['draft_workout_plan']> = input ?? {};
  const goal: PlanGoal = i.goal === 'fat_loss' ? 'fat_loss' : i.goal === 'muscle_gain' ? 'muscle' : i.goal === 'strength' ? 'strength' : 'general';
  const level: PlanLevel = i.goal === 'beginner' ? 'beginner' : i.level === 'intermediate' || i.level === 'advanced' ? i.level : 'beginner';
  const raw = typeof i.days_per_week === 'number' && Number.isFinite(i.days_per_week) ? Math.round(i.days_per_week) : 0;
  const days = raw <= 0 ? 4 : Math.min(6, Math.max(2, raw));
  const focus = typeof i.notes === 'string' ? i.notes.replace(/\s+/g, ' ').trim().slice(0, PLAN_FOCUS_MAX) : '';
  return { goal, level, days, focus };
}

/** One line of the exercise list sent to the writer. */
export interface PlanExercise {
  key: string;
  name: string;
  kind: string;
  primary: string[];
  custom?: true;
}

/**
 * The gym's exercise list: the library's exercises (key, name, how it is logged, main muscles), then the exercises
 * the gym typed into its own plans (no library key), each with a made-up key and `custom: true`. A typed exercise
 * without a main muscle is left out (the phone could not make it). At most PLAN_LIST_MAX. PURE.
 */
export function gymExerciseList(plans: readonly Pick<WorkoutPlan, 'routines'>[] | null | undefined): PlanExercise[] {
  const out: PlanExercise[] = EXERCISE_CATALOG.map((e) => ({ key: e.key, name: e.name, kind: e.logType, primary: [...e.primary] }));
  const known = new Set(out.map((e) => e.name.toLowerCase()));
  let n = 0;
  for (const p of plans ?? []) {
    for (const r of p.routines ?? []) {
      for (const e of r.exercises ?? []) {
        const name = (e.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (e.catalogKey || !name || known.has(name.toLowerCase()) || (e.primary ?? []).length === 0) continue;
        if (out.length >= PLAN_LIST_MAX) return out;
        known.add(name.toLowerCase());
        n += 1;
        out.push({ key: `custom_${n}`, name, kind: e.logType, primary: [...e.primary].slice(0, 4), custom: true });
      }
    }
  }
  return out;
}

/** The body of POST /api/assist/plan (the focus is masked by api.ts). NEVER a member's name or record. PURE. */
export function planRequestBody(ask: PlanAsk, exercises: readonly PlanExercise[], lang: 'en' | 'hi') {
  return {
    what: 'workout' as const,
    goal: ask.goal,
    level: ask.level,
    days_per_week: ask.days,
    focus: ask.focus.slice(0, PLAN_FOCUS_MAX),
    exercises: exercises.slice(0, PLAN_LIST_MAX),
    lang,
  };
}

/** The plan's language: the members read it, so it follows the gym's message language (Hindi only when set). */
export const planLang = (gymLang: 'en' | 'hi' | 'both'): 'en' | 'hi' => (gymLang === 'hi' ? 'hi' : 'en');

/**
 * The plan the writer sent, made ready for the builder: cleaned like the builder cleans it, sent to nobody but the
 * member it is for, and named for them. Null when it does not pass the builder's own check (a broken plan is never
 * shown for 3 credits). PURE.
 */
export function writtenPlan(raw: unknown, member: { id: string; name: string } | null): WorkoutPlanDraft | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { routines?: unknown }).routines)) return null;
  const r = raw as WorkoutPlanDraft;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const shaped = r.routines.every(
    (x) => !!x && typeof x === 'object' && typeof x.name === 'string' && Array.isArray(x.exercises) && x.exercises.every((e) => !!e && typeof e === 'object' && typeof e.name === 'string'),
  );
  if (!shaped) return null;
  const plan = cleanDraft({
    name: (member && name ? `${name} · ${member.name}` : name).slice(0, 80),
    note: typeof r.note === 'string' && r.note.trim() ? r.note : null,
    routines: r.routines.map((x) => ({ ...x, exercises: x.exercises.map((e) => ({ ...e, primary: Array.isArray(e.primary) ? e.primary : [] })) })),
    assign: { memberIds: member ? [member.id] : [], planIds: [] },
  });
  return plan.routines.length > 0 && !workoutPlanProblem(plan) ? { ...plan, id: null } : null;
}

/** Exercises in the whole plan. PURE. */
export const exerciseCount = (plan: Pick<WorkoutPlanDraft, 'routines'>): number => plan.routines.reduce((n, r) => n + r.exercises.length, 0);

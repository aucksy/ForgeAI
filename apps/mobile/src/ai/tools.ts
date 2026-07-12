/**
 * The AI Fitness OS surface: every read/write the model performs goes through
 * these tools, which hit the exact same repos/services as the UI. Tool results
 * sent back to the model are compact summaries — never raw row dumps.
 */
import * as exerciseRepo from '@/db/repos/exerciseRepo';
import * as nutritionRepo from '@/db/repos/nutritionRepo';
import * as prRepo from '@/db/repos/prRepo';
import * as userRepo from '@/db/repos/userRepo';
import * as workoutRepo from '@/db/repos/workoutRepo';
import { todayISO } from '@/lib/date';
import { fmtInt, trimNum } from '@/lib/format';
import { getExerciseStats } from '@/services/analytics';
import { getTodaysWorkout } from '@/services/coach';
import { getDashboardData } from '@/services/dashboard';
import type { PlanDayFull } from '@/db/repos/planRepo';
import * as routineRepo from '@/tracker/db/routineRepo';
import { getSessionSetMeta } from '@/tracker/db/trackerSets';
import type { SetMeta } from '@/tracker/db/trackerSets';
import type {
  DayType,
  Exercise,
  Goal,
  MuscleGroup,
  NutritionDay,
  PersonalRecord,
  SessionDetail,
  UserProfile,
} from '@/types/models';

import type { CoachTool, ToolRunResult } from '@/ai/types';

// ------------------------------------------------------------------ helpers

const DAY_TYPES: DayType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'rest'];

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function asDayType(v: unknown): DayType | undefined {
  const s = asString(v)?.toLowerCase();
  return DAY_TYPES.find((d) => d === s);
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const MUSCLE_KEYWORDS: [MuscleGroup, RegExp][] = [
  ['chest', /(chest|bench|pec|fly|flye|push[- ]?up|dips?\b|incline press|decline)/],
  ['back', /(row|pull[- ]?down|pulldown|pull[- ]?up|chin[- ]?up|lat\b|deadlift|back|shrug)/],
  ['shoulders', /(shoulder|ohp|overhead|military|lateral|front raise|rear delt|delt|arnold|face pull)/],
  ['biceps', /(curl|bicep|preacher|hammer)/],
  ['triceps', /(tricep|pushdown|push[- ]?down|skull|kickback|close[- ]?grip|overhead extension)/],
  ['quads', /(squat|leg press|lunge|quad|leg extension|hack|step[- ]?up|bulgarian)/],
  ['hamstrings', /(hamstring|leg curl|rdl|romanian|good morning|nordic)/],
  ['glutes', /(glute|hip thrust|kickback machine|abduction)/],
  ['calves', /(calf|calves|raise machine)/],
  ['core', /(ab\b|abs|crunch|plank|core|sit[- ]?up|leg raise|russian twist|woodchop)/],
  ['forearms', /(forearm|wrist|grip|farmer)/],
];

function guessMuscleGroup(name: string): MuscleGroup {
  const n = name.toLowerCase();
  for (const [group, re] of MUSCLE_KEYWORDS) {
    if (re.test(n)) return group;
  }
  return 'core';
}

function inferDayType(groups: MuscleGroup[]): DayType {
  const push: MuscleGroup[] = ['chest', 'shoulders', 'triceps'];
  const pull: MuscleGroup[] = ['back', 'biceps', 'forearms'];
  const legs: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves'];
  let p = 0;
  let pl = 0;
  let lg = 0;
  for (const g of groups) {
    if (push.includes(g)) p++;
    else if (pull.includes(g)) pl++;
    else if (legs.includes(g)) lg++;
  }
  const max = Math.max(p, pl, lg);
  if (max === 0) return 'full';
  if (lg === max) return p + pl > 0 ? 'full' : 'legs';
  if (p === max && pl === 0) return 'push';
  if (pl === max && p === 0) return 'pull';
  return 'upper';
}

export type PrWithName = PersonalRecord & { exerciseName: string };

export interface LoggedWorkout {
  detail: SessionDetail;
  newPrs: PrWithName[];
}

export interface WorkoutSetInput {
  weightKg: number;
  reps: number;
}

export interface WorkoutExerciseInput {
  name: string;
  sets: WorkoutSetInput[];
}

/**
 * Shared write-path for chat-driven workout logging (cloud tool + localCoach).
 * Resolves names, reuses today's session if one exists, records sets + PRs.
 */
export async function logWorkoutCore(
  exercises: WorkoutExerciseInput[],
  dayType?: DayType,
  dateISO?: string,
): Promise<LoggedWorkout> {
  const day = dateISO ?? todayISO();
  const resolved: { exercise: Exercise; sets: WorkoutSetInput[] }[] = [];
  for (const input of exercises) {
    const sets = input.sets.filter(
      (s) => s.weightKg >= 0 && s.weightKg <= 500 && s.reps >= 1 && s.reps <= 100,
    );
    if (!sets.length) continue;
    let exercise = await exerciseRepo.findExerciseByName(input.name);
    if (!exercise) {
      exercise = await exerciseRepo.createExercise({
        name: titleCase(input.name.trim()),
        aliases: [input.name.trim().toLowerCase()],
        muscleGroup: guessMuscleGroup(input.name),
        secondaryMuscles: [],
        equipment: 'other',
        isCompound: false,
        incrementKg: 2.5,
      });
    }
    resolved.push({ exercise, sets });
  }
  if (!resolved.length) throw new Error('No valid sets to log.');

  const existing = await workoutRepo.getSessionsBetween(day, day);
  let session = existing[0];
  if (!session) {
    session = await workoutRepo.createSession({
      dateISO: day,
      dayType: dayType ?? inferDayType(resolved.map((r) => r.exercise.muscleGroup)),
      source: 'chat',
    });
  }

  await workoutRepo.addSets(
    session.id,
    resolved.flatMap((r) =>
      r.sets.map((s) => ({ exerciseId: r.exercise.id, weightKg: s.weightKg, reps: s.reps })),
    ),
  );

  const newPrs: PrWithName[] = [];
  const seen = new Set<string>();
  for (const r of resolved) {
    if (seen.has(r.exercise.id)) continue;
    seen.add(r.exercise.id);
    const history = await prRepo.getPrHistory(r.exercise.id);
    for (const pr of history) {
      if (pr.sessionId === session.id) newPrs.push({ ...pr, exerciseName: r.exercise.name });
    }
  }

  const detail = await workoutRepo.getSessionDetail(session.id);
  if (!detail) throw new Error('Could not load the logged session.');
  return { detail, newPrs };
}

export interface NutritionSnapshot {
  day: NutritionDay;
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  remaining: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

/** Day totals + profile targets + remaining (floored at 0 for display sanity). */
export async function nutritionSnapshot(dateISO: string): Promise<NutritionSnapshot> {
  const [day, profile] = await Promise.all([
    nutritionRepo.getNutritionDay(dateISO),
    userRepo.getProfile(),
  ]);
  const targets = {
    calories: profile.calorieTarget,
    proteinG: profile.proteinTargetG,
    carbsG: profile.carbsTargetG,
    fatG: profile.fatTargetG,
  };
  return {
    day,
    targets,
    remaining: {
      calories: Math.max(0, Math.round(targets.calories - day.calories)),
      proteinG: Math.max(0, Math.round(targets.proteinG - day.proteinG)),
      carbsG: Math.max(0, Math.round(targets.carbsG - day.carbsG)),
      fatG: Math.max(0, Math.round(targets.fatG - day.fatG)),
    },
  };
}

export interface WorkoutRangeSummary {
  fromISO: string;
  toISO: string;
  sessions: number;
  totalVolumeKg: number;
  dayTypeCounts: Record<string, number>;
  topExercises: { name: string; volumeKg: number; sets: number }[];
}

/** Compact workout summary for a date range (shared by cloud tool + localCoach). */
export async function summarizeWorkoutRange(
  fromISO: string,
  toISO: string,
): Promise<WorkoutRangeSummary> {
  const sessions = await workoutRepo.getSessionsBetween(fromISO, toISO);
  const dayTypeCounts: Record<string, number> = {};
  const perExercise = new Map<string, { name: string; volumeKg: number; sets: number }>();
  let totalVolumeKg = 0;
  for (const s of sessions) {
    dayTypeCounts[s.dayType] = (dayTypeCounts[s.dayType] ?? 0) + 1;
    const detail = await workoutRepo.getSessionDetail(s.id);
    if (!detail) continue;
    totalVolumeKg += detail.totalVolumeKg;
    for (const ex of detail.exercises) {
      const cur = perExercise.get(ex.exercise.id) ?? {
        name: ex.exercise.name,
        volumeKg: 0,
        sets: 0,
      };
      cur.volumeKg += ex.volumeKg;
      cur.sets += ex.sets.filter((set) => !set.isWarmup).length;
      perExercise.set(ex.exercise.id, cur);
    }
  }
  const topExercises = [...perExercise.values()]
    .sort((a, b) => b.volumeKg - a.volumeKg)
    .slice(0, 5)
    .map((e) => ({ ...e, volumeKg: Math.round(e.volumeKg) }));
  return {
    fromISO,
    toISO,
    sessions: sessions.length,
    totalVolumeKg: Math.round(totalVolumeKg),
    dayTypeCounts,
    topExercises,
  };
}

function fmtSet(weightKg: number, reps: number): string {
  return `${trimNum(weightKg)}kg × ${reps}`;
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Average working-set RPE for a session (additive column; null when unrecorded). */
function avgRpe(sets: { id: string }[], meta: Record<string, SetMeta>): number | null {
  const rpes = sets
    .map((s) => meta[s.id]?.rpe)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return rpes.length ? r1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null;
}

function workoutLoggedCardText(detail: SessionDetail, newPrs: PrWithName[]): string {
  const setCount = detail.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => !s.isWarmup).length,
    0,
  );
  const pr = newPrs.length
    ? ` New PR${newPrs.length > 1 ? 's' : ''}: ${newPrs
        .map((p) => `${p.exerciseName} ${trimNum(p.value)}kg (${p.kind === 'e1rm' ? 'e1RM' : p.kind})`)
        .join(', ')}.`
    : '';
  return `Logged ${detail.exercises.length} exercise${detail.exercises.length > 1 ? 's' : ''}, ${setCount} sets — ${fmtInt(detail.totalVolumeKg)} kg volume.${pr}`;
}

/** Build the 'workout_logged' card (payload = SessionDetail + newPrs). */
export function buildWorkoutLoggedCard(logged: LoggedWorkout): ToolRunResult['card'] {
  return {
    kind: 'workout_logged',
    text: workoutLoggedCardText(logged.detail, logged.newPrs),
    payload: { ...logged.detail, newPrs: logged.newPrs },
  };
}

// -------------------------------------------------- routine (plan-day) helpers

/** Resolve a routine (plan day) by name — exact, then fuzzy, then by day type. */
async function resolveRoutine(name: string): Promise<PlanDayFull | null> {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const routines = await routineRepo.listRoutines();
  return (
    routines.find((r) => r.name.toLowerCase() === q) ??
    routines.find((r) => r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase())) ??
    routines.find((r) => r.dayType === q) ??
    null
  );
}

/** Find one exercise inside a routine by name/alias (for update / remove). */
function findRoutineExercise(
  routine: PlanDayFull,
  exName: string,
): PlanDayFull['exercises'][number] | null {
  const q = exName.trim().toLowerCase();
  if (!q) return null;
  return (
    routine.exercises.find((pe) => pe.exercise.name.toLowerCase() === q) ??
    routine.exercises.find((pe) => pe.exercise.aliases.some((a) => a.toLowerCase() === q)) ??
    routine.exercises.find((pe) => pe.exercise.name.toLowerCase().includes(q)) ??
    null
  );
}

/** Compact routine summary for tool results. */
function routineSummary(r: PlanDayFull): {
  name: string;
  dayType: DayType;
  exercises: string[];
} {
  return {
    name: r.name,
    dayType: r.dayType,
    exercises: r.exercises.map(
      (pe) => `${pe.exercise.name} — ${pe.targetSets} × ${pe.repRangeMin}-${pe.repRangeMax}`,
    ),
  };
}

const GOALS: Goal[] = ['muscle', 'fat_loss', 'strength', 'general'];

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// ------------------------------------------------------------------- tools

export const COACH_TOOLS: CoachTool[] = [
  {
    name: 'log_workout',
    description:
      'Log a workout the member describes. Pass every exercise with its sets (weight in kg, reps). ' +
      'Unknown exercise names are created automatically. Reuses the existing session for that day.',
    parameters: {
      type: 'object',
      properties: {
        dayType: {
          type: 'string',
          enum: ['push', 'pull', 'legs', 'upper', 'lower', 'full'],
          description: 'Optional workout day type; inferred from muscle groups when omitted.',
        },
        dateISO: {
          type: 'string',
          description: "Local calendar day 'YYYY-MM-DD'. Omit for today.",
        },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Exercise name as the member said it.' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    weightKg: { type: 'number', description: 'Weight in kg.' },
                    reps: { type: 'integer' },
                  },
                  required: ['weightKg', 'reps'],
                },
              },
            },
            required: ['name', 'sets'],
          },
        },
      },
      required: ['exercises'],
    },
    async execute(args) {
      const rawList = Array.isArray(args.exercises) ? args.exercises : [];
      const exercises: WorkoutExerciseInput[] = [];
      for (const raw of rawList) {
        if (typeof raw !== 'object' || raw === null) continue;
        const obj = raw as Record<string, unknown>;
        const name = asString(obj.name);
        const rawSets = Array.isArray(obj.sets) ? obj.sets : [];
        if (!name) continue;
        const sets: WorkoutSetInput[] = [];
        for (const rs of rawSets) {
          if (typeof rs !== 'object' || rs === null) continue;
          const so = rs as Record<string, unknown>;
          const weightKg = asNumber(so.weightKg);
          const reps = asNumber(so.reps);
          if (weightKg === undefined || reps === undefined) continue;
          sets.push({ weightKg, reps: Math.round(reps) });
        }
        if (sets.length) exercises.push({ name, sets });
      }
      if (!exercises.length) {
        return {
          resultForModel: {
            error: 'No valid exercises/sets provided. Each set needs weightKg and reps.',
          },
        };
      }
      const logged = await logWorkoutCore(exercises, asDayType(args.dayType), asString(args.dateISO));
      return {
        resultForModel: {
          logged: true,
          dateISO: logged.detail.dateISO,
          dayType: logged.detail.dayType,
          totalVolumeKg: Math.round(logged.detail.totalVolumeKg),
          exercises: logged.detail.exercises.map((e) => ({
            name: e.exercise.name,
            sets: e.sets
              .filter((s) => !s.isWarmup)
              .map((s) => fmtSet(s.weightKg, s.reps))
              .join(', '),
          })),
          newPrs: logged.newPrs.map(
            (p) => `${p.exerciseName} ${p.kind} ${trimNum(p.value)}kg (${fmtSet(p.weightKg, p.reps)})`,
          ),
        },
        card: buildWorkoutLoggedCard(logged),
      };
    },
  },

  {
    name: 'get_todays_workout',
    description:
      "Get today's planned workout with per-exercise progressive-overload targets: last session, today's target weight/reps and the reason behind it.",
    parameters: { type: 'object', properties: {} },
    async execute() {
      const tw = await getTodaysWorkout();
      return {
        resultForModel: {
          dayName: tw.dayName,
          dayType: tw.dayType,
          headline: tw.headline,
          exercises: tw.targets.map((t) => ({
            name: t.exerciseName,
            last: t.last
              ? `${fmtSet(t.last.weightKg, t.last.topReps)} on ${t.last.dateISO}`
              : 'never performed',
            target: `${trimNum(t.targetWeightKg)}kg, ${t.targetSets} sets of ${t.targetRepsMin}-${t.targetRepsMax}`,
            action: t.action,
            reason: t.reason,
          })),
        },
        card: { kind: 'workout_plan', text: tw.headline, payload: tw },
      };
    },
  },

  {
    name: 'log_meal',
    description:
      'Log a meal. YOU estimate calories and macros yourself (from the description or photo) and pass the numbers here — this tool only stores them.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short human description of the meal.' },
        calories: { type: 'number' },
        proteinG: { type: 'number' },
        carbsG: { type: 'number' },
        fatG: { type: 'number' },
        dateISO: { type: 'string', description: "Local day 'YYYY-MM-DD'. Omit for today." },
      },
      required: ['description', 'calories', 'proteinG', 'carbsG', 'fatG'],
    },
    async execute(args) {
      const description = asString(args.description);
      const calories = asNumber(args.calories);
      const proteinG = asNumber(args.proteinG);
      const carbsG = asNumber(args.carbsG);
      const fatG = asNumber(args.fatG);
      if (!description || calories === undefined || proteinG === undefined || carbsG === undefined || fatG === undefined) {
        return {
          resultForModel: {
            error: 'log_meal needs description, calories, proteinG, carbsG and fatG.',
          },
        };
      }
      const meal = await nutritionRepo.logMeal({
        dateISO: asString(args.dateISO) ?? todayISO(),
        description,
        calories: Math.round(calories),
        proteinG: Math.round(proteinG),
        carbsG: Math.round(carbsG),
        fatG: Math.round(fatG),
        source: 'text',
      });
      const snap = await nutritionSnapshot(meal.dateISO);
      return {
        resultForModel: {
          logged: true,
          meal: { description: meal.description, calories: meal.calories, proteinG: meal.proteinG },
          dayTotals: snap.day,
          remaining: snap.remaining,
        },
        card: {
          kind: 'meal_logged',
          text: `${meal.description} — ${fmtInt(meal.calories)} kcal · ${Math.round(meal.proteinG)}g protein`,
          payload: meal,
        },
      };
    },
  },

  {
    name: 'get_nutrition',
    description:
      "Get the member's nutrition for a day: totals eaten, daily targets and what's remaining.",
    parameters: {
      type: 'object',
      properties: {
        dateISO: { type: 'string', description: "Local day 'YYYY-MM-DD'. Omit for today." },
      },
    },
    async execute(args) {
      const dateISO = asString(args.dateISO) ?? todayISO();
      const [snap, meals] = await Promise.all([
        nutritionSnapshot(dateISO),
        nutritionRepo.getMealsForDay(dateISO),
      ]);
      return {
        resultForModel: {
          dateISO,
          eaten: {
            calories: Math.round(snap.day.calories),
            proteinG: Math.round(snap.day.proteinG),
            carbsG: Math.round(snap.day.carbsG),
            fatG: Math.round(snap.day.fatG),
            meals: snap.day.mealCount,
          },
          // Individual meals so the coach can reference/delete a specific one.
          mealsList: meals.slice(0, 25).map((m) => ({
            description: m.description,
            calories: Math.round(m.calories),
            proteinG: Math.round(m.proteinG),
          })),
          targets: snap.targets,
          remaining: snap.remaining,
        },
        card: {
          kind: 'nutrition_summary',
          text: `${fmtInt(snap.day.calories)} / ${fmtInt(snap.targets.calories)} kcal · ${Math.round(snap.day.proteinG)} / ${snap.targets.proteinG}g protein`,
          payload: snap,
        },
      };
    },
  },

  {
    name: 'get_nutrition_range',
    description: 'Get daily nutrition totals and averages across a date range (inclusive).',
    parameters: {
      type: 'object',
      properties: {
        fromISO: { type: 'string', description: "Start day 'YYYY-MM-DD'." },
        toISO: { type: 'string', description: "End day 'YYYY-MM-DD'." },
      },
      required: ['fromISO', 'toISO'],
    },
    async execute(args) {
      const fromISO = asString(args.fromISO);
      const toISO = asString(args.toISO);
      if (!fromISO || !toISO) {
        return { resultForModel: { error: 'get_nutrition_range needs fromISO and toISO.' } };
      }
      const days = await nutritionRepo.getNutritionRange(fromISO, toISO);
      const logged = days.filter((d) => d.mealCount > 0);
      const avg = (sel: (d: NutritionDay) => number) =>
        logged.length ? Math.round(logged.reduce((n, d) => n + sel(d), 0) / logged.length) : 0;
      return {
        resultForModel: {
          fromISO,
          toISO,
          dayCount: days.length,
          daysLogged: logged.length,
          avgPerLoggedDay: {
            calories: avg((d) => d.calories),
            proteinG: avg((d) => d.proteinG),
            carbsG: avg((d) => d.carbsG),
            fatG: avg((d) => d.fatG),
          },
        },
      };
    },
  },

  {
    name: 'get_workout_summary',
    description:
      'Summarise training across a date range (inclusive): session count, total volume, top exercises by volume and day-type mix.',
    parameters: {
      type: 'object',
      properties: {
        fromISO: { type: 'string', description: "Start day 'YYYY-MM-DD'." },
        toISO: { type: 'string', description: "End day 'YYYY-MM-DD'." },
      },
      required: ['fromISO', 'toISO'],
    },
    async execute(args) {
      const fromISO = asString(args.fromISO);
      const toISO = asString(args.toISO);
      if (!fromISO || !toISO) {
        return { resultForModel: { error: 'get_workout_summary needs fromISO and toISO.' } };
      }
      return { resultForModel: await summarizeWorkoutRange(fromISO, toISO) };
    },
  },

  {
    name: 'get_prs',
    description: "List the member's personal records (best weight and best estimated 1RM per exercise).",
    parameters: { type: 'object', properties: {} },
    async execute() {
      const prs = await prRepo.getAllPrs();
      return {
        resultForModel: prs.slice(0, 15).map((p) => ({
          exercise: p.exerciseName,
          kind: p.kind,
          valueKg: Math.round(p.value * 10) / 10,
          set: fmtSet(p.weightKg, p.reps),
          dateISO: p.dateISO,
        })),
        card: {
          kind: 'pr_list',
          text: prs.length
            ? `${prs.length} personal records on file.`
            : 'No personal records yet.',
          payload: prs,
        },
      };
    },
  },

  {
    name: 'get_exercise_stats',
    description:
      'Get progress stats for one exercise by name: best set, PR e1RM, averages and recent trend.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exercise name (aliases and Hinglish names work).' },
      },
      required: ['name'],
    },
    async execute(args) {
      const name = asString(args.name);
      if (!name) return { resultForModel: { error: 'get_exercise_stats needs a name.' } };
      const exercise = await exerciseRepo.findExerciseByName(name);
      if (!exercise) {
        return { resultForModel: { error: `No exercise found matching "${name}".` } };
      }
      const stats = await getExerciseStats(exercise.id);
      // RPE-aware: attach each recent session's average working-set RPE (opt-in
      // additive column; null when the member never logged RPE). Keyed by session
      // so same-day sessions don't collide.
      const recentHistory = stats.history.slice(0, 5); // newest first
      const rpeBySession = new Map<string, number | null>();
      await Promise.all(
        recentHistory.map(async (h) => {
          const meta = await getSessionSetMeta(h.sessionId);
          rpeBySession.set(h.sessionId, avgRpe(h.sets, meta));
        }),
      );
      // `progress` is `history` in chronological order (1:1 reverse), so align the
      // newest 5 progress points to the same sessions BY INDEX — robust to two
      // sessions on one calendar date (a date-keyed join would collide/overwrite).
      const chrono = [...recentHistory].reverse(); // oldest→newest, matches progress tail
      const recent = stats.progress.slice(-5);
      return {
        resultForModel: {
          name: stats.exercise.name,
          muscleGroup: stats.exercise.muscleGroup,
          sessionsCount: stats.sessionsCount,
          bestSet: stats.bestSet
            ? `${fmtSet(stats.bestSet.weightKg, stats.bestSet.reps)} on ${stats.bestSet.dateISO}`
            : null,
          prE1rmKg: stats.prE1rmKg !== null ? r1(stats.prE1rmKg) : null,
          avgWeightKg: stats.avgWeightKg !== null ? r1(stats.avgWeightKg) : null,
          avgReps: stats.avgReps !== null ? r1(stats.avgReps) : null,
          recentSessions: recent.map((p, i) => ({
            dateISO: p.dateISO,
            topWeightKg: p.topWeightKg,
            e1rmKg: r1(p.e1rmKg),
            volumeKg: Math.round(p.volumeKg),
            avgRpe: rpeBySession.get(chrono[i]?.sessionId ?? '') ?? null,
          })),
        },
      };
    },
  },

  {
    name: 'log_body_weight',
    description: "Log the member's body weight for a day (kg). Upserts by date.",
    parameters: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Body weight in kg.' },
        dateISO: { type: 'string', description: "Local day 'YYYY-MM-DD'. Omit for today." },
      },
      required: ['weightKg'],
    },
    async execute(args) {
      const weightKg = asNumber(args.weightKg);
      if (weightKg === undefined || weightKg < 20 || weightKg > 400) {
        return { resultForModel: { error: 'log_body_weight needs a plausible weightKg.' } };
      }
      const entry = await userRepo.logBodyWeight(asString(args.dateISO) ?? todayISO(), weightKg);
      const history = await userRepo.getBodyWeightHistory(60);
      const prev = history.filter((h) => h.dateISO < entry.dateISO).pop();
      return {
        resultForModel: {
          logged: true,
          dateISO: entry.dateISO,
          weightKg: entry.weightKg,
          changeSinceLastKg: prev ? Math.round((entry.weightKg - prev.weightKg) * 10) / 10 : null,
          lastEntry: prev ? { dateISO: prev.dateISO, weightKg: prev.weightKg } : null,
        },
      };
    },
  },

  {
    name: 'get_routines',
    description:
      "List the member's saved workout routines (the days of their active plan): each routine's name, day type, and its exercises with target sets and rep ranges. Use to answer 'what routines do I have?' or to build a session from a routine.",
    parameters: { type: 'object', properties: {} },
    async execute() {
      const routines = await routineRepo.listRoutines();
      return {
        resultForModel: {
          count: routines.length,
          routines: routines.map((d) => ({
            name: d.name,
            dayType: d.dayType,
            exerciseCount: d.exercises.length,
            exercises: d.exercises.map(
              (pe) =>
                `${pe.exercise.name} — ${pe.targetSets} × ${pe.repRangeMin}-${pe.repRangeMax}`,
            ),
          })),
        },
      };
    },
  },

  {
    name: 'get_recent_workouts',
    description:
      'Get the most recent logged workouts in detail: date, day type, volume, each exercise with its working sets, average RPE (if recorded), any supersets, and exercise notes. Use for "how did my last workout go?", "did I overreach (RPE)?", or superset questions.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'How many recent sessions to return (default 5, max 10).',
        },
      },
    },
    async execute(args) {
      const n = asNumber(args.limit);
      const limit = Math.min(10, Math.max(1, n === undefined ? 5 : Math.round(n)));
      const sessions = await workoutRepo.getRecentSessionDetails(limit);
      const workouts = await Promise.all(
        sessions.map(async (s) => {
          const meta = await getSessionSetMeta(s.id);
          const exercises = s.exercises.map((g) => {
            const working = g.sets.filter((st) => !st.isWarmup);
            const noteSet = working.find((st) => meta[st.id]?.note?.trim());
            return {
              name: g.exercise.name,
              sets: working.map((st) => fmtSet(st.weightKg, st.reps)).join(', '),
              avgRpe: avgRpe(working, meta),
              note: noteSet ? meta[noteSet.id]?.note ?? null : null,
            };
          });
          // Supersets: group working-set exercise names by their superset_group.
          const groups = new Map<number, Set<string>>();
          for (const g of s.exercises) {
            for (const st of g.sets) {
              if (st.isWarmup) continue;
              const grp = meta[st.id]?.supersetGroup;
              if (grp == null) continue;
              const set = groups.get(grp) ?? new Set<string>();
              set.add(g.exercise.name);
              groups.set(grp, set);
            }
          }
          const supersets = [...groups.values()]
            .map((names) => [...names])
            .filter((names) => names.length > 1);
          return {
            dateISO: s.dateISO,
            dayType: s.dayType,
            volumeKg: Math.round(s.totalVolumeKg),
            exercises,
            ...(supersets.length ? { supersets } : {}),
          };
        }),
      );
      return { resultForModel: { count: workouts.length, workouts } };
    },
  },

  {
    name: 'get_dashboard_snapshot',
    description:
      "Compact snapshot of the member's day and trends (streak, calories/protein vs targets, recovery, strength, weekly volume, body weight, last workout). Use for open coaching questions.",
    parameters: { type: 'object', properties: {} },
    async execute() {
      const d = await getDashboardData();
      return {
        resultForModel: {
          today: {
            dayName: d.todaysWorkout.dayName,
            headline: d.todaysWorkout.headline,
            exercises: d.todaysWorkout.targets.map((t) => t.exerciseName),
          },
          streakDays: d.streakDays,
          workoutsThisWeek: d.workoutsThisWeek,
          calories: { eaten: Math.round(d.caloriesToday), target: d.calorieTarget },
          protein: { eatenG: Math.round(d.proteinTodayG), targetG: d.proteinTargetG },
          recovery: { score: d.recovery.score, label: d.recovery.label, note: d.recovery.note },
          strength: { score: d.strength.score, label: d.strength.label },
          weeklyVolumeKg: Math.round(d.weeklyVolumeKg),
          weeklyVolumeDeltaPct: d.weeklyVolumeDeltaPct,
          bodyWeightKg: d.bodyWeightKg,
          lastWorkout: d.lastWorkout,
          insight: d.insight,
        },
      };
    },
  },

  // ------------------------------------------------- write / edit / delete tools
  // These mutate stored data. Destructive ones (delete_*, remove_*) are
  // confirm-first per the system prompt — the model asks before calling them.

  {
    name: 'create_routine',
    description:
      "Create a new empty workout routine (a day in the member's active plan). Add exercises afterwards with add_exercise_to_routine.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Routine name, e.g. "Push Day A".' },
        dayType: {
          type: 'string',
          enum: ['push', 'pull', 'legs', 'upper', 'lower', 'full'],
          description: 'Training split for this routine.',
        },
      },
      required: ['name', 'dayType'],
    },
    async execute(args) {
      const name = asString(args.name);
      const dayType = asDayType(args.dayType);
      if (!name || !dayType || dayType === 'rest') {
        return {
          resultForModel: {
            error: 'create_routine needs a name and a dayType (push/pull/legs/upper/lower/full).',
          },
        };
      }
      // Use the returned id (names aren't unique — resolveRoutine could return an
      // older same-named routine).
      const id = await routineRepo.createRoutine({ name, dayType });
      const routine = await routineRepo.getRoutine(id);
      return {
        resultForModel: {
          created: true,
          routine: routine ? routineSummary(routine) : { name, dayType, exercises: [] },
        },
      };
    },
  },

  {
    name: 'add_exercise_to_routine',
    description:
      "Add an exercise to one of the member's routines (creates the exercise if it doesn't exist). Call get_routines first to use the exact routine name.",
    parameters: {
      type: 'object',
      properties: {
        routineName: { type: 'string', description: 'Routine name as shown by get_routines.' },
        exerciseName: { type: 'string' },
        targetSets: { type: 'integer', description: 'Target working sets (default 3).' },
        repRangeMin: { type: 'integer', description: 'Min reps (default 8).' },
        repRangeMax: { type: 'integer', description: 'Max reps (default 12).' },
      },
      required: ['routineName', 'exerciseName'],
    },
    async execute(args) {
      const routineName = asString(args.routineName);
      const exerciseName = asString(args.exerciseName);
      if (!routineName || !exerciseName) {
        return {
          resultForModel: { error: 'add_exercise_to_routine needs routineName and exerciseName.' },
        };
      }
      const routine = await resolveRoutine(routineName);
      if (!routine) {
        return {
          resultForModel: {
            error: `No routine found named "${routineName}". Use get_routines to list them, or create_routine first.`,
          },
        };
      }
      let exercise = await exerciseRepo.findExerciseByName(exerciseName);
      if (!exercise) {
        exercise = await exerciseRepo.createExercise({
          name: titleCase(exerciseName.trim()),
          aliases: [exerciseName.trim().toLowerCase()],
          muscleGroup: guessMuscleGroup(exerciseName),
          secondaryMuscles: [],
          equipment: 'other',
          isCompound: false,
          incrementKg: 2.5,
        });
      }
      if (routine.exercises.some((pe) => pe.exerciseId === exercise.id)) {
        return {
          resultForModel: {
            error: `"${exercise.name}" is already in "${routine.name}". Use update_routine_exercise to change its sets/reps.`,
          },
        };
      }
      const sets = asNumber(args.targetSets);
      const rmin = asNumber(args.repRangeMin);
      const rmax = asNumber(args.repRangeMax);
      let repMin = rmin !== undefined ? clampInt(rmin, 1, 100) : undefined;
      let repMax = rmax !== undefined ? clampInt(rmax, 1, 100) : undefined;
      if (repMin !== undefined && repMax !== undefined && repMin > repMax) {
        [repMin, repMax] = [repMax, repMin]; // keep min ≤ max
      }
      await routineRepo.addExerciseToRoutine(routine.id, exercise.id, {
        targetSets: sets !== undefined ? clampInt(sets, 1, 20) : undefined,
        repRangeMin: repMin,
        repRangeMax: repMax,
      });
      const updated = await routineRepo.getRoutine(routine.id);
      return {
        resultForModel: { added: exercise.name, routine: updated ? routineSummary(updated) : null },
      };
    },
  },

  {
    name: 'update_routine_exercise',
    description:
      'Change the target sets and/or rep range of an exercise already in a routine.',
    parameters: {
      type: 'object',
      properties: {
        routineName: { type: 'string' },
        exerciseName: { type: 'string' },
        targetSets: { type: 'integer' },
        repRangeMin: { type: 'integer' },
        repRangeMax: { type: 'integer' },
      },
      required: ['routineName', 'exerciseName'],
    },
    async execute(args) {
      const routineName = asString(args.routineName);
      const exerciseName = asString(args.exerciseName);
      if (!routineName || !exerciseName) {
        return {
          resultForModel: { error: 'update_routine_exercise needs routineName and exerciseName.' },
        };
      }
      const routine = await resolveRoutine(routineName);
      if (!routine) return { resultForModel: { error: `No routine named "${routineName}".` } };
      const pe = findRoutineExercise(routine, exerciseName);
      if (!pe) {
        return { resultForModel: { error: `"${exerciseName}" is not in "${routine.name}".` } };
      }
      const sets = asNumber(args.targetSets);
      const rmin = asNumber(args.repRangeMin);
      const rmax = asNumber(args.repRangeMax);
      if (sets === undefined && rmin === undefined && rmax === undefined) {
        return {
          resultForModel: {
            error: 'Nothing to update — pass targetSets, repRangeMin and/or repRangeMax.',
          },
        };
      }
      // Resolve the effective rep range (falling back to the stored bound) so a
      // partial update can't leave an inverted min > max.
      let effMin = rmin !== undefined ? clampInt(rmin, 1, 100) : pe.repRangeMin;
      let effMax = rmax !== undefined ? clampInt(rmax, 1, 100) : pe.repRangeMax;
      if (effMin > effMax) [effMin, effMax] = [effMax, effMin];
      await routineRepo.updateRoutineExercise(pe.id, {
        targetSets: sets !== undefined ? clampInt(sets, 1, 20) : undefined,
        repRangeMin: rmin !== undefined || rmax !== undefined ? effMin : undefined,
        repRangeMax: rmin !== undefined || rmax !== undefined ? effMax : undefined,
      });
      const updated = await routineRepo.getRoutine(routine.id);
      return {
        resultForModel: {
          updated: pe.exercise.name,
          routine: updated ? routineSummary(updated) : null,
        },
      };
    },
  },

  {
    name: 'remove_exercise_from_routine',
    description:
      'Remove an exercise from a routine. Destructive — confirm with the member first unless they clearly asked to remove it.',
    parameters: {
      type: 'object',
      properties: {
        routineName: { type: 'string' },
        exerciseName: { type: 'string' },
      },
      required: ['routineName', 'exerciseName'],
    },
    async execute(args) {
      const routineName = asString(args.routineName);
      const exerciseName = asString(args.exerciseName);
      if (!routineName || !exerciseName) {
        return {
          resultForModel: {
            error: 'remove_exercise_from_routine needs routineName and exerciseName.',
          },
        };
      }
      const routine = await resolveRoutine(routineName);
      if (!routine) return { resultForModel: { error: `No routine named "${routineName}".` } };
      const pe = findRoutineExercise(routine, exerciseName);
      if (!pe) {
        return { resultForModel: { error: `"${exerciseName}" is not in "${routine.name}".` } };
      }
      const removedName = pe.exercise.name;
      await routineRepo.removeRoutineExercise(pe.id);
      const updated = await routineRepo.getRoutine(routine.id);
      return {
        resultForModel: {
          removed: removedName,
          routine: updated ? routineSummary(updated) : null,
        },
      };
    },
  },

  {
    name: 'delete_routine',
    description:
      'Delete an entire routine and all its exercises. Destructive — confirm with the member first unless they clearly asked to delete it.',
    parameters: {
      type: 'object',
      properties: { routineName: { type: 'string' } },
      required: ['routineName'],
    },
    async execute(args) {
      const routineName = asString(args.routineName);
      if (!routineName) return { resultForModel: { error: 'delete_routine needs routineName.' } };
      const routine = await resolveRoutine(routineName);
      if (!routine) return { resultForModel: { error: `No routine named "${routineName}".` } };
      const deletedName = routine.name;
      await routineRepo.deleteRoutine(routine.id);
      return { resultForModel: { deleted: deletedName } };
    },
  },

  {
    name: 'update_targets',
    description:
      "Update the member's profile: display name, primary goal, and/or daily nutrition targets (calories, protein, carbs, fat in grams). Only pass the fields being changed.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        goal: { type: 'string', enum: ['muscle', 'fat_loss', 'strength', 'general'] },
        calorieTarget: { type: 'integer' },
        proteinTargetG: { type: 'integer' },
        carbsTargetG: { type: 'integer' },
        fatTargetG: { type: 'integer' },
      },
    },
    async execute(args) {
      const patch: Partial<Omit<UserProfile, 'id'>> = {};
      const name = asString(args.name);
      if (name) patch.name = name;
      const goal = asString(args.goal)?.toLowerCase();
      if (goal && (GOALS as string[]).includes(goal)) patch.goal = goal as Goal;
      const cal = asNumber(args.calorieTarget);
      if (cal !== undefined) patch.calorieTarget = clampInt(cal, 0, 20000);
      const pro = asNumber(args.proteinTargetG);
      if (pro !== undefined) patch.proteinTargetG = clampInt(pro, 0, 1000);
      const carb = asNumber(args.carbsTargetG);
      if (carb !== undefined) patch.carbsTargetG = clampInt(carb, 0, 2000);
      const fat = asNumber(args.fatTargetG);
      if (fat !== undefined) patch.fatTargetG = clampInt(fat, 0, 1000);
      if (Object.keys(patch).length === 0) {
        return {
          resultForModel: {
            error: 'Nothing to update — pass name, goal, or a calorie/protein/carb/fat target.',
          },
        };
      }
      const updated = await userRepo.updateProfile(patch);
      return {
        resultForModel: {
          updated: true,
          profile: {
            name: updated.name,
            goal: updated.goal,
            calorieTarget: updated.calorieTarget,
            proteinTargetG: updated.proteinTargetG,
            carbsTargetG: updated.carbsTargetG,
            fatTargetG: updated.fatTargetG,
          },
        },
      };
    },
  },

  {
    name: 'delete_meal',
    description:
      "Delete a logged meal, identified by a word or two from its description (and optionally the day). Destructive — confirm with the member first unless they clearly asked to delete it. Call get_nutrition to see the day's meals.",
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A word or phrase from the meal to delete, e.g. "butter chicken".',
        },
        dateISO: { type: 'string', description: "Local day 'YYYY-MM-DD'. Omit for today." },
      },
    },
    async execute(args) {
      const dateISO = asString(args.dateISO) ?? todayISO();
      const query = asString(args.description)?.toLowerCase();
      const meals = await nutritionRepo.getMealsForDay(dateISO);
      if (!meals.length) return { resultForModel: { error: `No meals logged on ${dateISO}.` } };
      let target = meals[0];
      let otherMatches = 0;
      if (query) {
        const matches = meals.filter((m) => m.description.toLowerCase().includes(query));
        if (!matches.length) {
          return {
            resultForModel: {
              error: `No meal matching "${query}" on ${dateISO}.`,
              mealsThatDay: meals.map((m) => m.description),
            },
          };
        }
        target = matches[matches.length - 1]; // most recently logged match
        otherMatches = matches.length - 1;
      } else if (meals.length > 1) {
        return {
          resultForModel: {
            error: `${meals.length} meals logged on ${dateISO} — say which one to delete.`,
            mealsThatDay: meals.map((m) => m.description),
          },
        };
      }
      await nutritionRepo.deleteMeal(target.id);
      const snap = await nutritionSnapshot(dateISO);
      return {
        resultForModel: {
          deleted: target.description,
          dateISO,
          // Let the coach mention leftovers rather than assume it cleared them all.
          ...(otherMatches > 0
            ? { note: `${otherMatches} other meal(s) also matched "${query}" and were kept.` }
            : {}),
          dayTotals: {
            calories: Math.round(snap.day.calories),
            proteinG: Math.round(snap.day.proteinG),
          },
          remaining: snap.remaining,
        },
      };
    },
  },

  {
    name: 'delete_session',
    description:
      'Delete a logged workout session (all its sets) on a given day. Destructive — confirm with the member first unless they clearly asked to delete it. Call get_recent_workouts to see recent sessions and their dates.',
    parameters: {
      type: 'object',
      properties: {
        dateISO: {
          type: 'string',
          description: "Local day 'YYYY-MM-DD' of the workout to delete.",
        },
      },
      required: ['dateISO'],
    },
    async execute(args) {
      const dateISO = asString(args.dateISO);
      if (!dateISO) {
        return { resultForModel: { error: 'delete_session needs the dateISO of the workout.' } };
      }
      const sessions = await workoutRepo.getSessionsBetween(dateISO, dateISO);
      if (!sessions.length) return { resultForModel: { error: `No workout logged on ${dateISO}.` } };
      const target = sessions[sessions.length - 1]; // most recent that day (asc order)
      const detail = await workoutRepo.getSessionDetail(target.id);
      await workoutRepo.deleteSession(target.id);
      return {
        resultForModel: {
          deleted: true,
          dateISO,
          dayType: target.dayType,
          exercises: detail ? detail.exercises.map((e) => e.exercise.name) : [],
          ...(sessions.length > 1
            ? { note: `${sessions.length} sessions were on ${dateISO}; deleted the most recent.` }
            : {}),
        },
      };
    },
  },
];

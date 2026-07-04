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
import type {
  DayType,
  Exercise,
  MuscleGroup,
  NutritionDay,
  PersonalRecord,
  SessionDetail,
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
      const snap = await nutritionSnapshot(dateISO);
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
      return {
        resultForModel: {
          name: stats.exercise.name,
          muscleGroup: stats.exercise.muscleGroup,
          sessionsCount: stats.sessionsCount,
          bestSet: stats.bestSet
            ? `${fmtSet(stats.bestSet.weightKg, stats.bestSet.reps)} on ${stats.bestSet.dateISO}`
            : null,
          prE1rmKg: stats.prE1rmKg !== null ? Math.round(stats.prE1rmKg * 10) / 10 : null,
          avgWeightKg: stats.avgWeightKg !== null ? Math.round(stats.avgWeightKg * 10) / 10 : null,
          avgReps: stats.avgReps !== null ? Math.round(stats.avgReps * 10) / 10 : null,
          recentSessions: stats.progress.slice(-5).map((p) => ({
            dateISO: p.dateISO,
            topWeightKg: p.topWeightKg,
            e1rmKg: Math.round(p.e1rmKg * 10) / 10,
            volumeKg: Math.round(p.volumeKg),
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
];

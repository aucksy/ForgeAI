import { getDb } from '@/db';
import type {
  Exercise,
  MuscleGroup,
  PlanDay,
  PlanExercise,
  WorkoutPlan,
} from '@/types/models';

export type PlanDayFull = PlanDay & { exercises: (PlanExercise & { exercise: Exercise })[] };

// ---------------------------------------------------------------- rows

interface PlanRow {
  id: string;
  name: string;
  is_active: number;
}

interface PlanDayRow {
  id: string;
  plan_id: string;
  day_type: string;
  day_order: number;
  name: string;
}

interface PlanExerciseRow {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  ex_order: number;
  target_sets: number;
  rep_range_min: number;
  rep_range_max: number;
}

interface ExerciseRow {
  id: string;
  name: string;
  aliases: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  is_compound: number;
  increment_kg: number;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    aliases: parseJsonArray(r.aliases),
    muscleGroup: r.muscle_group as MuscleGroup,
    secondaryMuscles: parseJsonArray(r.secondary_muscles) as MuscleGroup[],
    equipment: r.equipment as Exercise['equipment'],
    isCompound: r.is_compound === 1,
    incrementKg: r.increment_kg,
  };
}

function mapPlanDay(r: PlanDayRow): PlanDay {
  return {
    id: r.id,
    planId: r.plan_id,
    dayType: r.day_type as PlanDay['dayType'],
    order: r.day_order,
    name: r.name,
  };
}

function mapPlanExercise(r: PlanExerciseRow): PlanExercise {
  return {
    id: r.id,
    planDayId: r.plan_day_id,
    exerciseId: r.exercise_id,
    order: r.ex_order,
    targetSets: r.target_sets,
    repRangeMin: r.rep_range_min,
    repRangeMax: r.rep_range_max,
  };
}

// ---------------------------------------------------------------- api

export async function getActivePlan(): Promise<{ plan: WorkoutPlan; days: PlanDayFull[] } | null> {
  const db = getDb();
  const planRow = await db.getFirstAsync<PlanRow>(
    'SELECT * FROM workout_plans WHERE is_active = 1 LIMIT 1',
  );
  if (!planRow) return null;
  const plan: WorkoutPlan = { id: planRow.id, name: planRow.name, isActive: true };

  const dayRows = await db.getAllAsync<PlanDayRow>(
    'SELECT * FROM plan_days WHERE plan_id = ? ORDER BY day_order ASC',
    [plan.id],
  );
  if (dayRows.length === 0) return { plan, days: [] };

  const dayPlaceholders = dayRows.map(() => '?').join(', ');
  const peRows = await db.getAllAsync<PlanExerciseRow>(
    `SELECT * FROM plan_exercises WHERE plan_day_id IN (${dayPlaceholders}) ORDER BY ex_order ASC`,
    dayRows.map((d) => d.id),
  );

  const exerciseIds = [...new Set(peRows.map((r) => r.exercise_id))];
  const exercises = new Map<string, Exercise>();
  if (exerciseIds.length > 0) {
    const exPlaceholders = exerciseIds.map(() => '?').join(', ');
    const exRows = await db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises WHERE id IN (${exPlaceholders})`,
      exerciseIds,
    );
    for (const r of exRows) exercises.set(r.id, mapExercise(r));
  }

  const days: PlanDayFull[] = dayRows.map((dayRow) => ({
    ...mapPlanDay(dayRow),
    exercises: peRows
      .filter((pe) => pe.plan_day_id === dayRow.id)
      .flatMap((pe) => {
        const exercise = exercises.get(pe.exercise_id);
        return exercise ? [{ ...mapPlanExercise(pe), exercise }] : [];
      }),
  }));
  return { plan, days };
}

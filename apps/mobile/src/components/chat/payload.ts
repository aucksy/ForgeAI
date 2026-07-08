/**
 * Runtime payload guards for the rich chat cards (chat-ui module).
 *
 * `ChatMessage.payload` arrives as already-parsed JSON from the orchestrator
 * tool loop, the local coach, or seeded history. The shapes are conventions,
 * not compile-time guarantees — every card validates its payload with these
 * parsers and the bubble falls back to plain `message.text` when anything is
 * off. Parsers never throw.
 */

// ------------------------------------------------------------------ views

export interface PlanTargetView {
  exerciseName: string;
  last: { weightKg: number; topReps: number; sets: number } | null;
  targetWeightKg: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets: number;
  reason: string;
  action: 'increase' | 'hold' | 'deload' | 'start';
}

export interface WorkoutPlanView {
  dayName: string;
  headline: string;
  targets: PlanTargetView[];
}

export interface LoggedExerciseView {
  name: string;
  setCount: number;
  topWeightKg: number;
}

export interface PrView {
  exerciseName: string;
  kind: string;
  value: number;
  weightKg: number;
  reps: number;
  dateISO: string | null;
}

export interface WorkoutLoggedView {
  dayType: string;
  dateISO: string | null;
  totalVolumeKg: number;
  setCount: number;
  exercises: LoggedExerciseView[];
  newPrs: PrView[];
}

export interface MealView {
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUri: string | null;
}

export interface MacroBlockView {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionSummaryView {
  day: MacroBlockView;
  targets: MacroBlockView;
  remaining: MacroBlockView;
}

export interface StatRowView {
  label: string;
  value: string;
}

// ------------------------------------------------------------------ guards

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function dateStr(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

const ACTIONS = ['increase', 'hold', 'deload', 'start'] as const;
type PlanAction = (typeof ACTIONS)[number];

function isAction(v: unknown): v is PlanAction {
  return typeof v === 'string' && (ACTIONS as readonly string[]).includes(v);
}

// ------------------------------------------------------------------ parsers

/** 'workout_plan' -> TodaysWorkout-shaped payload. */
export function parseWorkoutPlan(payload: unknown): WorkoutPlanView | null {
  if (!isRecord(payload) || !Array.isArray(payload.targets)) return null;
  const targets: PlanTargetView[] = [];
  for (const raw of payload.targets) {
    if (!isRecord(raw)) continue;
    if (
      !str(raw.exerciseName) ||
      !num(raw.targetWeightKg) ||
      !num(raw.targetRepsMin) ||
      !num(raw.targetRepsMax) ||
      !num(raw.targetSets) ||
      !isAction(raw.action)
    ) {
      continue;
    }
    const lastRaw = raw.last;
    const last =
      isRecord(lastRaw) && num(lastRaw.weightKg) && num(lastRaw.topReps)
        ? {
            weightKg: lastRaw.weightKg,
            topReps: lastRaw.topReps,
            sets: num(lastRaw.sets) ? lastRaw.sets : 0,
          }
        : null;
    targets.push({
      exerciseName: raw.exerciseName,
      last,
      targetWeightKg: raw.targetWeightKg,
      targetRepsMin: raw.targetRepsMin,
      targetRepsMax: raw.targetRepsMax,
      targetSets: raw.targetSets,
      reason: typeof raw.reason === 'string' ? raw.reason : '',
      action: raw.action,
    });
  }
  if (targets.length === 0) return null;
  return {
    dayName: str(payload.dayName) ? payload.dayName : "Today's workout",
    headline: typeof payload.headline === 'string' ? payload.headline : '',
    targets,
  };
}

function parsePrRows(v: unknown): PrView[] | null {
  if (!Array.isArray(v)) return null;
  const out: PrView[] = [];
  for (const raw of v) {
    if (!isRecord(raw)) continue;
    if (!str(raw.exerciseName) || !num(raw.value)) continue;
    out.push({
      exerciseName: raw.exerciseName,
      kind: typeof raw.kind === 'string' ? raw.kind : 'weight',
      value: raw.value,
      weightKg: num(raw.weightKg) ? raw.weightKg : raw.value,
      reps: num(raw.reps) ? raw.reps : 0,
      dateISO: dateStr(raw.dateISO),
    });
  }
  return out;
}

/** 'workout_logged' -> SessionDetail (& optional newPrs) payload. */
export function parseWorkoutLogged(payload: unknown): WorkoutLoggedView | null {
  if (!isRecord(payload)) return null;
  if (!Array.isArray(payload.exercises) || !num(payload.totalVolumeKg) || !str(payload.dayType)) {
    return null;
  }
  const exercises: LoggedExerciseView[] = [];
  let setCount = 0;
  for (const e of payload.exercises) {
    if (!isRecord(e)) continue;
    const ex = e.exercise;
    if (!isRecord(ex) || !str(ex.name)) continue;
    const sets = Array.isArray(e.sets) ? e.sets : [];
    let top = 0;
    let n = 0;
    for (const s of sets) {
      if (!isRecord(s)) continue;
      n += 1;
      const w = s.weightKg;
      if (num(w) && w > top) top = w;
    }
    setCount += n;
    exercises.push({ name: ex.name, setCount: n, topWeightKg: top });
  }
  if (exercises.length === 0) return null;
  return {
    dayType: payload.dayType,
    dateISO: dateStr(payload.dateISO),
    totalVolumeKg: payload.totalVolumeKg,
    setCount,
    exercises,
    newPrs: parsePrRows(payload.newPrs) ?? [],
  };
}

/** 'meal_logged' -> Meal payload. */
export function parseMeal(payload: unknown): MealView | null {
  if (!isRecord(payload)) return null;
  if (
    !str(payload.description) ||
    !num(payload.calories) ||
    !num(payload.proteinG) ||
    !num(payload.carbsG) ||
    !num(payload.fatG)
  ) {
    return null;
  }
  return {
    description: payload.description,
    calories: payload.calories,
    proteinG: payload.proteinG,
    carbsG: payload.carbsG,
    fatG: payload.fatG,
    photoUri: str(payload.photoUri) ? payload.photoUri : null,
  };
}

function parseMacroBlock(v: unknown): MacroBlockView | null {
  if (!isRecord(v)) return null;
  if (!num(v.calories) || !num(v.proteinG) || !num(v.carbsG) || !num(v.fatG)) return null;
  return { calories: v.calories, proteinG: v.proteinG, carbsG: v.carbsG, fatG: v.fatG };
}

/** 'nutrition_summary' -> { day, targets, remaining } payload. */
export function parseNutritionSummary(payload: unknown): NutritionSummaryView | null {
  if (!isRecord(payload)) return null;
  const day = parseMacroBlock(payload.day);
  const targets = parseMacroBlock(payload.targets);
  if (!day || !targets) return null;
  const remaining = parseMacroBlock(payload.remaining) ?? {
    calories: Math.max(0, targets.calories - day.calories),
    proteinG: Math.max(0, targets.proteinG - day.proteinG),
    carbsG: Math.max(0, targets.carbsG - day.carbsG),
    fatG: Math.max(0, targets.fatG - day.fatG),
  };
  return { day, targets, remaining };
}

/** 'pr_list' -> (PersonalRecord & { exerciseName })[] payload. */
export function parsePrList(payload: unknown): PrView[] | null {
  const rows = parsePrRows(payload);
  return rows && rows.length > 0 ? rows : null;
}

/** 'stats' -> { label, value }[] payload. */
export function parseStats(payload: unknown): StatRowView[] | null {
  if (!Array.isArray(payload)) return null;
  const out: StatRowView[] = [];
  for (const raw of payload) {
    if (!isRecord(raw)) continue;
    if (!str(raw.label) || !str(raw.value)) continue;
    out.push({ label: raw.label, value: raw.value });
  }
  return out.length > 0 ? out : null;
}

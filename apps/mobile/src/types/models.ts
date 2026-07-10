/**
 * ForgeAI domain model — single source of truth for every module.
 * All persisted entities live in SQLite (see src/db/schema.ts).
 * Weights are ALWAYS stored in kg; display conversion happens in lib/format.
 * Dates: `dateISO` is a local calendar day 'YYYY-MM-DD'; timestamps are epoch ms.
 */

// ---------------------------------------------------------------- user

export type Goal = 'muscle' | 'fat_loss' | 'strength' | 'general';
export type UnitSystem = 'metric' | 'imperial';
export type AppLanguage = 'en' | 'hi' | 'hinglish';

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  heightCm: number;
  goal: Goal;
  experience: 'beginner' | 'intermediate' | 'advanced';
  gymName: string;
  memberSinceISO: string;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  unitSystem: UnitSystem;
  language: AppLanguage;
}

export interface BodyWeightEntry {
  id: string;
  dateISO: string;
  weightKg: number;
}

// ---------------------------------------------------------------- exercises

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms';

export type DayType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full' | 'rest';

export interface Exercise {
  id: string;
  name: string;
  /** lower-cased alternate names for NL matching, incl. Hindi/Hinglish. */
  aliases: string[];
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';
  isCompound: boolean;
  /** Smallest sensible weight jump for progressive overload, in kg. */
  incrementKg: number;
}

// ---------------------------------------------------------------- workouts

export interface WorkoutSession {
  id: string;
  dateISO: string;
  startedAt: number;
  endedAt: number | null;
  dayType: DayType;
  notes: string | null;
  source: 'chat' | 'seed' | 'manual';
}

export interface SetEntry {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number; // 1-based within (session, exercise)
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

/** A session joined with its sets, grouped per exercise (query-layer shape). */
export interface SessionDetail extends WorkoutSession {
  exercises: {
    exercise: Exercise;
    sets: SetEntry[];
    volumeKg: number;
  }[];
  totalVolumeKg: number;
}

export interface PersonalRecord {
  id: string;
  exerciseId: string;
  kind: 'weight' | 'e1rm' | 'volume';
  value: number; // kg for weight/e1rm, kg total for volume
  weightKg: number;
  reps: number;
  dateISO: string;
  sessionId: string;
}

// ---------------------------------------------------------------- plans

export interface WorkoutPlan {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PlanDay {
  id: string;
  planId: string;
  dayType: DayType;
  /** rotation order within the plan, 0-based */
  order: number;
  name: string; // e.g. "Push Day A"
}

export interface PlanExercise {
  id: string;
  planDayId: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  repRangeMin: number;
  repRangeMax: number;
}

// ---------------------------------------------------------------- nutrition

export interface Meal {
  id: string;
  dateISO: string;
  loggedAt: number;
  /** human description, e.g. "Butter chicken + 2 rotis" */
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: 'text' | 'photo' | 'seed';
  photoUri: string | null;
}

export interface NutritionDay {
  dateISO: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
}

// ---------------------------------------------------------------- coach engine

/** Progressive-overload prescription for one exercise on today's workout. */
export interface OverloadTarget {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  /** null when the exercise has never been performed. */
  last: { weightKg: number; topReps: number; sets: number; dateISO: string } | null;
  targetWeightKg: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets: number;
  /** One-sentence WHY, e.g. "Completed all target reps last week." */
  reason: string;
  action: 'increase' | 'hold' | 'deload' | 'start';
}

export interface TodaysWorkout {
  dayType: DayType;
  dayName: string;
  planDayId: string | null;
  targets: OverloadTarget[];
  /** Coach-voice framing line for the day. */
  headline: string;
}

export interface RecoveryStatus {
  /** 0-100, higher = fresher. */
  score: number;
  label: 'primed' | 'good' | 'moderate' | 'low';
  /** per-muscle hours since last trained, used for advice. */
  muscleFreshness: { muscleGroup: MuscleGroup; hoursSince: number; fresh: boolean }[];
  note: string;
}

export interface StrengthScore {
  /** 0-100 composite of key-lift e1RM relative to bodyweight. */
  score: number;
  label: string;
  keyLifts: { exerciseName: string; e1rmKg: number; ratio: number }[];
}

// ---------------------------------------------------------------- chat

export type MessageRole = 'user' | 'coach';

/**
 * Structured payloads let the chat render rich cards instead of plain text.
 * `workout_plan` -> TodaysWorkout, `workout_logged` -> SessionDetail summary,
 * `meal_logged` -> Meal, `nutrition_summary` -> NutritionDay + targets,
 * `pr_list` -> PersonalRecord[] joined w/ names, `stats` -> generic stat rows.
 */
export type MessageKind =
  | 'text'
  | 'workout_plan'
  | 'workout_logged'
  | 'meal_logged'
  | 'nutrition_summary'
  | 'pr_list'
  | 'stats'
  | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  /** Always present: plain-text rendering / transcript of the message. */
  text: string;
  /** JSON payload for rich cards, shape depends on `kind`. */
  payload: unknown | null;
  createdAt: number;
  /** true while the coach is still generating (UI-only, not persisted). */
  pending?: boolean;
  /** optional image attached by the user (meal photo). */
  imageUri?: string | null;
}

// ---------------------------------------------------------------- dashboard

export interface DashboardData {
  todaysWorkout: TodaysWorkout;
  streakDays: number;
  workoutsThisWeek: number;
  caloriesToday: number;
  proteinTodayG: number;
  calorieTarget: number;
  proteinTargetG: number;
  recovery: RecoveryStatus;
  strength: StrengthScore;
  weeklyVolumeKg: number;
  weeklyVolumeDeltaPct: number; // vs previous week
  bodyWeightKg: number | null;
  bodyWeightTrend: { dateISO: string; weightKg: number }[]; // last ~30d
  insight: string; // AI-coach insight line
  lastWorkout: { dateISO: string; dayType: DayType; volumeKg: number } | null;
}

// ---------------------------------------------------------------- analytics

export interface VolumePoint {
  /** ISO date of the week's Monday (weekly buckets) or the day. */
  dateISO: string;
  volumeKg: number;
}

export interface ExerciseProgressPoint {
  dateISO: string;
  topWeightKg: number;
  e1rmKg: number;
  volumeKg: number;
}

export interface MuscleVolumeSlice {
  muscleGroup: MuscleGroup;
  volumeKg: number;
  sets: number;
}

export interface ConsistencyCell {
  dateISO: string;
  /** 0 = rest, intensity 1..4 by session volume quartile. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ExerciseStats {
  exercise: Exercise;
  sessionsCount: number;
  bestSet: { weightKg: number; reps: number; dateISO: string } | null;
  prE1rmKg: number | null;
  avgWeightKg: number | null;
  avgReps: number | null;
  progress: ExerciseProgressPoint[];
  history: {
    sessionId: string;
    dateISO: string;
    sets: SetEntry[];
    volumeKg: number;
  }[];
}

// ---------------------------------------------------------------- AI settings

export type AiProviderId = 'anthropic' | 'openai' | 'groq' | 'local';

export interface AiSettings {
  provider: AiProviderId;
  anthropicModel: string;
  openaiModel: string;
  groqModel: string;
  voiceEnabled: boolean;
  speakReplies: boolean;
}

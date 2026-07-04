/**
 * Demo-data seeder. First launch only (meta.seeded flag): profile, exercise
 * catalog, active PPL plan, 13 weeks of sessions/sets/PRs, body weight, meals
 * and a seeded coach conversation — everything inserted in ONE exclusive
 * transaction via multi-row batched statements (fast enough for on-device
 * first paint), with the seeded flag written last inside the same transaction.
 *
 * Deterministic: mulberry32(42); 'today' comes from todayISO() so the history
 * always ends yesterday relative to the launch day. No Math.random/Date.now.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, getMeta } from '@/db';
import { todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';

import { generateChat } from './chat';
import { EXERCISES, type ExerciseKey } from './exercises';
import { generateHistory } from './history';
import { generateMeals } from './meals';
import { PLAN_DAYS, PLAN_NAME } from './plan';
import { SEED_PROFILE } from './profile';
import { mulberry32 } from './rng';

type SqlValue = string | number | null;
type TxLike = Pick<SQLiteDatabase, 'runAsync'>;

/** Multi-row INSERT in chunks that stay under SQLite's bind-variable limit. */
async function batchInsert(
  tx: TxLike,
  table: string,
  cols: readonly string[],
  rows: SqlValue[][],
): Promise<void> {
  if (rows.length === 0) return;
  const perChunk = Math.max(1, Math.floor(800 / cols.length));
  const tuple = `(${cols.map(() => '?').join(', ')})`;
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    await tx.runAsync(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')}`,
      chunk.flat(),
    );
  }
}

let inFlight: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!inFlight) {
    inFlight = seed().catch((err: unknown) => {
      inFlight = null; // allow a retry on next call
      throw err;
    });
  }
  return inFlight;
}

async function seed(): Promise<void> {
  if ((await getMeta('seeded')) === '1') return;

  const today = todayISO();
  const rng = mulberry32(42);

  // ---- generate everything in memory first (cheap), then insert in one tx.
  const exerciseIds = {} as Record<ExerciseKey, string>;
  for (const ex of EXERCISES) exerciseIds[ex.key] = uuid();

  const history = generateHistory(today, rng);
  const sessionEndByDate = new Map<string, number>();
  for (const s of history.sessions) sessionEndByDate.set(s.dateISO, s.endedAt);
  const meals = generateMeals(today, history.trainingDates, sessionEndByDate, rng);

  const planId = uuid();
  const planDayIds = PLAN_DAYS.map(() => uuid());
  const chat = generateChat({ today, history, meals, exerciseIds, planDayIds });

  // ---- flatten to rows.
  const profileRow: SqlValue[] = [
    uuid(),
    SEED_PROFILE.name,
    SEED_PROFILE.age,
    SEED_PROFILE.heightCm,
    SEED_PROFILE.goal,
    SEED_PROFILE.experience,
    SEED_PROFILE.gymName,
    SEED_PROFILE.memberSinceISO,
    SEED_PROFILE.calorieTarget,
    SEED_PROFILE.proteinTargetG,
    SEED_PROFILE.carbsTargetG,
    SEED_PROFILE.fatTargetG,
    SEED_PROFILE.unitSystem,
    SEED_PROFILE.language,
  ];

  const exerciseRows: SqlValue[][] = EXERCISES.map((ex) => [
    exerciseIds[ex.key],
    ex.name,
    JSON.stringify(ex.aliases),
    ex.muscleGroup,
    JSON.stringify(ex.secondaryMuscles),
    ex.equipment,
    ex.isCompound ? 1 : 0,
    ex.incrementKg,
  ]);

  const planDayRows: SqlValue[][] = [];
  const planExerciseRows: SqlValue[][] = [];
  PLAN_DAYS.forEach((day, dayIdx) => {
    planDayRows.push([planDayIds[dayIdx], planId, day.dayType, dayIdx, day.name]);
    day.exercises.forEach((pe, exIdx) => {
      planExerciseRows.push([
        uuid(),
        planDayIds[dayIdx],
        exerciseIds[pe.key],
        exIdx,
        pe.sets,
        pe.repMin,
        pe.repMax,
      ]);
    });
  });

  const sessionRows: SqlValue[][] = [];
  const setRows: SqlValue[][] = [];
  for (const s of history.sessions) {
    sessionRows.push([
      s.id,
      s.dateISO,
      s.startedAt,
      s.endedAt,
      s.dayType,
      s.notes,
      chat.chatSessionIds.has(s.id) ? 'chat' : 'seed',
    ]);
    for (const st of s.sets) {
      setRows.push([st.id, s.id, exerciseIds[st.exerciseKey], st.setNumber, st.weightKg, st.reps, st.isWarmup ? 1 : 0]);
    }
  }

  const prRows: SqlValue[][] = history.prs.map((pr) => [
    pr.id,
    exerciseIds[pr.exerciseKey],
    pr.kind,
    pr.value,
    pr.weightKg,
    pr.reps,
    pr.dateISO,
    pr.sessionId,
  ]);

  const bodyWeightRows: SqlValue[][] = history.bodyWeight.map((bw) => [bw.id, bw.dateISO, bw.weightKg]);

  const mealRows: SqlValue[][] = meals.map((m) => [
    m.id,
    m.dateISO,
    m.loggedAt,
    m.description,
    m.calories,
    m.proteinG,
    m.carbsG,
    m.fatG,
    chat.chatMealIds.has(m.id) ? 'text' : 'seed',
    null,
  ]);

  const chatRows: SqlValue[][] = chat.messages.map((msg) => [
    msg.id,
    msg.role,
    msg.kind,
    msg.text,
    msg.payload === null ? null : JSON.stringify(msg.payload),
    null,
    msg.createdAt,
  ]);

  // ---- one exclusive transaction; seeded flag last so a crash re-seeds clean.
  await getDb().withExclusiveTransactionAsync(async (tx) => {
    await batchInsert(tx, 'user_profile', [
      'id', 'name', 'age', 'height_cm', 'goal', 'experience', 'gym_name', 'member_since_iso',
      'calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g', 'unit_system', 'language',
    ], [profileRow]);
    await batchInsert(tx, 'exercises', [
      'id', 'name', 'aliases', 'muscle_group', 'secondary_muscles', 'equipment', 'is_compound', 'increment_kg',
    ], exerciseRows);
    await batchInsert(tx, 'workout_plans', ['id', 'name', 'is_active'], [[planId, PLAN_NAME, 1]]);
    await batchInsert(tx, 'plan_days', ['id', 'plan_id', 'day_type', 'day_order', 'name'], planDayRows);
    await batchInsert(tx, 'plan_exercises', [
      'id', 'plan_day_id', 'exercise_id', 'ex_order', 'target_sets', 'rep_range_min', 'rep_range_max',
    ], planExerciseRows);
    await batchInsert(tx, 'workout_sessions', [
      'id', 'date_iso', 'started_at', 'ended_at', 'day_type', 'notes', 'source',
    ], sessionRows);
    await batchInsert(tx, 'set_entries', [
      'id', 'session_id', 'exercise_id', 'set_number', 'weight_kg', 'reps', 'is_warmup',
    ], setRows);
    await batchInsert(tx, 'personal_records', [
      'id', 'exercise_id', 'kind', 'value', 'weight_kg', 'reps', 'date_iso', 'session_id',
    ], prRows);
    await batchInsert(tx, 'body_weight', ['id', 'date_iso', 'weight_kg'], bodyWeightRows);
    await batchInsert(tx, 'meals', [
      'id', 'date_iso', 'logged_at', 'description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'source', 'photo_uri',
    ], mealRows);
    await batchInsert(tx, 'chat_messages', [
      'id', 'role', 'kind', 'text', 'payload', 'image_uri', 'created_at',
    ], chatRows);
    await tx.runAsync(
      `INSERT INTO meta(key, value) VALUES('seeded', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  });
}

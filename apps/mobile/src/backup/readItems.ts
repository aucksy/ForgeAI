/**
 * Everything the member keeps, as packed records (pack.ts) — ForgeAI 0.55.2's copy of MettleUp's
 * reader (MettleUp: src/cloud/copyLocal.ts readLocalItems, R-123), so both apps write the same
 * records and MettleUp restores a ForgeAI backup exactly. The database is the same in both apps.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/db';
import {
  exerciseRef,
  measurementId,
  packBodyWeight,
  packExercise,
  packFolder,
  packHash,
  packMeasurement,
  packPhotoRecord,
  packPrefs,
  packProfile,
  packWorkout,
  type DayRow,
  type FolderRow,
  type ItemKind,
  type OwnExerciseRow,
  type PlanExerciseRow,
  type ProfileRow,
  type SetRow,
  type WorkoutRow,
} from '@/cloud/pack';

type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

/** One thing on the phone, packed. `guess`: its edit time (ms). */
export interface LocalItem {
  kind: ItemKind;
  id: string;
  data: string;
  hash: string;
  guess: number;
}

function item(kind: ItemKind, id: string, data: string, guess = 0): LocalItem {
  return { kind, id, data, hash: packHash(data), guess };
}

export async function readLocalItems(db: Tx = getDb()): Promise<LocalItem[]> {
  const exRows = await db.getAllAsync<{ id: string; catalog_key: string | null }>('SELECT id, catalog_key FROM exercises');
  const refs = new Map(exRows.map((r) => [r.id, exerciseRef(r.id, r.catalog_key)]));
  const refOf = (id: string): string => refs.get(id) ?? `x:${id}`;
  const out: LocalItem[] = [];

  const sessions = await db.getAllAsync<WorkoutRow>(
    'SELECT id, date_iso, started_at, ended_at, day_type, notes, source, easy_week, title, routine_id FROM workout_sessions',
  );
  const sets = await db.getAllAsync<SetRow & { session_id: string }>(
    `SELECT session_id, exercise_id, set_number, weight_kg, reps, is_warmup, rpe, set_type, note, superset_group,
            duration_sec, distance_m, load_mode, card_index
       FROM set_entries ORDER BY session_id, rowid`,
  );
  const bySession = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = bySession.get(s.session_id);
    if (list) list.push(s);
    else bySession.set(s.session_id, [s]);
  }
  for (const w of sessions) out.push(item('w', w.id, packWorkout(w, bySession.get(w.id) ?? [], refOf), w.ended_at ?? w.started_at));

  const folders = await db.getAllAsync<FolderRow>('SELECT id, name, is_active, folder_order, source, settings FROM workout_plans');
  const days = await db.getAllAsync<DayRow>('SELECT id, plan_id, day_type, day_order, name FROM plan_days ORDER BY plan_id, day_order, rowid');
  const exs = await db.getAllAsync<PlanExerciseRow>(
    `SELECT plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max, sets_json, rest_sec, superset_group, note
       FROM plan_exercises ORDER BY plan_day_id, ex_order, rowid`,
  );
  for (const f of folders) {
    const mine = days.filter((d) => d.plan_id === f.id);
    const ids = new Set(mine.map((d) => d.id));
    out.push(item('r', f.id, packFolder(f, mine, exs.filter((e) => ids.has(e.plan_day_id)), refOf)));
  }

  const own = await db.getAllAsync<OwnExerciseRow & { id: string }>(
    `SELECT id, name, muscle_group, equipment, is_compound, increment_kg, aliases, secondary_muscles, log_type, load_mode,
            bw_share, muscles, dist_unit
       FROM exercises WHERE catalog_key IS NULL`,
  );
  for (const e of own) out.push(item('x', e.id, packExercise(e)));

  const prefs = await db.getAllAsync<{ exercise_id: string; rest_sec: number | null; records_from: string | null }>(
    'SELECT exercise_id, rest_sec, records_from FROM exercise_prefs',
  );
  const prefRows = prefs.filter((p) => refs.has(p.exercise_id) && (p.rest_sec != null || p.records_from != null));
  if (prefRows.length > 0) {
    out.push(item('p', 'all', packPrefs(prefRows.map((p) => ({ ref: refOf(p.exercise_id), rest_sec: p.rest_sec, records_from: p.records_from })))));
  }

  for (const b of await db.getAllAsync<{ date_iso: string; weight_kg: number }>('SELECT date_iso, weight_kg FROM body_weight')) {
    out.push(item('b', b.date_iso, packBodyWeight(b.weight_kg)));
  }
  for (const m of await db.getAllAsync<{ date_iso: string; kind: string; value: number }>('SELECT date_iso, kind, value FROM body_measurements')) {
    out.push(item('m', measurementId(m.date_iso, m.kind), packMeasurement(m.value)));
  }
  for (const p of await db.getAllAsync<{ id: string; date_iso: string; created_at: number }>('SELECT id, date_iso, created_at FROM progress_photos')) {
    out.push(item('f', p.id, packPhotoRecord(p.date_iso, p.created_at)));
  }
  const profile = await db.getFirstAsync<ProfileRow>(
    `SELECT name, age, height_cm, goal, experience, gym_name, member_since_iso, calorie_target, protein_target_g, carbs_target_g,
            fat_target_g, unit_system, language, bio, link
       FROM user_profile ORDER BY rowid LIMIT 1`,
  );
  if (profile) out.push(item('u', 'me', packProfile(profile)));
  return out;
}

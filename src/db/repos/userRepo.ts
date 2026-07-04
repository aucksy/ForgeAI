import { getDb } from '@/db';
import { addDays, todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import type { BodyWeightEntry, UserProfile } from '@/types/models';

// ---------------------------------------------------------------- rows

interface ProfileRow {
  id: string;
  name: string;
  age: number;
  height_cm: number;
  goal: string;
  experience: string;
  gym_name: string;
  member_since_iso: string;
  calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  unit_system: string;
  language: string;
}

interface BodyWeightRow {
  id: string;
  date_iso: string;
  weight_kg: number;
}

function mapProfile(r: ProfileRow): UserProfile {
  return {
    id: r.id,
    name: r.name,
    age: r.age,
    heightCm: r.height_cm,
    goal: r.goal as UserProfile['goal'],
    experience: r.experience as UserProfile['experience'],
    gymName: r.gym_name,
    memberSinceISO: r.member_since_iso,
    calorieTarget: r.calorie_target,
    proteinTargetG: r.protein_target_g,
    carbsTargetG: r.carbs_target_g,
    fatTargetG: r.fat_target_g,
    unitSystem: r.unit_system as UserProfile['unitSystem'],
    language: r.language as UserProfile['language'],
  };
}

function mapBodyWeight(r: BodyWeightRow): BodyWeightEntry {
  return { id: r.id, dateISO: r.date_iso, weightKg: r.weight_kg };
}

/** camelCase model key -> snake_case column, for patch updates. */
const PROFILE_COLUMNS: Record<keyof Omit<UserProfile, 'id'>, string> = {
  name: 'name',
  age: 'age',
  heightCm: 'height_cm',
  goal: 'goal',
  experience: 'experience',
  gymName: 'gym_name',
  memberSinceISO: 'member_since_iso',
  calorieTarget: 'calorie_target',
  proteinTargetG: 'protein_target_g',
  carbsTargetG: 'carbs_target_g',
  fatTargetG: 'fat_target_g',
  unitSystem: 'unit_system',
  language: 'language',
};

// ---------------------------------------------------------------- api

export async function getProfile(): Promise<UserProfile> {
  const row = await getDb().getFirstAsync<ProfileRow>('SELECT * FROM user_profile LIMIT 1');
  if (!row) throw new Error('User profile not found — demo data has not been seeded yet');
  return mapProfile(row);
}

export async function updateProfile(
  patch: Partial<Omit<UserProfile, 'id'>>,
): Promise<UserProfile> {
  const current = await getProfile();
  const assignments: string[] = [];
  const params: (string | number)[] = [];
  for (const key of Object.keys(PROFILE_COLUMNS) as (keyof typeof PROFILE_COLUMNS)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    assignments.push(`${PROFILE_COLUMNS[key]} = ?`);
    params.push(value);
  }
  if (assignments.length === 0) return current;
  params.push(current.id);
  await getDb().runAsync(
    `UPDATE user_profile SET ${assignments.join(', ')} WHERE id = ?`,
    params,
  );
  return getProfile();
}

export async function logBodyWeight(dateISO: string, weightKg: number): Promise<BodyWeightEntry> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO body_weight(id, date_iso, weight_kg) VALUES(?, ?, ?)
     ON CONFLICT(date_iso) DO UPDATE SET weight_kg = excluded.weight_kg`,
    [uuid(), dateISO, weightKg],
  );
  const row = await db.getFirstAsync<BodyWeightRow>(
    'SELECT * FROM body_weight WHERE date_iso = ?',
    [dateISO],
  );
  if (!row) throw new Error('Body-weight upsert failed');
  return mapBodyWeight(row);
}

export async function getBodyWeightHistory(days?: number): Promise<BodyWeightEntry[]> {
  const db = getDb();
  const rows =
    days != null
      ? await db.getAllAsync<BodyWeightRow>(
          'SELECT * FROM body_weight WHERE date_iso >= ? ORDER BY date_iso ASC',
          [addDays(todayISO(), -(days - 1))],
        )
      : await db.getAllAsync<BodyWeightRow>('SELECT * FROM body_weight ORDER BY date_iso ASC');
  return rows.map(mapBodyWeight);
}

export async function getLatestBodyWeight(): Promise<BodyWeightEntry | null> {
  const row = await getDb().getFirstAsync<BodyWeightRow>(
    'SELECT * FROM body_weight ORDER BY date_iso DESC LIMIT 1',
  );
  return row ? mapBodyWeight(row) : null;
}

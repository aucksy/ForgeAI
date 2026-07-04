import { getDb } from '@/db';
import { addDays, daysBetween, fromISO, todayISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';
import type { Meal, NutritionDay } from '@/types/models';

// ---------------------------------------------------------------- rows

interface MealRow {
  id: string;
  date_iso: string;
  logged_at: number;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
  photo_uri: string | null;
}

function mapMeal(r: MealRow): Meal {
  return {
    id: r.id,
    dateISO: r.date_iso,
    loggedAt: r.logged_at,
    description: r.description,
    calories: r.calories,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    source: r.source as Meal['source'],
    photoUri: r.photo_uri,
  };
}

/** Backdated meals get a mid-day timestamp so loggedAt ordering matches days. */
function defaultLoggedAt(dateISO: string): number {
  return dateISO === todayISO() ? Date.now() : fromISO(dateISO).getTime() + 12 * 3_600_000;
}

// ---------------------------------------------------------------- api

export async function logMeal(input: {
  dateISO: string;
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source?: Meal['source'];
  photoUri?: string | null;
  loggedAt?: number;
}): Promise<Meal> {
  const meal: Meal = {
    id: uuid(),
    dateISO: input.dateISO,
    loggedAt: input.loggedAt ?? defaultLoggedAt(input.dateISO),
    description: input.description,
    calories: input.calories,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    source: input.source ?? 'text',
    photoUri: input.photoUri ?? null,
  };
  await getDb().runAsync(
    `INSERT INTO meals(id, date_iso, logged_at, description, calories, protein_g, carbs_g, fat_g, source, photo_uri)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meal.id,
      meal.dateISO,
      meal.loggedAt,
      meal.description,
      meal.calories,
      meal.proteinG,
      meal.carbsG,
      meal.fatG,
      meal.source,
      meal.photoUri,
    ],
  );
  return meal;
}

export async function getMealsForDay(dateISO: string): Promise<Meal[]> {
  const rows = await getDb().getAllAsync<MealRow>(
    'SELECT * FROM meals WHERE date_iso = ? ORDER BY logged_at ASC, rowid ASC',
    [dateISO],
  );
  return rows.map(mapMeal);
}

export async function getNutritionDay(dateISO: string): Promise<NutritionDay> {
  const row = await getDb().getFirstAsync<{
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    meal_count: number;
  }>(
    `SELECT SUM(calories) AS calories, SUM(protein_g) AS protein_g, SUM(carbs_g) AS carbs_g,
            SUM(fat_g) AS fat_g, COUNT(*) AS meal_count
     FROM meals WHERE date_iso = ?`,
    [dateISO],
  );
  return {
    dateISO,
    calories: row?.calories ?? 0,
    proteinG: row?.protein_g ?? 0,
    carbsG: row?.carbs_g ?? 0,
    fatG: row?.fat_g ?? 0,
    mealCount: row?.meal_count ?? 0,
  };
}

/** Inclusive range, ascending, zero-filled for days with no meals. */
export async function getNutritionRange(
  fromISO_: string,
  toISO: string,
): Promise<NutritionDay[]> {
  const rows = await getDb().getAllAsync<{
    date_iso: string;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    meal_count: number;
  }>(
    `SELECT date_iso, SUM(calories) AS calories, SUM(protein_g) AS protein_g,
            SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g, COUNT(*) AS meal_count
     FROM meals WHERE date_iso BETWEEN ? AND ?
     GROUP BY date_iso`,
    [fromISO_, toISO],
  );
  const byDay = new Map(rows.map((r) => [r.date_iso, r]));
  const span = daysBetween(fromISO_, toISO);
  if (span < 0) return [];
  const out: NutritionDay[] = [];
  for (let i = 0; i <= span; i++) {
    const dateISO = addDays(fromISO_, i);
    const r = byDay.get(dateISO);
    out.push({
      dateISO,
      calories: r?.calories ?? 0,
      proteinG: r?.protein_g ?? 0,
      carbsG: r?.carbs_g ?? 0,
      fatG: r?.fat_g ?? 0,
      mealCount: r?.meal_count ?? 0,
    });
  }
  return out;
}

export async function deleteMeal(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM meals WHERE id = ?', [id]);
}

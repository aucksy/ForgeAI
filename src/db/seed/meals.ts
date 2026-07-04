/**
 * 13 weeks of Indian meals. Daily kcal lands within ~±10% of the 2600 target;
 * protein ramps ~120 g -> ~158 g across the window (Arjun got serious).
 * Training days add a post-workout whey shake ~25 min after the session ends.
 * TODAY only breakfast + lunch exist, at ~55% of daily targets, so the
 * dashboard rings sit mid-day realistic on first open.
 */
import { addDays, fromISO } from '@/lib/date';
import { uuid } from '@/lib/uuid';

import { SEED_PROFILE } from './profile';
import { pick, randInt, type Rng } from './rng';

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'whey' | 'dinner';

export interface GeneratedMeal {
  id: string;
  dateISO: string;
  loggedAt: number;
  slot: MealSlot;
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface FoodItem {
  desc: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
}

const BREAKFASTS: readonly FoodItem[] = [
  { desc: 'Masala oats with milk + 1 scoop whey', kcal: 520, p: 36, c: 62, f: 13 },
  { desc: '4-egg omelette + 2 slices brown toast', kcal: 540, p: 30, c: 36, f: 28 },
  { desc: 'Paneer bhurji + 2 roti', kcal: 560, p: 26, c: 50, f: 26 },
  { desc: 'Poha with peanuts + 2 boiled eggs', kcal: 520, p: 20, c: 66, f: 18 },
  { desc: 'Moong dal chilla (3) + dahi', kcal: 480, p: 25, c: 58, f: 14 },
  { desc: 'Idli (4) + sambar + 2 boiled eggs', kcal: 500, p: 22, c: 70, f: 12 },
];

const LUNCHES: readonly FoodItem[] = [
  { desc: 'Chicken curry + 2 roti + salad', kcal: 650, p: 38, c: 60, f: 24 },
  { desc: 'Dal tadka + jeera rice + dahi', kcal: 640, p: 22, c: 94, f: 16 },
  { desc: 'Rajma chawal + salad', kcal: 680, p: 24, c: 110, f: 12 },
  { desc: 'Chicken biryani + raita', kcal: 780, p: 34, c: 98, f: 25 },
  { desc: 'Paneer tikka + 2 roti + salad', kcal: 700, p: 32, c: 54, f: 36 },
  { desc: 'Fish curry + rice', kcal: 620, p: 34, c: 72, f: 18 },
  { desc: 'Egg curry (3 eggs) + 2 roti', kcal: 640, p: 27, c: 56, f: 31 },
];

const SNACKS: readonly FoodItem[] = [
  { desc: 'Whey shake + banana', kcal: 260, p: 27, c: 32, f: 3 },
  { desc: 'Peanut butter toast + chai', kcal: 320, p: 11, c: 34, f: 16 },
  { desc: 'Roasted chana + chai', kcal: 280, p: 13, c: 42, f: 7 },
  { desc: 'Greek yogurt + almonds', kcal: 250, p: 18, c: 16, f: 13 },
  { desc: 'Sprouts chaat', kcal: 220, p: 13, c: 32, f: 4 },
  { desc: 'Banana + handful of peanuts', kcal: 300, p: 9, c: 36, f: 14 },
];

const DINNERS: readonly FoodItem[] = [
  { desc: 'Grilled chicken breast + sauteed veg + rice', kcal: 620, p: 45, c: 58, f: 16 },
  { desc: 'Butter chicken + 2 roti', kcal: 760, p: 38, c: 54, f: 41 },
  { desc: 'Dal + 2 roti + palak paneer', kcal: 660, p: 25, c: 76, f: 27 },
  { desc: 'Chicken keema + 3 roti', kcal: 700, p: 40, c: 62, f: 28 },
  { desc: 'Egg bhurji (4 eggs) + 2 roti', kcal: 620, p: 29, c: 48, f: 32 },
  { desc: 'Tandoori chicken (half) + green salad + dahi', kcal: 580, p: 48, c: 20, f: 30 },
];

const WHEY: FoodItem = { desc: 'Whey protein shake (1 scoop)', kcal: 130, p: 25, c: 6, f: 2 };

const HISTORY_DAYS = 91;

/**
 * Scale a day's picked meals so kcal hits `desiredKcal` exactly, then shift
 * protein<->carbs (4 kcal/g each, kcal preserved) to hit `desiredProtein`.
 */
function buildDay(
  dateISO: string,
  picks: { slot: MealSlot; item: FoodItem; loggedAt: number }[],
  desiredKcal: number,
  desiredProtein: number,
): GeneratedMeal[] {
  const rawKcal = picks.reduce((s, x) => s + x.item.kcal, 0);
  const f = desiredKcal / rawKcal;
  const scaled = picks.map((x) => ({
    ...x,
    kcal: x.item.kcal * f,
    p: x.item.p * f,
    c: x.item.c * f,
    fat: x.item.f * f,
  }));
  const totP = scaled.reduce((s, x) => s + x.p, 0);
  const gap = desiredProtein - totP;
  return scaled.map((x) => {
    const dp = totP > 0 ? gap * (x.p / totP) : 0;
    const p = Math.max(5, x.p + dp);
    const c = Math.max(3, x.c - dp);
    return {
      id: uuid(),
      dateISO,
      loggedAt: x.loggedAt,
      slot: x.slot,
      description: x.item.desc,
      calories: Math.round(x.kcal),
      proteinG: Math.round(p),
      carbsG: Math.round(c),
      fatG: Math.round(x.fat),
    };
  });
}

export function generateMeals(
  todayISO: string,
  trainingDates: ReadonlySet<string>,
  sessionEndByDate: ReadonlyMap<string, number>,
  rng: Rng,
): GeneratedMeal[] {
  const start = addDays(todayISO, -HISTORY_DAYS);
  const meals: GeneratedMeal[] = [];
  const { calorieTarget, proteinTargetG } = SEED_PROFILE;

  for (let i = 0; i < HISTORY_DAYS; i++) {
    const dateISO = addDays(start, i);
    const dayMs = fromISO(dateISO).getTime();
    const at = (minutes: number) => dayMs + minutes * 60_000;

    const picks: { slot: MealSlot; item: FoodItem; loggedAt: number }[] = [
      { slot: 'breakfast', item: pick(rng, BREAKFASTS), loggedAt: at(8 * 60 + 15 + randInt(rng, 0, 25)) },
      { slot: 'lunch', item: pick(rng, LUNCHES), loggedAt: at(13 * 60 + 10 + randInt(rng, 0, 35)) },
      { slot: 'snack', item: pick(rng, SNACKS), loggedAt: at(17 * 60 + randInt(rng, 0, 40)) },
    ];
    if (trainingDates.has(dateISO)) {
      const end = sessionEndByDate.get(dateISO);
      const loggedAt = end != null ? end + randInt(rng, 20, 35) * 60_000 : at(20 * 60 + randInt(rng, 0, 20));
      picks.push({ slot: 'whey', item: WHEY, loggedAt });
    }
    picks.push({ slot: 'dinner', item: pick(rng, DINNERS), loggedAt: at(21 * 60 + randInt(rng, 0, 30)) });

    const desiredKcal = calorieTarget * (0.9 + 0.2 * rng());
    const desiredProtein = (120 + 38 * (i / (HISTORY_DAYS - 1))) * (0.97 + 0.06 * rng());
    meals.push(...buildDay(dateISO, picks, desiredKcal, desiredProtein));
  }

  // TODAY: breakfast + lunch only, ~55% of targets — the day is mid-flight.
  const todayMs = fromISO(todayISO).getTime();
  meals.push(
    ...buildDay(
      todayISO,
      [
        { slot: 'breakfast', item: pick(rng, BREAKFASTS), loggedAt: todayMs + (8 * 60 + 25) * 60_000 },
        { slot: 'lunch', item: pick(rng, LUNCHES), loggedAt: todayMs + (13 * 60 + 15) * 60_000 },
      ],
      calorieTarget * 0.55,
      proteinTargetG * 0.55,
    ),
  );

  return meals;
}

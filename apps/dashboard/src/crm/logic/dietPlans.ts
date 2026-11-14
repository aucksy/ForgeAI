/**
 * Diet plans from the trainer (R-120, 24 Oct 2026). PURE.
 *
 * A plan is a title, a goal, daily calories and protein (both optional), meals (a name, a time and
 * free-text lines such as "2 roti, dal, sabzi") and notes. It goes to members by name and/or to
 * everyone on a membership plan who has it today, exactly like workout plans (logic/workoutPlans.ts).
 * Saved on the gym's server (supabase/migrations/0035_trainer_measurements_diet.sql); the member reads
 * it in the MettleUp app (Gym → Diet plan). Never deleted: "Withdraw" stops it going out. No food
 * logging here. The limits below are the server's.
 *
 * The ready-made plans (R-532, 14 Nov 2026; the owner: "they're not samples") are six starting points
 * for Indian gyms: fat loss, muscle gain and maintenance, each veg (no eggs, meat or fish) and non-veg.
 * Everyday, affordable food with every weight written out; each line's kcal and protein come from the
 * food table below (IFCT 2017 first), and a test adds every plan up against what it says. No
 * supplements needed, no fasting, no medical claims; every plan says who should ask a doctor first.
 */

import type { DateISO, Membership } from '../types';

export interface DietMeal {
  name: string;
  /** "8:00 am", "After workout"; null when not given. */
  time: string | null;
  items: string[];
}

export interface DietAssign {
  memberIds: string[];
  planIds: string[];
}

export interface DietPlan {
  id: string;
  title: string;
  goal: string | null;
  kcal: number | null;
  proteinG: number | null;
  meals: DietMeal[];
  notes: string | null;
  assign: DietAssign;
  withdrawn: boolean;
  byName: string | null;
  createdAt: number;
  updatedAt: number;
}

export const DIET_LIMITS = {
  title: 80,
  goal: 120,
  meals: 10,
  mealName: 40,
  mealTime: 20,
  items: 20,
  item: 120,
  notes: 1000,
  kcal: [800, 6000],
  proteinG: [20, 400],
} as const;

/** Every plan says it (owner brief, R-120). */
export const DOCTOR_LINE = 'Talk to a doctor if you have a health condition.';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : []);

/** One plan from the server, or null when it can't be read. */
export function dietFromRow(raw: unknown): DietPlan | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const title = str(raw.title);
  if (!id || !title || !Array.isArray(raw.meals)) return null;
  const meals: DietMeal[] = [];
  for (const m of raw.meals) {
    if (!isObj(m) || !str(m.name) || !Array.isArray(m.items)) continue;
    const items = m.items.map(str).filter((s): s is string => s != null);
    if (items.length > 0) meals.push({ name: str(m.name) as string, time: str(m.time), items });
  }
  const a = isObj(raw.assign) ? raw.assign : {};
  return {
    id,
    title,
    goal: str(raw.goal),
    kcal: num(raw.kcal),
    proteinG: num(raw.proteinG),
    meals,
    notes: str(raw.notes),
    assign: { memberIds: ids(a.memberIds), planIds: ids(a.planIds) },
    withdrawn: raw.withdrawn === true,
    byName: str(raw.byName),
    createdAt: num(raw.createdAt) ?? 0,
    updatedAt: num(raw.updatedAt) ?? 0,
  };
}

export function dietsFromRows(raw: unknown): DietPlan[] {
  return Array.isArray(raw) ? raw.map(dietFromRow).filter((p): p is DietPlan => p != null) : [];
}

// ---------------------------------------------------------------- ready-made plans (R-532)

/**
 * The food table behind the ready-made plans: kcal and protein in 100 g of the food as it is weighed
 * in the plan (raw or dry). Every number and where it comes from: docs/diet-plans/SOURCES.md.
 * IFCT 2017 gives energy in kJ; kcal = kJ / 4.184. IFCT lists oils and ghee as 100 g fat with no
 * energy, so oil uses IFCT's own factor for fat (37 kJ per g). Curd and roasted chana are not in
 * IFCT 2017, so they come from NIN's "Nutritive Value of Indian Foods"; soya chunks from the pack.
 */
export interface FoodFacts {
  name: string;
  kcal: number;
  proteinG: number;
  source: string;
}

const kj = (kJ: number) => kJ / 4.184;

export const FOODS = {
  atta: { name: 'Wheat flour, atta', kcal: kj(1340), proteinG: 10.57, source: 'IFCT 2017 A019' },
  rice: { name: 'Rice, raw, milled', kcal: kj(1491), proteinG: 7.94, source: 'IFCT 2017 A015' },
  poha: { name: 'Rice, flakes', kcal: kj(1480), proteinG: 7.44, source: 'IFCT 2017 A011' },
  moongDal: { name: 'Green gram, dal', kcal: kj(1363), proteinG: 23.88, source: 'IFCT 2017 B010' },
  moongWhole: { name: 'Green gram, whole', kcal: kj(1229), proteinG: 22.53, source: 'IFCT 2017 B011' },
  toorDal: { name: 'Red gram, dal', kcal: kj(1384), proteinG: 21.7, source: 'IFCT 2017 B021' },
  besan: { name: 'Bengal gram, dal (besan is this dal, ground)', kcal: kj(1377), proteinG: 21.55, source: 'IFCT 2017 B001' },
  rajma: { name: 'Rajmah, red', kcal: kj(1252), proteinG: 19.91, source: 'IFCT 2017 B020' },
  paneer: { name: 'Paneer', kcal: kj(1079), proteinG: 18.86, source: 'IFCT 2017 L003' },
  milk: { name: 'Milk, whole, cow', kcal: kj(305), proteinG: 3.26, source: 'IFCT 2017 L002' },
  egg: { name: 'Egg, poultry, whole, raw', kcal: kj(564), proteinG: 13.28, source: 'IFCT 2017 M001' },
  eggBoiled: { name: 'Egg, poultry, whole, boiled', kcal: kj(618), proteinG: 13.43, source: 'IFCT 2017 M004' },
  eggWhite: { name: 'Egg, poultry, white, raw', kcal: kj(187), proteinG: 10.84, source: 'IFCT 2017 M002' },
  chicken: { name: 'Chicken, poultry, breast, skinless', kcal: kj(704), proteinG: 21.81, source: 'IFCT 2017 N003' },
  rohu: { name: 'Rohu', kcal: kj(428), proteinG: 19.71, source: 'IFCT 2017 S006' },
  peanuts: { name: 'Ground nut', kcal: kj(2176), proteinG: 23.65, source: 'IFCT 2017 H012' },
  almonds: { name: 'Almond', kcal: kj(2549), proteinG: 18.41, source: 'IFCT 2017 H001' },
  banana: { name: 'Banana, ripe, robusta', kcal: kj(440), proteinG: 1.23, source: 'IFCT 2017 E012' },
  apple: { name: 'Apple, big (the highest of apple, guava and orange)', kcal: kj(261), proteinG: 0.29, source: 'IFCT 2017 E001' },
  cucumber: { name: 'Cucumber, green, elongate', kcal: kj(82), proteinG: 0.71, source: 'IFCT 2017 D043' },
  tomato: { name: 'Tomato, ripe, local', kcal: kj(82), proteinG: 0.9, source: 'IFCT 2017 D076' },
  onion: { name: 'Onion, big', kcal: kj(201), proteinG: 1.5, source: 'IFCT 2017 G017' },
  mint: { name: 'Mint leaves', kcal: kj(155), proteinG: 4.66, source: 'IFCT 2017 G016' },
  vegetables: {
    name: 'Everyday sabzi vegetables: the average of cauliflower, cabbage, French beans, lauki, bhindi and brinjal',
    kcal: kj((96 + 90 + 93 + 46 + 115 + 106) / 6),
    proteinG: (2.15 + 1.36 + 2.12 + 0.53 + 2.08 + 1.48) / 6,
    source: 'IFCT 2017 D036, C015, D050, D007, D056, D031',
  },
  oil: { name: 'Cooking oil or ghee (100 g fat)', kcal: kj(37 * 100), proteinG: 0, source: 'IFCT 2017 T005/T006/T013; 37 kJ per g fat' },
  curd: { name: 'Curds, cow milk', kcal: 60, proteinG: 3, source: 'NIN, Nutritive Value of Indian Foods (2004)' },
  roastedChana: { name: 'Bengal gram, roasted', kcal: 369, proteinG: 22, source: 'NIN, Nutritive Value of Indian Foods (2004)' },
  soyaChunks: { name: 'Soya chunks, dry', kcal: 345, proteinG: 52, source: 'Pack label (Nutrela)' },
} as const satisfies Record<string, FoodFacts>;

export type FoodKey = keyof typeof FOODS;

/** One line of a ready-made plan: the words the member reads, and the weights behind them. */
export interface PlanLine {
  text: string;
  /** Grams of each food (raw or dry), or ml of milk (taken as grams). Empty for water. */
  parts: readonly (readonly [FoodKey, number])[];
}

export interface PlanMeal {
  name: string;
  time: string | null;
  lines: readonly PlanLine[];
}

export type DietAim = 'fat-loss' | 'muscle-gain' | 'maintenance';
export type DietFood = 'veg' | 'non-veg';

export interface StarterDiet {
  key: string;
  aim: DietAim;
  food: DietFood;
  title: string;
  goal: string;
  /** The day's calories and protein the plan says; a test checks them against `recipe`. */
  kcal: number;
  proteinG: number;
  /** One line for the picker. */
  summary: string;
  meals: DietMeal[];
  /** The same meals with the weight of every food, so the totals can be added up. */
  recipe: readonly PlanMeal[];
  notes: string;
}

const OIL_TSP = 5; // grams of oil in 1 teaspoon

const line = (text: string, ...parts: (readonly [FoodKey, number])[]): PlanLine => ({ text, parts });
const phulka = (n: number) => line(`${n} phulka (${30 * n} g atta), no ghee`, ['atta', 30 * n]);
const WATER = line('1 glass warm water');
const ALMONDS = line('5 almonds (6 g), soaked overnight', ['almonds', 6]);
const FRUIT = line('1 apple, guava or orange (about 150 g)', ['apple', 150]);
const BANANA = line('1 banana (about 100 g without the peel)', ['banana', 100]);
const SALAD = line('Salad: 100 g cucumber, tomato and onion', ['cucumber', 50], ['tomato', 30], ['onion', 20]);
const TEA = line('1 cup tea with 50 ml milk, no sugar', ['milk', 50]);
const sabzi = (g = 150) => line(`1 bowl sabzi: ${g} g vegetables, 1 tsp oil`, ['vegetables', g], ['oil', OIL_TSP]);
const dal = (g: number) => line(`1 bowl dal: ${g} g dry toor or moong dal, 1 tsp oil`, ['toorDal', g], ['oil', OIL_TSP]);
const curd = (g: number) => line(`1 bowl curd (${g} g)`, ['curd', g]);
const milk = (ml: number) => line(`1 glass milk (${ml} ml)`, ['milk', ml]);
const rice = (g: number) => line(`Rice: ${g} g dry rice (about ${g * 3} g cooked)`, ['rice', g]);
const chana = (g: number) => line(`Roasted chana: ${g} g (a small handful)`, ['roastedChana', g]);
const peanuts = (g: number) => line(`Peanuts: ${g} g (a small handful)`, ['peanuts', g]);

/** The day's calories and protein of a plan, added up from its food table. PURE. */
export function recipeTotals(recipe: readonly PlanMeal[]): { kcal: number; proteinG: number; oilG: number } {
  let kcal = 0;
  let proteinG = 0;
  let oilG = 0;
  for (const m of recipe) {
    for (const l of m.lines) {
      for (const [food, g] of l.parts) {
        kcal += (FOODS[food].kcal * g) / 100;
        proteinG += (FOODS[food].proteinG * g) / 100;
        if (food === 'oil') oilG += g;
      }
    }
  }
  return { kcal, proteinG, oilG };
}

/** Who the ready-made plans are made for (ICMR-NIN reference adults; docs/diet-plans/SOURCES.md). */
export const READY_SUITS = 'Made for an adult of about 60 to 70 kg who trains 3 to 5 days a week.';
export const READY_NOTE = 'This is a ready-made plan. Your trainer can change it to suit you.';
/** Who must ask a doctor first (said in every ready-made plan, before DOCTOR_LINE). */
export const CHECK_FIRST = 'Show this plan to a doctor before you start if you are under 18, pregnant or breastfeeding, or have diabetes, high BP, kidney disease or a food allergy.';

const AIM_WORDS: Record<DietAim, { name: string; goal: string; pace: string }> = {
  'fat-loss': {
    name: 'Fat loss',
    goal: 'Lose fat slowly and keep your strength',
    pace: 'Aim to lose about half a kilo a week, not more. If you feel weak or dizzy, eat a little more and tell your trainer.',
  },
  'muscle-gain': {
    name: 'Muscle gain',
    goal: 'Build muscle with slow, steady weight gain',
    pace: 'Aim to gain about 1 kg a month. If you gain faster, eat 1 phulka less at dinner.',
  },
  maintenance: {
    name: 'Maintenance',
    goal: 'Stay at your weight and train well',
    pace: 'Weigh yourself once a week. If your weight keeps going down, add 1 phulka a day. If it keeps going up, eat 1 phulka less.',
  },
};

function ready(aim: DietAim, food: DietFood, kcal: number, proteinG: number, dishes: string, recipe: PlanMeal[]): StarterDiet {
  const words = AIM_WORDS[aim];
  const oilG = recipeTotals(recipe).oilG;
  const notes = [
    READY_SUITS,
    words.pace,
    'All weights are of raw or dry food, weighed before cooking.',
    `The whole day’s cooking oil is ${oilG / OIL_TSP} teaspoons (${oilG} g). Use no more.`,
    'Keep salt under 5 g (1 level teaspoon) a day, counting pickle, papad and namkeen.',
    'Keep sweets, fried snacks and sugary drinks for once a week.',
    'Make one sabzi a day a green leafy one, like palak or methi.',
    'Drink enough water through the day to keep your urine pale yellow, more on hot and training days.',
    aim === 'muscle-gain' ? `You do not need whey or any protein powder: this food gives about ${proteinG} g of protein a day. Whey is optional, for adults only.` : '',
    READY_NOTE,
    CHECK_FIRST,
    DOCTOR_LINE,
  ].filter(Boolean);
  return {
    key: `${aim}-${food}-${kcal}`,
    aim,
    food,
    title: `${words.name} ${food} · ${kcal.toLocaleString('en-IN')} kcal`,
    goal: words.goal,
    kcal,
    proteinG,
    summary: `${recipe.length} meals · ${dishes}`,
    meals: recipe.map((m) => ({ name: m.name, time: m.time, items: m.lines.map((l) => l.text) })),
    recipe,
    notes: notes.join(' '),
  };
}

/** Six ready-made plans: each goal veg (no eggs, meat or fish) and non-veg. Numbers checked in test/crm/dietPlans.test.ts. */
export const STARTER_DIETS: readonly StarterDiet[] = [
  ready('fat-loss', 'veg', 1600, 85, 'moong chilla, dal, soya, paneer', [
    { name: 'Early morning', time: '6:30 am', lines: [WATER, ALMONDS] },
    {
      name: 'Breakfast',
      time: '8:30 am',
      lines: [
        line('2 moong dal chilla: 50 g dry moong dal, 1 tsp oil', ['moongDal', 50], ['oil', OIL_TSP]),
        line('Mint chutney: 20 g mint and coriander, no sugar', ['mint', 20]),
        curd(150),
      ],
    },
    { name: 'Mid-morning', time: '11:00 am', lines: [FRUIT] },
    {
      name: 'Lunch',
      time: '1:30 pm',
      lines: [phulka(2), dal(40), line('Soya chunk sabzi: 30 g dry soya chunks, 100 g vegetables, 1 tsp oil', ['soyaChunks', 30], ['vegetables', 100], ['oil', OIL_TSP]), SALAD],
    },
    { name: 'Evening', time: '5:00 pm', lines: [chana(30), TEA] },
    { name: 'Dinner', time: '8:30 pm', lines: [line('Paneer bhurji: 100 g paneer, 1 tsp oil', ['paneer', 100], ['oil', OIL_TSP]), sabzi(200), phulka(1)] },
  ]),
  ready('fat-loss', 'non-veg', 1600, 95, 'omelette, dal, chicken curry', [
    { name: 'Early morning', time: '6:30 am', lines: [WATER, ALMONDS] },
    {
      name: 'Breakfast',
      time: '8:30 am',
      lines: [line('Omelette: 2 eggs and 3 egg whites, onion, tomato, 1 tsp oil', ['egg', 100], ['eggWhite', 99], ['onion', 20], ['tomato', 20], ['oil', OIL_TSP]), phulka(1)],
    },
    { name: 'Mid-morning', time: '11:00 am', lines: [FRUIT] },
    { name: 'Lunch', time: '1:30 pm', lines: [phulka(2), dal(40), sabzi(), SALAD] },
    { name: 'Evening', time: '5:00 pm', lines: [chana(30), TEA] },
    { name: 'Dinner', time: '8:30 pm', lines: [line('Chicken curry: 150 g raw boneless chicken, 1 tsp oil', ['chicken', 150], ['oil', OIL_TSP]), sabzi(), phulka(1), curd(100)] },
  ]),
  ready('muscle-gain', 'veg', 2600, 115, 'besan chilla, rajma, paneer, soya, milk', [
    {
      name: 'Breakfast',
      time: '8:00 am',
      lines: [line('3 besan chilla: 75 g besan, onion and tomato, 2 tsp oil', ['besan', 75], ['onion', 30], ['tomato', 30], ['oil', 2 * OIL_TSP]), milk(250)],
    },
    { name: 'Mid-morning', time: '11:00 am', lines: [BANANA, peanuts(20)] },
    { name: 'Lunch', time: '1:30 pm', lines: [phulka(3), rice(30), line('1 bowl rajma: 50 g dry rajma, 1 tsp oil', ['rajma', 50], ['oil', OIL_TSP]), sabzi(), curd(150), SALAD] },
    { name: 'Before workout', time: '5:00 pm', lines: [BANANA, TEA] },
    { name: 'After workout', time: null, lines: [milk(250), chana(30)] },
    {
      name: 'Dinner',
      time: '9:00 pm',
      lines: [line('Paneer and soya sabzi: 100 g paneer, 25 g dry soya chunks, 1 tsp oil', ['paneer', 100], ['soyaChunks', 25], ['oil', OIL_TSP]), phulka(2), sabzi()],
    },
  ]),
  ready('muscle-gain', 'non-veg', 2600, 125, 'omelette, chicken, fish, milk', [
    {
      name: 'Breakfast',
      time: '8:00 am',
      lines: [line('Omelette: 2 eggs and 2 egg whites, onion, tomato, 1 tsp oil', ['egg', 100], ['eggWhite', 66], ['onion', 20], ['tomato', 20], ['oil', OIL_TSP]), phulka(2), milk(200)],
    },
    { name: 'Mid-morning', time: '11:00 am', lines: [BANANA, peanuts(30)] },
    { name: 'Lunch', time: '1:30 pm', lines: [rice(80), phulka(2), line('Chicken curry: 100 g raw boneless chicken, 1 tsp oil', ['chicken', 100], ['oil', OIL_TSP]), dal(30), sabzi(), SALAD] },
    { name: 'Before workout', time: '5:00 pm', lines: [BANANA, TEA] },
    { name: 'After workout', time: null, lines: [milk(250)] },
    { name: 'Dinner', time: '9:00 pm', lines: [line('Fish curry: 100 g raw rohu or katla, 1 tsp oil', ['rohu', 100], ['oil', OIL_TSP]), phulka(3), sabzi()] },
  ]),
  ready('maintenance', 'veg', 2200, 95, 'poha, rajma, sprouts, paneer', [
    { name: 'Breakfast', time: '8:00 am', lines: [line('Poha: 60 g dry poha, 10 g peanuts, 50 g vegetables, 1 tsp oil', ['poha', 60], ['peanuts', 10], ['vegetables', 50], ['oil', OIL_TSP]), milk(200)] },
    { name: 'Mid-morning', time: '11:00 am', lines: [FRUIT] },
    { name: 'Lunch', time: '1:30 pm', lines: [phulka(3), line('1 bowl rajma: 40 g dry rajma, 1 tsp oil', ['rajma', 40], ['oil', OIL_TSP]), sabzi(), curd(200)] },
    { name: 'Evening', time: '5:00 pm', lines: [line('Sprouts chaat: 40 g dry moong, sprouted, with onion, tomato and lemon', ['moongWhole', 40], ['onion', 20], ['tomato', 30]), TEA] },
    {
      name: 'Dinner',
      time: '8:30 pm',
      lines: [phulka(2), line('Paneer sabzi: 100 g paneer, 100 g vegetables, 1 tsp oil', ['paneer', 100], ['vegetables', 100], ['oil', OIL_TSP]), dal(40), SALAD],
    },
    { name: 'Bedtime', time: '10:00 pm', lines: [milk(200)] },
  ]),
  ready('maintenance', 'non-veg', 2200, 120, 'boiled eggs, chicken, fish, dal', [
    { name: 'Breakfast', time: '8:00 am', lines: [line('2 boiled eggs', ['eggBoiled', 100]), phulka(2), milk(200)] },
    { name: 'Mid-morning', time: '11:00 am', lines: [FRUIT] },
    { name: 'Lunch', time: '1:30 pm', lines: [rice(60), phulka(2), line('Chicken curry: 120 g raw boneless chicken, 1 tsp oil', ['chicken', 120], ['oil', OIL_TSP]), sabzi(), SALAD] },
    { name: 'Evening', time: '5:00 pm', lines: [chana(30), peanuts(20), TEA] },
    { name: 'Dinner', time: '8:30 pm', lines: [phulka(2), line('Fish curry: 100 g raw rohu or katla, 1 tsp oil', ['rohu', 100], ['oil', OIL_TSP]), dal(30), sabzi(), curd(150)] },
  ]),
];

// ---------------------------------------------------------------- the builder

export interface DietMealDraft {
  name: string;
  time: string;
  /** One food per line. */
  itemsText: string;
}

export interface DietDraft {
  /** Set when editing a saved plan. */
  id?: string;
  title: string;
  goal: string;
  kcal: string;
  proteinG: string;
  meals: DietMealDraft[];
  notes: string;
  assign: DietAssign;
}

const mealDraft = (m: DietMeal): DietMealDraft => ({ name: m.name, time: m.time ?? '', itemsText: m.items.join('\n') });

export function emptyMeal(): DietMealDraft {
  return { name: '', time: '', itemsText: '' };
}

export function emptyDietDraft(memberIds: readonly string[] = []): DietDraft {
  return {
    title: '',
    goal: '',
    kcal: '',
    proteinG: '',
    meals: [
      { name: 'Breakfast', time: '', itemsText: '' },
      { name: 'Lunch', time: '', itemsText: '' },
      { name: 'Dinner', time: '', itemsText: '' },
    ],
    notes: DOCTOR_LINE,
    assign: { memberIds: [...memberIds], planIds: [] },
  };
}

export function draftFromStarter(s: StarterDiet, memberIds: readonly string[] = []): DietDraft {
  return {
    title: s.title,
    goal: s.goal,
    kcal: String(s.kcal),
    proteinG: String(s.proteinG),
    meals: s.meals.map(mealDraft),
    notes: s.notes,
    assign: { memberIds: [...memberIds], planIds: [] },
  };
}

export function draftOfDiet(p: DietPlan): DietDraft {
  return {
    id: p.id,
    title: p.title,
    goal: p.goal ?? '',
    kcal: p.kcal == null ? '' : String(p.kcal),
    proteinG: p.proteinG == null ? '' : String(p.proteinG),
    meals: p.meals.map(mealDraft),
    notes: p.notes ?? '',
    assign: { memberIds: [...p.assign.memberIds], planIds: [...p.assign.planIds] },
  };
}

/** A new plan from a saved one ("Make a copy"): no id, sent to nobody yet. */
export function copyOfDiet(p: DietPlan): DietDraft {
  const d = draftOfDiet(p);
  delete d.id;
  return { ...d, title: `${p.title} (copy)`.slice(0, DIET_LIMITS.title), assign: { memberIds: [], planIds: [] } };
}

export interface DietPayload {
  id?: string;
  title: string;
  goal: string | null;
  kcal: number | null;
  proteinG: number | null;
  meals: DietMeal[];
  notes: string | null;
  assign: DietAssign;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A typed whole number: null for blank, NaN for not one. */
function wholeNumber(text: string): number | null {
  const t = text.replace(/[,\s]/g, '');
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** The builder → what Save sends, or the first problem in plain words. Empty meals are dropped. */
export function dietPayload(d: DietDraft): { payload: DietPayload | null; problem: string | null } {
  const fail = (problem: string) => ({ payload: null, problem });
  const title = tidy(d.title);
  if (!title) return fail('Give the plan a name, like “Fat loss veg”.');
  if (title.length > DIET_LIMITS.title) return fail(`The name can be up to ${DIET_LIMITS.title} letters.`);
  const goal = tidy(d.goal);
  if (goal.length > DIET_LIMITS.goal) return fail(`The goal can be up to ${DIET_LIMITS.goal} letters.`);
  const kcal = wholeNumber(d.kcal);
  if (kcal != null && (Number.isNaN(kcal) || kcal < DIET_LIMITS.kcal[0] || kcal > DIET_LIMITS.kcal[1])) {
    return fail(`Calories a day: a whole number from ${DIET_LIMITS.kcal[0]} to ${DIET_LIMITS.kcal[1]}, or leave it empty.`);
  }
  const proteinG = wholeNumber(d.proteinG);
  if (proteinG != null && (Number.isNaN(proteinG) || proteinG < DIET_LIMITS.proteinG[0] || proteinG > DIET_LIMITS.proteinG[1])) {
    return fail(`Protein a day: a whole number of grams from ${DIET_LIMITS.proteinG[0]} to ${DIET_LIMITS.proteinG[1]}, or leave it empty.`);
  }
  const meals: DietMeal[] = [];
  for (const m of d.meals) {
    const items = m.itemsText.split('\n').map(tidy).filter(Boolean);
    const name = tidy(m.name);
    const time = tidy(m.time);
    if (items.length === 0) continue; // a meal with no food is left out
    const label = name || 'A meal';
    if (!name) return fail('Each meal with food needs a name, like “Breakfast”.');
    if (name.length > DIET_LIMITS.mealName) return fail(`${label}: the meal name can be up to ${DIET_LIMITS.mealName} letters.`);
    if (time.length > DIET_LIMITS.mealTime) return fail(`${label}: the time can be up to ${DIET_LIMITS.mealTime} letters, like “8:00 am”.`);
    if (items.length > DIET_LIMITS.items) return fail(`${label}: up to ${DIET_LIMITS.items} lines.`);
    if (items.some((i) => i.length > DIET_LIMITS.item)) return fail(`${label}: each line can be up to ${DIET_LIMITS.item} letters.`);
    meals.push({ name, time: time || null, items });
  }
  if (meals.length === 0) return fail('Add the food for at least one meal (one food per line).');
  if (meals.length > DIET_LIMITS.meals) return fail(`Up to ${DIET_LIMITS.meals} meals.`);
  const notes = d.notes.trim().replace(/[ \t]+/g, ' ');
  if (notes.length > DIET_LIMITS.notes) return fail(`Notes can be up to ${DIET_LIMITS.notes} letters.`);
  const payload: DietPayload = {
    title,
    goal: goal || null,
    kcal,
    proteinG,
    meals,
    notes: notes || null,
    assign: { memberIds: [...new Set(d.assign.memberIds)], planIds: [...new Set(d.assign.planIds)] },
  };
  if (d.id) payload.id = d.id;
  return { payload, problem: null };
}

// ---------------------------------------------------------------- lists and who gets it

/** "6 meals · 1,600 kcal · 90 g protein". */
export function dietSizeWords(p: Pick<DietPlan, 'meals' | 'kcal' | 'proteinG'>): string {
  const parts = [`${p.meals.length} ${p.meals.length === 1 ? 'meal' : 'meals'}`];
  if (p.kcal != null) parts.push(`${p.kcal.toLocaleString('en-IN')} kcal`);
  if (p.proteinG != null) parts.push(`${p.proteinG} g protein`);
  return parts.join(' · ');
}

/** Open plans first, newest change first; withdrawn ones separately. */
export function splitDiets(list: readonly DietPlan[]): { open: DietPlan[]; withdrawn: DietPlan[] } {
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
  return { open: sorted.filter((p) => !p.withdrawn), withdrawn: sorted.filter((p) => p.withdrawn) };
}

type MembershipLite = Pick<Membership, 'memberId' | 'planId' | 'startsOn' | 'endsOn' | 'cancelled'>;

/** The open plans that reach this member today: by name, or through a membership plan they have today (the server's rule). */
export function dietsForMember(list: readonly DietPlan[], memberId: string, memberships: readonly MembershipLite[], today: DateISO): DietPlan[] {
  const mine = new Set(
    memberships.filter((m) => m.memberId === memberId && !m.cancelled && m.startsOn <= today && m.endsOn >= today).map((m) => m.planId),
  );
  return splitDiets(list).open.filter((p) => p.assign.memberIds.includes(memberId) || p.assign.planIds.some((id) => mine.has(id)));
}

/** The gym's open plans for "Send a diet plan", each marked when the member already gets it. */
export function dietSendChoices(list: readonly DietPlan[], memberId: string, memberships: readonly MembershipLite[], today: DateISO): { plan: DietPlan; already: boolean }[] {
  const gets = new Set(dietsForMember(list, memberId, memberships, today).map((p) => p.id));
  return splitDiets(list).open.map((plan) => ({ plan, already: gets.has(plan.id) }));
}

/** The saved plan with this member added (one tap from the member's page). */
export function dietWithMember(p: DietPlan, memberId: string): DietDraft {
  const d = draftOfDiet(p);
  return { ...d, assign: { ...d.assign, memberIds: [...new Set([...d.assign.memberIds, memberId])] } };
}

/** The saved plan with this member taken off again (Undo / Stop sending). */
export function dietWithoutMember(p: DietPlan, memberId: string): DietDraft {
  const d = draftOfDiet(p);
  return { ...d, assign: { ...d.assign, memberIds: d.assign.memberIds.filter((id) => id !== memberId) } };
}

/** A refusal from 0035 in plain words, or null when it is not one of its codes. */
export function dietErrorWords(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err ? String((err as { message?: unknown }).message ?? '') : String(err ?? '');
  if (/\bWITHDRAWN\b/.test(msg)) return 'This plan was withdrawn, so it can’t be changed. Make a copy of it instead.';
  if (/\bNOT_FOUND\b/.test(msg)) return 'This plan is not on your gym’s list any more. Close this and look again.';
  if (/\bINVALID\b/.test(msg)) return 'Something in the plan is too long or not a number. Check it and try again.';
  return null;
}

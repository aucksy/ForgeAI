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
 * The starter plans are plain samples for Indian gyms: everyday foods, round numbers, no medical
 * claims, and every one says to talk to a doctor about a health condition.
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

// ---------------------------------------------------------------- starter plans

export interface StarterDiet {
  key: string;
  title: string;
  goal: string;
  kcal: number;
  proteinG: number;
  /** One line for the picker. */
  summary: string;
  meals: DietMeal[];
  notes: string;
}

const SAMPLE_NOTE = 'This is a sample plan. Your trainer can change it to suit you.';

export const STARTER_DIETS: readonly StarterDiet[] = [
  {
    key: 'fat-loss-veg-1600',
    title: 'Fat loss veg · 1,600 kcal',
    goal: 'Lose fat slowly and keep your strength',
    kcal: 1600,
    proteinG: 90,
    summary: 'Vegetarian · 6 meals · dal, paneer, chana, curd',
    meals: [
      { name: 'Early morning', time: '6:30 am', items: ['1 glass warm water', '5 soaked almonds'] },
      { name: 'Breakfast', time: '8:30 am', items: ['2 moong dal chilla with mint chutney', '1 cup low-fat curd'] },
      { name: 'Mid-morning', time: '11:00 am', items: ['1 fruit (apple, guava or orange)'] },
      { name: 'Lunch', time: '1:30 pm', items: ['2 phulka (no ghee)', '1 bowl dal', '1 bowl sabzi', 'Salad: cucumber, tomato, onion'] },
      { name: 'Evening', time: '5:00 pm', items: ['1 cup roasted chana', 'Tea or green tea without sugar'] },
      { name: 'Dinner', time: '8:30 pm', items: ['100 g paneer bhurji or tofu', '1 bowl sabzi', '1 phulka'] },
    ],
    notes: `Drink 3 litres of water a day. Keep cooking oil to 3 to 4 teaspoons a day. Skip sweets, fried snacks and sugary drinks. ${SAMPLE_NOTE} ${DOCTOR_LINE}`,
  },
  {
    key: 'muscle-gain-nonveg-2600',
    title: 'Muscle gain non-veg · 2,600 kcal',
    goal: 'Build muscle with steady weight gain',
    kcal: 2600,
    proteinG: 140,
    summary: 'Non-veg · 6 meals · eggs, chicken, fish, milk',
    meals: [
      { name: 'Breakfast', time: '8:00 am', items: ['Omelette: 2 whole eggs + 3 egg whites', '2 slices brown bread or 2 small parathas (little oil)', '1 glass milk'] },
      { name: 'Mid-morning', time: '11:00 am', items: ['1 banana', '1 handful peanuts or mixed nuts'] },
      { name: 'Lunch', time: '1:30 pm', items: ['1.5 cups rice or 3 roti', '150 g chicken curry', '1 bowl dal', 'Salad'] },
      { name: 'Before workout', time: '5:00 pm', items: ['1 banana', '1 cup black coffee or tea'] },
      { name: 'After workout', time: null, items: ['1 scoop whey in water, or 1 glass milk with 2 boiled eggs'] },
      { name: 'Dinner', time: '9:00 pm', items: ['150 g grilled fish or chicken', '2 roti', '1 bowl sabzi', '1 cup curd'] },
    ],
    notes: `Drink 3 to 4 litres of water a day. Eat every 3 to 4 hours. Sleep 7 to 8 hours. ${SAMPLE_NOTE} ${DOCTOR_LINE}`,
  },
  {
    key: 'maintenance-veg-2000',
    title: 'Maintenance veg · 2,000 kcal',
    goal: 'Stay at your weight and train well',
    kcal: 2000,
    proteinG: 100,
    summary: 'Vegetarian · 5 meals · poha, rajma, sprouts, paneer',
    meals: [
      { name: 'Breakfast', time: '8:00 am', items: ['2 besan chilla, or 1 bowl poha with peanuts', '1 glass milk'] },
      { name: 'Mid-morning', time: '11:00 am', items: ['1 fruit'] },
      { name: 'Lunch', time: '1:30 pm', items: ['3 roti, or 1 cup rice with 1 roti', '1 bowl dal or rajma', '1 bowl sabzi', '1 cup curd'] },
      { name: 'Evening', time: '5:00 pm', items: ['1 cup sprouts chaat', 'Tea with little sugar'] },
      { name: 'Dinner', time: '8:30 pm', items: ['2 roti', '100 g paneer sabzi', 'Salad'] },
    ],
    notes: `Drink 3 litres of water a day. Keep sweets and fried food for once a week. ${SAMPLE_NOTE} ${DOCTOR_LINE}`,
  },
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

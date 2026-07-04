/**
 * NO-KEY FALLBACK COACH — deterministic intent parser for en/hi(latin)/hinglish.
 * Uses the exact same repos/services and returns the same card kinds as the
 * cloud tools, so the demo shines fully offline.
 */
import * as nutritionRepo from '@/db/repos/nutritionRepo';
import * as prRepo from '@/db/repos/prRepo';
import * as userRepo from '@/db/repos/userRepo';
import * as workoutRepo from '@/db/repos/workoutRepo';
import { addDays, todayISO } from '@/lib/date';
import { fmtInt, trimNum } from '@/lib/format';
import { getTodaysWorkout } from '@/services/coach';
import type { NutritionDay } from '@/types/models';

import {
  buildWorkoutLoggedCard,
  logWorkoutCore,
  nutritionSnapshot,
  summarizeWorkoutRange,
  type WorkoutExerciseInput,
} from '@/ai/tools';
import type { CoachCard } from '@/ai/types';

export interface LocalReply {
  text: string;
  cards: CoachCard[];
}

type Flavour = 'en' | 'hin';

function pick(f: Flavour, en: string, hin: string): string {
  return f === 'hin' ? hin : en;
}

function detectFlavour(raw: string): Flavour {
  if (/[ऀ-ॿ]/.test(raw)) return 'hin';
  const hin =
    /\b(aaj|kal|kya|hai|hain|kitna|kitni|kiya|kiye|kari|karna|karu|karun|khaya|khayi|khaye|mera|meri|nahi|bacha|bachi|baaki|baki|wala|kaisa|kaise|hua|gaya|gayi|aur|bhai|yaar|batao|bata|dikhao|dikha|wazan|vajan|abhi|thoda|zyada|maara|mara|lagaya)\b/i;
  return hin.test(raw) ? 'hin' : 'en';
}

// ------------------------------------------------------------ workout parse

interface ParsedSet {
  weightKg: number;
  reps: number;
}

const NUM = '\\d+(?:\\.\\d+)?';
const REP_LIST =
  '\\d{1,2}(?:\\s*reps?)?(?:\\s*(?:,|and|aur|then|phir|&|\\s)\\s*\\d{1,2}(?:\\s*reps?)?)*';

// Alternatives (tried in order at each position):
//  B  "3 sets of 10 at 60 kg"
//  B2 "3x10 @ 60" / "3 x 10 at 60kg"
//  A  "80x8" / "80 kg x 8"
//  C  "80 kg for 8, 7 and 6" / "80 kg 8 8 8" / "80 kg ke 8 8"
//  D  "80 for 8, 7 and 6" (no kg, explicit 'for')
const SET_EXPR = new RegExp(
  `(?<bcount>\\d{1,2})\\s*sets?\\s*(?:of|x)?\\s*(?<breps>\\d{1,2})\\s*(?:reps?)?\\s*(?:at|@|with|pe|par|me|mein)\\s*(?<bweight>${NUM})\\s*(?:kgs?|kilos?)?` +
    '|' +
    `(?<ccount>\\d{1,2})\\s*x\\s*(?<creps>\\d{1,2})\\s*(?:reps?)?\\s*(?:@|at)\\s*(?<cweight>${NUM})\\s*(?:kgs?|kilos?)?` +
    '|' +
    `(?<aweight>${NUM})\\s*(?:kgs?|kilos?)?\\s*x\\s*(?<areps>\\d{1,2})\\b` +
    '|' +
    `(?<lweight>${NUM})\\s*(?:kgs?|kilos?)\\b[\\s,]*(?:ke liye|ke|for|me|mein|par|pe|:)?\\s*(?<lreps>${REP_LIST})` +
    '|' +
    `(?<dweight>${NUM})\\s*(?:ke liye|for)\\s+(?<dreps>${REP_LIST})`,
  'gi',
);

const NAME_FILLERS = new Set([
  'i', 'did', 'do', 'just', 'me', 'my', 'maine', 'mene', 'ne', 'aaj', 'today', 'kal',
  'yesterday', 'log', 'logged', 'karo', 'add', 'kiya', 'kiye', 'kia', 'kar', 'kari', 'the',
  'a', 'an', 'then', 'phir', 'fir', 'aur', 'and', 'also', 'plus', 'uske', 'baad', 'with',
  'at', 'of', 'ka', 'ki', 'ke', 'set', 'sets', 'rep', 'reps', 'for', 'x', 'session',
  'workout', 'done', 'complete', 'completed', 'finished', 'maara', 'mara', 'maare',
  'lagaya', 'lagaye', 'hai', 'tha', 'par', 'pe', 'abhi', 'it', 'was', 'were', 'is', 'on',
]);

function cleanExerciseName(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !NAME_FILLERS.has(w));
  return words.join(' ').trim();
}

function parseWorkout(input: string): WorkoutExerciseInput[] {
  const text = input.replace(/×/g, 'x');
  const out: WorkoutExerciseInput[] = [];
  let cursor = 0;
  SET_EXPR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SET_EXPR.exec(text))) {
    const g = m.groups ?? {};
    const nameRaw = text.slice(cursor, m.index);
    cursor = SET_EXPR.lastIndex;

    const sets: ParsedSet[] = [];
    if (g.bcount) {
      const count = parseInt(g.bcount, 10);
      const reps = parseInt(g.breps, 10);
      const weightKg = parseFloat(g.bweight);
      for (let i = 0; i < Math.min(count, 10); i++) sets.push({ weightKg, reps });
    } else if (g.ccount) {
      const count = parseInt(g.ccount, 10);
      const reps = parseInt(g.creps, 10);
      const weightKg = parseFloat(g.cweight);
      for (let i = 0; i < Math.min(count, 10); i++) sets.push({ weightKg, reps });
    } else if (g.aweight) {
      sets.push({ weightKg: parseFloat(g.aweight), reps: parseInt(g.areps, 10) });
    } else {
      const weightKg = parseFloat(g.lweight ?? g.dweight ?? '');
      const repList = (g.lreps ?? g.dreps ?? '').match(/\d{1,2}/g) ?? [];
      for (const r of repList) sets.push({ weightKg, reps: parseInt(r, 10) });
    }

    const valid = sets.filter(
      (s) =>
        Number.isFinite(s.weightKg) && s.weightKg > 0 && s.weightKg <= 500 &&
        Number.isFinite(s.reps) && s.reps >= 1 && s.reps <= 50,
    );
    if (!valid.length) continue;

    const name = cleanExerciseName(nameRaw);
    if (name) out.push({ name, sets: valid });
    else if (out.length) out[out.length - 1].sets.push(...valid);
  }
  return out.filter((e) => e.sets.length > 0);
}

// --------------------------------------------------------------- food parse

interface FoodItem {
  label: string;
  aliases: string[];
  kcal: number;
  p: number;
  c: number;
  f: number;
  serving: string;
}

const FOOD_DB: FoodItem[] = [
  { label: 'Roti', aliases: ['roti', 'chapati', 'chapatti', 'phulka', 'fulka'], kcal: 100, p: 3, c: 18, f: 2, serving: '1 roti' },
  { label: 'Tandoori Roti', aliases: ['tandoori roti'], kcal: 120, p: 4, c: 24, f: 1, serving: '1 roti' },
  { label: 'Naan', aliases: ['naan', 'butter naan'], kcal: 280, p: 7, c: 45, f: 7, serving: '1 naan' },
  { label: 'Plain Paratha', aliases: ['paratha', 'parantha'], kcal: 210, p: 4, c: 26, f: 10, serving: '1 paratha' },
  { label: 'Aloo Paratha', aliases: ['aloo paratha', 'aloo parantha'], kcal: 290, p: 5, c: 40, f: 12, serving: '1 paratha' },
  { label: 'Steamed Rice', aliases: ['rice', 'chawal', 'white rice', 'steamed rice'], kcal: 200, p: 4, c: 45, f: 1, serving: '1 bowl' },
  { label: 'Jeera Rice', aliases: ['jeera rice'], kcal: 250, p: 5, c: 45, f: 6, serving: '1 bowl' },
  { label: 'Dal', aliases: ['dal', 'daal', 'dal tadka', 'dal fry', 'moong dal', 'arhar dal', 'toor dal'], kcal: 150, p: 9, c: 20, f: 3, serving: '1 katori' },
  { label: 'Dal Makhani', aliases: ['dal makhani'], kcal: 280, p: 11, c: 25, f: 15, serving: '1 katori' },
  { label: 'Paneer Bhurji', aliases: ['paneer bhurji'], kcal: 290, p: 14, c: 6, f: 22, serving: '1 plate' },
  { label: 'Paneer Tikka', aliases: ['paneer tikka'], kcal: 280, p: 20, c: 8, f: 18, serving: '150 g' },
  { label: 'Palak Paneer', aliases: ['palak paneer'], kcal: 280, p: 12, c: 10, f: 20, serving: '1 bowl' },
  { label: 'Paneer Butter Masala', aliases: ['paneer butter masala', 'shahi paneer', 'paneer makhani'], kcal: 360, p: 12, c: 14, f: 28, serving: '1 bowl' },
  { label: 'Paneer', aliases: ['paneer'], kcal: 265, p: 18, c: 4, f: 20, serving: '100 g' },
  { label: 'Butter Chicken', aliases: ['butter chicken', 'murgh makhani'], kcal: 430, p: 27, c: 10, f: 30, serving: '1 bowl' },
  { label: 'Chicken Curry', aliases: ['chicken curry', 'chicken masala', 'chicken'], kcal: 280, p: 26, c: 8, f: 15, serving: '1 bowl' },
  { label: 'Grilled Chicken', aliases: ['grilled chicken', 'chicken breast', 'grilled chicken breast'], kcal: 240, p: 45, c: 0, f: 5, serving: '150 g' },
  { label: 'Chicken Tikka', aliases: ['chicken tikka', 'tandoori chicken'], kcal: 230, p: 32, c: 4, f: 9, serving: '150 g' },
  { label: 'Chicken Biryani', aliases: ['chicken biryani', 'biryani'], kcal: 600, p: 28, c: 70, f: 22, serving: '1 plate' },
  { label: 'Veg Biryani', aliases: ['veg biryani', 'vegetable biryani'], kcal: 450, p: 10, c: 70, f: 14, serving: '1 plate' },
  { label: 'Fish Curry', aliases: ['fish curry', 'fish'], kcal: 250, p: 25, c: 6, f: 14, serving: '1 bowl' },
  { label: 'Boiled Egg', aliases: ['egg', 'anda', 'ande', 'boiled egg', 'eggs'], kcal: 70, p: 6, c: 1, f: 5, serving: '1 egg' },
  { label: 'Egg White', aliases: ['egg white', 'egg whites'], kcal: 17, p: 4, c: 0, f: 0, serving: '1 white' },
  { label: 'Omelette', aliases: ['omelette', 'omelet', 'anda bhurji', 'egg bhurji'], kcal: 180, p: 12, c: 2, f: 14, serving: '2-egg' },
  { label: 'Oats', aliases: ['oats', 'oatmeal', 'porridge', 'daliya'], kcal: 190, p: 7, c: 33, f: 4, serving: '1 bowl' },
  { label: 'Whey Protein', aliases: ['whey protein', 'whey', 'protein shake', 'protein scoop', 'scoop of whey'], kcal: 120, p: 24, c: 3, f: 2, serving: '1 scoop' },
  { label: 'Milk', aliases: ['milk', 'doodh', 'dudh'], kcal: 150, p: 8, c: 12, f: 8, serving: '1 glass' },
  { label: 'Curd', aliases: ['curd', 'dahi', 'yogurt', 'yoghurt'], kcal: 100, p: 5, c: 7, f: 5, serving: '1 katori' },
  { label: 'Greek Yogurt', aliases: ['greek yogurt', 'greek yoghurt'], kcal: 90, p: 10, c: 5, f: 3, serving: '100 g' },
  { label: 'Plain Dosa', aliases: ['dosa', 'plain dosa'], kcal: 170, p: 4, c: 28, f: 5, serving: '1 dosa' },
  { label: 'Masala Dosa', aliases: ['masala dosa'], kcal: 300, p: 6, c: 45, f: 11, serving: '1 dosa' },
  { label: 'Idli', aliases: ['idli', 'idly'], kcal: 60, p: 2, c: 12, f: 1, serving: '1 idli' },
  { label: 'Sambar', aliases: ['sambar', 'sambhar'], kcal: 130, p: 6, c: 20, f: 3, serving: '1 katori' },
  { label: 'Poha', aliases: ['poha'], kcal: 270, p: 6, c: 45, f: 8, serving: '1 plate' },
  { label: 'Upma', aliases: ['upma'], kcal: 250, p: 6, c: 40, f: 8, serving: '1 plate' },
  { label: 'Chole', aliases: ['chole', 'chana masala', 'chana', 'chickpeas'], kcal: 220, p: 10, c: 30, f: 7, serving: '1 katori' },
  { label: 'Rajma', aliases: ['rajma', 'kidney beans'], kcal: 210, p: 10, c: 30, f: 5, serving: '1 katori' },
  { label: 'Salad', aliases: ['salad', 'green salad'], kcal: 60, p: 2, c: 10, f: 1, serving: '1 bowl' },
  { label: 'Banana', aliases: ['banana', 'kela', 'kele'], kcal: 105, p: 1, c: 27, f: 0, serving: '1 banana' },
  { label: 'Apple', aliases: ['apple', 'seb'], kcal: 95, p: 1, c: 25, f: 0, serving: '1 apple' },
  { label: 'Peanut Butter', aliases: ['peanut butter', 'pb'], kcal: 95, p: 4, c: 3, f: 8, serving: '1 tbsp' },
  { label: 'Bread', aliases: ['bread', 'brown bread', 'toast', 'bread slice'], kcal: 75, p: 3, c: 13, f: 1, serving: '1 slice' },
  { label: 'Veg Sandwich', aliases: ['sandwich', 'veg sandwich'], kcal: 250, p: 8, c: 35, f: 9, serving: '1 sandwich' },
  { label: 'Paneer Sandwich', aliases: ['paneer sandwich'], kcal: 320, p: 14, c: 34, f: 14, serving: '1 sandwich' },
  { label: 'Maggi', aliases: ['maggi', 'instant noodles', 'noodles'], kcal: 350, p: 8, c: 50, f: 13, serving: '1 pack' },
  { label: 'Samosa', aliases: ['samosa', 'samose'], kcal: 260, p: 4, c: 28, f: 15, serving: '1 samosa' },
  { label: 'Veg Momos', aliases: ['momos', 'momo', 'veg momos'], kcal: 300, p: 9, c: 45, f: 8, serving: '6 pcs' },
  { label: 'Chicken Momos', aliases: ['chicken momos', 'chicken momo'], kcal: 330, p: 16, c: 42, f: 10, serving: '6 pcs' },
  { label: 'Banana Shake', aliases: ['banana shake', 'shake', 'milkshake'], kcal: 250, p: 8, c: 40, f: 7, serving: '1 glass' },
  { label: 'Soya Chunks', aliases: ['soya chunks', 'soya', 'soybean chunks'], kcal: 170, p: 26, c: 15, f: 1, serving: '50 g dry' },
  { label: 'Ghee', aliases: ['ghee'], kcal: 45, p: 0, c: 0, f: 5, serving: '1 tsp' },
];

const NUM_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, che: 6, cheh: 6, six: 6, saat: 7, seven: 7,
  aath: 8, eight: 8, nine: 9, nau: 9, ten: 10, das: 10, half: 0.5, adha: 0.5, aadha: 0.5,
};
const QTY_PATTERN = `\\d+(?:\\.\\d+)?|${Object.keys(NUM_WORDS).join('|')}`;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Aliases sorted longest-first so "butter chicken" wins over "chicken". */
const ALIAS_INDEX: { alias: string; item: FoodItem }[] = FOOD_DB.flatMap((item) =>
  item.aliases.map((alias) => ({ alias, item })),
).sort((a, b) => b.alias.length - a.alias.length);

interface FoodMatch {
  item: FoodItem;
  qty: number;
}

function parseFoods(t: string): FoodMatch[] {
  let text = ` ${t} `;
  const matches: FoodMatch[] = [];
  for (const { alias, item } of ALIAS_INDEX) {
    const re = new RegExp(`(?:(${QTY_PATTERN})\\s+)?\\b${escapeRegex(alias)}(?:es|s)?\\b`, 'i');
    const m = re.exec(text);
    if (!m) continue;
    const qtyRaw = m[1]?.toLowerCase();
    const qty = qtyRaw ? (NUM_WORDS[qtyRaw] ?? parseFloat(qtyRaw)) : 1;
    if (!Number.isFinite(qty) || qty <= 0 || qty > 20) continue;
    matches.push({ item, qty });
    text = text.slice(0, m.index) + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length);
  }
  return matches;
}

// ------------------------------------------------------------------ intents

function isTodaysWorkout(t: string): boolean {
  if (/\blog\b/.test(t)) return false;
  return (
    /(what|which|show).*(workout|training|exercise|lift)/.test(t) ||
    /\b(today'?s?|aaj)\b.*\b(workout|plan|training|session|exercises?)\b/.test(t) ||
    /\b(workout|plan|training)\b.*\b(today|aaj)\b/.test(t) ||
    /aaj\s+(kya|konsa|kaunsa)/.test(t) ||
    /kya\s+karna\s+hai/.test(t) ||
    /(push|pull|leg|legs|upper|lower)\s+day/.test(t) ||
    /what should i (lift|do|train)/.test(t) ||
    /how much should i lift/.test(t) ||
    /kitna\s+(uthau|uthau?n|uthana|lift)/.test(t)
  );
}

function isPrQuery(t: string): boolean {
  return /\b(prs?|personal records?|records|best lifts?|max lifts?|maxes)\b/.test(t);
}

function isNutritionQuery(t: string): boolean {
  if (!/(calorie|calories|kcal|protein|carb|fat|macro|nutrition|diet)/.test(t)) return false;
  if (/\b(ate|had|khaya|khayi|khaye|drank|piya|having|finished|liya)\b/.test(t)) return false;
  return /(how much|how many|kitna|kitni|remaining|left|baaki|baki|bacha|bachi|to go|today|aaj|so far|status|summary|check|\?)/.test(t);
}

function isRemainingQuery(t: string): boolean {
  return /(remaining|left|baaki|baki|bacha|bachi|to go)/.test(t);
}

function summaryDays(t: string): number | null {
  const week = /(week|weekly|hafta|hafte|saptah)/.test(t);
  const month = /(month|monthly|mahina|mahine|maheena|maheene)/.test(t);
  if (!week && !month) return null;
  const intent = /(summary|recap|report|review|kaisa|kesa|kaise|stats|overview|progress|how (was|did)|dikha|batao)/.test(t);
  if (!intent) return null;
  return month ? 30 : 7;
}

function isImprovement(t: string): boolean {
  return /(improve|improvement|improved|progress|stronger|strength badh|sudhar|behtar|better hua|kitna aage|gains)/.test(t);
}

function parseBodyWeight(t: string): number | null {
  if (!/(body\s*weight|weight|wazan|vajan)/.test(t)) return null;
  if (/(bench|squat|deadlift|press|curl|row|pulldown|pull|push|lift|set|rep|x\s*\d)/.test(t)) return null;
  const m = t.match(/(\d{2,3}(?:\.\d+)?)\s*(?:kgs?|kilos?)?/);
  if (!m) return null;
  const w = parseFloat(m[1]);
  return w >= 25 && w <= 250 ? w : null;
}

function isLogWorkoutHint(t: string): boolean {
  return (
    /\blog\b.*\b(workout|session|exercise|lift|training)\b/.test(t) ||
    /\b(workout|training)\b.*\blog\b/.test(t) ||
    /\b(kiya|kiye|kari|maara|mara|lagaya|train kiya)\b/.test(t)
  );
}

function isLogMealHint(t: string): boolean {
  return (
    /\blog\b.*\b(meal|food|khana|lunch|dinner|breakfast)\b/.test(t) ||
    /\b(meal|food)\b.*\blog\b/.test(t) ||
    /(food photo|upload.*photo|photo.*meal)/.test(t)
  );
}

// ------------------------------------------------------------------ replies

async function todaysWorkoutReply(f: Flavour): Promise<LocalReply> {
  const tw = await getTodaysWorkout();
  const top = tw.targets
    .slice(0, 3)
    .map((t) => `${t.exerciseName} ${trimNum(t.targetWeightKg)}kg × ${t.targetRepsMin}-${t.targetRepsMax}`)
    .join(' · ');
  const text = pick(
    f,
    `${tw.headline}${top ? `\nKey lifts: ${top}. Full plan below 👇` : ''}`,
    `Aaj ${tw.dayName} hai! ${tw.headline}${top ? `\nMain lifts: ${top}. Pura plan neeche 👇` : ''}`,
  );
  return { text, cards: [{ kind: 'workout_plan', text: tw.headline, payload: tw }] };
}

async function logWorkoutReply(
  entries: WorkoutExerciseInput[],
  f: Flavour,
): Promise<LocalReply> {
  const logged = await logWorkoutCore(entries);
  const card = buildWorkoutLoggedCard(logged);
  const names = logged.detail.exercises.map((e) => e.exercise.name).join(', ');
  const vol = fmtInt(logged.detail.totalVolumeKg);
  const prLine = logged.newPrs.length
    ? pick(
        f,
        ` 🏆 New PR: ${logged.newPrs.map((p) => `${p.exerciseName} ${trimNum(p.value)}kg`).join(', ')}!`,
        ` 🏆 Naya PR: ${logged.newPrs.map((p) => `${p.exerciseName} ${trimNum(p.value)}kg`).join(', ')}!`,
      )
    : '';
  const text = pick(
    f,
    `Logged: ${names} — ${vol} kg total volume. Solid work.${prLine}`,
    `Log ho gaya: ${names} — total volume ${vol} kg. Badhiya kaam!${prLine}`,
  );
  return { text, cards: card ? [card] : [] };
}

async function logMealReply(matches: FoodMatch[], f: Flavour): Promise<LocalReply> {
  const totals = matches.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.item.kcal * m.qty,
      p: acc.p + m.item.p * m.qty,
      c: acc.c + m.item.c * m.qty,
      f: acc.f + m.item.f * m.qty,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const description = matches
    .map((m) => `${m.qty !== 1 ? `${trimNum(m.qty)} ` : ''}${m.item.label}`)
    .join(' + ');
  const meal = await nutritionRepo.logMeal({
    dateISO: todayISO(),
    description,
    calories: Math.round(totals.kcal),
    proteinG: Math.round(totals.p),
    carbsG: Math.round(totals.c),
    fatG: Math.round(totals.f),
    source: 'text',
  });
  const snap = await nutritionSnapshot(meal.dateISO);
  const text = pick(
    f,
    `Logged: ${description} ≈ ${fmtInt(meal.calories)} kcal, ${Math.round(meal.proteinG)}g protein. You're ${snap.remaining.proteinG}g away from your protein goal with ${fmtInt(snap.remaining.calories)} kcal left today.`,
    `Log kar diya: ${description} ≈ ${fmtInt(meal.calories)} kcal, ${Math.round(meal.proteinG)}g protein. Protein goal se sirf ${snap.remaining.proteinG}g door ho — ${fmtInt(snap.remaining.calories)} kcal aur bache hain aaj.`,
  );
  return {
    text,
    cards: [
      {
        kind: 'meal_logged',
        text: `${meal.description} — ${fmtInt(meal.calories)} kcal · ${Math.round(meal.proteinG)}g protein`,
        payload: meal,
      },
    ],
  };
}

async function nutritionReply(t: string, f: Flavour): Promise<LocalReply> {
  const snap = await nutritionSnapshot(todayISO());
  const d = snap.day;
  const card: CoachCard = {
    kind: 'nutrition_summary',
    text: `${fmtInt(d.calories)} / ${fmtInt(snap.targets.calories)} kcal · ${Math.round(d.proteinG)} / ${snap.targets.proteinG}g protein`,
    payload: snap,
  };
  if (isRemainingQuery(t)) {
    const text = pick(
      f,
      `You have ${fmtInt(snap.remaining.calories)} kcal and ${snap.remaining.proteinG}g protein left today (${fmtInt(d.calories)} kcal, ${Math.round(d.proteinG)}g protein down so far).`,
      `Aaj abhi ${fmtInt(snap.remaining.calories)} kcal aur ${snap.remaining.proteinG}g protein bacha hai (${fmtInt(d.calories)} kcal, ${Math.round(d.proteinG)}g protein ho chuka hai).`,
    );
    return { text, cards: [card] };
  }
  const text = pick(
    f,
    `So far today: ${fmtInt(d.calories)} kcal · ${Math.round(d.proteinG)}g protein · ${Math.round(d.carbsG)}g carbs · ${Math.round(d.fatG)}g fat across ${d.mealCount} meal${d.mealCount === 1 ? '' : 's'}. ${snap.remaining.proteinG}g protein to go — keep it coming.`,
    `Aaj ab tak: ${fmtInt(d.calories)} kcal · ${Math.round(d.proteinG)}g protein · ${Math.round(d.carbsG)}g carbs · ${Math.round(d.fatG)}g fat (${d.mealCount} meal). Protein target ke liye ${snap.remaining.proteinG}g aur chahiye.`,
  );
  return { text, cards: [card] };
}

async function summaryReply(days: number, f: Flavour): Promise<LocalReply> {
  const to = todayISO();
  const from = addDays(to, -(days - 1));
  const w = await summarizeWorkoutRange(from, to);
  const nutrition = await nutritionRepo.getNutritionRange(from, to);
  const logged = nutrition.filter((d: NutritionDay) => d.mealCount > 0);
  const avgKcal = logged.length
    ? Math.round(logged.reduce((n: number, d: NutritionDay) => n + d.calories, 0) / logged.length)
    : 0;
  const avgP = logged.length
    ? Math.round(logged.reduce((n: number, d: NutritionDay) => n + d.proteinG, 0) / logged.length)
    : 0;
  const label = days >= 30 ? pick(f, 'Last 30 days', 'Pichle 30 din') : pick(f, 'This week', 'Is hafte');
  const topName = w.topExercises[0]?.name;
  const text = pick(
    f,
    `${label}: ${w.sessions} workouts, ${fmtInt(w.totalVolumeKg)} kg total volume${topName ? ` (biggest mover: ${topName})` : ''}. Nutrition averaged ${fmtInt(avgKcal)} kcal & ${avgP}g protein/day.`,
    `${label}: ${w.sessions} workouts, total volume ${fmtInt(w.totalVolumeKg)} kg${topName ? ` (sabse zyada: ${topName})` : ''}. Nutrition average ${fmtInt(avgKcal)} kcal aur ${avgP}g protein/din raha.`,
  );
  const rows = [
    { label: 'Workouts', value: `${w.sessions}` },
    { label: 'Total volume', value: `${fmtInt(w.totalVolumeKg)} kg` },
    ...w.topExercises.slice(0, 3).map((e) => ({
      label: e.name,
      value: `${fmtInt(e.volumeKg)} kg · ${e.sets} sets`,
    })),
    { label: 'Avg calories', value: `${fmtInt(avgKcal)} kcal/day` },
    { label: 'Avg protein', value: `${avgP} g/day` },
  ];
  return { text, cards: [{ kind: 'stats', text: `${label} summary`, payload: rows }] };
}

async function prReply(f: Flavour): Promise<LocalReply> {
  const prs = await prRepo.getAllPrs();
  if (!prs.length) {
    return {
      text: pick(
        f,
        'No PRs on record yet — log a few workouts and we will start tracking them.',
        'Abhi tak koi PR record nahi hai — kuch workouts log karo, phir track karte hain.',
      ),
      cards: [],
    };
  }
  const top = prs
    .slice(0, 3)
    .map((p) => `${p.exerciseName} ${trimNum(p.value)}kg`)
    .join(', ');
  const text = pick(
    f,
    `You have ${prs.length} PRs on file. Latest highlights: ${top}. Full list below 👇`,
    `Tumhare ${prs.length} PRs file pe hain. Latest: ${top}. Puri list neeche 👇`,
  );
  return {
    text,
    cards: [{ kind: 'pr_list', text: `${prs.length} personal records`, payload: prs }],
  };
}

async function improvementReply(f: Flavour): Promise<LocalReply> {
  const today = todayISO();
  const weekly = await workoutRepo.getWeeklyVolume(8);
  const half = Math.floor(weekly.length / 2);
  const older = weekly.slice(0, half).reduce((n, p) => n + p.volumeKg, 0);
  const recent = weekly.slice(half).reduce((n, p) => n + p.volumeKg, 0);
  const volDelta = older > 0 ? Math.round(((recent - older) / older) * 100) : 0;

  const prs = await prRepo.getAllPrs();
  const cutoff = addDays(today, -30);
  const recentPrs = prs.filter((p) => p.dateISO >= cutoff);

  const bw = await userRepo.getBodyWeightHistory(90);
  const bwDelta = bw.length >= 2 ? Math.round((bw[bw.length - 1].weightKg - bw[0].weightKg) * 10) / 10 : null;

  const parts: string[] = [];
  parts.push(
    pick(
      f,
      `Training volume is ${volDelta >= 0 ? 'up' : 'down'} ${Math.abs(volDelta)}% over the last month vs the month before`,
      `Training volume pichle mahine se ${Math.abs(volDelta)}% ${volDelta >= 0 ? 'upar' : 'neeche'} hai`,
    ),
  );
  parts.push(
    pick(
      f,
      `${recentPrs.length} PR${recentPrs.length === 1 ? '' : 's'} in the last 30 days`,
      `pichle 30 din me ${recentPrs.length} PR`,
    ),
  );
  if (bwDelta !== null) {
    parts.push(
      pick(
        f,
        `body weight ${bwDelta >= 0 ? '+' : ''}${bwDelta} kg over ~3 months`,
        `body weight ~3 mahine me ${bwDelta >= 0 ? '+' : ''}${bwDelta} kg`,
      ),
    );
  }
  const text = pick(
    f,
    `Solid trajectory: ${parts.join(' · ')}. That's progressive overload doing its job.`,
    `Kaafi accha improve kiya hai: ${parts.join(' · ')}. Progressive overload kaam kar raha hai 💪`,
  );
  const rows = [
    { label: 'Volume trend (4wk vs prev 4wk)', value: `${volDelta >= 0 ? '+' : ''}${volDelta}%` },
    { label: 'PRs in last 30 days', value: `${recentPrs.length}` },
    ...(bwDelta !== null
      ? [{ label: 'Body weight (90d)', value: `${bwDelta >= 0 ? '+' : ''}${bwDelta} kg` }]
      : []),
  ];
  return { text, cards: [{ kind: 'stats', text: 'Progress check', payload: rows }] };
}

async function bodyWeightReply(weightKg: number, f: Flavour): Promise<LocalReply> {
  const entry = await userRepo.logBodyWeight(todayISO(), weightKg);
  const history = await userRepo.getBodyWeightHistory(60);
  const prev = history.filter((h) => h.dateISO < entry.dateISO).pop();
  const deltaLine = prev
    ? (() => {
        const d = Math.round((entry.weightKg - prev.weightKg) * 10) / 10;
        if (d === 0) return pick(f, 'Steady since last check-in.', 'Pichli baar jitna hi hai.');
        return pick(
          f,
          `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} kg since ${prev.dateISO}.`,
          `${prev.dateISO} se ${Math.abs(d)} kg ${d > 0 ? 'zyada' : 'kam'}.`,
        );
      })()
    : '';
  const text = pick(
    f,
    `Body weight logged: ${trimNum(entry.weightKg)} kg. ${deltaLine}`.trim(),
    `Weight log ho gaya: ${trimNum(entry.weightKg)} kg. ${deltaLine}`.trim(),
  );
  return { text, cards: [] };
}

function workoutGuidance(f: Flavour): LocalReply {
  return {
    text: pick(
      f,
      'Tell me what you lifted and I will log it — e.g. "Bench press 80 kg for 8, 7 and 6" or "squat 3 sets of 10 at 100".',
      'Batao kya uthaya, main log kar dunga — jaise "Bench press 80 kg 8, 7 aur 6 reps" ya "squat 100 kg 3 sets of 10".',
    ),
    cards: [],
  };
}

function mealGuidance(f: Flavour): LocalReply {
  return {
    text: pick(
      f,
      'Tell me what you ate and I will estimate the macros — e.g. "2 rotis, dal and butter chicken". (Photo estimation needs a cloud AI key in Settings.)',
      'Batao kya khaya, main macros estimate kar dunga — jaise "2 roti, dal aur butter chicken". (Photo se estimate ke liye Settings me AI key chahiye.)',
    ),
    cards: [],
  };
}

// -------------------------------------------------------------------- main

/**
 * Deterministic local coach. Returns null when no intent matches — the
 * orchestrator then sends a generic help reply.
 */
export async function localCoachReply(text: string): Promise<LocalReply | null> {
  const raw = text.trim();
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/\s+/g, ' ');
  const f = detectFlavour(raw);

  if (isTodaysWorkout(t)) return todaysWorkoutReply(f);
  if (isPrQuery(t)) return prReply(f);
  if (isNutritionQuery(t)) return nutritionReply(t, f);

  const days = summaryDays(t);
  if (days !== null) return summaryReply(days, f);

  if (isImprovement(t)) return improvementReply(f);

  const bodyWeight = parseBodyWeight(t);
  if (bodyWeight !== null) return bodyWeightReply(bodyWeight, f);

  const workout = parseWorkout(t);
  if (workout.length) return logWorkoutReply(workout, f);

  if (isLogWorkoutHint(t)) return workoutGuidance(f);

  const foods = parseFoods(t);
  const eatVerb = /\b(ate|had|eat|eaten|having|khaya|khayi|khaye|kha liya|breakfast|lunch|dinner|snack|meal|log)\b/.test(t);
  const question = /(how|what|kitna|kitni|kya\b|kab|should|\?)/.test(t);
  if (foods.length && (eatVerb || !question)) return logMealReply(foods, f);

  if (isLogMealHint(t)) return mealGuidance(f);

  return null;
}

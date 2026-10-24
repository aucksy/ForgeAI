/**
 * Measurements taken by the gym's trainer, and the gym's diet plans (R-120, 24 Oct 2026). The PURE
 * half: reading the gym's answers (member_measurements and member_diet_plans,
 * supabase/migrations/0035_trainer_measurements_diet.sql), the copy kept on the phone, and merging
 * the gym's measurements with the member's own for the Body page (Progress → Body).
 *
 * Rules:
 *  - The member's own entries stay theirs: never changed, never sent anywhere. The gym's are a
 *    separate, read-only list marked "From <gym>".
 *  - One value per measurement per day (the app's rule): on a day with the member's own entry, theirs
 *    is shown and the gym's is left out, so nothing is counted twice.
 *  - Kept per gym. A member who leaves the gym keeps the numbers already on the phone (they are about
 *    their own body); a new gym's numbers sit beside them. Erase all data removes them.
 *  - Diet plans are the gym's: the phone shows the last list it got, while the member is in that gym.
 * tracker/services/gymBodySync.ts does the asking and the saving.
 */
import type { MeasureKind } from '@/tracker/engine/measurements';

/** The gym's measurement kinds: body weight plus the app's ten (body fat and nine tape ones). */
export type GymMeasureKind = 'bodyweight' | MeasureKind;

const TAPE: readonly MeasureKind[] = ['neck', 'shoulders', 'chest', 'arm', 'forearm', 'waist', 'hips', 'thigh', 'calf'];

/** One day the gym measured the member. Weight in kg, body fat in %, tape in cm (the app's own units). */
export interface GymMeasureDay {
  id: string;
  dateISO: string;
  weightKg: number | null;
  bodyFat: number | null;
  tape: Partial<Record<MeasureKind, number>>;
  /** Who measured ("Ravi"); null when not known. */
  byName: string | null;
}

export interface GymMeasuresCopy {
  gymId: string;
  gymName: string;
  days: GymMeasureDay[];
  /** When the gym last answered (ms). */
  at: number;
}

/** Everything kept, by gym id. */
export type GymMeasuresStore = Record<string, GymMeasuresCopy>;

export type GymProblem = 'NO_PHONE' | 'NOT_ON_ROSTER' | 'GYM_NOT_ONLINE' | 'NAME_MISMATCH' | 'SHARED_NUMBER';
const PROBLEMS: readonly GymProblem[] = ['NO_PHONE', 'NOT_ON_ROSTER', 'GYM_NOT_ONLINE', 'NAME_MISMATCH', 'SHARED_NUMBER'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** One day from the gym, or null when it can't be read. PURE. */
export function gymMeasureFromRow(raw: unknown): GymMeasureDay | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const dateISO = str(raw.date);
  if (!id || !ISO.test(dateISO)) return null;
  const tape: Partial<Record<MeasureKind, number>> = {};
  if (isObj(raw.tape)) {
    for (const k of TAPE) {
      const v = pos(raw.tape[k]);
      if (v != null) tape[k] = v;
    }
  }
  const day: GymMeasureDay = { id, dateISO, weightKg: pos(raw.weightKg), bodyFat: pos(raw.bodyFat), tape, byName: str(raw.byName) || null };
  return day.weightKg == null && day.bodyFat == null && Object.keys(tape).length === 0 ? null : day;
}

export type GymMeasuresAnswer =
  | { ok: true; gymId: string; gymName: string; days: GymMeasureDay[] }
  | { ok: false; problem: GymProblem; gymName: string };

/** member_measurements' answer, checked; null when it is not one. PURE. */
export function gymMeasuresFromRow(raw: unknown): GymMeasuresAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  const gymName = str(r.gymName) || 'Your gym';
  const problem = PROBLEMS.find((p) => p === r.error);
  if (problem) return { ok: false, problem, gymName };
  if (r.ok !== true || !str(r.gymId) || !Array.isArray(r.entries)) return null;
  const days = r.entries.map(gymMeasureFromRow).filter((d): d is GymMeasureDay => d != null);
  return { ok: true, gymId: str(r.gymId), gymName, days };
}

/** The kept copies after a fresh answer: this gym's list replaced (a deleted entry goes), others kept. PURE. */
export function withGymAnswer(store: GymMeasuresStore, a: { gymId: string; gymName: string; days: GymMeasureDay[] }, at: number): GymMeasuresStore {
  return { ...store, [a.gymId]: { gymId: a.gymId, gymName: a.gymName, days: a.days, at } };
}

/** The kept copies read back; anything unreadable dropped. PURE. */
export function parseGymMeasuresStore(raw: string | null): GymMeasuresStore {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v)) return {};
    const out: GymMeasuresStore = {};
    for (const [gymId, c] of Object.entries(v)) {
      if (!isObj(c) || !Array.isArray(c.days)) continue;
      const days = c.days
        .map((d) => (isObj(d) ? gymMeasureFromRow({ ...d, date: d.dateISO }) : null))
        .filter((d): d is GymMeasureDay => d != null);
      out[gymId] = { gymId, gymName: str(c.gymName) || 'Your gym', days, at: typeof c.at === 'number' ? c.at : 0 };
    }
    return out;
  } catch {
    return {};
  }
}

/** One value of the gym's for a measure (stored units: kg, %, cm). */
export interface GymPoint {
  id: string;
  dateISO: string;
  value: number;
  gymName: string;
  byName: string | null;
}

function valueOf(d: GymMeasureDay, kind: GymMeasureKind): number | null {
  if (kind === 'bodyweight') return d.weightKg;
  if (kind === 'body_fat') return d.bodyFat;
  return d.tape[kind] ?? null;
}

/**
 * The gym's values for one measure, left out on the days the member has their own (theirs is shown)
 * and, between two gyms on the same day, only the newer copy. Oldest first. PURE.
 */
export function gymPointsFor(store: GymMeasuresStore, kind: GymMeasureKind, ownDays: ReadonlySet<string>): GymPoint[] {
  const byDay = new Map<string, GymPoint & { at: number }>();
  for (const c of Object.values(store)) {
    for (const d of c.days) {
      const v = valueOf(d, kind);
      if (v == null || ownDays.has(d.dateISO)) continue;
      const prev = byDay.get(d.dateISO);
      if (prev && prev.at >= c.at) continue;
      byDay.set(d.dateISO, { id: `gym:${c.gymId}:${d.id}:${kind}`, dateISO: d.dateISO, value: v, gymName: c.gymName, byName: d.byName, at: c.at });
    }
  }
  return [...byDay.values()]
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0))
    .map(({ at: _at, ...p }) => p);
}

/** "From Shakti Gym · Ravi": under a gym entry on the Body page. PURE. */
export function fromGymWords(p: Pick<GymPoint, 'gymName' | 'byName'>): string {
  return `From ${p.gymName}${p.byName ? ` · ${p.byName}` : ''}`;
}

// ------------------------------------------------------------------ diet plans

export interface GymDietMeal {
  name: string;
  time: string | null;
  items: string[];
}

export interface GymDietPlan {
  id: string;
  title: string;
  goal: string | null;
  kcal: number | null;
  proteinG: number | null;
  meals: GymDietMeal[];
  notes: string | null;
  byName: string | null;
  updatedAt: number;
}

export interface GymDietsCopy {
  gymId: string;
  gymName: string;
  plans: GymDietPlan[];
  at: number;
}

/** One plan from the gym, or null when it can't be read. Meals with no food are dropped. PURE. */
export function gymDietFromRow(raw: unknown): GymDietPlan | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const title = str(raw.title).slice(0, 80);
  if (!id || !title || !Array.isArray(raw.meals)) return null;
  const meals: GymDietMeal[] = [];
  for (const m of raw.meals.slice(0, 10)) {
    if (!isObj(m) || !str(m.name) || !Array.isArray(m.items)) continue;
    const items = m.items.map(str).filter(Boolean).slice(0, 20);
    if (items.length > 0) meals.push({ name: str(m.name).slice(0, 40), time: str(m.time) || null, items });
  }
  if (meals.length === 0) return null;
  const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  return {
    id,
    title,
    goal: str(raw.goal) || null,
    kcal: whole(raw.kcal),
    proteinG: whole(raw.proteinG),
    meals,
    notes: str(raw.notes) || null,
    byName: str(raw.byName) || null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export type GymDietsAnswer = { ok: true; gymId: string; gymName: string; plans: GymDietPlan[] } | { ok: false; problem: GymProblem; gymName: string };

/** member_diet_plans' answer, checked; null when it is not one. PURE. */
export function gymDietsFromRow(raw: unknown): GymDietsAnswer | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r)) return null;
  const gymName = str(r.gymName) || 'Your gym';
  const problem = PROBLEMS.find((p) => p === r.error);
  if (problem) return { ok: false, problem, gymName };
  if (r.ok !== true || !str(r.gymId) || !Array.isArray(r.plans)) return null;
  const plans = r.plans.map(gymDietFromRow).filter((p): p is GymDietPlan => p != null);
  return { ok: true, gymId: str(r.gymId), gymName, plans };
}

/** The kept diet plans read back, or null. PURE. */
export function parseGymDietsCopy(raw: string | null): GymDietsCopy | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v) || !str(v.gymId) || !Array.isArray(v.plans)) return null;
    const plans = v.plans.map(gymDietFromRow).filter((p): p is GymDietPlan => p != null);
    return { gymId: str(v.gymId), gymName: str(v.gymName) || 'Your gym', plans, at: typeof v.at === 'number' ? v.at : 0 };
  } catch {
    return null;
  }
}

/** "1,600 kcal · 90 g protein a day", or null when the plan has neither. PURE. */
export function dietTargetsWords(p: Pick<GymDietPlan, 'kcal' | 'proteinG'>): string | null {
  const parts: string[] = [];
  if (p.kcal != null) parts.push(`${p.kcal.toLocaleString('en-IN')} kcal`);
  if (p.proteinG != null) parts.push(`${p.proteinG} g protein`);
  return parts.length > 0 ? `${parts.join(' · ')} a day` : null;
}

/** The Gym tab's row line: "Fat loss veg · 1,600 kcal", "2 plans from your trainer", or the empty words. PURE. */
export function dietRowWords(plans: readonly Pick<GymDietPlan, 'title'>[] | null): string {
  if (!plans || plans.length === 0) return 'What to eat, when your trainer sends a plan';
  if (plans.length === 1) return plans[0].title;
  return `${plans.length} plans from your trainer`;
}

/** Shown under every diet plan (owner brief, R-120). */
export const DIET_DOCTOR_LINE = 'Talk to a doctor if you have a health condition.';

/** What the diet page says when the gym can't match the member yet. PURE. */
export function dietProblemWords(problem: GymProblem, gymName: string): { title: string; body: string } {
  switch (problem) {
    case 'NO_PHONE':
      return { title: 'Check in once to see your diet plan', body: `Scan ${gymName}'s check-in QR at the gym. After that, the plan your trainer sends shows here.` };
    case 'NAME_MISMATCH':
      return { title: 'Ask the desk to check your name', body: `${gymName}'s list has a different name for the number you checked in with. Your plan shows here once they match.` };
    case 'SHARED_NUMBER':
      return { title: 'Your number is shared', body: `More than one ${gymName} member has this mobile number. Ask the desk to give each person their own.` };
    case 'NOT_ON_ROSTER':
      return { title: 'Your gym has a different number', body: `${gymName}'s list doesn't have the number you checked in with. Ask the desk to update it.` };
    default:
      return { title: 'Not available yet', body: `${gymName} doesn't send diet plans in MettleUp yet. Ask your trainer.` };
  }
}

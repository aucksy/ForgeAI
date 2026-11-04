/**
 * F109 "Trainers see their members' progress" (OWNER-INBOX #46, DECIDED 24 Oct 2026: no tick box; one line on
 * the join screen and an off switch, on by default; supabase/migrations/0050_trainer_view.sql). The PURE half:
 *  - the weekly summary this phone sends while "Share my workouts with my trainers" is on (`trainerSummaryFrom`):
 *    workouts and kg lifted per week (12 weeks), the best set of the 5 most-done exercises, new heaviest weights
 *    of the last 30 days, and the day of the last workout. Never body weight, photos, notes or food, and no list
 *    of sets. The kg counts only the weight on the bar or in the hands (as mateProfile.ts sharedKg does), so no
 *    one can divide a pull-up's kg back into a body weight;
 *  - the gym's answers read defensively;
 *  - every word a member reads (TRAINER_WORDS, held to the member-words rules by a test).
 * trainerSync.ts sends it (mateShare.ts's sharer decides when) and talks to the server.
 */
import { addDays } from '@/lib/date';

export const TRAINER_WEEKS = 12;
export const TRAINER_BEST = 5;
export const TRAINER_RECORD_DAYS = 30;
export const TRAINER_RECORDS = 5;
const NAME_MAX = 40;

/** Every word a member reads about it. The owner approved them as written, 3 Nov 2026 (#86). */
export const TRAINER_WORDS = {
  // words: owner approved 3 Nov 2026 (#86); "gym and your trainer" R-296
  joinNote: 'Your gym and your trainer see your workouts, so they can help you progress.',
  // words: owner approved 3 Nov 2026 (#86)
  shareSwitch: 'Share my workouts with my trainers',
  // words: owner approved 3 Nov 2026 (#86); "gym and your trainer" R-296
  shareCaption:
    'Your gym and your trainer see a weekly summary: how many workouts, kg lifted, your best sets and new bests. Never your body weight, photos or notes. Off: the gym deletes it at once.',
  // words: NEW (R-319 item 11, 4 Nov 2026), shown once the gym's server has 0053: what trainers now see. Owner checks at UAT.
  shareCaptionRecent:
    "Your gym and your trainer see your kg lifted each week, your best lifts, and up to 30 workouts from the last 3 months with each exercise's best set. Never your body weight, photos or notes. Off: the gym deletes it at once.",
  // words: owner approved 3 Nov 2026 (#86)
  yourTrainer: (name: string): string => `Your trainer: ${name}`,
  // words: owner approved 3 Nov 2026 (#86)
  helpButton: 'Ask my trainer for help',
  // words: owner approved 3 Nov 2026 (#86)
  helpSent: 'Sent. Your trainer will get in touch.',
  // words: owner approved 3 Nov 2026 (#86)
  helpAlready: 'Already sent today. Your trainer will get in touch.',
  // words: owner approved 3 Nov 2026 (#86)
  helpFailed: 'Could not send. Check your internet and try again.',
} as const;

/** One working set as this phone reads it (warm-ups already left out). */
export interface TrainerSetRow {
  workoutId: string;
  /** "YYYY-MM-DD". */
  dateISO: string;
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
}

export interface TrainerWeek {
  /** The week's Monday, "YYYY-MM-DD". */
  w: string;
  /** Workouts that week. */
  n: number;
  /** kg lifted that week (bar weight x reps, whole kg). */
  kg: number;
}

export interface TrainerBest {
  n: string;
  w: number;
  r: number;
  /** Workouts with this exercise in the 12 weeks. */
  t: number;
}

export interface TrainerRecord {
  n: string;
  w: number;
  r: number;
  d: string;
}

export interface TrainerSummary {
  weeks: TrainerWeek[];
  best: TrainerBest[];
  records: TrainerRecord[];
  last: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
// Whole characters (release review, 3 Nov): a cut emoji half makes the server refuse the whole summary.
const clean = (s: string): string => Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
const kg1 = (w: number): number => Math.round(Math.min(1000, Math.max(0, finite(w))) * 10) / 10;
const reps = (r: number): number => Math.min(1000, Math.max(0, Math.floor(finite(r))));

/** The Monday of a day's week, "YYYY-MM-DD". PURE. */
export function mondayOf(dayISO: string): string {
  const d = new Date(`${dayISO}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0 .. Sunday 6
  return addDays(dayISO, -dow);
}

/** The first day the summary covers: the Monday 11 weeks before this week's. PURE. */
export function trainerFrom(today: string): string {
  return addDays(mondayOf(today), -7 * (TRAINER_WEEKS - 1));
}

/**
 * The summary. `rows`: working sets from `trainerFrom(today)` to today. `before`: per exercise id, the heaviest
 * working weight from before the last 30 days (so "new best" means heavier than ever before; a first-ever
 * exercise is not a record). PURE.
 */
export function trainerSummaryFrom(rows: readonly TrainerSetRow[], before: ReadonlyMap<string, number>, today: string): TrainerSummary {
  const from = trainerFrom(today);
  const recordFrom = addDays(today, -(TRAINER_RECORD_DAYS - 1));
  const ok = rows.filter((r) => ISO_DAY.test(r.dateISO) && r.dateISO >= from && r.dateISO <= today && r.workoutId && r.exerciseId);

  // Weeks: every week of the 12, newest first, even an empty one (the trainer sees the gap).
  const weekWorkouts = new Map<string, Set<string>>();
  const weekKg = new Map<string, number>();
  let last: string | null = null;
  for (const r of ok) {
    const w = mondayOf(r.dateISO);
    if (!weekWorkouts.has(w)) weekWorkouts.set(w, new Set());
    weekWorkouts.get(w)!.add(r.workoutId);
    weekKg.set(w, (weekKg.get(w) ?? 0) + Math.max(0, finite(r.weightKg)) * reps(r.reps));
    if (!last || r.dateISO > last) last = r.dateISO;
  }
  const weeks: TrainerWeek[] = [];
  for (let i = 0; i < TRAINER_WEEKS; i++) {
    const w = addDays(mondayOf(today), -7 * i);
    weeks.push({ w, n: Math.min(21, weekWorkouts.get(w)?.size ?? 0), kg: Math.min(2000000, Math.round(weekKg.get(w) ?? 0)) });
  }

  // Per exercise: workouts it was in, its best set over the 12 weeks, and its sets of the last 30 days by day.
  type Ex = { name: string; workouts: Set<string>; best: { w: number; r: number } | null; days: Map<string, { w: number; r: number }> };
  const byEx = new Map<string, Ex>();
  for (const r of ok) {
    const name = clean(r.name ?? '');
    const w = kg1(r.weightKg);
    const rp = reps(r.reps);
    if (!name || (w === 0 && rp === 0)) continue;
    let e = byEx.get(r.exerciseId);
    if (!e) {
      e = { name, workouts: new Set(), best: null, days: new Map() };
      byEx.set(r.exerciseId, e);
    }
    e.workouts.add(r.workoutId);
    if (!e.best || w > e.best.w || (w === e.best.w && rp > e.best.r)) e.best = { w, r: rp };
    if (r.dateISO >= recordFrom && w > 0) {
      const d = e.days.get(r.dateISO);
      if (!d || w > d.w || (w === d.w && rp > d.r)) e.days.set(r.dateISO, { w, r: rp });
    }
  }

  const best: TrainerBest[] = [...byEx.values()]
    .filter((e) => e.best)
    .sort((a, b) => b.workouts.size - a.workouts.size || a.name.localeCompare(b.name))
    .slice(0, TRAINER_BEST)
    .map((e) => ({ n: e.name, w: e.best!.w, r: e.best!.r, t: Math.min(500, e.workouts.size) }));

  // New heaviest weights: each exercise's last day in the 30 that beat everything before it.
  const records: TrainerRecord[] = [];
  for (const [id, e] of byEx) {
    const prior = finite(before.get(id));
    if (prior <= 0) continue;
    let top = prior;
    let rec: TrainerRecord | null = null;
    for (const d of [...e.days.keys()].sort()) {
      const s = e.days.get(d)!;
      if (s.w > top) {
        top = s.w;
        rec = { n: e.name, w: s.w, r: s.r, d };
      }
    }
    if (rec) records.push(rec);
  }
  records.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.n.localeCompare(b.n)));

  return { weeks, best, records: records.slice(0, TRAINER_RECORDS), last };
}

// ------------------------------------------------------------------ the gym's answers

export interface TrainerStatus {
  shared: boolean;
  /** The trainer's first name, or null (none picked yet). */
  trainer: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** member_trainer_status's answer; null when it is not one. PURE. */
export function trainerStatusFrom(raw: unknown): TrainerStatus | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  const t = typeof r.trainer === 'string' ? r.trainer.trim().slice(0, 40) : '';
  return { shared: r.shared === true, trainer: t || null };
}

/** member_trainer_help's answer: 'sent', 'already', or null when it is not one. PURE. */
export function trainerHelpFrom(raw: unknown): 'sent' | 'already' | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  return r.already === true ? 'already' : 'sent';
}

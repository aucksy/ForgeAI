/**
 * R-540: 12 weeks of believable workouts that demo members "shared from the MettleUp app", for Training progress and
 * a member's Progress card (the trend lines of logic/progressTrend.ts). Each member follows one story:
 *   - stronger: trains 4 days a week and adds weight every couple of weeks (tag "Getting stronger", new bests);
 *   - steady:   3 days a week at the same weights (tag "Steady");
 *   - dropping: came 3 days a week, then less and less, lighter, and not at all for 9 days ("Dropping");
 *   - new:      joined the app 2.5 weeks ago (tag "Not enough data yet").
 * The answers have the shape the gym server sends (0050's weekly summary, 0053's recent workouts: best set per
 * exercise and how many sets). Exercise names are the member app's own library names. PURE: no clock beyond `today`.
 */

import { addDays, diffDays, type DateISO } from '../logic/dates';

export type TrainingStory = 'stronger' | 'steady' | 'dropping' | 'new';

interface Lift {
  n: string;
  /** Starting kg (0: a body-weight move, counted in reps). */
  kg: number;
  reps: number;
  sets: number;
  /** The plate jump for this lift. */
  step: number;
}

const DAYS: Record<'push' | 'pull' | 'legs', { name: string; lifts: Lift[] }> = {
  push: {
    name: 'Push',
    lifts: [
      { n: 'Barbell Bench Press', kg: 50, reps: 8, sets: 4, step: 2.5 },
      { n: 'Incline Dumbbell Press', kg: 16, reps: 10, sets: 3, step: 2 },
      { n: 'Dumbbell Shoulder Press', kg: 14, reps: 10, sets: 3, step: 2 },
      { n: 'Lateral Raise', kg: 6, reps: 12, sets: 3, step: 1 },
      { n: 'Triceps Pushdown', kg: 25, reps: 12, sets: 3, step: 2.5 },
    ],
  },
  pull: {
    name: 'Pull',
    lifts: [
      { n: 'Lat Pulldown', kg: 45, reps: 10, sets: 4, step: 2.5 },
      { n: 'Seated Cable Row', kg: 40, reps: 10, sets: 3, step: 2.5 },
      { n: 'Barbell Curl', kg: 20, reps: 10, sets: 3, step: 2.5 },
      { n: 'Face Pull', kg: 15, reps: 15, sets: 3, step: 2.5 },
      { n: 'Pull-Up', kg: 0, reps: 6, sets: 3, step: 1 },
    ],
  },
  legs: {
    name: 'Legs',
    lifts: [
      { n: 'Barbell Squat', kg: 60, reps: 8, sets: 4, step: 5 },
      { n: 'Leg Press', kg: 120, reps: 10, sets: 3, step: 10 },
      { n: 'Romanian Deadlift', kg: 50, reps: 10, sets: 3, step: 5 },
      { n: 'Leg Extension', kg: 35, reps: 12, sets: 3, step: 2.5 },
    ],
  },
};

const ORDER = ['push', 'pull', 'legs'] as const;

export interface SharedSet {
  n: string;
  w: number;
  r: number;
  s: number;
}

export interface SharedWorkout {
  d: DateISO;
  n: string;
  x: SharedSet[];
}

/** One member's share, as the gym server keeps it. */
export interface SharedTraining {
  summary: {
    weeks: { w: DateISO; n: number; kg: number }[];
    best: { n: string; w: number; r: number; t: number }[];
    records: { n: string; w: number; r: number; d: DateISO }[];
    last: DateISO | null;
  };
  recent: SharedWorkout[];
  /** When the phone last sent it (ms). */
  updatedAt: number;
}

const round = (kg: number, step: number): number => Math.max(step, Math.round(kg / step) * step);
const mondayOf = (d: DateISO): DateISO => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
/** 0 = Monday ... 6 = Sunday. */
const weekday = (d: DateISO): number => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Which days a story trains, `ago` days before today. */
function trainsOn(story: TrainingStory, ago: number, day: number, lean: number): boolean {
  switch (story) {
    case 'stronger':
      return [0, 2, 4, 5].includes(day);
    case 'steady':
      return [1, 3, 5].includes((day + lean) % 7);
    case 'new':
      return ago <= 17 && [0, 2, 4].includes(day);
    case 'dropping':
      if (ago < 9) return false;
      if (ago >= 42) return [0, 2, 4].includes(day);
      if (ago >= 21) return [1, 4].includes(day);
      return day === 2;
  }
}

/** The kg a story lifts on a day: `strength` scales the starting weights to the member. */
function weightFor(story: TrainingStory, lift: Lift, ago: number, strength: number): number {
  const start = lift.kg * strength;
  if (lift.kg === 0) return 0;
  if (story === 'stronger') return round(start * (1 + 0.16 * ((84 - ago) / 84)), lift.step);
  if (story === 'dropping') return round(ago >= 42 ? start : start * 0.88, lift.step);
  return round(start, lift.step);
}

function repsFor(story: TrainingStory, lift: Lift, ago: number): number {
  const late = story === 'dropping' && ago < 42;
  // A body-weight move gets more reps as the member gets stronger, fewer as they drop.
  if (lift.kg === 0) return story === 'stronger' ? lift.reps + Math.floor((84 - ago) / 21) : late ? lift.reps - 2 : lift.reps;
  return late ? lift.reps - 1 : lift.reps;
}

/**
 * One member's 12 weeks. `strength` (0.5 to 1.3) sets how heavy they lift; `lean` shifts a steady member's days so two
 * steady members do not train on the same days.
 */
export function sharedTraining(story: TrainingStory, today: DateISO, strength: number, lean = 0): SharedTraining {
  const recent: SharedWorkout[] = [];
  let n = 0;
  for (let ago = 83; ago >= 0; ago -= 1) {
    const d = addDays(today, -ago);
    if (!trainsOn(story, ago, weekday(d), lean)) continue;
    const kind = ORDER[n % ORDER.length]!;
    const plan = DAYS[kind];
    const x: SharedSet[] = plan.lifts.map((lift) => ({ n: lift.n, w: weightFor(story, lift, ago, strength), r: repsFor(story, lift, ago), s: lift.sets }));
    recent.push({ d, n: plan.name, x });
    n += 1;
  }
  recent.sort((a, b) => (a.d < b.d ? 1 : -1));

  // The weekly summary: the 12 weeks up to this one, newest first.
  const thisMonday = mondayOf(today);
  const weeks: SharedTraining['summary']['weeks'] = [];
  for (let i = 0; i < 12; i += 1) {
    const w = addDays(thisMonday, -7 * i);
    const inWeek = recent.filter((r) => r.d >= w && r.d < addDays(w, 7));
    if (inWeek.length === 0) continue;
    const kg = inWeek.reduce((sum, r) => sum + r.x.reduce((s, e) => s + e.w * e.r * e.s, 0), 0);
    weeks.push({ w, n: inWeek.length, kg: Math.round(kg) });
  }

  // Best set of the 5 most-done exercises, and the new heaviest weights of the last 30 days.
  const by = new Map<string, { t: number; best: SharedSet; firstAtBest: DateISO; heavierBefore: number; heaviestRecent: SharedSet | null; recentDay: DateISO | null }>();
  for (const w of [...recent].reverse()) {
    for (const e of w.x) {
      const a = by.get(e.n) ?? { t: 0, best: e, firstAtBest: w.d, heavierBefore: 0, heaviestRecent: null, recentDay: null };
      a.t += 1;
      if (e.w > a.best.w || (e.w === a.best.w && e.r > a.best.r)) {
        a.best = e;
        a.firstAtBest = w.d;
      }
      if (diffDays(w.d, today) > 30) a.heavierBefore = Math.max(a.heavierBefore, e.w);
      else if (e.w > 0 && e.w > a.heavierBefore && (!a.heaviestRecent || e.w > a.heaviestRecent.w)) {
        a.heaviestRecent = e;
        a.recentDay = w.d;
      }
      by.set(e.n, a);
    }
  }
  const ranked = [...by.entries()].sort((p, q) => q[1].t - p[1].t || p[0].localeCompare(q[0]));
  const best = ranked.slice(0, 5).map(([name, a]) => ({ n: name, w: a.best.w, r: a.best.r, t: a.t }));
  const records = ranked
    .filter(([, a]) => a.heaviestRecent && a.recentDay && a.heavierBefore > 0)
    .map(([name, a]) => ({ n: name, w: a.heaviestRecent!.w, r: a.heaviestRecent!.r, d: a.recentDay! }))
    .sort((p, q) => (p.d < q.d ? 1 : -1))
    .slice(0, 5);
  const last = recent[0]?.d ?? null;
  const [y, m, dd] = (last ?? today).split('-').map(Number);
  return { summary: { weeks, best, records, last }, recent, updatedAt: new Date(y!, m! - 1, dd!, 20, 30).getTime() };
}

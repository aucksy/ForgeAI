/**
 * Audit Phase 8 — a SYNTHETIC multi-year training history, written as a Hevy CSV so it goes
 * through the app's real import path (parseHevyBase64 → previewImport → runImport).
 *
 * No real member data: every number comes from a seeded random generator, so the same options
 * always give the same file. The shape follows a believable lifter:
 *  - 4–6 workouts a week (about 5 on average), a few holiday weeks a year with none;
 *  - Push / Pull / Legs for most years, an Upper / Lower block in the middle;
 *  - 5–8 exercises a workout, 3–5 working sets, warm-ups on the big lifts;
 *  - supersets (accessories in pairs), drop sets and to-failure sets now and then, RPE on some;
 *  - cardio: a treadmill / bike / rower finisher in about a third of workouts (distance and/or
 *    time), planks and hangs as timed sets;
 *  - slow strength gains with deload dips; exercise notes and workout descriptions sometimes.
 *
 * Body weight, measurements and progress photos are NOT part of a Hevy workout export, so they
 * come out as plain lists; the perf test writes them through the app's own repos.
 *
 * Columns and formats match `src/tracker/services/historyExport.ts` (`hevyColumns`,
 * `hevyStamp`): "7 Jul 2026, 14:24" clock times, every cell quoted.
 */

export interface SyntheticOptions {
  /** The last workout is on this day (YYYY-MM-DD); default yesterday. */
  endISO?: string;
  /** Stop once this many workouts are written (default 1,300 ≈ 5 years). */
  workouts?: number;
  /** Stop once at least this many set rows are written (overrides `workouts` when larger). */
  minRows?: number;
  seed?: number;
}

export interface SyntheticHistory {
  csv: string;
  rows: number;
  workouts: number;
  firstISO: string;
  lastISO: string;
  /** Distinct exercise titles, most-logged first. */
  exerciseCounts: [string, number][];
  bodyWeight: { dateISO: string; weightKg: number }[];
  measurements: { dateISO: string; values: Record<string, number> }[];
  photos: { dateISO: string }[];
  /** The routines used (name → exercise titles), to build matching routines in the app. */
  routines: Record<string, string[]>;
}

// ------------------------------------------------------------------ deterministic random

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ the training plan

type Kind = 'lift' | 'bw' | 'time' | 'cardio';
interface Ex {
  title: string;
  kind: Kind;
  /** Starting working weight (kg) and the yearly gain (kg). */
  start: number;
  gain: number;
  reps: [number, number];
  sets: [number, number];
  warmups?: number;
  /** Pair with the next exercise in a superset. */
  ssNext?: boolean;
  step?: number;
}

const L = (title: string, start: number, gain: number, reps: [number, number], sets: [number, number], extra: Partial<Ex> = {}): Ex => ({
  title,
  kind: 'lift',
  start,
  gain,
  reps,
  sets,
  ...extra,
});

const ROUTINES: Record<string, Ex[]> = {
  'Push 1': [
    L('Bench Press (Barbell)', 60, 8, [4, 8], [3, 5], { warmups: 2 }),
    L('Overhead Press (Barbell)', 35, 4, [5, 8], [3, 4], { warmups: 1 }),
    L('Incline Bench Press (Dumbbell)', 20, 3, [8, 12], [3, 4]),
    L('Lateral Raise (Dumbbell)', 8, 1, [10, 15], [3, 4], { ssNext: true, step: 1 }),
    L('Triceps Pushdown (Cable)', 20, 3, [10, 15], [3, 4]),
    L('Chest Fly (Machine)', 35, 5, [10, 15], [3, 3]),
    L('Skullcrusher (Dumbbell)', 10, 1.5, [8, 12], [3, 3]),
  ],
  'Pull 1': [
    L('Deadlift (Barbell)', 90, 12, [3, 6], [3, 4], { warmups: 3 }),
    { title: 'Pull Up', kind: 'bw', start: 0, gain: 0, reps: [5, 12], sets: [3, 4] },
    L('Bent Over Row (Barbell)', 50, 6, [6, 10], [3, 4], { warmups: 1 }),
    L('Lat Pulldown (Cable)', 45, 5, [8, 12], [3, 4]),
    L('Face Pull (Cable)', 20, 2, [12, 15], [3, 3], { ssNext: true }),
    L('Bicep Curl (Dumbbell)', 10, 1.5, [8, 12], [3, 4]),
    L('Hammer Curl (Dumbbell)', 12, 1.5, [8, 12], [2, 3]),
  ],
  'Legs 1': [
    L('Squat (Barbell)', 70, 10, [4, 8], [3, 5], { warmups: 3 }),
    L('Romanian Deadlift (Barbell)', 60, 8, [6, 10], [3, 4], { warmups: 1 }),
    L('Leg Press (Machine)', 120, 20, [8, 12], [3, 4]),
    L('Leg Extension (Machine)', 40, 5, [10, 15], [3, 3], { ssNext: true }),
    L('Seated Leg Curl (Machine)', 35, 5, [10, 15], [3, 3]),
    L('Standing Calf Raise (Machine)', 60, 8, [10, 15], [3, 4]),
    { title: 'Plank', kind: 'time', start: 45, gain: 10, reps: [0, 0], sets: [2, 3] },
  ],
  'Push 2': [
    L('Overhead Press (Barbell)', 37.5, 4, [4, 6], [4, 5], { warmups: 2 }),
    L('Incline Bench Press (Barbell)', 50, 6, [6, 10], [3, 4], { warmups: 1 }),
    L('Chest Dip', 0, 0, [8, 15], [3, 3], { kind: 'bw' }),
    L('Lateral Raise (Cable)', 5, 0.8, [12, 15], [3, 4], { ssNext: true, step: 1 }),
    L('Triceps Kickback (Cable)', 8, 1, [12, 15], [3, 3]),
    L('Pec Deck (Machine)', 40, 5, [10, 15], [3, 3]),
  ],
  'Pull 2': [
    L('Seated Cable Row - V Grip (Cable)', 50, 6, [8, 12], [3, 4], { warmups: 1 }),
    L('Chest Supported Incline Row (Dumbbell)', 20, 3, [8, 12], [3, 4]),
    L('Lat Pulldown (Cable)', 45, 5, [10, 12], [3, 3]),
    L('Rear Delt Reverse Fly (Machine)', 25, 3, [12, 15], [3, 3], { ssNext: true }),
    L('Preacher Curl (Dumbbell)', 10, 1.5, [8, 12], [3, 3]),
    L('Seated Incline Curl (Dumbbell)', 8, 1, [10, 12], [2, 3]),
    { title: 'Dead Hang', kind: 'time', start: 30, gain: 8, reps: [0, 0], sets: [2, 2] },
  ],
  'Legs 2': [
    L('Front Squat (Barbell)', 50, 7, [5, 8], [3, 4], { warmups: 2 }),
    L('Hip Thrust (Machine)', 80, 12, [8, 12], [3, 4]),
    L('Bulgarian Split Squat (Dumbbell)', 12, 2, [8, 12], [3, 3]),
    L('Lying Leg Curl (Machine)', 30, 4, [10, 12], [3, 3], { ssNext: true }),
    L('Seated Calf Raise', 40, 6, [12, 15], [3, 4]),
    L('Hanging Leg Raise', 0, 0, [10, 15], [3, 3], { kind: 'bw' }),
  ],
  'Upper 1': [
    L('Bench Press (Barbell)', 60, 8, [5, 8], [4, 5], { warmups: 2 }),
    L('Bent Over Row (Barbell)', 50, 6, [6, 10], [4, 4], { warmups: 1 }),
    L('Overhead Press (Dumbbell)', 16, 2, [8, 10], [3, 3]),
    { title: 'Pull Up', kind: 'bw', start: 0, gain: 0, reps: [5, 12], sets: [3, 3] },
    L('Lateral Raise (Dumbbell)', 8, 1, [12, 15], [3, 3], { ssNext: true, step: 1 }),
    L('Bicep Curl (Barbell)', 25, 3, [8, 12], [3, 3]),
    L('Triceps Rope Pushdown', 20, 3, [10, 15], [3, 3]),
  ],
  'Lower 1': [
    L('Squat (Barbell)', 70, 10, [5, 8], [4, 5], { warmups: 3 }),
    L('Romanian Deadlift (Barbell)', 60, 8, [8, 10], [3, 4], { warmups: 1 }),
    L('Walking Lunge (Dumbbell)', 14, 2, [10, 12], [3, 3]),
    L('Leg Extension (Machine)', 40, 5, [12, 15], [3, 3], { ssNext: true }),
    L('Seated Leg Curl (Machine)', 35, 5, [12, 15], [3, 3]),
    L('Standing Calf Raise (Machine)', 60, 8, [12, 15], [4, 4]),
  ],
  'Upper 2': [
    L('Incline Bench Press (Dumbbell)', 22, 3, [8, 10], [4, 4], { warmups: 1 }),
    L('Seated Cable Row - V Grip (Cable)', 50, 6, [8, 12], [4, 4]),
    L('Overhead Press (Barbell)', 35, 4, [6, 8], [3, 4], { warmups: 1 }),
    L('Lat Pulldown (Cable)', 45, 5, [10, 12], [3, 3]),
    L('Face Pull (Cable)', 20, 2, [12, 15], [3, 3], { ssNext: true }),
    L('Hammer Curl (Dumbbell)', 12, 1.5, [10, 12], [3, 3]),
    L('Skullcrusher (Dumbbell)', 10, 1.5, [10, 12], [3, 3]),
    L('Chest Fly (Machine)', 35, 5, [12, 15], [2, 3]),
  ],
  'Lower 2': [
    L('Deadlift (Barbell)', 90, 12, [3, 5], [3, 4], { warmups: 3 }),
    L('Leg Press (Machine)', 120, 20, [10, 12], [3, 4]),
    L('Hip Thrust (Machine)', 80, 12, [10, 12], [3, 3]),
    L('Lying Leg Curl (Machine)', 30, 4, [10, 12], [3, 3]),
    L('Seated Calf Raise', 40, 6, [12, 15], [3, 4]),
    { title: 'Plank', kind: 'time', start: 45, gain: 10, reps: [0, 0], sets: [3, 3] },
  ],
};

const PPL = ['Push 1', 'Pull 1', 'Legs 1', 'Push 2', 'Pull 2', 'Legs 2'];
const UL = ['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2'];

const CARDIO: { title: string; distance: boolean; minutes: [number, number]; kmPerMin: number }[] = [
  { title: 'Treadmill', distance: true, minutes: [10, 25], kmPerMin: 0.15 },
  { title: 'Cycling', distance: true, minutes: [15, 30], kmPerMin: 0.4 },
  { title: 'Rowing (Machine)', distance: true, minutes: [8, 15], kmPerMin: 0.22 },
  { title: 'Stair Machine', distance: false, minutes: [10, 20], kmPerMin: 0 },
];

const NOTES = ['Seat at 4', 'Pause at the bottom', 'Left shoulder felt tight', 'Belt on top sets', 'Slow negatives', 'Grip 2 fingers wider'];
const DESCRIPTIONS = ['Felt strong today', 'Short on sleep', 'Gym was packed, swapped order', 'New shoes', 'Deload-ish', ''];

// ------------------------------------------------------------------ formatting

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');
/** Hevy's "7 Jul 2026, 14:24" (local clock), as historyExport.hevyStamp. */
function stamp(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function cell(v: string | number | null | undefined): string {
  if (v == null || v === '') return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export const HEVY_COLUMNS = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
  'rpe',
];

// ------------------------------------------------------------------ the generator

export function generateHistory(opts: SyntheticOptions = {}): SyntheticHistory {
  const rand = mulberry32(opts.seed ?? 20261011);
  const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const chance = (p: number): boolean => rand() < p;
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const round = (kg: number, step = 2.5): number => Math.max(step, Math.round(kg / step) * step);

  const end = opts.endISO ? new Date(`${opts.endISO}T12:00:00`) : new Date(Date.now() - 86_400_000);
  const wantWorkouts = opts.workouts ?? 1300;
  const wantRows = opts.minRows ?? 0;

  // Walk BACK from the end, week by week, choosing training days; then write oldest first.
  const days: Date[] = [];
  let weekStart = new Date(end.getFullYear(), end.getMonth(), end.getDate() - ((end.getDay() + 6) % 7));
  // Rows grow ~30 per workout; generate days generously, trim after rows are known.
  const dayBudget = Math.max(wantWorkouts, Math.ceil(wantRows / 25) + 50);
  while (days.length < dayBudget) {
    const holiday = chance(3 / 52);
    if (!holiday) {
      const r = rand();
      const n = r < 0.15 ? 4 : r < 0.85 ? 5 : 6;
      const pool = [0, 1, 2, 3, 4, 5, 6];
      // Sunday rest more often.
      const chosen = new Set<number>();
      while (chosen.size < n) {
        const d = pick(pool);
        if (d === 6 && chance(0.6)) continue;
        chosen.add(d);
      }
      for (const d of [...chosen].sort((a, b) => b - a)) {
        const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + d);
        if (day <= end) days.push(day);
      }
    }
    weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7);
  }
  days.sort((a, b) => a.getTime() - b.getTime());
  const firstDay = days[0];
  const totalYears = Math.max(1, (end.getTime() - firstDay.getTime()) / (365.25 * 86_400_000));

  const lines: string[] = [HEVY_COLUMNS.map(cell).join(',')];
  const counts = new Map<string, number>();
  let rows = 0;
  let workouts = 0;
  let rot = 0;
  let lastSplit = '';
  let ssCounter = 0;
  const used: Record<string, string[]> = {};

  const out: { lines: string[]; rows: number }[] = [];
  for (const day of days) {
    const yearsIn = (day.getTime() - firstDay.getTime()) / (365.25 * 86_400_000);
    const frac = yearsIn / totalYears;
    // Upper / lower in the middle fifth of the history; PPL otherwise.
    const split = frac > 0.4 && frac < 0.6 ? UL : PPL;
    if (split.join() !== lastSplit) {
      rot = 0;
      lastSplit = split.join();
    }
    const name = split[rot % split.length];
    rot += 1;
    const plan = ROUTINES[name];
    used[name] = plan.map((e) => e.title);

    // Strength: steady gains, a deload every ~8 weeks, a dip after holidays.
    const week = Math.floor(yearsIn * 52);
    const deload = week % 8 === 7;

    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), between(6, 20), between(0, 59));
    let clock = start.getTime();
    const wLines: string[] = [];
    const descr = chance(0.15) ? pick(DESCRIPTIONS) : '';
    // Hevy names a routine workout after it ("Push 1"); now and then a free name.
    const title = chance(0.08) ? pick(['Morning workout', 'Evening workout', 'Quick session']) : name;

    // 5–8 exercises: drop one or two accessories sometimes.
    let list = plan.slice();
    while (list.length > 5 && chance(0.25)) list.splice(between(2, list.length - 1), 1);
    const cardio = chance(0.33) ? pick(CARDIO) : null;

    const startText = stamp(start);
    let ssOpen: number | null = null;
    for (let ei = 0; ei < list.length; ei++) {
      const ex = list[ei];
      // Superset id: Hevy writes the same number on both exercises of the pair.
      let ss: number | null = null;
      if (ssOpen != null) {
        ss = ssOpen;
        ssOpen = null;
      } else if (ex.ssNext && ei + 1 < list.length) {
        ssCounter += 1;
        ss = ssCounter;
        ssOpen = ss;
      }
      const note = chance(0.05) ? pick(NOTES) : '';
      const nSets = between(ex.sets[0], ex.sets[1]);
      const base = ex.start + ex.gain * yearsIn * (0.85 + 0.3 * rand());
      const work = deload ? base * 0.85 : base;
      let idx = 0;
      const push = (setType: string, weight: number | '', reps: number | '', dist: number | '', dur: number | '', rpe: number | '') => {
        wLines.push(
          [title, startText, '', descr, ex.title, ss ?? '', note, idx, setType, weight, reps, dist, dur, rpe]
            .map((v, i) => (i === 2 ? '\u0000END\u0000' : cell(v)))
            .join(','),
        );
        idx += 1;
        counts.set(ex.title, (counts.get(ex.title) ?? 0) + 1);
        clock += between(90, 180) * 1000;
      };
      if (ex.kind === 'lift') {
        for (let w = 0; w < (ex.warmups ?? 0); w++) {
          push('warmup', round(work * (0.4 + 0.2 * w), ex.step ?? 2.5), between(5, 10), '', '', '');
        }
        for (let s = 0; s < nSets; s++) {
          const reps = between(ex.reps[0], ex.reps[1]);
          const wt = round(work * (1 + (ex.reps[1] - reps) * 0.02) , ex.step ?? 2.5);
          const failure = s === nSets - 1 && chance(0.08);
          push(failure ? 'failure' : 'normal', wt, reps, '', '', chance(0.2) ? pick([7, 7.5, 8, 8.5, 9, 9.5, 10]) : '');
          if (s === nSets - 1 && chance(0.06)) push('dropset', round(wt * 0.7, ex.step ?? 2.5), between(8, 15), '', '', '');
        }
      } else if (ex.kind === 'bw') {
        for (let s = 0; s < nSets; s++) {
          const added = yearsIn > 2 && chance(0.3) ? round(5 + 2.5 * yearsIn) : '';
          push('normal', added, between(ex.reps[0], ex.reps[1] + Math.floor(yearsIn)), '', '', '');
        }
      } else {
        for (let s = 0; s < nSets; s++) push('normal', '', '', '', Math.round(ex.start + ex.gain * yearsIn + between(-5, 10)), '');
      }
    }
    if (cardio) {
      const min = between(cardio.minutes[0], cardio.minutes[1]);
      const km = cardio.distance ? Math.round(min * cardio.kmPerMin * (0.9 + 0.2 * rand()) * 100) / 100 : '';
      wLines.push(
        [title, startText, '', descr, cardio.title, '', '', 0, 'normal', '', '', km, min * 60, '']
          .map((v, i) => (i === 2 ? '\u0000END\u0000' : cell(v)))
          .join(','),
      );
      counts.set(cardio.title, (counts.get(cardio.title) ?? 0) + 1);
      clock += min * 60_000;
    }
    const endText = cell(stamp(new Date(Math.max(clock, start.getTime() + 25 * 60_000))));
    out.push({ lines: wLines.map((l) => l.replace('\u0000END\u0000', endText)), rows: wLines.length });
  }

  // Keep the NEWEST workouts: enough for both targets.
  let keepFrom = out.length;
  let r = 0;
  let w = 0;
  while (keepFrom > 0 && (w < wantWorkouts || r < wantRows)) {
    keepFrom -= 1;
    r += out[keepFrom].rows;
    w += 1;
  }
  for (let i = keepFrom; i < out.length; i++) {
    lines.push(...out[i].lines);
    rows += out[i].rows;
    workouts += 1;
  }
  const kept = days.slice(keepFrom);
  const firstISO = iso(kept[0]);
  const lastISO = iso(kept[kept.length - 1]);

  // Body weight about every third day; measurements monthly; a progress photo about weekly.
  const bodyWeight: SyntheticHistory['bodyWeight'] = [];
  const measurements: SyntheticHistory['measurements'] = [];
  const photos: SyntheticHistory['photos'] = [];
  let kg = 82;
  for (let t = kept[0].getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    kg += (rand() - 0.52) * 0.3;
    if (chance(1 / 3)) bodyWeight.push({ dateISO: iso(d), weightKg: Math.round(kg * 10) / 10 });
    if (d.getDate() === 1) {
      measurements.push({
        dateISO: iso(d),
        values: {
          waist: Math.round((84 + (kg - 82) * 0.8 + rand()) * 10) / 10,
          chest: Math.round((102 + rand() * 2) * 10) / 10,
          arm: Math.round((36 + rand()) * 10) / 10,
        },
      });
    }
    // ~500 photos over five years (PG-19's case).
    if (chance(0.27)) photos.push({ dateISO: iso(d) });
  }

  return {
    csv: `${lines.join('\n')}\n`,
    rows,
    workouts,
    firstISO,
    lastISO,
    exerciseCounts: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    bodyWeight,
    measurements,
    photos,
    routines: used,
  };
}

/**
 * Monthly report and year in review — Phase 3. PURE.
 *
 * Hevy users name "the monthly report" among the things they love; Hevy also does a
 * December year in review. Here both are built from the member's own log, with a short
 * note in the coach's voice written by fixed rules (no AI call, works offline): how often
 * they trained against the month before, the records they set, and the one big muscle that
 * got the least work.
 */
import { addDays, weekStartISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { kgToShown, weightUnitOf } from '@/lib/units';
import type { UnitSystem } from '@/types/models';
import { countWord } from '@/lib/words';

import { MUSCLE_LABEL, type Muscle } from '../catalog/muscles';
import { liftsBeatingBest, liftsUpText, weightChange } from './headline';
import { monthName, shiftMonth } from '../lib/months';
import type { RecordKind } from './records';
import { fmtTotalDistance } from './logTypes';
import { setsText, type BodyweightPoint, type MuscleSetsSlice } from './volume';

/** One workout, as the reports need it. */
export interface ReportSession {
  sessionId: string;
  dateISO: string;
  /** 0 when the workout has no end time (logged by chat). */
  durationSec: number;
  /** By the one volume rule. */
  volumeKg: number;
  /** Working sets. */
  sets: number;
  exercises: { exerciseId: string; name: string; sets: number }[];
}

/** The parts of a record a report needs. */
export interface ReportRecord {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  dateISO: string;
}

/**
 * What a share picture may say was moved over a period (v0.25.1 review): the weight on the
 * bar, dumbbells, machine or belt — never body weight, as on the workout picture — then the
 * reps and the distance, for a month of only pull-ups or only runs.
 */
export interface PictureTotals {
  kg: number;
  reps: number;
  distanceM: number;
}

export interface PeriodTotals {
  workouts: number;
  /** Days with at least one workout. */
  days: number;
  durationSec: number;
  /** Workouts with a length (one logged by chat has none, so time only covers these). */
  timed: number;
  volumeKg: number;
  sets: number;
}

export function totalsOf(sessions: readonly ReportSession[]): PeriodTotals {
  return {
    workouts: sessions.length,
    days: new Set(sessions.map((s) => s.dateISO)).size,
    durationSec: sessions.reduce((n, s) => n + Math.max(0, s.durationSec), 0),
    timed: sessions.filter((s) => s.durationSec > 0).length,
    volumeKg: sessions.reduce((n, s) => n + Math.max(0, s.volumeKg), 0),
    sets: sessions.reduce((n, s) => n + s.sets, 0),
  };
}

/**
 * The time line of a report: "11 h 20 min", or — when some workouts have no length —
 * "11 h 20 min in 40 timed workouts", so a partial total never reads as the whole.
 */
export function timeText(t: Pick<PeriodTotals, 'durationSec' | 'timed' | 'workouts'>): string {
  const base = durationText(t.durationSec);
  if (t.timed === 0 || t.timed >= t.workouts) return base;
  return `${base} in ${t.timed} timed ${t.timed === 1 ? 'workout' : 'workouts'}`;
}

export interface TopExercise {
  exerciseId: string;
  name: string;
  sets: number;
  workouts: number;
}

/** Most-trained exercises by working sets (then workouts, then name). */
export function topExercises(sessions: readonly ReportSession[], n = 3): TopExercise[] {
  const by = new Map<string, TopExercise>();
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (e.sets <= 0) continue;
      const cur = by.get(e.exerciseId) ?? { exerciseId: e.exerciseId, name: e.name, sets: 0, workouts: 0 };
      cur.sets += e.sets;
      cur.workouts += 1;
      by.set(e.exerciseId, cur);
    }
  }
  return [...by.values()]
    .sort((a, b) => b.sets - a.sets || b.workouts - a.workouts || a.name.localeCompare(b.name))
    .slice(0, n);
}

export interface BodyweightChange {
  start: number;
  end: number;
  change: number;
  startISO: string;
  endISO: string;
}

/** First and last weigh-in inside the period; null with fewer than two. The one body-weight
 *  change rule (`engine/headline` `weightChange`), with the two weights it compares. */
export function bodyweightChange(points: readonly BodyweightPoint[], from: string, to: string): BodyweightChange | null {
  const c = weightChange(points, from, to);
  if (!c) return null;
  // The two weigh-ins the change itself compared (a day with two weigh-ins: the same one).
  return { start: c.fromKg, end: c.toKg, change: c.changeKg, startISO: c.fromISO, endISO: c.toISO };
}

/** Longest run of back-to-back weeks (Monday to Sunday) with at least one workout. */
export function longestWeekStreak(dates: readonly string[]): number {
  const weeks = [...new Set(dates.map(weekStartISO))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    run = prev != null && addDays(prev, 7) === w ? run + 1 : 1;
    if (run > best) best = run;
    prev = w;
  }
  return best;
}

export interface StrengthPoint {
  exerciseId: string;
  name: string;
  dateISO: string;
  /** Best estimated 1-rep max of that workout. */
  e1rm: number;
}

export interface StrengthGain {
  exerciseId: string;
  name: string;
  fromKg: number;
  toKg: number;
  pct: number;
}

/** The middle value (the mean of the middle two for an even count). */
function median(values: readonly number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * The lift that grew the most: the MEDIAN estimated 1-rep max of its first third of workouts
 * in the period (two or three of them) against its last third — the two never overlap.
 * PG-02: a median, not the best, so one mistyped set ("350 kg" for 35) can never be "the
 * biggest gain"; it needs at least six workouts (two each side) over four weeks or more.
 */
export function biggestGain(points: readonly StrengthPoint[]): StrengthGain | null {
  const by = new Map<string, StrengthPoint[]>();
  for (const p of points) {
    if (!(p.e1rm > 0)) continue;
    const list = by.get(p.exerciseId) ?? [];
    list.push(p);
    by.set(p.exerciseId, list);
  }
  let best: StrengthGain | null = null;
  for (const [exerciseId, list] of by) {
    const sorted = [...list].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
    const k = Math.min(3, Math.floor(sorted.length / 3));
    if (k < 2) continue;
    if (addDays(sorted[0].dateISO, 28) > sorted[sorted.length - 1].dateISO) continue;
    const fromKg = median(sorted.slice(0, k).map((p) => p.e1rm));
    const toKg = median(sorted.slice(-k).map((p) => p.e1rm));
    const pct = Math.round(((toKg - fromKg) / fromKg) * 100);
    if (pct <= 0) continue;
    if (!best || pct > best.pct) best = { exerciseId, name: sorted[0].name, fromKg: Math.round(fromKg), toKg: Math.round(toKg), pct };
  }
  return best;
}

/**
 * A change against the period before, for a tile: "+3", "−2", "+12%", "Same". null when the
 * period before had nothing to compare with.
 */
export function changeText(cur: number, prev: number | null | undefined, mode: 'count' | 'pct'): { value: string; good: boolean } | null {
  if (prev == null || !(prev > 0)) return null;
  if (mode === 'pct') {
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return { value: 'Same', good: true };
    return { value: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, good: pct > 0 };
  }
  const diff = Math.round(cur - prev);
  if (diff === 0) return { value: 'Same', good: true };
  return { value: `${diff > 0 ? '+' : '−'}${fmtInt(Math.abs(diff))}`, good: diff > 0 };
}

/** "11 h 20 min", "45 min", "—". */
export function durationText(sec: number): string {
  if (!(sec > 0)) return '—';
  const total = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * What a report with no workouts says. A month or year that is over can't gain any, so it
 * says so instead of "workouts you log will show here".
 */
export function emptyReportText(kind: 'month' | 'year', complete: boolean, name: string): { title: string; body: string } {
  if (complete) return { title: `No workouts in ${name}`, body: `Nothing was logged that ${kind}.` };
  return { title: `No workouts yet this ${kind}`, body: `Workouts you log this ${kind} will show here.` };
}

/** The year row on Progress: "73 workouts this year", or "150 workouts in 2026" once it is over. */
export function yearRowSub(workouts: number, running: boolean, year: number): string {
  return `${workouts} ${workouts === 1 ? 'workout' : 'workouts'} ${running ? 'this year' : `in ${year}`}`;
}

// ---------------------------------------------------------------- the month

export interface MonthReport {
  month: string;
  /** The month is over (else it reads "so far"). */
  complete: boolean;
  totals: PeriodTotals;
  /** The month before, for the comparison; null when nothing was logged then. */
  previous: PeriodTotals | null;
  trainedDays: string[];
  records: ReportRecord[];
  muscles: MuscleSetsSlice[];
  topExercises: TopExercise[];
  bodyweight: BodyweightChange | null;
  note: string;
  /** For the share picture (absent when the caller did not count it). */
  picture?: PictureTotals;
}

/** The big muscles the coach checks for balance, and one move to suggest for each. */
const BALANCE: readonly { muscle: Muscle; move: string }[] = [
  { muscle: 'chest', move: 'push-ups or a bench press' },
  { muscle: 'lats', move: 'pull-ups or lat pulldowns' },
  { muscle: 'upper_back', move: 'rows' },
  { muscle: 'front_delts', move: 'an overhead press' },
  { muscle: 'side_delts', move: 'lateral raises' },
  { muscle: 'rear_delts', move: 'face pulls' },
  { muscle: 'quads', move: 'squats or leg presses' },
  { muscle: 'hamstrings', move: 'Romanian deadlifts or leg curls' },
  { muscle: 'glutes', move: 'hip thrusts' },
  { muscle: 'calves', move: 'calf raises' },
  { muscle: 'abs', move: 'planks or crunches' },
];

/** The least-trained big muscle when it clearly lags (under 4 sets in a month of real training). */
export function lagging(muscles: readonly MuscleSetsSlice[], totalSets: number): { muscle: Muscle; sets: number; move: string } | null {
  if (totalSets < 40) return null;
  let worst: { muscle: Muscle; sets: number; move: string } | null = null;
  for (const b of BALANCE) {
    const sets = muscles.find((m) => m.muscle === b.muscle)?.sets ?? 0;
    if (sets < 4 && (!worst || sets < worst.sets)) worst = { muscle: b.muscle, sets, move: b.move };
  }
  return worst;
}

function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

/** Two or three short sentences in the coach's voice. */
export function monthNote(r: Omit<MonthReport, 'note'>): string {
  const name = monthName(r.month);
  const prevName = monthName(shiftMonth(r.month, -1));
  const n = r.totals.workouts;
  const parts: string[] = [];
  if (n === 0) {
    parts.push(r.complete ? `No workouts logged in ${name}.` : `No workouts yet in ${name}.`);
    return parts.join(' ');
  }
  let first = `You trained ${times(n)} in ${name}${r.complete ? '' : ' so far'}`;
  if (r.previous && r.previous.workouts > 0 && r.complete) {
    const diff = n - r.previous.workouts;
    first += diff > 0 ? ` — ${diff} more than ${prevName}` : diff < 0 ? ` — ${-diff} fewer than ${prevName}` : ` — the same as ${prevName}`;
  }
  parts.push(`${first}.`);

  if (r.records.length > 0) {
    // D10: count the LIFTS that beat a best; the lead is the lift with the most records.
    const counts = new Map<string, { name: string; n: number }>();
    for (const rec of r.records) {
      const c = counts.get(rec.exerciseId) ?? { name: rec.exerciseName, n: 0 };
      c.n += 1;
      counts.set(rec.exerciseId, c);
    }
    const lead = [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))[0];
    const lifts = liftsBeatingBest(r.records);
    parts.push(lifts === 1 ? `${lead.name} beat its best.` : `${liftsUpText(lifts)}, led by ${lead.name}.`);
  } else {
    parts.push('No new records this time — steady work still counts.');
  }

  // Only once the month is over: on the 8th, "calves got no work" is not news yet.
  const lag = r.complete ? lagging(r.muscles, r.totals.sets) : null;
  if (lag) {
    const label = MUSCLE_LABEL[lag.muscle];
    parts.push(
      lag.sets === 0
        ? `${label} got no work — try ${lag.move} next month.`
        : `${label} got only ${fmtSetsWord(lag.sets)} — try ${lag.move} next month.`,
    );
  }
  return parts.join(' ');
}

function fmtSetsWord(sets: number): string {
  const v = Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
  return `${v} ${sets === 1 ? 'set' : 'sets'}`;
}

export function buildMonthReport(input: {
  month: string;
  complete: boolean;
  sessions: readonly ReportSession[];
  previous: readonly ReportSession[];
  records: readonly ReportRecord[];
  muscles: readonly MuscleSetsSlice[];
  bodyweight: readonly BodyweightPoint[];
  from: string;
  to: string;
  picture?: PictureTotals;
}): MonthReport {
  const base: Omit<MonthReport, 'note'> = {
    ...(input.picture ? { picture: input.picture } : {}),
    month: input.month,
    complete: input.complete,
    totals: totalsOf(input.sessions),
    previous: input.previous.length > 0 ? totalsOf(input.previous) : null,
    trainedDays: [...new Set(input.sessions.map((s) => s.dateISO))].sort(),
    records: [...input.records],
    muscles: [...input.muscles],
    topExercises: topExercises(input.sessions),
    bodyweight: bodyweightChange(input.bodyweight, input.from, input.to),
  };
  return { ...base, note: monthNote(base) };
}

// ---------------------------------------------------------------- the year

export interface YearReview {
  year: number;
  complete: boolean;
  totals: PeriodTotals;
  /** Workouts in each month so far, January first. */
  byMonth: { month: string; workouts: number }[];
  busiest: { month: string; workouts: number } | null;
  topExercises: TopExercise[];
  /** D10: the LIFTS that beat a best this year (not every kind of record). */
  recordCount: number;
  gain: StrengthGain | null;
  longestStreakWeeks: number;
  muscles: MuscleSetsSlice[];
  bodyweight: BodyweightChange | null;
  note: string;
  /** For the share picture (absent when the caller did not count it). */
  picture?: PictureTotals;
}

/** "1.2 million", "84,500". */
export function bigNumber(n: number): string {
  if (n >= 1_000_000) return `${(Math.round(n / 100_000) / 10).toString()} million`;
  return fmtInt(n);
}

/**
 * The report hero's second line, built only from what applies (audit PG-21): the time when any
 * workout has a length (never a leading "—"), then what was moved — kg lifted, or for a period
 * with no kilos (only runs, only pull-ups with no body weight) the distance or the reps, never
 * "0 kg" — then the sets. `big`: the year's style ("1.2 million").
 */
export function heroLine(t: PeriodTotals, picture: PictureTotals | undefined, units: UnitSystem, big = false): string {
  const parts: string[] = [];
  if (t.durationSec > 0) parts.push(timeText(t));
  const kg = kgToShown(t.volumeKg, units);
  if (t.volumeKg > 0) parts.push(`${big ? bigNumber(Math.round(kg)) : fmtInt(kg)} ${weightUnitOf(units)}`);
  else if (picture && picture.distanceM > 0) parts.push(fmtTotalDistance(picture.distanceM));
  else if (picture && picture.reps > 0) parts.push(`${fmtInt(picture.reps)} ${picture.reps === 1 ? 'rep' : 'reps'}`);
  if (t.sets > 0) parts.push(setsText(t.sets));
  return parts.join(' · ');
}

/** Hours, rounded: "168 hours", "1 hour". */
export function hoursText(sec: number): string {
  const h = Math.round(sec / 3600);
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

export function yearNote(r: Omit<YearReview, 'note'>): string {
  const t = r.totals;
  if (t.workouts === 0) return r.complete ? `No workouts logged in ${r.year}.` : `No workouts yet in ${r.year}.`;
  const head = r.complete ? `${r.year}` : `${r.year} so far`;
  const facts = [`${fmtInt(t.workouts)} ${t.workouts === 1 ? 'workout' : 'workouts'}`];
  if (t.durationSec >= 3600) facts.push(t.timed >= t.workouts ? hoursText(t.durationSec) : `${hoursText(t.durationSec)} of timed workouts`);
  if (t.volumeKg > 0) facts.push(`${bigNumber(kgToShown(t.volumeKg))} ${weightUnitOf()} lifted`);
  const parts = [`${head}: ${facts.length > 1 ? `${facts.slice(0, -1).join(', ')} and ${facts[facts.length - 1]}` : facts[0]}.`];
  const fav = r.topExercises[0];
  if (r.busiest && r.busiest.workouts > 0 && fav) {
    parts.push(`Your busiest month was ${monthName(r.busiest.month)}, and ${fav.name} was your favourite — ${countWord(fav.sets, 'set', fmtInt)}.`);
  } else if (fav) {
    parts.push(`${fav.name} was your favourite — ${countWord(fav.sets, 'set', fmtInt)}.`);
  }
  if (r.gain) {
    parts.push(`Biggest gain: ${r.gain.name}, up ${r.gain.pct}% (about ${Math.round(kgToShown(r.gain.fromKg))} → ${Math.round(kgToShown(r.gain.toKg))} ${weightUnitOf()} for one rep).`);
  } else if (r.recordCount > 0) {
    parts.push(`${liftsUpText(r.recordCount)}.`);
  }
  return parts.join(' ');
}

export function buildYearReview(input: {
  year: number;
  complete: boolean;
  /** Last month to list (December for a finished year, else this month). */
  lastMonth: string;
  sessions: readonly ReportSession[];
  /** Lifts that beat a best this year (D10). */
  recordCount: number;
  strength: readonly StrengthPoint[];
  muscles: readonly MuscleSetsSlice[];
  bodyweight: readonly BodyweightPoint[];
  picture?: PictureTotals;
}): YearReview {
  const byMonth: { month: string; workouts: number }[] = [];
  for (let m = `${input.year}-01`; m <= input.lastMonth && m.startsWith(String(input.year)); m = shiftMonth(m, 1)) {
    byMonth.push({ month: m, workouts: input.sessions.filter((s) => s.dateISO.startsWith(m)).length });
  }
  const busiest = byMonth.reduce<{ month: string; workouts: number } | null>((b, m) => (m.workouts > (b?.workouts ?? 0) ? m : b), null);
  const base: Omit<YearReview, 'note'> = {
    ...(input.picture ? { picture: input.picture } : {}),
    year: input.year,
    complete: input.complete,
    totals: totalsOf(input.sessions),
    byMonth,
    busiest,
    topExercises: topExercises(input.sessions),
    recordCount: input.recordCount,
    gain: biggestGain(input.strength),
    longestStreakWeeks: longestWeekStreak(input.sessions.map((s) => s.dateISO)),
    muscles: [...input.muscles],
    bodyweight: bodyweightChange(input.bodyweight, `${input.year}-01-01`, `${input.year}-12-31`),
  };
  return { ...base, note: yearNote(base) };
}

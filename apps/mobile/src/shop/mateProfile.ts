/**
 * Gym mate profiles (R-164, supabase/migrations/0040_gym_mate_profiles.sql). The PURE half:
 *  - what this phone shares while "Let my gym mates see my workouts" is on (`mateShareFrom`): the
 *    bio and up to 30 workouts of the last 60 days, each with its name, minutes, kg lifted (bar
 *    weight only, `sharedKg`) and up to 8 exercises with their best set. No sets list,
 *    body weight, photo or note ever leaves the phone;
 *  - the gym's answers read defensively (`mateBoardFrom`, `mateProfileFrom`);
 *  - every word a member reads (MATE_WORDS, held to the member-words rules by a test).
 * mateShare.ts decides when to send, mateSync.ts talks to the server.
 */
import { addDays } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { fmtW, type UnitSystem } from '@/lib/units';

/** The share covers the last 60 days and at most 30 workouts (owner, 28 Oct 2026: keep it tiny). */
export const MATE_DAYS = 60;
export const MATE_MAX_WORKOUTS = 30;
export const MATE_MAX_EXERCISES = 8;
export const MATE_BIO_MAX = 160;
const NAME_MAX = 60;
const EX_NAME_MAX = 40;

export interface MateExercise {
  /** The exercise's name. */
  n: string;
  /** The app's picture key for it (so the mate's phone shows the same picture), or null. */
  k: string | null;
  /** The best set: kg (0 for a body-weight move) and reps. */
  w: number;
  r: number;
}

export interface MateWorkout {
  id: string;
  /** "YYYY-MM-DD". */
  d: string;
  name: string;
  /** Minutes (0 when the workout has no end time). */
  min: number;
  kg: number;
  ex: MateExercise[];
}

export interface MateShare {
  bio: string | null;
  workouts: MateWorkout[];
}

/** One workout as this phone reads it (HistoryItem / SessionDetail, as far as this needs). */
export interface LocalWorkout {
  id: string;
  dateISO: string;
  /** The workout's own name (sessionTitle). */
  title: string;
  exercises: {
    exercise: { id: string; name: string };
    sets: { weightKg: number; reps: number; isWarmup: boolean }[];
  }[];
}

/** The same workout's length and kg lifted by the app's one rule (getSessionTotalsBetween). */
export interface LocalTotals {
  sessionId: string;
  durationSec: number;
  volumeKg: number;
}

const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_OK = /^[A-Za-z0-9_.-]{1,40}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const clean = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max).trim();
const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * The best set of one exercise: the heaviest working set (most reps on a tie); with no weight on any
 * set, the most reps. null when no working set has weight or reps (a plank, a run). PURE.
 */
export function bestSet(sets: LocalWorkout['exercises'][number]['sets']): { w: number; r: number } | null {
  let best: { w: number; r: number } | null = null;
  for (const s of sets) {
    if (s.isWarmup) continue;
    const w = Math.min(1000, Math.max(0, finite(s.weightKg)));
    const r = Math.min(1000, Math.max(0, Math.floor(finite(s.reps))));
    if (w === 0 && r === 0) continue;
    if (!best || w > best.w || (w === best.w && r > best.r)) best = { w, r };
  }
  return best ? { w: Math.round(best.w * 10) / 10, r: best.r } : null;
}

/**
 * The kg a mate sees for one workout: only the weight on the bar or in the hands (working sets,
 * weight x reps), never the body-weight part the app's own kg-lifted rule adds for pull-ups and
 * dips. With that part in, a mate could divide a pull-up workout's kg by its reps and get the
 * member's body weight (0.60.0 review). Capped by the app's own total when it is known. PURE.
 */
export function sharedKg(w: LocalWorkout, t: LocalTotals | undefined): number {
  let kg = 0;
  for (const g of w.exercises) {
    for (const s of g.sets) {
      if (s.isWarmup) continue;
      const wt = Math.max(0, finite(s.weightKg));
      const r = Math.max(0, Math.floor(finite(s.reps)));
      kg += wt * r;
    }
  }
  const total = finite(t?.volumeKg);
  return total > 0 ? Math.min(kg, total) : kg;
}

/**
 * What the phone sends while the switch is on, newest first. `workouts` newest first, as History
 * reads them; `keys`: each exercise id's picture key. Workouts with no id the server accepts, a bad
 * day, or outside the last 60 days are left out. PURE.
 */
export function mateShareFrom(
  bio: string | null | undefined,
  workouts: readonly LocalWorkout[],
  totals: readonly LocalTotals[],
  keys: ReadonlyMap<string, string | null>,
  today: string,
): MateShare {
  const from = addDays(today, -(MATE_DAYS - 1));
  const byId = new Map(totals.map((t) => [t.sessionId, t]));
  const out: MateWorkout[] = [];
  for (const w of workouts) {
    if (out.length >= MATE_MAX_WORKOUTS) break;
    if (!ID_OK.test(w.id) || !ISO_DAY.test(w.dateISO) || w.dateISO < from || w.dateISO > today) continue;
    const t = byId.get(w.id);
    const ex: MateExercise[] = [];
    for (const g of w.exercises) {
      if (ex.length >= MATE_MAX_EXERCISES) break;
      const best = bestSet(g.sets);
      const n = clean(g.exercise.name ?? '', EX_NAME_MAX);
      if (!best || !n) continue;
      const k = keys.get(g.exercise.id) ?? null;
      ex.push({ n, k: k && KEY_OK.test(k) ? k : null, w: best.w, r: best.r });
    }
    out.push({
      id: w.id,
      d: w.dateISO,
      name: clean(w.title ?? '', NAME_MAX) || 'Workout',
      min: Math.min(1440, Math.max(0, Math.round(finite(t?.durationSec) / 60))),
      kg: Math.min(60000, Math.max(0, Math.round(sharedKg(w, t)))),
      ex,
    });
  }
  const b = clean(bio ?? '', MATE_BIO_MAX);
  return { bio: b || null, workouts: out };
}

// ------------------------------------------------------------------ the gym's answers

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** One leaderboard row and the profile it opens (null: not shared). */
export interface MateRow {
  rank: number;
  name: string;
  profile: string | null;
}

export interface MateBoard {
  workouts: MateRow[];
  kg: MateRow[];
}

function mateRows(raw: unknown): MateRow[] {
  if (!Array.isArray(raw)) return [];
  const out: MateRow[] = [];
  for (const r of raw.slice(0, 10)) {
    if (!isObj(r)) continue;
    const rank = num(r.rank);
    if (rank == null) continue;
    const p = str(r.profile);
    out.push({ rank, name: str(r.name).slice(0, 40) || 'A member', profile: UUID.test(p) ? p.toLowerCase() : null });
  }
  return out;
}

/** member_mate_board's answer; null when it is not one. PURE. */
export function mateBoardFrom(raw: unknown): MateBoard | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  return { workouts: mateRows(r.workouts), kg: mateRows(r.kg) };
}

/**
 * The profile a board row opens: only when the gym's row at the same place has the same rank and
 * name (the two answers can come a moment apart). PURE.
 */
export function profileFor(rows: readonly MateRow[] | undefined, index: number, rank: number, name: string): string | null {
  const r = rows?.[index];
  return r && r.rank === rank && r.name === name ? r.profile : null;
}

export interface MateProfile {
  name: string;
  bio: string | null;
  workouts: MateWorkout[];
}

function mateExercise(raw: unknown): MateExercise | null {
  if (!isObj(raw)) return null;
  const n = str(raw.n).slice(0, EX_NAME_MAX);
  if (!n) return null;
  const k = str(raw.k);
  return { n, k: KEY_OK.test(k) ? k : null, w: Math.max(0, num(raw.w) ?? 0), r: Math.max(0, Math.floor(num(raw.r) ?? 0)) };
}

function mateWorkout(raw: unknown): MateWorkout | null {
  if (!isObj(raw)) return null;
  const d = str(raw.d).slice(0, 10);
  if (!ISO_DAY.test(d)) return null;
  return {
    id: str(raw.id) || d,
    d,
    name: str(raw.name).slice(0, NAME_MAX) || 'Workout',
    min: Math.max(0, Math.round(num(raw.min) ?? 0)),
    kg: Math.max(0, num(raw.kg) ?? 0),
    ex: (Array.isArray(raw.ex) ? raw.ex : []).map(mateExercise).filter((e): e is MateExercise => e != null).slice(0, MATE_MAX_EXERCISES),
  };
}

/** member_mate_profile's answer; null when it is not one. PURE. */
export function mateProfileFrom(raw: unknown): MateProfile | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  const bio = str(r.bio).slice(0, MATE_BIO_MAX);
  return {
    name: str(r.name).slice(0, 40) || 'A member',
    bio: bio || null,
    workouts: (Array.isArray(r.workouts) ? r.workouts : []).map(mateWorkout).filter((w): w is MateWorkout => w != null).slice(0, MATE_MAX_WORKOUTS),
  };
}

// ------------------------------------------------------------------ words

export const MATE_WORDS = {
  // Settings → Your gym → What my gym can see
  shareSwitch: 'Let my gym mates see my workouts',
  shareCaption:
    'Members of your gym can tap your name on the leaderboard to see your bio and up to 30 workouts from the last 60 days: name, date, time, kg lifted and your best set of each exercise. Never photos, body weight, notes or your phone number. Turn it off and what you shared is deleted at once.',
  needsName: "Gym mates can open your workouts only while 'Show my name on my gym's leaderboard' is on.",
  // The leaderboard row
  openHint: 'Opens their workouts',
  // The mate's profile page
  title: 'Gym mate',
  from: (name: string): string => `${name} shares these workouts with members of your gym. You see the last 60 days.`,
  empty: 'No workouts in the last 60 days.',
  closed: 'This member is not sharing their workouts right now.',
  failed: "Couldn't load their workouts. Check your internet and try again.",
  tryAgain: 'Try again',
  stats: { time: 'Time', kg: 'Kg lifted', lb: 'Lb lifted', exercises: 'Exercises' },
} as const;

/** "AR" for "Asha R."; "A" for "Asha"; "?" for nothing. PURE. */
export function initialsOf(name: string): string {
  const w = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return '?';
  const first = [...w[0]!][0]!.toUpperCase();
  return w.length > 1 ? first + [...w[w.length - 1]!][0]!.toUpperCase() : first;
}

/** One exercise row: "Bench Press · best 60 kg × 8", "Pull Up · best 12 reps". PURE. */
export function exerciseLine(e: MateExercise, u: UnitSystem): string {
  if (e.w > 0) return `${e.n} · best ${fmtW(e.w, u)} × ${fmtInt(e.r)}`;
  return `${e.n} · best ${fmtInt(e.r)} ${e.r === 1 ? 'rep' : 'reps'}`;
}

/**
 * The gym leaderboard in the member app (R-133, docs/research/R-leaderboard.md). The PURE half:
 * the day totals a phone sends, and the gym's answer (member_board) read defensively.
 * leaderboardPush.ts decides when to send, leaderboardSync.ts talks to the server, boardWords.ts
 * holds every word the member reads.
 *
 * Only these leave the phone: per day, how many workouts and how many kg (the app's ONE volume
 * rule, tracker/engine/volume.ts). No exercise, set, lift, body weight, photo or note.
 */
import { addDays } from '@/lib/date';

/** One day of the push: `{"d":"YYYY-MM-DD","w":workouts,"kg":kg}`. */
export interface BoardDay {
  d: string;
  w: number;
  kg: number;
}

/** What `getSessionTotalsBetween` gives for one workout (volumeService.ts), as far as this needs. */
export interface WorkoutTotal {
  dateISO: string;
  volumeKg: number;
  sets: number;
}

/** Days the push covers: the last 31, ending today. */
export const BOARD_PUSH_DAYS = 31;
/** A day counts at most 3 workouts (more are counted as 3); the server drops a day above 60,000 kg, so the phone never sends one. */
export const MAX_WORKOUTS_PER_DAY = 3;
export const MAX_KG_PER_DAY = 60000;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** First day of the push window. */
export function boardFromDay(today: string): string {
  return addDays(today, -(BOARD_PUSH_DAYS - 1));
}

/**
 * The day list to send, oldest first. A workout counts only with at least one working set; a day
 * with more than 3 workouts counts 3; a day with more than 60,000 kg is left out whole (neither
 * workouts nor kg are sent); kg is never negative. PURE.
 */
export function boardDays(workouts: readonly WorkoutTotal[], today: string): BoardDay[] {
  const from = boardFromDay(today);
  const byDay = new Map<string, { w: number; kg: number }>();
  for (const t of workouts) {
    if (!ISO_DAY.test(t.dateISO) || t.dateISO < from || t.dateISO > today) continue;
    if (!(t.sets > 0)) continue;
    const day = byDay.get(t.dateISO) ?? { w: 0, kg: 0 };
    day.w += 1;
    day.kg += Number.isFinite(t.volumeKg) ? Math.max(0, t.volumeKg) : 0;
    byDay.set(t.dateISO, day);
  }
  const out: BoardDay[] = [];
  for (const [d, v] of byDay) {
    if (v.kg > MAX_KG_PER_DAY) continue;
    out.push({ d, w: Math.min(v.w, MAX_WORKOUTS_PER_DAY), kg: Math.round(v.kg) });
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

// ------------------------------------------------------------------ the gym's answer

export type BoardMeasure = 'workouts' | 'kg';

export interface BoardRow {
  rank: number;
  /** "Rahul S." or "A member". */
  name: string;
  value: number;
  me: boolean;
}

export interface BoardList {
  top: BoardRow[];
  /** This member's own place, with or without a row in the top 10. null: nothing counted yet. */
  me: { rank: number; value: number } | null;
}

export interface BoardChallenge {
  id: string;
  title: string;
  measure: BoardMeasure;
  goal: number;
  startsOn: string;
  endsOn: string;
  prizeDays: number;
  myValue: number;
  hit: boolean;
}

export interface Board {
  gymName: string;
  members: number;
  workouts: BoardList;
  kg: BoardList;
  challenge: BoardChallenge | null;
}

const TOP_SHOWN = 10;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

function rowFrom(raw: unknown): BoardRow | null {
  if (!isObj(raw)) return null;
  const rank = num(raw.rank);
  const value = num(raw.value);
  if (rank == null || value == null || !Number.isInteger(rank) || rank < 1 || value < 0) return null;
  return { rank, name: str(raw.name).slice(0, 40) || 'A member', value, me: raw.me === true };
}

function listFrom(raw: unknown): BoardList {
  if (!isObj(raw)) return { top: [], me: null };
  const top = (Array.isArray(raw.top) ? raw.top : [])
    .map(rowFrom)
    .filter((r): r is BoardRow => r != null)
    .slice(0, TOP_SHOWN);
  let me: BoardList['me'] = null;
  if (isObj(raw.me)) {
    const rank = num(raw.me.rank);
    const value = num(raw.me.value);
    if (rank != null && value != null && Number.isInteger(rank) && rank >= 1 && value >= 0) me = { rank, value };
  }
  return { top, me };
}

function challengeFrom(raw: unknown): BoardChallenge | null {
  if (!isObj(raw)) return null;
  const goal = num(raw.goal);
  const title = str(raw.title);
  const measure = raw.measure === 'workouts' || raw.measure === 'kg' ? raw.measure : null;
  const startsOn = str(raw.startsOn).slice(0, 10);
  const endsOn = str(raw.endsOn).slice(0, 10);
  if (!measure || goal == null || goal <= 0 || !title || !ISO_DAY.test(startsOn) || !ISO_DAY.test(endsOn)) return null;
  const myValue = Math.max(0, num(raw.myValue) ?? 0);
  const prize = num(raw.prizeDays);
  return {
    id: str(raw.id),
    title: title.slice(0, 60),
    measure,
    goal,
    startsOn,
    endsOn,
    prizeDays: prize != null && prize > 0 ? Math.min(60, Math.floor(prize)) : 0,
    myValue,
    // The server's `hit` is myValue >= goal; either says it is true.
    hit: raw.hit === true || myValue >= goal,
  };
}

/** member_board's answer, checked; null when it is not one (the card then stays hidden). PURE. */
export function boardFromRow(raw: unknown): Board | null {
  const r = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(r) || r.ok !== true) return null;
  const members = num(r.members);
  return {
    gymName: str(r.gymName) || 'Your gym',
    members: members != null && members > 0 ? Math.floor(members) : 0,
    workouts: listFrom(r.workouts),
    kg: listFrom(r.kg),
    challenge: challengeFrom(r.challenge),
  };
}

/** The progress bar's fill, 0 to 1. PURE. */
export function challengeFill(c: Pick<BoardChallenge, 'goal' | 'myValue'>): number {
  return c.goal > 0 ? Math.min(1, Math.max(0, c.myValue / c.goal)) : 0;
}

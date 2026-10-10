/**
 * "Today" from the database — the ONE answer Home, the Workout tab, the Today page, Start,
 * the reminders and the widgets share (audit Phase 3; the rules are in `plans/todayPlan.ts`).
 *
 * RP-22: bounded reads only — the followed plan, the newest 30 workouts and which exercises
 * they held. No exercise's history is read here (the Targets are worked out separately, for
 * the one routine shown).
 */
import { getDb } from '@/db';
import { getActivePlan, type PlanDayFull } from '@/db/repos/planRepo';
import { todayISO } from '@/lib/date';
import type { DayType, TodaySummary, TodaysWorkout } from '@/types/models';

import { followedFolder } from '../db/folderRepo';
import { todayPlan, todayWords, type TodaySessionInput, type TodayStatus, type TodayWords } from '../plans/todayPlan';

/** Workouts read to place the rotation (the frozen rotation read 10). */
const RECENT = 30;

export interface TodayInfo {
  status: TodayStatus;
  /** 'next': today's routine. 'doneToday': the routine done today. Else null. */
  routine: PlanDayFull | null;
  /** The routine Start starts ('next' and 'doneToday'). */
  next: PlanDayFull | null;
  /** The workout done today from the plan. */
  doneToday: { id: string; name: string } | null;
  folder: { id: string; name: string } | null;
  words: TodayWords;
}

type RoutineIn = PlanDayFull & { exerciseIds: string[] };

interface SessionRow {
  id: string;
  date_iso: string;
  started_at: number;
  day_type: string;
  title: string | null;
  notes: string | null;
  routine_id: string | null;
}

async function recentSessions(today: string, floor: string | null): Promise<TodaySessionInput[]> {
  const db = getDb();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT id, date_iso, started_at, day_type, title, notes, routine_id FROM workout_sessions
      WHERE date_iso <= ?${floor ? ' AND date_iso >= ?' : ''}
      ORDER BY date_iso DESC, started_at DESC LIMIT ${RECENT}`,
    floor ? [today, floor] : [today],
  );
  if (rows.length === 0) return [];
  // Which exercises each held — only needed to guess the routine of an older workout.
  const unknown = rows.filter((r) => r.routine_id == null).map((r) => r.id);
  const exercises = new Map<string, string[]>();
  if (unknown.length > 0) {
    const sets = await db.getAllAsync<{ session_id: string; exercise_id: string }>(
      `SELECT DISTINCT session_id, exercise_id FROM set_entries WHERE session_id IN (${unknown.map(() => '?').join(', ')})`,
      unknown,
    );
    for (const s of sets) exercises.set(s.session_id, [...(exercises.get(s.session_id) ?? []), s.exercise_id]);
  }
  // Saved routines that exist in no folder any more (deleted, or re-made): placed by name.
  const named = [...new Set(rows.map((r) => r.routine_id).filter((id): id is string => !!id))];
  const existing = new Set<string>();
  if (named.length > 0) {
    const found = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM plan_days WHERE id IN (${named.map(() => '?').join(', ')})`,
      named,
    );
    for (const f of found) existing.add(f.id);
  }
  return rows.map((r) => ({
    id: r.id,
    dateISO: r.date_iso,
    startedAt: r.started_at,
    dayType: r.day_type as DayType,
    routineId: r.routine_id,
    routineGone: !!r.routine_id && !existing.has(r.routine_id),
    title: r.title,
    notes: r.notes,
    exerciseIds: exercises.get(r.id) ?? [],
  }));
}

/** Today's answer, read from the database. */
export async function getTodayPlan(today: string = todayISO()): Promise<TodayInfo> {
  const [plan, folder] = await Promise.all([getActivePlan(), followedFolder()]);
  if (!plan) {
    const a = { status: 'noPlan' as const, routine: null };
    return { status: 'noPlan', routine: null, next: null, doneToday: null, folder: null, words: todayWords(a) };
  }
  const floor = folder && folder.id === plan.plan.id ? folder.settings.startISO ?? null : null;
  const routines: RoutineIn[] = plan.days.map((d) => ({ ...d, exerciseIds: d.exercises.map((e) => e.exerciseId) }));
  const sessions = await recentSessions(today, floor);
  const a = todayPlan({ todayISO: today, folder: { id: plan.plan.id, name: plan.plan.name, startISO: floor, routines }, sessions });
  const doneName = a.doneToday ? a.doneToday.title?.trim() || a.routine?.name || 'Workout' : null;
  const byId = new Map(plan.days.map((d) => [d.id, d]));
  const strip = (r: RoutineIn | null | undefined): PlanDayFull | null => (r ? byId.get(r.id) ?? null : null);
  return {
    status: a.status,
    routine: strip(a.routine),
    next: strip(a.next),
    doneToday: a.doneToday && doneName ? { id: a.doneToday.id, name: doneName } : null,
    folder: { id: plan.plan.id, name: plan.plan.name },
    words: todayWords({ status: a.status, routine: a.routine, next: a.next ?? null, doneName, folderName: plan.plan.name }),
  };
}

/** The small, serialisable part every screen reads. PURE. */
export function todaySummary(info: TodayInfo): TodaySummary {
  return {
    status: info.status,
    title: info.words.title,
    line: info.words.line,
    nextId: info.next?.id ?? null,
    nextName: info.next?.name ?? null,
    doneName: info.doneToday?.name ?? null,
    doneSessionId: info.doneToday?.id ?? null,
  };
}

/**
 * Today's workout in the shape Home and the coach read (`TodaysWorkout`), without Targets.
 * `planDayId` / `dayName` are always the routine Start starts. PURE.
 */
export function todaysWorkoutOf(info: TodayInfo): Omit<TodaysWorkout, 'targets'> {
  const today = todaySummary(info);
  if (!info.next) {
    return { dayType: 'rest', dayName: info.words.title, planDayId: null, headline: info.words.line, today };
  }
  return {
    dayType: info.next.dayType,
    dayName: info.next.name,
    planDayId: info.next.id,
    headline: info.status === 'doneToday' ? info.words.sentence : info.words.line,
    today,
  };
}

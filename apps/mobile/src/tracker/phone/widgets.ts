/**
 * Home-screen widgets (v0.27.0, tracker plan Phase 5). The native widgets (modules/forge-phone)
 * only draw what the app hands them; this builds it. Two widgets:
 *  - Today: today's workout from the followed plan ("Push Day" / "6 exercises · Bench Press
 *    first" / "Start"), "done" once trained today, or "No plan yet". Tap → the Workout tab.
 *  - This week: workouts done since Monday, day by day, against the plan's days a week.
 *    Tap → History.
 * The widget data carries its day (and week), so a widget left until tomorrow says "Open
 * ForgeAI…" instead of yesterday's workout.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { addDays, todayISO, weekStartISO } from '@/lib/date';
import { countWord } from '@/lib/words';
import { getTodayPlan } from '@/tracker/services/todayService';
import { followedFolder } from '@/tracker/db/folderRepo';
import { planDaysPerWeek } from '@/tracker/services/planState';

import { phoneNative } from './native';

export interface WidgetInput {
  todayISO: string;
  /** The plan's workout for today; null = no plan. */
  today: { name: string; exercises: string[] } | null;
  /** Name of a workout already done today, if any. */
  doneToday: string | null;
  /** Audit Phase 3: the plan's routine after today's ("Next: Pull 1"), once today's is done. */
  next?: string | null;
  /** Days with a finished workout ('YYYY-MM-DD'). */
  doneDates: ReadonlySet<string>;
  /** Workouts a week in the plan; null = no plan. */
  goal: number | null;
}

export interface WidgetData {
  dateISO: string;
  today: { title: string; line: string; action: string };
  week: { weekStartISO: string; weekEndISO: string; count: string; line: string; days: boolean[]; todayIndex: number };
}

/** PURE. */
export function widgetData(i: WidgetInput): WidgetData {
  const start = weekStartISO(i.todayISO);
  const days = Array.from({ length: 7 }, (_, k) => i.doneDates.has(addDays(start, k)));
  const done = days.filter(Boolean).length;
  const todayIndex = Array.from({ length: 7 }, (_, k) => addDays(start, k)).indexOf(i.todayISO);

  let today: WidgetData['today'];
  if (i.doneToday) today = { title: `${i.doneToday} done`, line: i.next ? `Next: ${i.next}` : 'Nice work. Rest well.', action: 'Open' };
  else if (i.today && i.today.exercises.length > 0) {
    today = {
      title: i.today.name,
      line: `${countWord(i.today.exercises.length, 'exercise')} · ${i.today.exercises[0]} first`,
      action: 'Start',
    };
  } else if (i.today) today = { title: i.today.name, line: 'Open ForgeAI to see it', action: 'Open' };
  else today = { title: 'No plan yet', line: 'Open ForgeAI to start a workout', action: 'Open' };

  const count = i.goal != null && i.goal > 0 ? `${done} of ${i.goal}` : countWord(done, 'workout');
  const line =
    i.goal != null && i.goal > 0
      ? done >= i.goal
        ? 'Week done. Well trained.'
        : `${countWord(i.goal - done, 'workout')} to go`
      : 'Since Monday';
  return {
    dateISO: i.todayISO,
    today,
    week: { weekStartISO: start, weekEndISO: addDays(start, 6), count, line, days, todayIndex },
  };
}

/** Read what the widgets show and hand it to them. Quiet; does nothing without the native piece. */
export async function refreshWidgets(): Promise<void> {
  const n = phoneNative();
  if (!n) return;
  try {
    const t = todayISO();
    const start = weekStartISO(t);
    // Audit Phase 3: the same "Today" answer as Home and the Workout tab (RP-10).
    const [plan, sessions, tp, folder] = await Promise.all([
      getActivePlan(),
      getSessionsBetween(start, addDays(start, 6)),
      getTodayPlan(t).catch(() => null),
      followedFolder().catch(() => null),
    ]);
    const doneDates = new Set(sessions.map((s) => s.dateISO));
    const hasPlan = plan != null && plan.days.length > 0;
    const data = widgetData({
      todayISO: t,
      today: tp?.next ? { name: tp.next.name, exercises: tp.next.exercises.map((x) => x.exercise.name) } : null,
      // Only the plan's routine done today closes Today; an empty workout never does (RP-01).
      doneToday: tp?.status === 'doneToday' ? (tp.doneToday?.name ?? 'Workout') : null,
      next: tp?.status === 'doneToday' ? (tp.next?.name ?? null) : null,
      doneDates,
      // RP-06: the plan's days a week (3 for a 3-day plan of 2 routines), not its routine count.
      goal: hasPlan ? planDaysPerWeek(folder?.settings ?? {}, plan.days.length) : null,
    });
    n.widgetSave(JSON.stringify(data));
  } catch {
    // quiet
  }
}

/** How many ForgeAI widgets are on the home screen. */
export function widgetsPlaced(): number {
  try {
    return phoneNative()?.widgetCount() ?? 0;
  } catch {
    return 0;
  }
}

/** Ask the home screen to add one. False when this phone's home screen cannot. */
export function placeWidget(kind: 'today' | 'week'): boolean {
  try {
    return phoneNative()?.widgetPin(kind) ?? false;
  } catch {
    return false;
  }
}

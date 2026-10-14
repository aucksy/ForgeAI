/**
 * Home-screen widgets (v0.27.0, tracker plan Phase 5). The native widgets (modules/forge-phone)
 * only draw what the app hands them; this builds it. Two widgets:
 *  - Today: today's workout from the followed plan ("Push Day" / "6 exercises · Bench Press
 *    first" / "Start"), "done" once trained today, or "No plan yet". Tap → the Workout tab.
 *  - This week: workouts done since Monday, day by day, against the member's weekly goal
 *    (audit Phase 9), else the plan's days a week.
 *    Tap → the Profile (redesign R1; it was History).
 *
 * Audit Phase 6:
 *  - PH-02: the data holds the next 7 days (each with its own Today and week), and the widget
 *    picks the entry for the phone's date itself — so the morning after, and every Monday, it
 *    still shows the right workout without the app being opened. Only a workout saved moves
 *    the rotation, and every save writes the widgets again, so each later day's Today is the
 *    routine Start starts now (exactly `todayPlan`'s answer for those dates; tested). Past the
 *    7 days, `later` keeps that routine and an empty week.
 *  - PH-09: "Start" carries the routine's id: the widget opens
 *    `forgeai://workout/start?routine=<id>`, which starts that routine (or resumes the open
 *    workout). During a workout the widget says "Resume".
 *  - Review fix: the data carries the widget's own key (`token`, `widgetToken.ts`), which the
 *    widget adds to its link (`t=`); only a link with it starts a workout by itself.
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { addDays, todayISO, weekStartISO } from '@/lib/date';
import { countWord } from '@/lib/words';
import { getTodayPlan } from '@/tracker/services/todayService';
import { followedFolder } from '@/tracker/db/folderRepo';
import { planDaysPerWeek } from '@/tracker/services/planState';
import { color } from '@/theme/tokens';

import { liveWorkout } from './liveWorkout';
import { phoneNative } from './native';
import { widgetToken } from './widgetToken';

export interface WidgetInput {
  todayISO: string;
  /** The plan's workout for today; null = no plan. `routineId` lets "Start" start it. */
  today: { name: string; exercises: string[]; routineId?: string | null } | null;
  /** Name of a workout already done today, if any. */
  doneToday: string | null;
  /** Audit Phase 3: the plan's routine after today's ("Next: Pull 1"), once today's is done. */
  next?: string | null;
  /** Days with a finished workout ('YYYY-MM-DD'). */
  doneDates: ReadonlySet<string>;
  /** Workouts a week in the plan; null = no plan. */
  goal: number | null;
}

export interface WidgetToday {
  title: string;
  line: string;
  action: string;
  /** The routine "Start" starts; absent when the action only opens the app. */
  routineId?: string;
}

export interface WidgetData {
  dateISO: string;
  today: WidgetToday;
  week: { weekStartISO: string; weekEndISO: string; count: string; line: string; days: boolean[]; todayIndex: number };
}

/** PURE. */
export function widgetData(i: WidgetInput): WidgetData {
  const start = weekStartISO(i.todayISO);
  const days = Array.from({ length: 7 }, (_, k) => i.doneDates.has(addDays(start, k)));
  const done = days.filter(Boolean).length;
  const todayIndex = Array.from({ length: 7 }, (_, k) => addDays(start, k)).indexOf(i.todayISO);

  let today: WidgetToday;
  if (i.doneToday) today = { title: `${i.doneToday} done`, line: i.next ? `Next: ${i.next}` : 'Nothing else planned today', action: 'Open' };
  else if (i.today && i.today.exercises.length > 0) {
    today = {
      title: i.today.name,
      line: `${countWord(i.today.exercises.length, 'exercise')} · ${i.today.exercises[0]} first`,
      action: 'Start',
    };
    if (i.today.routineId) today.routineId = i.today.routineId;
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

/** The whole widget data: 7 days, the open workout, and what stands after the 7 days. */
export interface WidgetPayload {
  v: 2;
  days: WidgetData[];
  /** A workout open now: the Today widget says "Resume" (any day). */
  live: { title: string; line: string; action: 'Resume' } | null;
  /** Any day after the 7: the same routine, and a week with nothing done yet. */
  later: { today: WidgetToday; week: { count: string; line: string } };
  /** Review fix: the widget's key, added to its Start / Resume link (absent: none could be read). */
  token?: string;
  /**
   * Gym branding: the app's accent ('#RRGGBB') and the ink that reads on it, so the widgets wear
   * the gym's colour (labels, the day marks). Absent or damaged: the widget keeps ForgeAI's orange.
   */
  accent?: string;
  onAccent?: string;
}

/** Gym branding: the colours the widgets draw in — the app's live accent (theme tokens). PURE read. */
export function widgetLook(): { accent: string; onAccent: string } {
  return { accent: color.accent, onAccent: color.onAccent };
}

export const WIDGET_DAYS = 7;

/**
 * PURE (PH-02, PH-09). Today's answer and the next 6 days. With no workout in between, the
 * rotation does not move: every later day offers today's "Start" routine (`today` — after a
 * workout done today, the next one), and only its own week's done days.
 */
export function widgetPayload(i: WidgetInput & { live: { name: string } | null }): WidgetPayload {
  const days: WidgetData[] = [];
  for (let k = 0; k < WIDGET_DAYS; k++) {
    const dateISO = addDays(i.todayISO, k);
    days.push(
      k === 0
        ? widgetData(i)
        : widgetData({ ...i, todayISO: dateISO, doneToday: null, next: null, doneDates: i.doneDates }),
    );
  }
  const after = widgetData({ ...i, todayISO: addDays(i.todayISO, 7 * 52), doneToday: null, next: null, doneDates: new Set() });
  return {
    v: 2,
    days,
    live: i.live ? { title: i.live.name || 'Workout', line: 'Workout in progress', action: 'Resume' } : null,
    later: { today: after.today, week: { count: after.week.count, line: after.week.line } },
  };
}

/** One app-icon shortcut (long-press on ForgeAI's icon). */
export interface AppShortcut {
  id: 'today' | 'weight';
  /** Shown where there is little room. */
  short: string;
  /** Shown in the long-press menu (Android: about 25 characters fit). */
  long: string;
  uri: string;
}

const LONG_MAX = 25;

/** "Start Push 1", the name cut with "…" so the line fits the menu. PURE. */
function fitLong(prefix: string, name: string): string {
  const room = LONG_MAX - prefix.length;
  const n = name.trim();
  return prefix + (n.length <= room ? n : `${n.slice(0, room - 1).trimEnd()}…`);
}

/**
 * Audit Phase 9 (#9): the long-press shortcuts on the app icon, from the same answer as the
 * Today widget — "Resume workout" while one is open; "Start <today's routine>" (the widget's own
 * link, so with its key it starts in one tap; without it the calm "Start …?" screen); else
 * "Start workout" (the Workout tab). Then "Log body weight" — redesign R6: it opens Measures on
 * Body weight (`/bodyweight` still works for links an older launcher kept). PURE.
 */
export function appShortcuts(p: Pick<WidgetPayload, 'days' | 'live' | 'token'>): AppShortcut[] {
  const today = p.days[0]?.today;
  let first: AppShortcut;
  if (p.live) first = { id: 'today', short: 'Resume', long: 'Resume workout', uri: 'forgeai://workout/start' };
  else if (today?.action === 'Start' && today.routineId) {
    const t = p.token ? `&t=${encodeURIComponent(p.token)}` : '';
    first = {
      id: 'today',
      short: 'Start',
      long: fitLong('Start ', today.title),
      uri: `forgeai://workout/start?routine=${encodeURIComponent(today.routineId)}${t}`,
    };
  } else first = { id: 'today', short: 'Start', long: 'Start workout', uri: 'forgeai://workout' };
  return [first, { id: 'weight', short: 'Weight', long: 'Log body weight', uri: 'forgeai://measures?kind=bodyweight' }];
}

/** Hand the shortcuts to the launcher. Quiet; an older build without the call does nothing. */
function saveShortcuts(list: AppShortcut[]): void {
  try {
    const n = phoneNative();
    if (n && typeof n.shortcutsSave === 'function') n.shortcutsSave(JSON.stringify(list));
  } catch {
    // quiet
  }
}

/** Erase all data: the shortcuts go too (the launcher keeps nothing of the member's). */
export function clearShortcuts(): void {
  saveShortcuts([]);
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
    const live = liveWorkout();
    const token = await widgetToken().catch(() => '');
    // Audit Phase 9 (#4): the member's own weekly goal wins over the plan's days a week.
    const ownGoal = await import('../store/trackerPrefsStore')
      .then((m) => m.cleanWeeklyGoal(m.useTrackerPrefs.getState().weeklyGoal))
      .catch(() => null);
    const data: WidgetPayload = widgetPayload({
      todayISO: t,
      today: tp?.next ? { name: tp.next.name, exercises: tp.next.exercises.map((x) => x.exercise.name), routineId: tp.next.id } : null,
      // Only the plan's routine done today closes Today; an empty workout never does (RP-01).
      doneToday: tp?.status === 'doneToday' ? (tp.doneToday?.name ?? 'Workout') : null,
      next: tp?.status === 'doneToday' ? (tp.next?.name ?? null) : null,
      doneDates,
      // RP-06: the plan's days a week (3 for a 3-day plan of 2 routines), not its routine count.
      goal: ownGoal ?? (hasPlan ? planDaysPerWeek(folder?.settings ?? {}, plan.days.length) : null),
      live: live ? { name: live.name } : null,
    });
    if (token) data.token = token;
    Object.assign(data, widgetLook());
    n.widgetSave(JSON.stringify(data));
    saveShortcuts(appShortcuts(data));
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

/**
 * PURE (audit H3). Android's "yes" to a pin request only means the home screen supports it — not
 * that a widget was placed (the member can cancel, and some home screens show nothing). So the
 * count is read again when the member is back: no more widgets than before means none was added.
 */
export function pinNotPlaced(before: number, after: number): boolean {
  return after <= before;
}

/** How long to wait for a home screen's "Add widget?" before checking (it may show nothing). */
export const PIN_CHECK_MS = 6000;

/** PURE (audit H3). The long-press hint: the home screen said no, or nothing was added. */
export function widgetHintText(why: 'refused' | 'notPlaced'): string {
  return why === 'refused'
    ? "Your home screen can't add it from here. Long-press your home screen → Widgets → ForgeAI."
    : 'No widget added? Long-press your home screen → Widgets → ForgeAI.';
}

/** Ask the home screen to add one. False when this phone's home screen cannot. */
export function placeWidget(kind: 'today' | 'week'): boolean {
  try {
    return phoneNative()?.widgetPin(kind) ?? false;
  } catch (e) {
    console.warn('[ForgeErr] widget pin request failed', e);
    return false;
  }
}

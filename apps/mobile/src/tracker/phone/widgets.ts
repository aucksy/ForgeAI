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
 *
 * R-320 (owner, 4 Nov 2026: "Widget - Lets go with A"; R-319 item 2: make widgets worth keeping):
 *  - Today shows what to beat: for today's routine, the first 1-2 lifts with last time's best set and the
 *    app's own Target ("Bench Press 60 kg × 8 last time · try 62.5 × 8"). The numbers are the Target the
 *    workout screen shows (coachTargets.getTodaysWorkoutWithTargets), never a new guess; a lift with no
 *    last time, a time or distance exercise, an easy week or a switch to another version says nothing.
 *  - A third widget, "Gym right now" (`gym`): how busy the member's gym is (the Gym tab's own answer,
 *    shop/gymBusySync.ts: the server's level, and a head count only from 5 people), with the time it
 *    was read. The widget itself stops saying "now" once the reading is 30 minutes old. Tap: check in
 *    (the poster scanner). Not in a gym: "Join your gym in the app to see how busy it is".
 */
import { getActivePlan } from '@/db/repos/planRepo';
import { getSessionsBetween } from '@/db/repos/workoutRepo';
import { addDays, todayISO, weekStartISO } from '@/lib/date';
import { countWord } from '@/lib/words';
import { getTodayPlan } from '@/tracker/services/todayService';
import { followedFolder } from '@/tracker/db/folderRepo';
import { planDaysPerWeek } from '@/tracker/services/planState';
// The dark look's colours (with the gym's): the widgets and the reminder's tint do not change with the app's light/dark look.
import { darkColor as color } from '@/theme/tokens';

import { aboutLine, levelLine, type BusyLevel, type GymBusy } from '@/shop/gymBusy';

import { liveWorkout } from './liveWorkout';
import { phoneNative } from './native';
import { widgetToken } from './widgetToken';

export interface WidgetInput {
  todayISO: string;
  /**
   * The plan's workout for today; null = no plan. `routineId` lets "Start" start it. `beats` (R-320): what
   * to beat on its first lifts, one line each (`beatLine`).
   */
  today: { name: string; exercises: string[]; routineId?: string | null; beats?: string[] } | null;
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
  /** R-320: up to 2 "what to beat" lines for the routine "Start" starts. */
  beats?: string[];
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
  if (i.doneToday) today = { title: `${i.doneToday} done`, line: i.next ? `Next: ${i.next}` : 'Nothing else planned', action: 'Open' };
  else if (i.today && i.today.exercises.length > 0) {
    const beats = (i.today.beats ?? []).filter((x) => x.trim() !== '').slice(0, WIDGET_BEATS);
    const count = countWord(i.today.exercises.length, 'exercise');
    today = {
      title: i.today.name,
      // R-320: with what-to-beat lines under it, the first lift is already named there.
      line: beats.length > 0 ? count : `${count} · ${i.today.exercises[0]} first`,
      action: 'Start',
    };
    if (i.today.routineId) today.routineId = i.today.routineId;
    if (beats.length > 0) today.beats = beats;
  } else if (i.today) today = { title: i.today.name, line: 'Open MettleUp to see it', action: 'Open' };
  else today = { title: 'No plan yet', line: 'Open MettleUp to start a workout', action: 'Open' };

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
  /**
   * R-320: the "Gym right now" widget. null = this phone is in no gym; absent = an older app wrote the
   * data (the widget asks to open the app).
   */
  gym?: WidgetGym | null;
}

/** R-320: what the "Gym right now" widget draws. `word` empty = no reading yet. `at` = when it was read (ms). */
export interface WidgetGym {
  name: string;
  word: string;
  line: string;
  at: number;
}

/** Today's what-to-beat lines: at most this many lifts (the widget's height). */
export const WIDGET_BEATS = 2;

/** The parts of a Target `beatLine` reads (tracker/engine/progression.ts ProgressionTarget). */
export interface BeatTarget {
  exerciseName: string;
  targetWeightKg: number;
  repGoal: number | null;
  targetRepsMin: number;
  last: { weightKg: number; topReps: number } | null;
  logType?: string;
  bodyweightOnly?: boolean;
  free?: boolean;
  easy?: boolean;
  version?: unknown;
  each?: boolean;
}

/**
 * R-320: "Bench Press 60 kg × 8 last time · try 62.5 × 8", from the Target the workout screen shows:
 * last time's best set (the top weight and its reps) and the Target's weight and rep goal. null when
 * there is nothing honest to say (no last time, not a weight-and-reps lift, a bodyweight move, an easy
 * week, a switch to another version). `kg` writes a weight with its unit ("62.5 kg"). PURE.
 */
export function beatLine(t: BeatTarget, kg: (kg: number) => string): string | null {
  if (t.free || t.easy || t.bodyweightOnly || t.version != null) return null;
  if ((t.logType ?? 'weight_reps') !== 'weight_reps') return null;
  const last = t.last;
  if (!last || !(last.weightKg > 0) || !(last.topReps > 0) || !(t.targetWeightKg > 0)) return null;
  const goal = t.repGoal ?? t.targetRepsMin;
  if (!(goal > 0)) return null;
  const bare = (w: number): string => kg(w).replace(/\s*(kg|lb)$/, '');
  const each = t.each ? ' each' : '';
  return `${t.exerciseName}: previous ${kg(last.weightKg)}${each} × ${last.topReps} · next ${bare(t.targetWeightKg)} × ${goal}`;
}

/** Gym level → the widget's one word. The server knows quiet / as usual / busier / closed; nothing more. PURE. */
export function gymWord(level: BusyLevel): string {
  switch (level) {
    case 'quiet':
      return 'Quiet';
    case 'busy':
      return 'Busy';
    case 'closed':
      return 'Closed';
    default:
      return 'Usual';
  }
}

/**
 * R-320: the "Gym right now" widget's data. No link: null (not in a gym). The reading's own time goes
 * with it; the widget decides from it whether "now" is still true. The head count only from 5 people
 * (the server's rule, gymBusy.aboutLine). PURE.
 */
export function widgetGym(link: { gymName: string } | null, read: { busy: GymBusy | null; at: number } | null): WidgetGym | null {
  if (!link) return null;
  const name = link.gymName.trim() || 'Your gym';
  if (!read?.busy) return { name, word: '', line: '', at: 0 };
  const b = read.busy;
  return { name, word: gymWord(b.level), line: aboutLine(b, b.level) ?? levelLine(b.level), at: read.at };
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
    // R-320: what to beat, only while a Today widget is on the home screen (it reads each lift's history).
    const beats = tp?.next && placedOf(n, 'today') > 0 ? await todayBeats(tp.next.id) : [];
    const data: WidgetPayload = widgetPayload({
      todayISO: t,
      today: tp?.next ? { name: tp.next.name, exercises: tp.next.exercises.map((x) => x.exercise.name), routineId: tp.next.id, beats } : null,
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
    // R-320: "Gym right now": the Gym tab's last answer, however old (the widget says when it was read).
    const gymLink = await import('@/shop/gymStore').then((m) => m.useGymShop.getState().link).catch(() => null);
    const sync = await import('@/shop/gymBusySync').catch(() => null);
    data.gym = widgetGym(gymLink, sync ? sync.lastGymBusy(gymLink) : null);
    n.widgetSave(JSON.stringify(data));
    saveShortcuts(appShortcuts(data));
    // A "Gym right now" widget is placed and the answer is missing or 5 minutes old: ask the gym (at most
    // every 5 minutes, gymBusySync), then draw once more. Not waited on: a save never waits on the gym.
    if (gymLink && sync && !gymRedrawing && placedOf(n, 'gym') > 0) {
      const last = sync.lastGymBusy(gymLink);
      if (!last || Date.now() - last.at >= sync.GYM_BUSY_EVERY_MS) {
        void sync
          .readGymBusy(gymLink)
          .then((r) => (r.kind === 'busy' ? redrawAfterGym() : undefined))
          .catch((e: unknown) => console.warn('[widgets] how busy the gym is could not be read', e));
      }
    }
  } catch {
    // quiet
  }
}

/** One redraw after a fresh gym answer (never a loop: that redraw asks nothing, and the answer is fresh). */
let gymRedrawing = false;
function redrawAfterGym(): void {
  gymRedrawing = true;
  void refreshWidgets().finally(() => {
    gymRedrawing = false;
  });
}

/** Widgets of one kind on the home screen; an older build without the call counts all of them. */
function placedOf(n: NonNullable<ReturnType<typeof phoneNative>>, kind: WidgetKind): number {
  try {
    return typeof n.widgetCountOf === 'function' ? n.widgetCountOf(kind) : n.widgetCount();
  } catch {
    return 0;
  }
}

/**
 * R-320: today's what-to-beat lines, from the Up next routine's Targets (the same answer as the workout
 * screen and the Progress tab's Today card). Only when that answer is about the same routine. Never throws.
 */
async function todayBeats(routineId: string): Promise<string[]> {
  try {
    const [{ getTodaysWorkoutWithTargets }, { targetKgText }] = await Promise.all([
      import('@/tracker/services/coachTargets'),
      import('@/tracker/engine/progression'),
    ]);
    const tw = await getTodaysWorkoutWithTargets();
    if (tw.planDayId !== routineId) return [];
    const lines: string[] = [];
    for (const t of tw.targets) {
      const line = beatLine(t, targetKgText);
      if (line) lines.push(line);
      if (lines.length >= WIDGET_BEATS) break;
    }
    return lines;
  } catch (e) {
    console.warn('[widgets] what to beat could not be worked out', e);
    return [];
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
    ? "Your home screen can't add it from here. Long-press your home screen → Widgets → MettleUp."
    : 'No widget added? Long-press your home screen → Widgets → MettleUp.';
}

/** The home-screen widgets: Today, This week and (R-320) Gym right now. */
export type WidgetKind = 'today' | 'week' | 'gym';

/** Ask the home screen to add one. False when this phone's home screen cannot. */
export function placeWidget(kind: WidgetKind): boolean {
  try {
    return phoneNative()?.widgetPin(kind) ?? false;
  } catch (e) {
    console.warn('[ForgeErr] widget pin request failed', e);
    return false;
  }
}

/**
 * Audit Phase 6, packet A — around the phone.
 *  - Reminders (PH-04, PH-06, PH-07, PH-08, HI-17): weekly repeats on the chosen days, a day
 *    already trained (or with a workout open) bridged with dated alerts, "your usual days and
 *    time" as the default, the time zone / clock check, the time picker steps, the blocked state.
 *  - Widgets (PH-02, PH-09): the next 7 days of "Today", Resume during a workout.
 *  - Health Connect (PH-03, PH-12): the body weight of that day, the workout's own name, and
 *    honest words after "Send past workouts".
 */
import { describe, expect, it } from 'vitest';

import {
  bodyWeightOn,
  healthPayload,
  healthTitle,
  sendResultText,
} from '@/tracker/phone/healthConnect';
import {
  BRIDGE_WEEKS,
  expoWeekday,
  needsReschedule,
  planDaysToWeekdays,
  reminderCaption,
  reminderTriggers,
  stepReminderHour,
  stepReminderMinute,
  usualTrainingSlot,
} from '@/tracker/phone/reminders';
import { routineParam, widgetStartAction, widgetTokenOk } from '@/tracker/phone/widgetLink';
import { widgetPayload } from '@/tracker/phone/widgets';
import { todayPlan } from '@/tracker/plans/todayPlan';

/** Local epoch ms of a day and clock time. */
const at = (iso: string, h: number, m = 0): number => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};

describe('reminders — your usual days and time (owner pick)', () => {
  it('takes the weekdays trained in at least 2 of the last 8 weeks, at the usual start time', () => {
    // Today Sat 10 Oct 2026. Tue and Thu evenings for 6 weeks, around 7 pm; one odd Sunday.
    const sessions: { dateISO: string; startedAt: number }[] = [];
    for (let w = 0; w < 6; w++) {
      const tue = new Date(2026, 9, 6 - 7 * w);
      const thu = new Date(2026, 9, 8 - 7 * w);
      sessions.push({ dateISO: iso(tue), startedAt: tue.getTime() + (19 * 60 + (w % 2 ? 10 : 0)) * 60000 });
      sessions.push({ dateISO: iso(thu), startedAt: thu.getTime() + (18 * 60 + 55) * 60000 });
    }
    sessions.push({ dateISO: '2026-09-27', startedAt: at('2026-09-27', 9) });
    const s = usualTrainingSlot({ sessions, todayISO: '2026-10-10', planDaysPerWeek: 3 });
    expect(s.days).toEqual([1, 3]);
    expect(s.minutes).toBe(19 * 60); // median 7:00 pm, on a 5-minute step
    expect(s.from).toBe('history');
  });

  it('ignores workouts older than 8 weeks; falls back to the plan, then Mon/Wed/Fri 6 pm', () => {
    const old = [
      { dateISO: '2026-07-01', startedAt: at('2026-07-01', 7) },
      { dateISO: '2026-07-08', startedAt: at('2026-07-08', 7) },
    ];
    const plan = usualTrainingSlot({ sessions: old, todayISO: '2026-10-10', planDaysPerWeek: 4 });
    expect(plan).toEqual({ days: [0, 1, 3, 4], minutes: 18 * 60, from: 'plan' });
    const none = usualTrainingSlot({ sessions: [], todayISO: '2026-10-10', planDaysPerWeek: null });
    expect(none).toEqual({ days: [0, 2, 4], minutes: 18 * 60, from: 'default' });
  });

  it('spreads a plan of N days a week over the week', () => {
    expect(planDaysToWeekdays(1)).toEqual([0]);
    expect(planDaysToWeekdays(2)).toEqual([0, 3]);
    expect(planDaysToWeekdays(3)).toEqual([0, 2, 4]);
    expect(planDaysToWeekdays(5)).toEqual([0, 1, 2, 3, 4]);
    expect(planDaysToWeekdays(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('reminders — weekly repeats that never run out (PH-04)', () => {
  const now = new Date(2026, 9, 8, 9, 0); // Thu 8 Oct 2026, 9:00 am

  it('one weekly repeat per chosen day, at the chosen time', () => {
    const t = reminderTriggers({ days: [0, 2, 4], minutes: 18 * 60 + 15, now, skipToday: false });
    expect(t).toEqual([
      { id: 'forgeai-reminder-w0', kind: 'weekly', weekday: 0, hour: 18, minute: 15 },
      { id: 'forgeai-reminder-w2', kind: 'weekly', weekday: 2, hour: 18, minute: 15 },
      { id: 'forgeai-reminder-w4', kind: 'weekly', weekday: 4, hour: 18, minute: 15 },
    ]);
    // expo-notifications counts weekdays 1 = Sunday … 7 = Saturday.
    expect([0, 1, 2, 3, 4, 5, 6].map(expoWeekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
  });

  it('trained today (or a workout open) before the time: today is skipped, the day still comes back every week (PH-07, HI-17)', () => {
    const t = reminderTriggers({ days: [0, 3], minutes: 18 * 60, now, skipToday: true });
    expect(t[0]).toEqual({ id: 'forgeai-reminder-w0', kind: 'weekly', weekday: 0, hour: 18, minute: 0 });
    // Thursday: no alert today; dated alerts on the next 52 Thursdays (review fix: was 8, which
    // ran out for a phone left unopened that long), until the app turns it back into a weekly
    // repeat once today's time has passed.
    expect(BRIDGE_WEEKS).toBe(52);
    const thu = t.filter((x) => x.kind === 'date');
    expect(thu).toHaveLength(52);
    expect(thu.every((x) => x.kind === 'date' && new Date(x.at).getDay() === 4 && new Date(x.at).getHours() === 18)).toBe(true);
    expect(thu[0].kind === 'date' && new Date(thu[0].at).getDate()).toBe(15);
    // The last one is a year on (Thu 7 Oct 2027), still at 6 pm.
    const last = thu[thu.length - 1];
    expect(last.kind === 'date' && new Date(last.at).toDateString()).toBe(new Date(2027, 9, 7).toDateString());
    expect(new Set(thu.map((x) => x.id)).size).toBe(52);
    expect(t.some((x) => x.id === 'forgeai-reminder-w3')).toBe(false);
  });

  it("skipping matters only while today's time is still ahead", () => {
    const late = new Date(2026, 9, 8, 20, 0);
    const t = reminderTriggers({ days: [3], minutes: 18 * 60, now: late, skipToday: true });
    expect(t).toEqual([{ id: 'forgeai-reminder-w3', kind: 'weekly', weekday: 3, hour: 18, minute: 0 }]);
    expect(reminderTriggers({ days: [], minutes: 600, now, skipToday: false })).toEqual([]);
  });
});

describe('reminders — time zone and clock changes (PH-08)', () => {
  const key = 'w0@18:00|w2@18:00';
  it('sets them again when the offset changed, the plan changed, or one is missing', () => {
    const prev = { offset: -330, key };
    const ids = ['forgeai-reminder-w0', 'forgeai-reminder-w2'];
    expect(needsReschedule(prev, { offset: -330, key }, ids, ids)).toBe(false);
    expect(needsReschedule(prev, { offset: 60, key }, ids, ids)).toBe(true); // India → London
    expect(needsReschedule(prev, { offset: -330, key: 'w0@19:00' }, ids, ids)).toBe(true);
    expect(needsReschedule(prev, { offset: -330, key }, [ids[0]], ids)).toBe(true);
    expect(needsReschedule(null, { offset: -330, key }, ids, ids)).toBe(true);
  });
});

describe('reminders — the time picker and the words (PH-06, PH-01)', () => {
  it('hour and minute move on their own; minutes in 5-minute steps', () => {
    expect(stepReminderHour(18 * 60, -1)).toBe(17 * 60);
    expect(stepReminderHour(0 * 60 + 15, -1)).toBe(23 * 60 + 15);
    expect(stepReminderMinute(18 * 60 + 55, 1)).toBe(18 * 60); // wraps inside the hour
    expect(stepReminderMinute(6 * 60, -1)).toBe(6 * 60 + 55);
    expect(stepReminderMinute(6 * 60 + 12, 1)).toBe(6 * 60 + 15); // snaps to the 5-minute grid
  });

  it('says notifications are off instead of a next time that will never come', () => {
    expect(reminderCaption({ on: true, blocked: true, next: '2026-10-12T18:00', days: 3 })).toBe(
      'Notifications are off for ForgeAI, so no reminder can arrive.',
    );
    expect(reminderCaption({ on: true, blocked: false, next: 'Mon 6:00 pm', days: 3 })).toBe(
      'Next: Mon 6:00 pm. None on a day you already trained or while a workout is open.',
    );
    expect(reminderCaption({ on: true, blocked: false, next: null, days: 0 })).toBe('Pick at least one day.');
  });
});

describe('widgets — the next 7 days of "Today" (PH-02, PH-09)', () => {
  const base = {
    todayISO: '2026-10-10', // Saturday
    today: { routineId: 'r-push', name: 'Push 1', exercises: ['Bench Press', 'Dips'] },
    doneToday: null,
    next: null,
    doneDates: new Set(['2026-10-05', '2026-10-07']),
    goal: 3,
    live: null,
  };

  it('holds 7 days; every later day shows the routine Start starts now, with its id', () => {
    const p = widgetPayload(base);
    expect(p.days.map((d) => d.dateISO)).toEqual([
      '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
    ]);
    expect(p.days.every((d) => d.today.title === 'Push 1' && d.today.action === 'Start' && d.today.routineId === 'r-push')).toBe(true);
    // Monday starts a fresh week — not "Open ForgeAI to update".
    expect(p.days[2].week).toMatchObject({ weekStartISO: '2026-10-12', count: '0 of 3', todayIndex: 0 });
    expect(p.days[2].week.days).toEqual([false, false, false, false, false, false, false]);
    expect(p.days[0].week).toMatchObject({ count: '2 of 3', todayIndex: 5 });
    // After the 7 days the same routine still stands (nothing else moves the rotation).
    expect(p.later.today.title).toBe('Push 1');
    expect(p.later.week.count).toBe('0 of 3');
  });

  it('done today: today says done, tomorrow shows the next routine', () => {
    const p = widgetPayload({ ...base, doneToday: 'Push 1', next: 'Pull 1', today: { routineId: 'r-pull', name: 'Pull 1', exercises: ['Row'] } });
    expect(p.days[0].today).toMatchObject({ title: 'Push 1 done', line: 'Next: Pull 1', action: 'Open' });
    expect(p.days[1].today).toMatchObject({ title: 'Pull 1', action: 'Start', routineId: 'r-pull' });
  });

  it('during a workout the widget says Resume', () => {
    const p = widgetPayload({ ...base, live: { name: 'Push 1' } });
    expect(p.live).toEqual({ title: 'Push 1', line: 'Workout in progress', action: 'Resume' });
  });

  it("matches todayPlan's own answer for each later date (no workout in between)", () => {
    const routines = [
      { id: 'a', name: 'Push 1', dayType: 'push' as const, exerciseIds: ['x'] },
      { id: 'b', name: 'Pull 1', dayType: 'pull' as const, exerciseIds: ['y'] },
    ];
    const sessions = [{ id: 's', dateISO: '2026-10-09', startedAt: at('2026-10-09', 18), dayType: 'push' as const, routineId: 'a', title: null, exerciseIds: ['x'] }];
    const folder = { id: 'f', name: 'Plan', routines };
    const now = todayPlan({ todayISO: '2026-10-10', folder, sessions });
    for (let k = 1; k < 7; k++) {
      const d = todayPlan({ todayISO: iso(new Date(2026, 9, 10 + k)), folder, sessions });
      expect(d.status).toBe('next');
      expect(d.routine?.id).toBe(now.next?.id);
    }
  });
});

describe('the widget link only starts or resumes (PH-09, Phase 0 link rule)', () => {
  it('takes nothing but a routine id', () => {
    expect(routineParam('3f2a-77_b')).toBe('3f2a-77_b');
    expect(routineParam(['abc', 'def'])).toBe('abc');
    expect(routineParam('a b')).toBeNull();
    expect(routineParam('x/../../coach?prompt=hi')).toBeNull();
    expect(routineParam(undefined)).toBeNull();
    expect(routineParam('x'.repeat(81))).toBeNull();
  });

  it('resumes an open workout, starts only a routine that exists, else opens the Workout tab', () => {
    expect(widgetStartAction({ routineId: 'r1', open: true, routineExists: true, tokenOk: true })).toBe('resume');
    expect(widgetStartAction({ routineId: null, open: true, routineExists: false, tokenOk: true })).toBe('resume');
    expect(widgetStartAction({ routineId: 'r1', open: false, routineExists: true, tokenOk: true })).toBe('start');
    expect(widgetStartAction({ routineId: 'gone', open: false, routineExists: false, tokenOk: true })).toBe('tab');
    expect(widgetStartAction({ routineId: null, open: false, routineExists: false, tokenOk: true })).toBe('tab');
  });

  it('review fix: only a link with the widget\'s own key starts by itself (key valid / missing × each state)', () => {
    const cases = [
      // [state, with the key, without it]
      [{ routineId: 'r1', open: true, correcting: false, routineExists: false }, 'resume', 'resume'], // live: harmless
      [{ routineId: 'r1', open: true, correcting: true, routineExists: false }, 'tab', 'tab'], // never into a correction
      [{ routineId: 'r1', open: false, correcting: false, routineExists: true }, 'start', 'confirm'], // one tap without it
      [{ routineId: 'gone', open: false, correcting: false, routineExists: false }, 'tab', 'tab'],
      [{ routineId: null, open: false, correcting: false, routineExists: false }, 'tab', 'tab'],
    ] as const;
    for (const [state, withKey, without] of cases) {
      expect(widgetStartAction({ ...state, tokenOk: true })).toBe(withKey);
      expect(widgetStartAction({ ...state, tokenOk: false })).toBe(without);
    }
  });

  it('review fix: the key matches only exactly, and never when the phone keeps none', () => {
    expect(widgetTokenOk('k-123', 'k-123')).toBe(true);
    expect(widgetTokenOk(['k-123', 'x'], 'k-123')).toBe(true);
    expect(widgetTokenOk('k-12', 'k-123')).toBe(false);
    expect(widgetTokenOk(undefined, 'k-123')).toBe(false);
    expect(widgetTokenOk('', '')).toBe(false);
    expect(widgetTokenOk(undefined, '')).toBe(false);
  });
});

describe('Health Connect — the day’s body weight and the real name (PH-12)', () => {
  const weights = [
    { dateISO: '2024-01-10', weightKg: 90 },
    { dateISO: '2025-06-01', weightKg: 82 },
    { dateISO: '2026-10-01', weightKg: 75 },
  ];

  it('uses the weight logged nearest that day, on or before it; before the first, the first', () => {
    expect(bodyWeightOn('2025-06-01', weights)).toBe(82);
    expect(bodyWeightOn('2025-12-31', weights)).toBe(82);
    expect(bodyWeightOn('2023-05-05', weights)).toBe(90);
    expect(bodyWeightOn('2026-10-09', weights)).toBe(75);
    expect(bodyWeightOn('2026-10-09', [])).toBeNull();
  });

  it('names a record by the workout title, else the routine, else its day', () => {
    expect(healthTitle({ title: ' Leg day PR ', routineName: 'Legs 1', dayType: 'legs' })).toBe('Leg day PR');
    expect(healthTitle({ title: null, routineName: 'Push 1', dayType: 'push' })).toBe('Push 1');
    expect(healthTitle({ title: '', routineName: null, dayType: 'push' })).toBe('Push Day');
  });

  it("an old workout's calories use that day's weight", () => {
    const T = at('2024-03-01', 18);
    const [r] = healthPayload(
      [{ id: 'old', date_iso: '2024-03-01', started_at: T, ended_at: T + 3600_000, day_type: 'push', title: null, routine_name: 'Push 1', sets: 18, cardio: 0 }],
      weights,
    );
    // 60 min × 2.5 MET at 90 kg (not today's 75 kg) = 225 kcal
    expect(r).toEqual({ id: 'old', title: 'Push 1', startMs: T, endMs: T + 3600_000, kcal: 225 });
  });
});

describe('Health Connect — honest send results (PH-03)', () => {
  it('says what really happened', () => {
    expect(sendResultText({ kind: 'sent', sent: 1500, total: 1500 })).toBe('Sent 1,500 workouts to Health Connect.');
    expect(sendResultText({ kind: 'sent', sent: 1, total: 1 })).toBe('Sent 1 workout to Health Connect.');
    expect(sendResultText({ kind: 'failed', sent: 750, total: 1500, reason: 'error' })).toBe(
      'Sent 750 of 1,500 workouts. Health Connect stopped taking them. Try again to send the rest.',
    );
    expect(sendResultText({ kind: 'failed', sent: 0, total: 20, reason: 'access' })).toBe(
      "Couldn't send: ForgeAI isn't allowed to add workouts in Health Connect. Check its access there.",
    );
    expect(sendResultText({ kind: 'failed', sent: 0, total: 20, reason: 'unavailable' })).toBe(
      "Couldn't send: Health Connect isn't available right now.",
    );
    expect(sendResultText({ kind: 'none' })).toBe('No workouts to send yet.');
    expect(sendResultText({ kind: 'demo' })).toBe('Nothing sent. Workouts on demo data are never sent.');
  });
});

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

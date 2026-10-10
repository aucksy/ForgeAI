/**
 * v0.27.0 — around the phone: the calories sent to Health Connect, what goes into a Health
 * Connect record, the reminder times, and what the two home-screen widgets show.
 */
import { describe, expect, it } from 'vitest';

import { activeKcal, endFor, workoutMinutes } from '@/tracker/phone/calories';
import { healthPayload } from '@/tracker/phone/healthConnect';
import { fmtReminderTime, planReminders } from '@/tracker/phone/reminders';
import { widgetData } from '@/tracker/phone/widgets';

const T0 = new Date(2026, 9, 8, 18, 0).getTime(); // Thu 8 Oct 2026, 6:00 pm local

describe('calories (an estimate, by MET)', () => {
  it('a 60-minute weight workout at 75 kg is about 190 active kcal', () => {
    expect(activeKcal({ startedAt: T0, endedAt: T0 + 3600_000, sets: 18, cardioSec: 0 }, 75)).toBe(188);
  });

  it('cardio minutes count more; no body weight logged uses 70 kg', () => {
    const w = { startedAt: T0, endedAt: T0 + 3600_000, sets: 10, cardioSec: 1200 };
    // 40 min strength × 2.5 + 20 min cardio × 6 = 220 MET-min → 220/60 × 70
    expect(activeKcal(w, null)).toBe(257);
  });

  it('a workout with no end time counts 2.5 min a set; one left open counts 3 hours at most', () => {
    expect(workoutMinutes({ startedAt: T0, endedAt: null, sets: 12, cardioSec: 0 })).toBe(30);
    expect(workoutMinutes({ startedAt: T0, endedAt: T0 + 10 * 3600_000, sets: 12, cardioSec: 0 })).toBe(180);
    expect(endFor({ startedAt: T0, endedAt: null, sets: 12, cardioSec: 0 })).toBe(T0 + 30 * 60000);
  });

  it('builds one Health Connect record per workout, named by its day', () => {
    const [r] = healthPayload([{ id: 's1', date_iso: '2026-10-07', started_at: T0, ended_at: T0 + 3600_000, day_type: 'push', sets: 18, cardio: 0 }], [{ dateISO: '2026-10-01', weightKg: 75 }]);
    expect(r).toEqual({ id: 's1', title: 'Push Day', startMs: T0, endMs: T0 + 3600_000, kcal: 188 });
  });
});

describe('workout reminders', () => {
  it('next times on the chosen days, at the chosen time', () => {
    // Mon, Wed, Fri at 7:00 pm, asked on Thursday 6 pm → Fri 9, Mon 12, Wed 14 …
    const t = planReminders({ days: [0, 2, 4], minutes: 19 * 60, now: new Date(T0), trainedToday: false }, 3);
    expect(t.map((ms) => new Date(ms).getDate())).toEqual([9, 12, 14]);
    expect(new Date(t[0]).getHours()).toBe(19);
  });

  it('today counts only if its time is still ahead and nothing was trained today', () => {
    const later = planReminders({ days: [3], minutes: 19 * 60, now: new Date(T0), trainedToday: false }, 1);
    expect(new Date(later[0]).getDate()).toBe(8);
    const trained = planReminders({ days: [3], minutes: 19 * 60, now: new Date(T0), trainedToday: true }, 1);
    expect(new Date(trained[0]).getDate()).toBe(15);
    const passed = planReminders({ days: [3], minutes: 17 * 60, now: new Date(T0), trainedToday: false }, 1);
    expect(new Date(passed[0]).getDate()).toBe(15);
    expect(planReminders({ days: [], minutes: 600, now: new Date(T0), trainedToday: false })).toEqual([]);
  });

  it('shows the time the way people say it', () => {
    expect(fmtReminderTime(18 * 60)).toBe('6:00 pm');
    expect(fmtReminderTime(6 * 60 + 30)).toBe('6:30 am');
    expect(fmtReminderTime(0)).toBe('12:00 am');
  });
});

describe('home-screen widgets', () => {
  const base = { todayISO: '2026-10-08', doneToday: null, doneDates: new Set(['2026-10-05', '2026-10-07']), goal: 4 };

  it('Today: the plan workout, how many exercises and the first one', () => {
    const d = widgetData({ ...base, today: { name: 'Push Day', exercises: ['Bench Press', 'Dips', 'Fly'] } });
    expect(d.today).toEqual({ title: 'Push Day', line: '3 exercises · Bench Press first', action: 'Start' });
    expect(d.dateISO).toBe('2026-10-08');
  });

  it('Today: done once trained, and "No plan yet" without a plan', () => {
    expect(widgetData({ ...base, today: { name: 'Push Day', exercises: ['Bench'] }, doneToday: 'Push Day' }).today.title).toBe('Push Day done');
    expect(widgetData({ ...base, today: null, goal: null }).today.title).toBe('No plan yet');
  });

  it('This week: Monday to Sunday, done days, today, against the plan', () => {
    const d = widgetData({ ...base, today: null });
    expect(d.week.weekStartISO).toBe('2026-10-05');
    expect(d.week.weekEndISO).toBe('2026-10-11');
    expect(d.week.days).toEqual([true, false, true, false, false, false, false]);
    expect(d.week.todayIndex).toBe(3);
    expect(d.week.count).toBe('2 of 4');
    expect(d.week.line).toBe('2 workouts to go');
    expect(widgetData({ ...base, today: null, goal: null }).week.count).toBe('2 workouts');
  });
});

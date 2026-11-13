/**
 * R-484 (13 Nov 2026) — a followed plan with no saved start day (an older backup, the demo
 * data, a plan followed before Phase 4). Its start day used to become TODAY the first time the
 * week line was read, so Up next (which counts only workouts from the start day on) dropped
 * every past workout and restarted at the first routine and "Week 1". Now the start day is the
 * member's first workout of that plan. Pure rule + REAL SQLite (test/helpers/realDb.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { startFromHistory } from '@/tracker/services/planState';
import { bootRealApp, type RealDb } from '../helpers/realDb';

describe('startFromHistory (pure)', () => {
  const routines = [
    { id: 'push', name: 'Push 1' },
    { id: 'pull', name: 'Pull 1' },
  ];
  const s = (dateISO: string, routineId: string | null, title: string | null = null) => ({ dateISO, routineId, title });

  it('the first workout done from one of the plan routines', () => {
    expect(startFromHistory([s('2026-10-20', 'pull'), s('2026-10-05', 'push'), s('2026-11-01', 'push')], routines, '2026-11-13')).toBe('2026-10-05');
  });

  it('an older workout with no routine saved counts by its name (any case, extra spaces)', () => {
    expect(startFromHistory([s('2026-10-20', 'pull'), s('2026-09-01', null, '  push   1 ')], routines, '2026-11-13')).toBe('2026-09-01');
  });

  it('never: another plan\'s routine, an empty workout, an unknown name, a future day', () => {
    const got = startFromHistory(
      [s('2026-08-01', 'other-plan-routine', 'Push 1'), s('2026-08-02', '', 'Push 1'), s('2026-08-03', null, 'Arms'), s('2026-12-01', 'push'), s('2026-10-10', 'pull')],
      routines,
      '2026-11-13',
    );
    expect(got).toBe('2026-10-10');
  });

  it('no workout of the plan → today', () => {
    expect(startFromHistory([], routines, '2026-11-13')).toBe('2026-11-13');
    expect(startFromHistory([s('2026-10-01', null, 'Legs')], routines, '2026-11-13')).toBe('2026-11-13');
  });
});

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
});

let k = 0;
function saved(dateISO: string, routineId: string | null, title: string | null = null): void {
  k += 1;
  db.raw.run(
    "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, source, routine_id, title) VALUES (?, ?, ?, ?, 'full', 'manual', ?, ?)",
    [`r484-${k}`, dateISO, Date.parse(`${dateISO}T10:00:00`) + k, Date.parse(`${dateISO}T11:00:00`) + k, routineId, title],
  );
}

/** A followed Push / Pull / Legs plan whose settings carry NO start day (as an older backup brings back). */
async function oldFollowedPlan(): Promise<{ planId: string; ids: Record<string, string> }> {
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const ex = { exerciseId: bench, sets: 3, repMin: 8, repMax: 12 };
  const planId = await createFolderWithRoutines('PPL', [
    { name: 'Push', dayType: 'push', exercises: [ex] },
    { name: 'Pull', dayType: 'pull', exercises: [ex] },
    { name: 'Legs', dayType: 'legs', exercises: [ex] },
  ]);
  db.raw.run("UPDATE workout_plans SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END, settings = '{}'", [planId]);
  const rows = db.all<{ id: string; name: string }>('SELECT id, name FROM plan_days WHERE plan_id = ?', [planId]);
  return { planId, ids: Object.fromEntries(rows.map((r) => [r.name, r.id])) };
}

describe('R-484: Up next keeps its place when the plan has no saved start day', () => {
  it('the start day comes from the first workout of the plan; Up next and the week follow the history', async () => {
    const { planId, ids } = await oldFollowedPlan();
    const { addDays, todayISO } = await import('@/lib/date');
    const today = todayISO();
    saved(addDays(today, -20), ids.Push);
    saved(addDays(today, -18), ids.Pull);
    saved(addDays(today, -16), ids.Legs);
    saved(addDays(today, -2), ids.Push);

    const { getPlanNow } = await import('@/tracker/services/planState');
    const plan = await getPlanNow(today);
    expect(plan?.week).toBe(3); // 20 days in = week 3, never "Week 1"
    const settings = JSON.parse(db.all<{ settings: string }>('SELECT settings FROM workout_plans WHERE id = ?', [planId])[0].settings);
    expect(settings.startISO).toBe(addDays(today, -20)); // saved once

    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const tp = await getTodayPlan(today);
    expect(tp.following).toBe(true);
    expect(tp.next?.name).toBe('Pull'); // after the last Push — the bug restarted at "Push"
  });

  it('an older workout with no routine saved (only its name) sets the start day too', async () => {
    const { ids } = await oldFollowedPlan();
    const { addDays, todayISO } = await import('@/lib/date');
    const today = todayISO();
    saved(addDays(today, -35), null, 'Push');
    saved(addDays(today, -3), ids.Pull);
    const { getPlanNow } = await import('@/tracker/services/planState');
    expect((await getPlanNow(today))?.week).toBe(6);
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan(today)).next?.name).toBe('Legs');
  });

  it('no workout of the plan yet → its weeks start today (unchanged)', async () => {
    const { planId } = await oldFollowedPlan();
    const { todayISO } = await import('@/lib/date');
    const today = todayISO();
    const { getPlanNow } = await import('@/tracker/services/planState');
    expect((await getPlanNow(today))?.week).toBe(1);
    const settings = JSON.parse(db.all<{ settings: string }>('SELECT settings FROM workout_plans WHERE id = ?', [planId])[0].settings);
    expect(settings.startISO).toBe(today);
  });

  it('a saved start day is never changed', async () => {
    const { planId, ids } = await oldFollowedPlan();
    const { addDays, todayISO } = await import('@/lib/date');
    const today = todayISO();
    db.raw.run('UPDATE workout_plans SET settings = ? WHERE id = ?', [JSON.stringify({ startISO: addDays(today, -7) }), planId]);
    saved(addDays(today, -40), ids.Push);
    const { getPlanNow } = await import('@/tracker/services/planState');
    expect((await getPlanNow(today))?.week).toBe(2);
  });
});

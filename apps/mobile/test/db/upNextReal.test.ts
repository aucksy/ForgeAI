/**
 * Redesign R1 — "Up next" read from REAL SQL (test/helpers/realDb.ts): with no folder followed,
 * the folder of the routine done last decides; the Workout tab, the coach's Today (widgets,
 * reminders, shortcuts) and the store's Start all read the same answer.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

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

function exerciseId(name: string): string {
  const row = db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0];
  if (!row) throw new Error(`exercise not in library: ${name}`);
  return row.id;
}

/** Two folders, neither followed: Upper Lower (first), then Push Pull Legs. */
async function twoFolders(): Promise<Record<string, string>> {
  const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
  const bench = exerciseId('Barbell Bench Press');
  const curl = exerciseId('Dumbbell Curl');
  const ex = (id: string) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 12 });
  await createFolderWithRoutines('Upper Lower', [
    { name: 'Upper', dayType: 'upper', exercises: [ex(bench)] },
    { name: 'Lower', dayType: 'lower', exercises: [ex(curl)] },
  ]);
  await createFolderWithRoutines('Push Pull Legs', [
    { name: 'Push', dayType: 'push', exercises: [ex(bench), ex(curl)] },
    { name: 'Pull', dayType: 'pull', exercises: [ex(curl)] },
    { name: 'Empty', dayType: 'full', exercises: [] },
    { name: 'Legs', dayType: 'legs', exercises: [ex(curl)] },
  ]);
  const rows = db.all<{ id: string; name: string }>('SELECT id, name FROM plan_days');
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

let k = 0;
function saved(dateISO: string, routineId: string | null, title: string | null = null): void {
  k += 1;
  db.raw.run(
    "INSERT INTO workout_sessions (id, date_iso, started_at, ended_at, day_type, source, routine_id, title) VALUES (?, ?, ?, ?, 'full', 'manual', ?, ?)",
    [`w${k}`, dateISO, Date.parse(`${dateISO}T10:00:00`) + k, Date.parse(`${dateISO}T11:00:00`) + k, routineId, title],
  );
}

describe('Up next from the database, no folder followed', () => {
  it('never done a routine → the first routine of the first folder', async () => {
    await twoFolders();
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const tp = await getTodayPlan();
    expect(tp.status).toBe('next');
    expect(tp.next?.name).toBe('Upper');
    expect(tp.folder?.name).toBe('Upper Lower');
    expect(tp.following).toBe(false);
    expect(tp.next?.exercises[0].exercise.name).toBe('Barbell Bench Press');
  });

  it('the folder of the routine done last, the routine after it (empty ones skipped), wrapping', async () => {
    const ids = await twoFolders();
    const { addDays, todayISO } = await import('@/lib/date');
    saved(addDays(todayISO(), -3), ids.Upper);
    saved(addDays(todayISO(), -2), ids.Pull);
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    let tp = await getTodayPlan();
    expect(tp.folder?.name).toBe('Push Pull Legs');
    expect(tp.next?.name).toBe('Legs');
    expect(tp.words.line).toBe('1 exercise from Push Pull Legs');
    saved(addDays(todayISO(), -1), ids.Legs);
    tp = await getTodayPlan();
    expect(tp.next?.name).toBe('Push');
  });

  it('done today → "Done today" and the next routine; an empty workout after it changes nothing', async () => {
    const ids = await twoFolders();
    const { todayISO } = await import('@/lib/date');
    saved(todayISO(), ids.Push, 'Push');
    saved(todayISO(), '');
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const tp = await getTodayPlan();
    expect(tp.status).toBe('doneToday');
    expect(tp.doneToday?.name).toBe('Push');
    expect(tp.next?.name).toBe('Pull');
  });

  it('the last routine workout is found behind more than 30 empty workouts', async () => {
    const ids = await twoFolders();
    const { addDays, todayISO } = await import('@/lib/date');
    saved(addDays(todayISO(), -60), ids.Upper);
    for (let i = 40; i >= 1; i--) saved(addDays(todayISO(), -i), '');
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).next?.name).toBe('Lower');
  });

  it('a followed folder still drives it (rule 1)', async () => {
    const ids = await twoFolders();
    const { addDays, todayISO } = await import('@/lib/date');
    const { followFolder } = await import('@/tracker/db/folderRepo');
    const ppl = db.all<{ id: string }>("SELECT id FROM workout_plans WHERE name = 'Push Pull Legs'")[0].id;
    await followFolder(ppl, todayISO());
    saved(addDays(todayISO(), -1), ids.Upper);
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const tp = await getTodayPlan();
    expect(tp.following).toBe(true);
    expect(tp.next?.name).toBe('Push');
  });

  it('no routines → noPlan', async () => {
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    expect((await getTodayPlan()).status).toBe('noPlan');
  });

  it('the coach’s Today (widgets, reminders, shortcuts) and the store’s Start agree with the card', async () => {
    const ids = await twoFolders();
    const { addDays, todayISO } = await import('@/lib/date');
    saved(addDays(todayISO(), -1), ids.Lower);
    const { getTodayPlan } = await import('@/tracker/services/todayService');
    const { getTodaysWorkout } = await import('@/services/coach');
    const tp = await getTodayPlan();
    expect(tp.next?.name).toBe('Upper');
    const tw = await getTodaysWorkout(undefined, { targets: false });
    expect(tw.planDayId).toBe(ids.Upper);
    expect(tw.today?.nextName).toBe('Upper');
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    await useActiveWorkout.getState().startFromPlan();
    expect(useActiveWorkout.getState().planDayId).toBe(ids.Upper);
  });
});

describe('the one-time notice after the update', () => {
  it('a fresh install never sees it; an upgrade sees it once, until dismissed', async () => {
    const { tabsNoticeDue, dismissTabsNotice, tabsNoticeOnUpgrade } = await import('@/tracker/services/upNextService');
    expect(await tabsNoticeDue()).toBe(false);
    expect(tabsNoticeOnUpgrade(0, 2)).toBe(false);
    expect(tabsNoticeOnUpgrade(1, 2)).toBe(true);
    expect(tabsNoticeOnUpgrade(2, 2)).toBe(false);
    // An install from before the redesign (member schema v1) starting this version.
    db.raw.run("UPDATE meta SET value = '1' WHERE key = 'member_schema_version'");
    const { initMemberSchema } = await import('@/onboarding/db/memberSchema');
    await initMemberSchema();
    expect(await tabsNoticeDue()).toBe(true);
    await dismissTabsNotice();
    expect(await tabsNoticeDue()).toBe(false);
    // The next start-up does not bring it back.
    await initMemberSchema();
    expect(await tabsNoticeDue()).toBe(false);
  });
});

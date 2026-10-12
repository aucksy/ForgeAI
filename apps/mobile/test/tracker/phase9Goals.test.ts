/**
 * Audit Phase 9 (#4) — a weekly goal and workout milestones.
 *  - Weekly goal: "2 / of 4 workouts / 2 to go", then "goal met"; only a whole 1–7 is kept.
 *  - Milestones: 1st, 10th, 25th, 50th, 100th, 250th, 500th, 750th, 1,000th, then every 500;
 *    numbered in the order the workouts were done, never counting the demo's (real SQL).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { weekGoalStat } from '@/tracker/engine/progressTop';
import { isMilestone, milestoneText, ordinal } from '@/tracker/services/milestones';
import { cleanWeeklyGoal, stepWeeklyGoal } from '@/tracker/store/trackerPrefsStore';

import { bootRealApp, type RealDb } from '../helpers/realDb';

describe('weekly goal', () => {
  it('reads how far the week is, and never "-1 to go"', () => {
    expect(weekGoalStat(0, 4)).toEqual({ label: 'of 4 workouts', sub: '4 to go' });
    expect(weekGoalStat(3, 4)).toEqual({ label: 'of 4 workouts', sub: '1 to go' });
    expect(weekGoalStat(4, 4)).toEqual({ label: 'of 4 workouts', sub: 'goal met' });
    expect(weekGoalStat(6, 4)).toEqual({ label: 'of 4 workouts', sub: 'goal met' });
    expect(weekGoalStat(0, 1)).toEqual({ label: 'of 1 workout', sub: '1 to go' });
  });

  it('keeps only a whole 1–7 (anything else is off)', () => {
    for (const n of [1, 4, 7]) expect(cleanWeeklyGoal(n)).toBe(n);
    for (const v of [0, 8, -1, 2.5, NaN, '3', null, undefined]) expect(cleanWeeklyGoal(v)).toBeNull();
  });

  it('[source-text check] Home, Progress and the This week widget use it; Profile sets it', () => {
    const src = (p: string): string => readFileSync(resolve(__dirname, '../../src', p), 'utf8');
    expect(src('components/analytics/WeekCard.tsx')).toContain('weekGoalStat(w.workouts, goal)');
    expect(src('tracker/phone/widgets.ts')).toContain('goal: ownGoal ?? (hasPlan');
    // Oct 2026: a − N + stepper under a "Weekly goal" heading (eight chips wrapped at large text).
    const card = src('tracker/components/WorkoutPrefsCard.tsx');
    expect(card).toMatch(/>\s*Weekly goal\s*</);
    expect(card).toContain('<WeeklyGoalStepper');
    expect(card).not.toContain('ChipGroup');
  });

  it('the stepper walks Off ↔ 1 … 7 and never past either end', () => {
    expect(stepWeeklyGoal(null, 1)).toBe(1);
    expect(stepWeeklyGoal(1, -1)).toBeNull();
    expect(stepWeeklyGoal(null, -1)).toBeNull();
    expect(stepWeeklyGoal(3, 1)).toBe(4);
    expect(stepWeeklyGoal(3, -1)).toBe(2);
    expect(stepWeeklyGoal(7, 1)).toBe(7);
    // Seven taps down from anywhere is Off; three up from Off is 3 (what the phone test does).
    let g: number | null = 5;
    for (let i = 0; i < 7; i++) g = stepWeeklyGoal(g, -1);
    expect(g).toBeNull();
    for (let i = 0; i < 3; i++) g = stepWeeklyGoal(g, 1);
    expect(g).toBe(3);
  });
});

describe('milestones — the words', () => {
  it('marks 1, 10, 25, 50, 100, 250, 500, 750, 1,000, then every 500', () => {
    const hits = Array.from({ length: 3001 }, (_, i) => i).filter(isMilestone);
    expect(hits).toEqual([1, 10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000]);
    expect(isMilestone(2.5)).toBe(false);
  });

  it('says "Your first workout" and "Your 100th workout"; nothing between milestones', () => {
    expect(milestoneText(1)).toBe('Your first workout');
    expect(milestoneText(100)).toBe('Your 100th workout');
    expect(milestoneText(1000)).toMatch(/^Your 1,000th workout$/);
    expect(milestoneText(99)).toBeNull();
    expect(milestoneText(null)).toBeNull();
  });

  it('ordinals: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 101st 111th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  });
});

describe('milestones — the number of a workout (real SQL)', () => {
  let db: RealDb;
  beforeEach(async () => {
    vi.resetModules();
    db = await bootRealApp();
  });

  async function addWorkout(dateISO: string, startedAt: number, id?: string): Promise<string> {
    const repo = await import('@/db/repos/workoutRepo');
    const s = await repo.createSession({ dateISO, dayType: 'full', source: 'manual', startedAt } as Parameters<typeof repo.createSession>[0]);
    if (id) {
      db.raw.run('UPDATE workout_sessions SET id = ? WHERE id = ?', [id, s.id]);
      return id;
    }
    db.raw.run('UPDATE workout_sessions SET started_at = ? WHERE id = ?', [startedAt, s.id]);
    return s.id;
  }

  it('numbers workouts in the order they were done; a ten-workout history marks the 1st and the 10th', async () => {
    db.raw.exec('DELETE FROM set_entries; DELETE FROM workout_sessions');
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await addWorkout(`2026-01-${String(10 + i).padStart(2, '0')}`, Date.UTC(2026, 0, 10 + i, 7)));
    const { workoutNumber, workoutMilestone } = await import('@/tracker/services/milestones');
    expect(await workoutNumber(ids[0])).toBe(1);
    expect(await workoutNumber(ids[4])).toBe(5);
    expect(await workoutMilestone(ids[0])).toBe('Your first workout');
    expect(await workoutMilestone(ids[4])).toBeNull();
    expect(await workoutMilestone(ids[9])).toBe('Your 10th workout');
    // An older workout logged later moves the later numbers, as a member would count them.
    const old = await addWorkout('2025-12-01', Date.UTC(2025, 11, 1, 7));
    expect(await workoutNumber(old)).toBe(1);
    expect(await workoutNumber(ids[9])).toBe(11);
    expect(await workoutNumber('no-such-id')).toBeNull();
  });

  it("the demo's workouts are never counted, and a demo workout has no number", async () => {
    const { loadDemoData, demoSessionIds } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    const demo = [...(await demoSessionIds())];
    expect(demo.length).toBeGreaterThan(10);
    const repo = await import('@/db/repos/workoutRepo');
    const { todayISO, addDays } = await import('@/lib/date');
    const own = await repo.createSession({ dateISO: addDays(todayISO(), 1), dayType: 'push', source: 'manual' });
    const { workoutNumber, workoutMilestone } = await import('@/tracker/services/milestones');
    expect(await workoutNumber(own.id)).toBe(1);
    expect(await workoutMilestone(own.id)).toBe('Your first workout');
    expect(await workoutNumber(demo[0])).toBeNull();
  });
});

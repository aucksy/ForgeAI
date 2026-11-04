/**
 * Launch audit, 3 Nov 2026 (member app #6), against REAL SQL (test/helpers/realDb.ts): the finish
 * screen must never say "Your first workout" and compare with a "Last time" in the same breath.
 *
 * How it could: the milestone line counts only the member's own workouts (the demo's are left out),
 * but the comparison fell back to "the last workout of the same kind", demo workouts included. A
 * member who loaded the demo and then logged their own first push workout got both lines.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;

beforeEach(async () => {
  db = await bootRealApp();
  const { loadDemoData } = await import('@/onboarding/db/dataActions');
  await loadDemoData();
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
});

/** The member's own push workout (today, or `daysAgo` days back): bench 60 kg x 8, three sets. */
async function logOwnPush(daysAgo = 0): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { addDays, todayISO } = await import('@/lib/date');
  const bench = db.all<{ id: string }>("SELECT id FROM exercises WHERE name = 'Barbell Bench Press'")[0].id;
  const after = Number(db.all<{ t: number | null }>('SELECT MAX(started_at) AS t FROM workout_sessions')[0].t ?? 0);
  const s = await createSession({ dateISO: addDays(todayISO(), -daysAgo), dayType: 'push', source: 'manual', startedAt: Math.max(after + 60_000, Date.now()) });
  await addSetsWithMeta(
    s.id,
    [0, 1, 2].map(() => ({ exerciseId: bench, weightKg: 60, reps: 8, isWarmup: false, rpe: null })),
  );
  return s.id;
}

describe('the finish screen after the demo (audit #6)', () => {
  it('the demo holds an earlier push workout (the trap this test is about)', async () => {
    const { todayISO } = await import('@/lib/date');
    expect(db.count('workout_sessions', `day_type = 'push' AND source = 'seed' AND date_iso < '${todayISO()}'`)).toBeGreaterThan(0);
  });

  it('the member\'s own first workout says "Your first workout" and compares with nothing', async () => {
    const id = await logOwnPush();
    const { workoutMilestone } = await import('@/tracker/services/milestones');
    const { getSessionSummary } = await import('@/tracker/services/finishSummary');
    const { getSessionCoachNote } = await import('@/tracker/services/coachNote');
    expect(await workoutMilestone(id)).toBe('Your first workout');
    const data = (await getSessionSummary(id))!;
    const note = await getSessionCoachNote(data);
    expect(note.againstId ?? null).toBeNull();
    expect(note.hero?.tone).toBe('first');
    expect(note.hero?.lastLine ?? null).toBeNull();
    expect(note.text ?? '').not.toMatch(/last time|last push|last workout/i);
  });

  it('the second own workout compares with the first, not with the demo', async () => {
    const first = await logOwnPush(1);
    const second = await logOwnPush();
    const { getSessionSummary } = await import('@/tracker/services/finishSummary');
    const { getSessionCoachNote } = await import('@/tracker/services/coachNote');
    const note = await getSessionCoachNote((await getSessionSummary(second))!);
    expect(note.againstId).toBe(first);
  });
});

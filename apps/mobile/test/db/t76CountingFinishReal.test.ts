/**
 * T76 (owner's full test round, 5 Nov 2026), against REAL SQL (test/helpers/realDb.ts): the finish
 * screen never compares kg lifted across a Counting change (the R-358 family).
 *
 * The owner's Dumbbell Preacher Curl: 22 Oct "Weight as typed" 10 × 15, 10 × 12 (270 kg, counted
 * once); then Counting "One side at a time" and 10 × 13, 10 × 18, 10 × 15 (counted twice: 920 kg).
 * The big card said "+650 kg more than last time" for about the same work; switching back, the
 * other way, said "Lighter than last time" and put a sleep or protein line under it. Now: no
 * comparison (the number to beat next time), and the next workout in the same Counting is
 * compared again (positive control).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootRealApp, type RealDb } from '../helpers/realDb';

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let curl: string;
let clock = Date.now() - 10 * 86_400_000;

beforeEach(async () => {
  db = await bootRealApp();
  const { setDisplayUnits } = await import('@/lib/units');
  setDisplayUnits('metric');
  const { createExercise } = await import('@/db/repos/exerciseRepo');
  curl = (
    await createExercise({
      name: 'Dumbbell Preacher Curl T76',
      aliases: [],
      muscleGroup: 'biceps',
      secondaryMuscles: [],
      equipment: 'dumbbell',
      isCompound: false,
      incrementKg: 2.5,
    })
  ).id;
  clock = Date.now() - 10 * 86_400_000;
});

/** A pull workout `daysAgo` days back with these curl sets (kg, reps). */
async function logPull(daysAgo: number, sets: [number, number][]): Promise<string> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { addDays, todayISO } = await import('@/lib/date');
  clock += 86_400_000;
  const s = await createSession({ dateISO: addDays(todayISO(), -daysAgo), dayType: 'pull', source: 'manual', startedAt: clock });
  await addSetsWithMeta(
    s.id,
    sets.map(([w, r]) => ({ exerciseId: curl, weightKg: w, reps: r, isWarmup: false, rpe: null })),
  );
  return s.id;
}

async function noteOf(id: string) {
  const { getSessionSummary } = await import('@/tracker/services/finishSummary');
  const { getSessionCoachNote } = await import('@/tracker/services/coachNote');
  return getSessionCoachNote((await getSessionSummary(id))!);
}

async function setCounting(mode: 'one' | 'side') {
  const { setExerciseLoadMode } = await import('@/tracker/db/exerciseInfo');
  await setExerciseLoadMode(curl, mode);
}

describe('T76: the finish screen after a Counting change', () => {
  it('as typed, then one side at a time: not compared (no "+... more than last time", no share brag)', async () => {
    await logPull(3, [[10, 15], [10, 12]]);
    await setCounting('side');
    const today = await logPull(2, [[10, 13], [10, 18], [10, 15]]);
    const note = await noteOf(today);
    expect(note.hero?.tone).toBe('first');
    expect(note.hero?.line).toBe('Your number to beat next time.');
    expect(note.hero?.shareLine ?? null).toBeNull();
    expect(note.hero?.lastLine ?? null).toBeNull();
    expect(note.againstId ?? null).toBeNull();
    expect(note.text ?? '').not.toMatch(/more|less|same/i);
  });

  it('switched back (per side, then as typed): never "Lighter than last time" (so no sleep or protein line)', async () => {
    await setCounting('side');
    await logPull(3, [[10, 13], [10, 18], [10, 15]]);
    await setCounting('one');
    const today = await logPull(2, [[10, 15], [10, 12]]);
    const note = await noteOf(today);
    expect(note.hero?.tone).not.toBe('down');
    expect(note.hero?.line ?? '').not.toMatch(/Lighter/);
    expect(note.text ?? '').not.toMatch(/less/i);
  });

  it('positive control: the next workout in the same Counting is compared again', async () => {
    await logPull(4, [[10, 15], [10, 12]]);
    await setCounting('side');
    const first = await logPull(3, [[10, 13], [10, 18], [10, 15]]);
    const second = await logPull(2, [[10, 14], [10, 18], [10, 16]]);
    const note = await noteOf(second);
    expect(note.againstId).toBe(first);
    expect(note.hero?.tone).toBe('up');
    expect(note.hero?.line).toMatch(/more than previous/);
  });

  it('units switched to lb, the same dumbbells typed as shown (22.0 lb for 10 kg): never "Lighter than last time"', async () => {
    const { KG_PER_LB, setDisplayUnits } = await import('@/lib/units');
    await logPull(3, [[10, 10], [10, 10], [10, 10]]);
    setDisplayUnits('imperial');
    const w = 22 * KG_PER_LB;
    const today = await logPull(2, [[w, 10], [w, 10], [w, 10]]);
    const note = await noteOf(today);
    expect(note.hero?.tone).toBe('same');
    expect(note.hero?.line).toBe('Same as previous');
    setDisplayUnits('metric');
  });

  it('positive control: no Counting change at all is compared as before (a real lighter day says so)', async () => {
    const first = await logPull(3, [[10, 15], [10, 12], [10, 12]]);
    const second = await logPull(2, [[10, 8], [10, 8], [10, 8]]);
    const note = await noteOf(second);
    expect(note.againstId).toBe(first);
    expect(note.hero?.tone).toBe('down');
  });
});

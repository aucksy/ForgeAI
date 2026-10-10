/**
 * Phase 4 review round (v0.26.0) — each test fails before its fix and passes after.
 *  HIGH 1  a plan followed before Phase 4 has no start day: easy weeks, the week line and
 *          "Take an easy week now" did nothing on it;
 *  MED 3   Home and the coach showed normal Targets in an easy week;
 *  MED 4   an easy week asked for a longer hold than last time;
 *  MED 5   a new empty folder vanished behind "No routines yet";
 *  MED 6   the PR rebuild after a delete could pick an easy-week workout;
 *  MED 7   a swap in a ready program offered gym kit to a home program;
 *  LOW 8   "Its 1 routine go too."
 * (HIGH 2 is the phone test's own flow; MED 6's finish and edit, and LOW 9, are in
 * phase4ReviewStore.test.ts and sessionEdit.test.ts.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Exercise } from '@/types/models';

const h = vi.hoisted(() => ({
  folder: null as null | { id: string; name: string; following: boolean; source: string | null; settings: Record<string, unknown> },
  writes: [] as { id: string; settings: Record<string, unknown> }[],
  sql: [] as string[],
  rechecked: [] as string[],
}));

const bench: Exercise = { id: 'bench', name: 'Barbell Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
const plan = [{ id: 'pe1', planDayId: 'd1', exerciseId: 'bench', order: 0, targetSets: 4, repRangeMin: 8, repRangeMax: 12, exercise: bench }];

vi.mock('@/lib/date', async (orig) => ({ ...(await orig<typeof import('@/lib/date')>()), todayISO: () => '2026-10-20' }));
vi.mock('@/tracker/db/folderRepo', () => ({
  followedFolder: async () => h.folder,
  folderOfRoutine: async () => h.folder,
  setFolderSettings: async (id: string, settings: Record<string, unknown>) => {
    h.writes.push({ id, settings });
    if (h.folder && h.folder.id === id) h.folder = { ...h.folder, settings };
  },
  getRoutineAnywhere: async (id: string) => (id === 'd1' ? { id: 'd1', exercises: plan } : null),
}));
vi.mock('@/db/repos/planRepo', () => ({ getActivePlan: async () => ({ days: [{ id: 'd1', exercises: plan }] }) }));
vi.mock('@/services/coach', () => ({
  getTodaysWorkout: async () => ({ planDayId: 'd1', dayName: 'Push', dayType: 'push', headline: 'Push day', targets: [{ exerciseId: 'bench' }] }),
}));
// Two workouts at the top of the range: a normal week says "Up" to 62.5 kg.
vi.mock('@/tracker/db/progressionHistory', () => {
  const getProgressionHistory = async () =>
    ['2026-10-16', '2026-10-13'].map((dateISO) => ({
      dateISO,
      sets: [0, 1, 2, 3].map(() => ({ weightKg: 60, reps: 12, rpe: null, setType: 'normal' as const })),
    }));
  // Audit Phase 8: the Targets read every lift's history in one go.
  return {
    getProgressionHistory,
    getProgressionHistoryMany: async (reqs: unknown[]) => Promise.all(reqs.map(() => getProgressionHistory())),
    getWeightLadders: async () => new Map(),
  };
});
vi.mock('@/tracker/db/exerciseInfo', () => ({
  getExerciseIdsByCatalogKey: async () => new Map(),
  getTrackerExercisesByIds: async () =>
    new Map([['bench', { id: 'bench', catalogKey: 'barbell_bench_press', logType: 'weight_reps', loadMode: 'one', muscles: { primary: ['chest'], secondary: [] } }]]),
}));
vi.mock('@/db/repos/userRepo', () => ({ getProfile: async () => ({ experience: 'intermediate' }) }));
vi.mock('@/db', () => ({
  getDb: () => ({
    getFirstAsync: async (sql: string) => {
      h.sql.push(sql);
      return sql.includes('weight_kg DESC') ? { session_id: 'heavy' } : { session_id: 'e1rm' };
    },
    getAllAsync: async () => [],
    runAsync: async () => undefined,
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('@/db/repos/prRepo', () => ({ E1RM_SQL: 'CASE WHEN se.reps = 1 THEN se.weight_kg ELSE se.weight_kg * (1 + se.reps / 30.0) END', checkAndRecordPrs: async (id: string) => void h.rechecked.push(id) }));
vi.mock('@/db/repos/workoutRepo', () => ({ deleteSession: async () => undefined }));

const planState = await import('@/tracker/services/planState');
const { getTodaysWorkoutWithTargets } = await import('@/tracker/services/coachTargets');
const { computeProgressionTarget, targetLine, toEasyTarget } = await import('@/tracker/engine/progression');
const { EASY_REASON, easySets } = await import('@/tracker/plans/easyWeek');
const { swapContextFor } = await import('@/tracker/services/plansService');
const { reconcilePrsForExercises } = await import('@/tracker/services/prRebuild');

const oldPlan = () => ({ id: 'mine', name: 'My Routines', following: true, source: null, settings: {} as Record<string, unknown> });

beforeEach(() => {
  h.folder = oldPlan();
  h.writes = [];
  h.sql = [];
  h.rechecked = [];
});

describe('HIGH 1 — a plan from before Phase 4 gets weeks', () => {
  it('its weeks start the first time the app reads it (before: no week, ever)', async () => {
    const now = await planState.getPlanNow();
    expect(now?.week).toBe(1);
    expect(h.writes).toEqual([{ id: 'mine', settings: { startISO: '2026-10-20' } }]);
    // Read again: the saved start day is used, nothing is written twice.
    await planState.getPlanNow();
    expect(h.writes).toHaveLength(1);
  });

  it('turning easy weeks on starts its weeks too', async () => {
    await planState.setEasyWeeks(h.folder!, true);
    expect(h.writes.at(-1)?.settings).toEqual({ startISO: '2026-10-20', easy: { every: 6, base: 0 } });
  });

  it('"Take an easy week now" works on it (before: it did nothing)', async () => {
    h.folder = { ...oldPlan(), settings: { easy: { every: 6, base: 0 } } };
    await planState.moveEasyWeek(h.folder, 'now');
    const s = h.writes.at(-1)?.settings;
    expect(s?.startISO).toBe('2026-10-20');
    expect(planState.planNowOf({ ...h.folder, settings: s as never }, '2026-10-20')?.easy).toBe(true);
  });
});

describe('MED 3 — Home and the coach in an easy week', () => {
  it('say the same easy Target as the workout screen (before: "Up" and every set)', async () => {
    h.folder = { ...oldPlan(), settings: { startISO: '2026-10-01', easy: { every: 6, base: 0 }, easyOnce: 3 } };
    const tw = await getTodaysWorkoutWithTargets();
    expect(tw.targets[0].easy).toBe(true);
    expect(targetLine(tw.targets[0])).toBe('Easy week · 60 kg · 2 sets');
  });

  it('and the normal Target in a normal week', async () => {
    h.folder = { ...oldPlan(), settings: { startISO: '2026-10-01', easy: { every: 6, base: 0 } } };
    const tw = await getTodaysWorkoutWithTargets();
    expect(tw.targets[0].easy).toBeUndefined();
    expect(tw.targets[0].change).toBe('up');
  });
});

describe('MED 4 — an easy-week hold', () => {
  it("keeps last time's hold (before: last time + 5 s)", () => {
    const plank: Exercise = { ...bench, id: 'plank', name: 'Plank', equipment: 'bodyweight', isCompound: false };
    const holds = (dateISO: string, s: number) => ({ dateISO, sets: [0, 1, 2].map(() => ({ weightKg: 0, reps: 0, rpe: null, setType: 'normal' as const, durationSec: s })) });
    const t = computeProgressionTarget({
      exercise: plank,
      target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 },
      history: [holds('2026-10-16', 40), holds('2026-10-13', 35)],
      todayISO: '2026-10-20',
      logType: 'time',
    });
    expect(t.holdSec).toBe(45);
    const easy = toEasyTarget(t, EASY_REASON, easySets);
    expect(easy.holdSec).toBe(40);
    expect(targetLine(easy)).toBe('Easy week · Hold 40 s · 2 sets');
  });
});

describe('MED 5 / LOW 8 — the Routines screen', () => {
  it('"No routines yet" only when there is no folder at all (before: a new empty folder vanished)', () => {
    expect(planState.showNoRoutinesYet([])).toBe(true);
    expect(planState.showNoRoutinesYet([{ routines: [], following: false }])).toBe(false);
  });

  it('the delete question counts right (before: "Its 1 routine go too.")', () => {
    expect(planState.deleteFolderMessage(1, false)).toBe('Its routine goes too. Your workout history stays.');
    expect(planState.deleteFolderMessage(3, true)).toBe("Its 3 routines go too. Your workout history stays. Today's workout will have no plan until you follow another folder.");
    expect(planState.deleteFolderMessage(0, false)).toBe('It has no routines. Your workout history stays.');
  });
});

describe('MED 6 — the PR rebuild after a delete', () => {
  it('never picks an easy-week workout to record a PR from', async () => {
    await reconcilePrsForExercises(['bench']);
    expect(h.sql).toHaveLength(2);
    for (const q of h.sql) expect(q).toContain('COALESCE(ws.easy_week, 0) = 0');
    expect(h.rechecked).toEqual(['heavy', 'e1rm']);
  });
});

describe('MED 7 — a swap in a ready program', () => {
  it("keeps to the program's kit (before: a home program was offered a barbell)", async () => {
    h.folder = { ...oldPlan(), source: 'program', settings: { program: 'home_full_body_beginner' } };
    expect((await swapContextFor('d1')).equipment).toBe('bar');
    h.folder = { ...oldPlan(), source: 'program', settings: { program: 'db_full_body_beginner' } };
    expect((await swapContextFor('d1')).equipment).toBe('dumbbells_bench');
    h.folder = { ...oldPlan(), source: 'program', settings: { program: 'gym_ppl_advanced' } };
    expect((await swapContextFor('d1')).equipment).toBe('gym');
  });
});

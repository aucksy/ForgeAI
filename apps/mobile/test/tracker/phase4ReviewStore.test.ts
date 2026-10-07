/**
 * Phase 4 review round (v0.26.0), the live workout's store — each test fails before its fix.
 *  MED 6  finishing an easy-week workout left its rows in the frozen PR log, so Home's PR
 *         count, the strength score and the coach counted a record the app says it isn't;
 *  LOW 9  "Swap exercise" in an easy week brought back last time's full set count.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] as { sql: string; params?: unknown[] }[] }));

vi.mock('@/db', () => ({
  getDb: () => ({
    runAsync: async (sql: string, params?: unknown[]) => void h.calls.push({ sql, params }),
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('@/db/repos/workoutRepo', () => ({ createSession: async () => ({ id: 'sess-1' }) }));
vi.mock('@/tracker/db/trackerSets', () => ({ addSetsWithMeta: async () => [], getSessionSetMeta: async () => new Map() }));
// Last time: 4 working sets.
vi.mock('@/tracker/db/exerciseHistory', () => ({
  getBoundedExerciseHistory: async () => [
    {
      sessionId: 'old',
      dateISO: '2026-10-10',
      volumeKg: 0,
      sets: [0, 1, 2, 3].map((i) => ({ id: `s${i}`, sessionId: 'old', exerciseId: 'row', setNumber: i + 1, weightKg: 50, reps: 10, isWarmup: false })),
    },
  ],
}));
vi.mock('@/tracker/db/exercisePrefs', () => ({
  getCarriedNote: async () => null,
  getExerciseRestSec: async () => null,
  getPriorBests: async () => null,
  setExerciseRestSec: async () => undefined,
}));
vi.mock('@/tracker/db/exerciseInfo', () => ({
  getTrackerExercise: async () => null,
  getTrackerExercisesByIds: async () => new Map(),
}));
vi.mock('@/lib/uuid', () => {
  let n = 0;
  return { uuid: () => `u${++n}` };
});

const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
type DraftExercise = import('@/tracker/store/activeWorkoutStore').DraftExercise;

const card = (sets: { done: boolean }[]): DraftExercise => ({
  key: 'bench-card',
  exerciseId: 'bench',
  name: 'Bench',
  muscleGroup: 'chest',
  equipment: 'barbell',
  previousSets: [],
  sets: sets.map((s, i) => ({ key: `k${i}`, weightKg: 60, reps: 8, isWarmup: false, done: s.done })),
});

const start = (easyWeek: boolean, exercises: DraftExercise[]) =>
  useActiveWorkout.setState({
    active: true,
    hydrated: true,
    committing: false,
    editingSessionId: null,
    startedAt: Date.parse('2026-10-20T07:00:00'),
    dayType: 'push',
    planDayId: 'd1',
    easyWeek,
    exercises,
  });

beforeEach(() => {
  h.calls = [];
});

describe('MED 6 — finishing an easy-week workout', () => {
  it('marks it and takes its rows out of the frozen PR log', async () => {
    start(true, [card([{ done: true }, { done: true }])]);
    expect(await useActiveWorkout.getState().finish(null)).toBe('sess-1');
    const sql = h.calls.map((c) => c.sql);
    expect(sql).toContain('UPDATE workout_sessions SET easy_week = 1 WHERE id = ?');
    const del = h.calls.find((c) => c.sql === 'DELETE FROM personal_records WHERE session_id = ?');
    expect(del?.params).toEqual(['sess-1']);
  });

  it('a normal workout keeps its PR rows', async () => {
    start(false, [card([{ done: true }])]);
    await useActiveWorkout.getState().finish(null);
    expect(h.calls.some((c) => c.sql.includes('personal_records'))).toBe(false);
  });
});

describe('LOW 9 — "Swap exercise" in an easy week', () => {
  it('keeps the easy set count (before: last time\'s 4 sets came back)', async () => {
    start(true, [card([{ done: false }, { done: false }])]);
    const ok = await useActiveWorkout.getState().swapExercise('bench-card', {
      id: 'row',
      name: 'Barbell Row',
      aliases: [],
      muscleGroup: 'back',
      secondaryMuscles: [],
      equipment: 'barbell',
      isCompound: true,
      incrementKg: 2.5,
    });
    expect(ok).toBe(true);
    const swapped = useActiveWorkout.getState().exercises[0];
    expect(swapped.exerciseId).toBe('row');
    expect(swapped.sets).toHaveLength(2);
  });

  it('in a normal week a swap still offers last time\'s rows', async () => {
    start(false, [card([{ done: false }, { done: false }])]);
    await useActiveWorkout.getState().swapExercise('bench-card', {
      id: 'row',
      name: 'Barbell Row',
      aliases: [],
      muscleGroup: 'back',
      secondaryMuscles: [],
      equipment: 'barbell',
      isCompound: true,
      incrementKg: 2.5,
    });
    expect(useActiveWorkout.getState().exercises[0].sets).toHaveLength(4);
  });
});

/**
 * Phase 2 review — the Hevy import's write path, against a recording fake database.
 *
 *  - A fresh phone imports the owner's file: a library dumbbell exercise nobody has logged
 *    takes "weight as typed" (else every dumbbell set would count both dumbbells and the
 *    file would read differently than on an upgraded phone).
 *  - The Merge backfill of timed rows that older versions dropped runs once: a later Merge
 *    never brings back timed sets the member deleted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as { sql: string; params?: unknown[] }[],
  meta: new Map<string, string>(),
  library: [] as { id: string; name: string; catalog_key: string | null; log_type: string | null; load_mode: string | null }[],
  sessions: [] as { id: string; startedAt: number }[],
  present: [] as { exercise_id: string }[],
  added: [] as { sessionId: string; sets: { exerciseId: string; loadMode?: string | null }[] }[],
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    runAsync: async (sql: string, params?: unknown[]) => {
      h.calls.push({ sql, params });
      return { changes: 1, lastInsertRowId: 0 };
    },
    getAllAsync: async (sql: string) => {
      if (sql.includes('FROM exercises')) return h.library;
      if (sql.includes('GROUP BY exercise_id')) return [];
      if (sql.includes('DISTINCT exercise_id')) return h.present;
      return [];
    },
  }),
  getMeta: async (k: string) => h.meta.get(k) ?? null,
  setMeta: async (k: string, v: string) => {
    h.meta.set(k, v);
  },
}));
vi.mock('@/db/repos/workoutRepo', () => ({
  getSessionsBetween: async () => h.sessions,
  deleteSession: async () => undefined,
  createSession: async () => ({ id: `s${h.added.length + 1}` }),
}));
vi.mock('@/db/repos/exerciseRepo', () => ({
  createExercise: async (input: { name: string }) => ({ id: `new-${input.name}`, name: input.name }),
}));
vi.mock('@/tracker/db/trackerSets', () => ({
  addSetsWithMeta: async (sessionId: string, sets: { exerciseId: string; loadMode?: string | null }[]) => {
    h.added.push({ sessionId, sets });
    return [];
  },
}));

const { runImport } = await import('@/tracker/services/hevyImport');

const set = (weightKg: number, reps: number, durationSec: number | null = null) => ({
  weightKg,
  reps,
  isWarmup: false,
  setType: 'normal' as const,
  rpe: null,
  setIndex: 0,
  durationSec,
  distanceM: null,
});
const workout = (startedAt: number, exercises: { title: string; sets: ReturnType<typeof set>[] }[]) => ({
  title: 'Shoulders',
  dayType: 'push' as const,
  startedAt,
  endedAt: startedAt + 3_600_000,
  dateISO: '2026-07-01',
  exercises: exercises.map((e) => ({ ...e, supersetId: null, note: null })),
});
const parsed = (workouts: ReturnType<typeof workout>[]) => ({
  workouts,
  distinctExerciseTitles: [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.title)))],
  skippedRows: 0,
  totalSetRows: 0,
  timedRows: 0,
});

beforeEach(() => {
  h.calls = [];
  h.meta.clear();
  h.added = [];
  h.sessions = [];
  h.present = [];
  h.library = [
    { id: 'lat', name: 'Lateral Raise', catalog_key: 'lateral_raise', log_type: 'weight_reps', load_mode: null },
    { id: 'plank', name: 'Plank', catalog_key: 'plank', log_type: 'time', load_mode: null },
  ];
});

describe('fresh phone + the owner\'s Hevy file', () => {
  it('the library\'s Lateral Raise (counts "each") takes "weight as typed" before its history goes in', async () => {
    await runImport(parsed([workout(1, [{ title: 'Lateral Raise (Dumbbell)', sets: [set(10, 12)] }])]), { mode: 'merge' });
    const freeze = h.calls.find((c) => c.sql.includes("SET load_mode = 'one'"));
    expect(freeze?.params).toEqual(['lat']);
    // Audit Phase 8: new workouts go in through the import's own multi-row INSERT (every column
    // at once), not addSetsWithMeta — read the set's load_mode column from it.
    const { SET_COLS } = await import('@/tracker/db/importWrite');
    const insert = h.calls.find((c) => c.sql.startsWith('INSERT INTO set_entries'));
    expect(insert).toBeTruthy();
    expect(insert?.params?.[SET_COLS.indexOf('load_mode')]).toBeNull(); // follows the exercise, now "as typed"
    expect(insert?.params?.[SET_COLS.indexOf('exercise_id')]).toBe('lat');
  });
});

describe('the Merge backfill of timed rows runs once', () => {
  const file = parsed([workout(5, [{ title: 'Plank', sets: [set(0, 0, 45)] }])]);
  it('first Phase 2 Merge over an older import adds the plank rows it had dropped', async () => {
    h.sessions = [{ id: 'old', startedAt: 5 }];
    const r = await runImport(file, { mode: 'merge' });
    expect(r.backfilledSets).toBe(1);
    // Phase 6 review fix: that earlier import is named for Health Connect to send again.
    expect(r.extendedSessionIds).toEqual(['old']);
    expect(r.createdSessionIds).toEqual([]);
  });
  it('a later Merge does not bring back plank sets the member deleted', async () => {
    h.sessions = [{ id: 'old', startedAt: 5 }];
    await runImport(file, { mode: 'merge' });
    const again = await runImport(file, { mode: 'merge' });
    expect(again.backfilledSets).toBe(0);
    expect(again.extendedSessionIds).toEqual([]);
  });
});

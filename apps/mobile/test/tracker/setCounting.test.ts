/**
 * Phase 2 review — changing an exercise's "Counting" must not re-read its history.
 * Each set can carry the counting it was logged with; the volume rule honours it, and
 * switching the exercise's counting stamps the old way on its sets first.
 */
import { describe, expect, it, vi } from 'vitest';

import { setVolumeKg } from '@/tracker/engine/volume';

const h = vi.hoisted(() => ({ calls: [] as { sql: string; params?: unknown[] }[] }));
vi.mock('@/db', () => ({
  getDb: () => ({
    // The switch is one queued transaction now (DS-04); the fake just runs it.
    withTransactionAsync: async (task: () => Promise<void>) => task(),
    runAsync: async (sql: string, params?: unknown[]) => {
      h.calls.push({ sql, params });
      return { changes: 0, lastInsertRowId: 0 };
    },
    getFirstAsync: async () => ({
      id: 'db1',
      name: 'Dumbbell Bench Press',
      aliases: '[]',
      muscle_group: 'chest',
      secondary_muscles: '[]',
      equipment: 'dumbbell',
      is_compound: 1,
      increment_kg: 2.5,
      catalog_key: 'dumbbell_bench_press',
      log_type: 'weight_reps',
      load_mode: 'one', // logged "weight as typed" so far
      bw_share: null,
      muscles: null,
      media_uri: null,
      media_type: null,
    }),
  }),
}));

const { applyVolume } = await import('@/tracker/services/volumeService');
const { setExerciseLoadMode } = await import('@/tracker/db/exerciseInfo');

const both = { logType: 'weight_reps' as const, loadMode: 'both' as const, bwShare: 0 };

describe('a set keeps the counting it was logged with', () => {
  it('25 kg × 10 typed as one number reads 250 even after the exercise switched to "two dumbbells"', () => {
    expect(setVolumeKg({ weightKg: 25, reps: 10, isWarmup: false, loadMode: 'one' }, both, null)).toBe(250);
    expect(setVolumeKg({ weightKg: 25, reps: 10, isWarmup: false }, both, null)).toBe(500);
  });
  it('session volume uses each set\'s own counting', () => {
    const detail = {
      id: 's',
      dateISO: '2026-10-01',
      startedAt: 0,
      endedAt: 1,
      dayType: 'push' as const,
      notes: null,
      source: 'manual' as const,
      totalVolumeKg: 0,
      exercises: [
        {
          exercise: { id: 'db1', name: 'Dumbbell Bench Press', aliases: [], muscleGroup: 'chest' as const, secondaryMuscles: [], equipment: 'dumbbell' as const, isCompound: true, incrementKg: 2.5 },
          volumeKg: 0,
          sets: [
            { id: 'old', sessionId: 's', exerciseId: 'db1', setNumber: 1, weightKg: 25, reps: 10, isWarmup: false },
            { id: 'new', sessionId: 's', exerciseId: 'db1', setNumber: 2, weightKg: 25, reps: 10, isWarmup: false },
          ],
        },
      ],
    };
    const ctx = {
      bw: [],
      exercises: new Map([['db1', { id: 'db1', logType: 'weight_reps', loadMode: 'both', bwShare: 0 } as never]]),
      setModes: new Map([['old', 'one' as const]]),
    };
    expect(applyVolume(detail, ctx).totalVolumeKg).toBe(250 + 500);
  });
});

describe('switching Counting stamps the old way on past sets first', () => {
  it('UPDATE set_entries (old counting, only unstamped sets) runs before the exercise changes', async () => {
    h.calls = [];
    await setExerciseLoadMode('db1', 'both');
    expect(h.calls.map((c) => c.sql.replace(/\s+/g, ' ').trim())).toEqual([
      'UPDATE set_entries SET load_mode = ? WHERE exercise_id = ? AND load_mode IS NULL',
      'UPDATE exercises SET load_mode = ? WHERE id = ?',
    ]);
    expect(h.calls[0].params).toEqual(['one', 'db1']);
    expect(h.calls[1].params).toEqual(['both', 'db1']);
  });
  it('choosing the same counting again stamps nothing', async () => {
    h.calls = [];
    await setExerciseLoadMode('db1', 'one');
    expect(h.calls).toHaveLength(1);
  });
});

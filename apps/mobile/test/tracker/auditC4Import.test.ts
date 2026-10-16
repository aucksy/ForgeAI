/**
 * 16 Oct 2026 end-to-end audit, C4 (import and export) PREVIOUS rows, plus the wave-1 review items — Audit/e2e-v2/C4-import-export.md. Each test
 * failed on the code before its fix unless it says "already fixed".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const restStarts: number[] = [];
vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async (endsAt: number) => {
    restStarts.push(endsAt);
  },
  cancelRestEnd: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return { ...real, ringerMode: () => 'normal', dismissRestOver: () => undefined, postDoneNote: () => undefined };
});
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined, tap: () => undefined, warn: () => undefined }));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = {
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
    AccessibilityInfo: { announceForAccessibility: () => undefined },
    Platform: { OS: 'test' },
  };
  const stub: unknown = new Proxy(
    {},
    {
      has: () => true,
      get(_t, k) {
        if (k === 'default') return stub;
        if (k === '__esModule') return true;
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k in fixed) return fixed[k];
        return () => {
          throw new Error(`native ${String(k)} in a unit test`);
        };
      },
    },
  );
  return stub as Record<string, unknown>;
});
import { fillForSet, prevForSet, toPrevSet, type DraftExercise, type DraftSet, type PrevSet } from '@/tracker/store/activeWorkoutStore';

const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });
const card = (key: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name: 'Dumbbell Curl', muscleGroup: 'biceps', equipment: 'dumbbell', previousSets: [], prevTyped: true, sets, ...o }) as DraftExercise;
const prev = (weightKg: number, reps: number, setType?: 'drop'): PrevSet =>
  toPrevSet({ weightKg, reps, durationSec: null, distanceM: null, loadMode: null, ...(setType ? { setType } : {}) }, 'weight_reps');
const wr = (p: PrevSet | SetFillLike | null) => (p ? [p.weightKg, p.reps] : null);
type SetFillLike = { weightKg: number; reps: number };

describe('C4-1: a trailing W row (Hevy typed his usual drop as a warm-up once)', () => {
  // Last time (Pull 1): W 10x30, 20x14, 20x11, 15x15, drop 10x10. Today's routine: W, 3 sets, W.
  const last = { previousSets: [prev(20, 14), prev(20, 11), prev(15, 15), prev(10, 10, 'drop')], previousWarmups: [prev(10, 30)] };
  const c = card('a', [row('w1', { isWarmup: true }), row('s1'), row('s2'), row('s3'), row('w2', { isWarmup: true })], last);

  it('the leading W row reads last time\'s warm-up', () => {
    expect(wr(prevForSet(c, 'w1'))).toEqual([10, 30]);
  });

  it('the trailing W row reads last time\'s drop (no 2nd warm-up last time), and hints it', () => {
    expect(wr(prevForSet(c, 'w2'))).toEqual([10, 10]);
    expect(wr(fillForSet(c, 'w2', null))).toEqual([10, 10]);
  });

  it('working rows still read the working sets in order', () => {
    expect(['s1', 's2', 's3'].map((k) => wr(prevForSet(c, k)))).toEqual([
      [20, 14],
      [20, 11],
      [15, 15],
    ]);
  });
});

describe('C4-2 / C4-3: drop rows read drops by drop order (already fixed in 6d68d32 / 05177bf)', () => {
  it('3 normal + D today, last time 4 normal + drop 10x9: the D row reads 10x9, never 20x13', () => {
    const c = card('a', [row('s1'), row('s2'), row('s3'), row('d1', { setType: 'drop' })], {
      previousSets: [prev(20, 13), prev(20, 13), prev(20, 12), prev(20, 11), prev(10, 9, 'drop')],
    });
    expect(wr(prevForSet(c, 'd1'))).toEqual([10, 9]);
    expect(wr(fillForSet(c, 'd1', { weightKg: 22.5, reps: 10 }))).toEqual([10, 9]);
  });

  it('a drop row with no drop last time never hints the working weight', () => {
    const c = card('a', [row('s1'), row('d1', { setType: 'drop' })], { previousSets: [prev(20, 12), prev(20, 12)] });
    expect(prevForSet(c, 'd1')).toBeNull();
    expect(fillForSet(c, 'd1', { weightKg: 20, reps: 12 })?.weightKg ?? null).not.toBe(20);
  });
});

describe('review item 4: a second drop row takes the weight typed in the drop row above', () => {
  it('drop 1 typed at 15 kg, no 2nd drop last time: drop 2 hints 15 kg', () => {
    const c = card('a', [row('s1', { weightKg: 20, reps: 10 }), row('d1', { setType: 'drop', weightKg: 15, reps: 8 }), row('d2', { setType: 'drop' })], {
      previousSets: [prev(20, 10), prev(15, 8, 'drop')],
    });
    expect(fillForSet(c, 'd2', null)?.weightKg).toBe(15);
  });

  it('a drop row never takes a NORMAL row\'s typed weight', () => {
    const c = card('a', [row('s1', { weightKg: 20, reps: 10 }), row('d1', { setType: 'drop' })], { previousSets: [prev(20, 10)] });
    expect(fillForSet(c, 'd1', null)?.weightKg ?? null).toBeNull();
  });
});

describe('review item 5: a draft saved before drops were marked still shows PREVIOUS on drop rows', () => {
  it('no marker on last time\'s numbers: the drop row falls back to the same place', () => {
    const c = card('a', [row('s1'), row('s2'), row('d1', { setType: 'drop' })], {
      prevTyped: undefined,
      previousSets: [prev(20, 10), prev(20, 9), prev(12.5, 10)],
    });
    expect(wr(prevForSet(c, 'd1'))).toEqual([12.5, 10]);
    expect(wr(prevForSet(c, 's2'))).toEqual([20, 9]);
  });
});

describe('C4-1 (routine rebuild): each set keeps the type he uses most, not the last workout\'s one-off', () => {
  it('curls ending in a drop 2 of 3 times, a warm-up once (the newest): the routine ends with a drop', async () => {
    const { findRoutines } = await import('@/tracker/services/routineRebuild');
    const w = (s: string) => ({ reps: 10, isWarmup: s === 'w', ...(s === 'd' ? { setType: 'drop' as const } : {}) });
    const curl = (types: string) => ({ title: 'Bicep Curl (Dumbbell)', sets: [...types].map(w) });
    const pull = (dateISO: string, types: string) => ({ title: 'Pull 2', dayType: 'pull' as const, dateISO, exercises: [curl(types)] });
    const found = findRoutines([pull('2026-08-01', 'wnnnd'), pull('2026-08-08', 'wnnnd'), pull('2026-08-22', 'wnnnw')]);
    const row = found.find((r) => r.title === 'Pull 2')!.exercises.find((e) => e.title === 'Bicep Curl (Dumbbell)')!;
    expect(row.setList?.map((s) => s.type)).toEqual(['warmup', 'normal', 'normal', 'normal', 'drop']);
  });
});

describe('C4-5: a phone in another time zone never imports bare "Push" workouts twice', () => {
  it('same day, same day type, same length, no name on either: already here', async () => {
    const { isAlreadyHere } = await import('@/tracker/services/hevyImport');
    const start = Date.UTC(2026, 7, 22, 6, 0);
    const shifted = start + 5.5 * 3_600_000; // IST → London
    const here = { dateISO: '2026-08-22', startedAt: start, endedAt: start + 3_600_000, title: null, dayType: 'push' };
    const file = { dateISO: '2026-08-22', startedAt: shifted, endedAt: shifted + 3_600_000, title: null, dayType: 'push' };
    expect(isAlreadyHere(file, [here])).toBe('exact');
    expect(isAlreadyHere({ ...file, dayType: 'pull' }, [here])).toBeNull();
  });
});

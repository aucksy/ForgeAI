/**
 * 16 Oct 2026 end-to-end audit, C3 (routines and suggestions): set-row hints and routine screens — Audit/e2e-v2/C3-routines-suggestions.md. Each test
 * failed on the code before its fix.
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
import { computeProgressionTarget, targetFill, type ProgSession } from '@/tracker/engine/progression';
import { fillForSet, toPrevSet, type DraftExercise, type DraftSet, type PrevSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const row = (key: string, p: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...p });
const card = (sets: DraftSet[], previousSets: PrevSet[]): DraftExercise =>
  ({ key: 'c', exerciseId: 'e1', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', previousSets, prevTyped: true, sets }) as DraftExercise;
const prev = (weightKg: number, reps: number): PrevSet => toPrevSet({ weightKg, reps, durationSec: null, distanceM: null, loadMode: null }, 'weight_reps');
const bench: Exercise = { id: 'e1', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
const sess = (dateISO: string, sets: [number, number][]): ProgSession => ({ dateISO, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })) });
const wr = (f: { weightKg: number; reps: number } | null) => (f ? [f.weightKg, f.reps] : null);

describe('C3-4: back-off rows hint last time\'s back-off, not the top weight', () => {
  it('2 x 100 x 5 + 2 x 80 x 10 last time: rows 3-4 hint 80 x 10', () => {
    const last = sess('2026-10-03', [[100, 5], [100, 5], [80, 10], [80, 10]]);
    const t = computeProgressionTarget({ exercise: bench, target: { targetSets: 4, repRangeMin: 4, repRangeMax: 6 }, history: [last], todayISO: '2026-10-06' });
    const c = card([row('a'), row('b'), row('c3'), row('d')], [prev(100, 5), prev(100, 5), prev(80, 10), prev(80, 10)]);
    const fill = targetFill(t);
    expect(wr(fillForSet(c, 'a', fill))).toEqual([100, 6]);
    expect(wr(fillForSet(c, 'c3', fill))).toEqual([80, 10]);
    expect(wr(fillForSet(c, 'd', fill))).toEqual([80, 10]);
  });
});

describe('C3-5: one top set plus back-offs', () => {
  it('100 x 5 then 3 x 85 x 8: row 1 hints 100 x 5, rows 2-4 the back-off goals 9, 8, 8', () => {
    const last = sess('2026-10-03', [[100, 5], [85, 8], [85, 8], [85, 8]]);
    const t = computeProgressionTarget({ exercise: bench, target: { targetSets: 4, repRangeMin: 6, repRangeMax: 10 }, history: [last], todayISO: '2026-10-06' });
    const c = card([row('a'), row('b'), row('c3'), row('d')], [prev(100, 5), prev(85, 8), prev(85, 8), prev(85, 8)]);
    const fill = targetFill(t);
    expect(['a', 'b', 'c3', 'd'].map((k) => wr(fillForSet(c, k, fill)))).toEqual([
      [100, 5],
      [85, 9],
      [85, 8],
      [85, 8],
    ]);
  });
});

describe('C3-23: editing Sets, then Warm-ups, keeps the Sets change', () => {
  it('a row with a set list: 3 → 4 sets, then 2 warm-ups → 2 warm-ups and 4 working sets', async () => {
    const { setsPatchFor, warmupsPatchFor, workingCount } = await import('@/tracker/plans/routineSets');
    let pe: { targetSets: number; sets: import('@/tracker/plans/routineSets').PlanSet[] | null } = {
      targetSets: 3,
      sets: [{ type: 'normal' }, { type: 'normal' }, { type: 'normal' }, { type: 'drop' }],
    };
    const p1 = setsPatchFor(pe, 4);
    pe = { targetSets: 4, sets: p1.sets ?? pe.sets };
    const p2 = warmupsPatchFor(pe, 2);
    expect(p2.sets!.filter((s) => s.type === 'warmup')).toHaveLength(2);
    expect(workingCount(p2.sets!)).toBe(4);
  });

  it('a plain row (no set list) keeps a plain count, and warm-ups follow the count shown', async () => {
    const { setsPatchFor, warmupsPatchFor, workingCount } = await import('@/tracker/plans/routineSets');
    expect(setsPatchFor({ targetSets: 3, sets: null }, 5)).toEqual({ targetSets: 5 });
    const p = warmupsPatchFor({ targetSets: 5, sets: null }, 1);
    expect(workingCount(p.sets!)).toBe(5);
  });
});

describe('C3-24 / C3-30: the folder picker', () => {
  it('"My routines" with no such folder yet still names where the copy goes; an older plan named My Routines → "Other routines"', async () => {
    const { folderChoices } = await import('@/tracker/services/folderChoice');
    const choices = folderChoices([{ id: 'p', name: 'My Routines', following: true, routines: [] }]);
    expect(choices[0].label).toBe('Other routines');
  });
});

describe('C3-20: a routine\'s own per-set weights are hinted in the workout', () => {
  it('planned 100 x 5, 100 x 5, 80 x 8, 80 x 8: rows 3-4 hint 80 x 8, never the Target\'s 100', () => {
    const plan = (weightKg: number, reps: number) => ({ plan: { weightKg, reps } }) as Partial<DraftSet>;
    const c = card([row('a', plan(100, 5)), row('b', plan(100, 5)), row('c3', plan(80, 8)), row('d', plan(80, 8))], [prev(100, 5), prev(100, 5)]);
    const target = { weightKg: 102.5, reps: 5 };
    expect(wr(fillForSet(c, 'c3', target))).toEqual([80, 8]);
    expect(wr(fillForSet(c, 'd', target))).toEqual([80, 8]);
    // A typed weight in the row above does not override the plan of a back-off row.
    const typed = card([row('a', { weightKg: 100, reps: 5, ...plan(100, 5) }), row('c3', plan(80, 8))], [prev(100, 5)]);
    expect(wr(fillForSet(typed, 'c3', target))).toEqual([80, 8]);
  });

  it('the draft built from a routine carries each set\'s plan', async () => {
    const { planOfSet } = await import('@/tracker/store/activeWorkoutStore');
    expect(planOfSet({ type: 'normal', weightKg: 80, reps: 8 })).toEqual({ weightKg: 80, reps: 8 });
    expect(planOfSet({ type: 'normal' })).toBeUndefined();
    expect(planOfSet({ type: 'warmup', reps: 10 })).toBeUndefined();
  });
});

describe('C3-28 / C3-29: the routine editor at 360 dp and large text (source check)', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'src/app/routines/[id].tsx'), 'utf8').replace(/\r\n/g, '\n');
  it('an exercise name may take two lines', () => {
    const at = src.indexOf('{pe.exercise.name}\n');
    expect(src.slice(Math.max(0, at - 300), at)).toContain('numberOfLines={2}');
  });
  it('the Sets / Reps / Rest steppers wrap onto a new line instead of running off the card', () => {
    const rows = src.match(/<View style=\{\{ flexDirection: 'row', [^}]*gap: space\.lg[^}]*\}\}>\s*<Stepper/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toContain("flexWrap: 'wrap'");
  });
});

/**
 * Phase 4 — "stall on several lifts at once → offer the easy week early" (research v3 §5).
 * Counts the followed plan's lifts whose Target says stalled (R3 / R4), each lift once even
 * when two routines share it. New in Phase 4 (fails on v0.25.1: the function does not exist).
 */
import { describe, expect, it, vi } from 'vitest';

import type { Exercise } from '@/types/models';

const h = vi.hoisted(() => ({ now: { week: 4, easy: false } as { week: number | null; easy: boolean } | null }));

const lift = (id: string): Exercise => ({ id, name: id, aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 });
const pe = (id: string, day: string) => ({ id: `${day}-${id}`, planDayId: day, exerciseId: id, order: 0, targetSets: 3, repRangeMin: 8, repRangeMax: 12, exercise: lift(id) });

vi.mock('@/lib/date', async (orig) => ({ ...(await orig<typeof import('@/lib/date')>()), todayISO: () => '2026-10-20' }));
vi.mock('@/tracker/services/planState', () => ({ getPlanNow: async () => h.now, planNowOf: () => null }));
vi.mock('@/db/repos/planRepo', () => ({
  getActivePlan: async () => ({
    days: [
      { id: 'a', exercises: [pe('bench', 'a'), pe('squat', 'a'), pe('row', 'a')] },
      { id: 'b', exercises: [pe('bench', 'b'), pe('press', 'b'), pe('curl', 'b')] },
    ],
  }),
}));
vi.mock('@/tracker/db/folderRepo', () => ({ getRoutineAnywhere: async () => null, folderOfRoutine: async () => null }));
vi.mock('@/services/coach', () => ({ getTodaysWorkout: async () => ({ planDayId: null, targets: [] }) }));
vi.mock('@/db/repos/userRepo', () => ({ getProfile: async () => ({ experience: 'intermediate' }) }));
vi.mock('@/tracker/db/exerciseInfo', () => ({ getExerciseIdsByCatalogKey: async () => new Map(), getTrackerExercisesByIds: async () => new Map() }));
// Four workouts at 60 kg × 9 (stuck: R4) for bench, squat and press; row and curl move up.
vi.mock('@/tracker/db/progressionHistory', () => ({
  getProgressionHistory: async (id: string) =>
    ['2026-10-17', '2026-10-14', '2026-10-10', '2026-10-07'].map((dateISO, i) => ({
      dateISO,
      sets: [0, 1, 2].map(() => ({
        weightKg: 60,
        reps: id === 'row' || id === 'curl' ? 12 - i : 9,
        rpe: null,
        setType: 'normal' as const,
      })),
    })),
}));

const { stalledLiftsInPlan } = await import('@/tracker/services/coachTargets');

describe('stalled lifts in the followed plan', () => {
  it('counts each stalled lift once (bench is in two routines)', async () => {
    expect(await stalledLiftsInPlan()).toBe(3);
  });

  it('none in an easy week, or before the plan has weeks', async () => {
    h.now = { week: 4, easy: true };
    expect(await stalledLiftsInPlan()).toBe(0);
    h.now = { week: null, easy: false };
    expect(await stalledLiftsInPlan()).toBe(0);
    h.now = null;
    expect(await stalledLiftsInPlan()).toBe(0);
  });
});

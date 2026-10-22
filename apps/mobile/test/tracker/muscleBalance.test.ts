/**
 * R-58 (owner, 22 Oct 2026): missing-muscle suggestions, the shared check. The research ran this
 * rule on our own programs: the cases below are its table (docs/overhaul/research/R-muscle-balance.md).
 */
import { describe, expect, it } from 'vitest';

import type { Muscle } from '@/tracker/catalog/muscles';
import { missingGroups, planLine, todayLine, weekFromLogged, type WeekSets } from '@/tracker/engine/muscleBalance';

/** A week from "muscle: main sets" and "muscle: helper sets". */
function week(main: Partial<Record<Muscle, number>>, helper: Partial<Record<Muscle, number>> = {}): WeekSets {
  const counted = new Map<Muscle, number>();
  const mainMap = new Map<Muscle, number>();
  for (const [m, n] of Object.entries(main) as [Muscle, number][]) {
    counted.set(m, (counted.get(m) ?? 0) + n);
    mainMap.set(m, n);
  }
  for (const [m, n] of Object.entries(helper) as [Muscle, number][]) counted.set(m, (counted.get(m) ?? 0) + n * 0.5);
  return { counted, main: mainMap };
}

describe('R-58: which group is close to zero', () => {
  it('upper body only, 3 days: one card, "legs" (never six warnings)', () => {
    const w = week(
      { chest: 9, lats: 6, upper_back: 6, side_delts: 3, rear_delts: 0, biceps: 4, triceps: 4 },
      { front_delts: 9, triceps: 9, biceps: 6, rear_delts: 6 },
    );
    expect(missingGroups(w)[0]).toBe('legs');
  });

  it('push, pull, legs with squats and leg press only: hamstrings first', () => {
    const w = week(
      { chest: 9, front_delts: 3, side_delts: 3, triceps: 4, lats: 6, upper_back: 6, rear_delts: 3, biceps: 4, quads: 9, calves: 3, abs: 3 },
      { glutes: 9, hamstrings: 2 },
    );
    expect(missingGroups(w)[0]).toBe('hamstrings');
  });

  it('push and legs, no pulling: back (it covers rear shoulders and biceps)', () => {
    const w = week({ chest: 9, side_delts: 3, triceps: 4, quads: 9, hamstrings: 3, glutes: 3, calves: 3, abs: 3 }, { front_delts: 9 });
    const out = missingGroups(w);
    expect(out[0]).toBe('back');
    expect(out).not.toContain('rear_shoulders');
    expect(out).not.toContain('biceps');
  });

  it('a balanced week: nothing', () => {
    const w = week({
      chest: 9, lats: 6, upper_back: 6, front_delts: 3, side_delts: 3, rear_delts: 3, biceps: 4, triceps: 4,
      quads: 9, hamstrings: 4, glutes: 4, calves: 3, abs: 3,
    });
    expect(missingGroups(w)).toEqual([]);
  });

  it('close to zero only: 2 helper sets a week is no gap... but helper-only work with no main set under 2 is', () => {
    expect(missingGroups(week({ chest: 9, lats: 6, quads: 6, hamstrings: 3, glutes: 3, abs: 3, calves: 3, side_delts: 3, rear_delts: 3 }, { triceps: 4, biceps: 4 }))).toEqual([]);
    expect(missingGroups(week({ chest: 9, lats: 6, quads: 6, hamstrings: 3, glutes: 3, abs: 3, calves: 3, side_delts: 3, rear_delts: 3 }, { triceps: 2, biceps: 4 }))).toEqual(['triceps']);
  });

  it('beginners see the big groups only; muted or snoozed groups never show', () => {
    const w = week({ chest: 9, lats: 6, upper_back: 6, quads: 9, hamstrings: 3, glutes: 3, abs: 3, front_delts: 3, side_delts: 3, rear_delts: 3, biceps: 3, triceps: 3 });
    expect(missingGroups(w)).toEqual(['calves']);
    expect(missingGroups(w, { beginner: true })).toEqual([]);
    expect(missingGroups(w, { quiet: new Set(['calves']) })).toEqual([]);
  });

  it('logged sets are averaged over the weeks judged; a helper share never counts as a main set', () => {
    const shares = (m: Partial<Record<Muscle, number>>) => new Map(Object.entries(m) as [Muscle, number][]);
    const w = weekFromLogged(
      [
        { dateISO: '2026-10-01', shares: shares({ chest: 1, triceps: 0.5 }) },
        { dateISO: '2026-10-08', shares: shares({ chest: 1, triceps: 0.5 }) },
        { dateISO: '2026-10-15', shares: shares({ chest: 1, triceps: 0.5 }) },
      ],
      3,
    );
    expect(w.counted.get('chest')).toBeCloseTo(1);
    expect(w.counted.get('triceps')).toBeCloseTo(0.5);
    expect(w.main.get('triceps')).toBeUndefined();
  });

  it('the words say what to add, never what is wrong', () => {
    expect(planLine('hamstrings', 'Lying Leg Curl', 'Legs day')).toBe('Your week has no hamstring work. Lying Leg Curl on Legs day covers it.');
    expect(todayLine('rear_shoulders', 'Face Pull', 2)).toBe('Easy add today: 2 sets of Face Pull for your rear shoulders.');
    for (const l of [planLine('legs', 'Leg Press', 'Upper A'), todayLine('calves', 'Calf Raise', 3)]) {
      expect(l).not.toMatch(/\b(volume|PR|session|missing|neglect|imbalance|weak)\b/i);
    }
  });
});

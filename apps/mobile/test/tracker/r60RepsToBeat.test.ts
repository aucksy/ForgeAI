/**
 * R-60 (owner, 22 Oct 2026): "for rep-based exercises, we are just saying aim for this ... we have to
 * show the total number of reps to achieve or to beat". A move with no kilos gets reps to beat.
 */
import { describe, expect, it } from 'vitest';

import { beatPlan, kgBeaten, kgProgress, repLiveLine, repPlan, repSetLines, repsToBeatLine } from '@/tracker/lib/kgTarget';

const pushUps = {
  action: 'hold' as const,
  targetWeightKg: 0,
  targetSets: 3,
  repGoal: 16,
  setGoals: [16, 15, 14],
  topSetOnly: false,
  logType: 'reps' as const,
  bodyweightOnly: false,
};
const last = [
  { weightKg: 0, reps: 15 },
  { weightKg: 0, reps: 15 },
  { weightKg: 0, reps: 12 },
];

describe('R-60: reps to beat', () => {
  it('a "Reps only" move: each set\'s goal added up, against last time', () => {
    const p = repPlan(pushUps, last)!;
    expect(p.reps).toBe(true);
    expect(p.total).toBe(45);
    expect(p.last).toBe(42);
    expect(repsToBeatLine(p)).toBe('45 reps to beat · +3 on last time');
    expect(repSetLines(p)).toEqual(['Set 1 · 16 reps', 'Set 2 · 15 reps', 'Set 3 · 14 reps']);
    expect(repsToBeatLine(p, true)).toBe('45 reps to beat per side · +3 on last time');
  });

  it('a bodyweight lift logged at 0 kg gets reps; a loaded lift keeps its kilos', () => {
    const bw = { ...pushUps, logType: 'weight_reps' as const, bodyweightOnly: true };
    expect(beatPlan(bw, last)?.reps).toBe(true);
    const bench = { ...pushUps, logType: 'weight_reps' as const, targetWeightKg: 60, bodyweightOnly: false };
    const kg = beatPlan(bench, [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }])!;
    expect(kg.reps).toBeUndefined();
    expect(kg.total).toBe(60 * 45);
  });

  it('no rep goal, a first time, an easy week or another set count: no line, no false difference', () => {
    expect(repPlan({ ...pushUps, action: 'start' }, last)).toBeNull();
    expect(repPlan({ ...pushUps, repGoal: null }, last)).toBeNull();
    expect(repPlan({ ...pushUps, easy: true }, last)).toBeNull();
    const two = repPlan(pushUps, last.slice(0, 2))!;
    expect(two.last).toBeNull();
    expect(repsToBeatLine(two)).toBe('45 reps to beat');
    expect(repsToBeatLine(repPlan(pushUps, [{ weightKg: 0, reps: 16 }, { weightKg: 0, reps: 16 }, { weightKg: 0, reps: 16 }])!)).toBe(
      '45 reps to beat · fewer than last time',
    );
  });

  it('during the workout: done so far, what the open sets need, then beaten (green)', () => {
    const p = repPlan(pushUps, last)!;
    const open = { weightKg: null, reps: null, done: false, isWarmup: false };
    const g1 = kgProgress(p, [{ weightKg: null, reps: 17, done: true, isWarmup: false }, { ...open, hintReps: 15 }, { ...open, hintReps: 14 }]);
    expect(g1.done).toBe(17);
    expect(repLiveLine(p, g1)).toBe('17 of 45 reps · next 15, 14');
    const g2 = kgProgress(p, [
      { weightKg: null, reps: 17, done: true, isWarmup: false },
      { weightKg: null, reps: 16, done: true, isWarmup: false },
      { weightKg: null, reps: 14, done: true, isWarmup: false },
    ]);
    expect(kgBeaten(g2)).toBe(true);
    expect(repLiveLine(p, g2)).toBe('45 reps beaten ✓ (47 done)');
    // A warm-up never counts.
    expect(kgProgress(p, [{ weightKg: null, reps: 20, done: true, isWarmup: true }]).done).toBe(0);
  });

  it('member words never say volume, PR or session', () => {
    const p = repPlan(pushUps, last)!;
    for (const w of [repsToBeatLine(p), ...repSetLines(p)]) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

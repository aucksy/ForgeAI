/**
 * R-499 (owner, 14 Nov 2026: "it should always be previous and next ... if I am not going to do this exercise
 * today but tomorrow, then the word today doesn't make sense"): the exercise card's kg to beat and its live
 * line never say "today" or "last time". Before: "Done: 0 of today's 1,800 kg", "fine for today",
 * "+5% on last time", "same as last time", "lighter than last time", "fewer than last time", "(as last time)".
 * The green finished line (R-498) keeps its own words. Plus `keepUnitsTogether`, the one no-break helper the
 * green line and the Profile Next line share.
 */
import { describe, expect, it } from 'vitest';

import {
  keepUnitsTogether,
  kgLiveLine,
  kgPlan,
  kgProgress,
  kgSetLines,
  kgToBeatLine,
  pctWords,
  repDiffWords,
  repLiveLine,
  repPlan,
  repsToBeatLine,
  type KgRow,
} from '@/tracker/lib/kgTarget';

const NB = String.fromCharCode(160);
const OLD = /\btoday\b|today's|last time/i;
const base = {
  action: 'increase' as const,
  targetWeightKg: 40,
  targetSets: 3,
  repGoal: 15,
  setGoals: [15, 15, 15],
  topSetOnly: false,
  logType: 'weight_reps' as const,
  bodyweightOnly: false,
};
const last = [
  { weightKg: 40, reps: 15 },
  { weightKg: 40, reps: 14 },
  { weightKg: 40, reps: 14 },
];
const bw = last.map((x) => ({ weightKg: 0, reps: x.reps }));
const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const row = (weightKg: number | null, reps: number | null, done: boolean): KgRow => ({ weightKg, reps, done, isWarmup: false });

describe('R-499: the kg to beat says previous, never today or last time', () => {
  const p = kgPlan(base, last)!; // 40 x 15 x 3 = 1,800 against 1,720
  it('before the workout: "+5% on previous"', () => {
    expect(kgToBeatLine(p, total)).toBe('1,800 kg to beat · +5% on previous');
  });
  it('the live line: "Done: 0 of 1,800 kg" (no "today\'s")', () => {
    const g = kgProgress(p, [row(null, null, false), row(null, null, false), row(null, null, false)]);
    expect(kgLiveLine(p, g, total, weight)).toBe('Next set: 40 kg × 15 · Done: 0 of 1,800 kg');
  });
  it('all ticked, short and under the previous: "fine for this workout"', () => {
    const g = kgProgress(p, [row(40, 14, true), row(40, 14, true), row(40, 13, true)]);
    expect(kgLiveLine(p, g, total, weight)).toBe('Done: 1,640 of 1,800 kg · 160 kg less, fine for this workout');
  });
  it('the % words and the rep words', () => {
    expect(pctWords(0)).toBe('same as previous');
    expect(pctWords(-0.1)).toBe('lighter than previous');
    expect(pctWords(0.05)).toBe('+5% on previous');
    const reps = repPlan({ ...base, logType: 'reps', targetWeightKg: 0, setGoals: [16, 15, 15] }, bw)!;
    expect(repsToBeatLine(reps)).toBe('46 reps to beat · +3 on previous');
    const fewer = repPlan({ ...base, logType: 'reps', targetWeightKg: 0, setGoals: [13, 13, 13], repGoal: 13 }, bw)!;
    expect(repDiffWords(fewer)).not.toMatch(OLD);
  });
  it('a set planned as it was: "(as previous)"', () => {
    const q = kgPlan({ ...base, setGoals: [9, 8, 8], targetWeightKg: 45 }, [{ weightKg: 42.5, reps: 8 }, { weightKg: 42.5, reps: 8 }, { weightKg: 30, reps: 12 }])!;
    expect(kgSetLines(q, weight).at(-1)).toBe('Set 3 · 30 kg × 12 (as previous)');
  });
  it('no line in any state says today or last time; the green line keeps its R-498 words', () => {
    const states: KgRow[][] = [
      [row(null, null, false), row(null, null, false), row(null, null, false)],
      [row(40, 15, true), row(null, null, false), row(null, null, false)],
      [row(40, 10, true), row(40, 10, true), row(null, null, false)],
      [row(40, 14, true), row(40, 14, true), row(40, 13, true)],
      [row(40, 15, true), row(40, 14, true), row(40, 14, true)],
      [row(40, 16, true), row(40, 16, true), row(40, 15, true)],
    ];
    const lines = states.map((s) => kgLiveLine(p, kgProgress(p, s), total, weight));
    for (const l of [...lines, kgToBeatLine(p, total), ...kgSetLines(p, weight)]) expect(l).not.toMatch(OLD);
    expect(lines.at(-1)).toBe(`Previous set volume beaten! +160${NB}kg\nDone 1,880 kg · Previous 1,720 kg`);
    const reps = repPlan({ ...base, logType: 'reps', targetWeightKg: 0 }, bw)!;
    for (const s of states) expect(repLiveLine(reps, kgProgress(reps, s.map((r) => ({ ...r, weightKg: r.weightKg == null ? null : 0 }))))).not.toMatch(OLD);
  });
});

describe('keepUnitsTogether: a number never splits from its unit', () => {
  it('kg, lb, min, h, reps and sets take a no-break space; other words keep their spaces', () => {
    expect(keepUnitsTogether('610 kg more than previous (7,910 kg).')).toBe(`610${NB}kg more than previous (7,910${NB}kg).`);
    expect(keepUnitsTogether('+200 lb')).toBe(`+200${NB}lb`);
    expect(keepUnitsTogether('It took 1 h 5 min the previous time.')).toBe(`It took 1${NB}h 5${NB}min the previous time.`);
    expect(keepUnitsTogether('46 reps · 2 sets')).toBe(`46${NB}reps · 2${NB}sets`);
    expect(keepUnitsTogether('Pull 2. 2 more')).toBe('Pull 2. 2 more');
    expect(keepUnitsTogether('3 kgs')).toBe('3 kgs');
  });
});

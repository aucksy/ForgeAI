import { describe, expect, it } from 'vitest';

import { kgLiveLine, kgPlan, kgProgress, kgSetLines, kgToBeatLine, MAX_EXTRA_REPS, pctWords, type KgRow } from '@/tracker/lib/kgTarget';

const base = {
  action: 'increase' as const,
  targetWeightKg: 45,
  targetSets: 3,
  repGoal: 8,
  setGoals: [9, 8, 8],
  topSetOnly: false,
  logType: 'weight_reps' as const,
  bodyweightOnly: false,
};
const last3 = [
  { weightKg: 42.5, reps: 8 },
  { weightKg: 42.5, reps: 8 },
  { weightKg: 42.5, reps: 7 },
];
const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const row = (weightKg: number | null, reps: number | null, done: boolean, isWarmup = false): KgRow => ({ weightKg, reps, done, isWarmup });

describe('#9 kg to beat: the plan', () => {
  it('adds up each set at the Target weight and its own rep goal; % on last time', () => {
    const p = kgPlan(base, last3)!;
    expect(p.sets).toEqual([
      { weightKg: 45, reps: 9, asLast: false },
      { weightKg: 45, reps: 8, asLast: false },
      { weightKg: 45, reps: 8, asLast: false },
    ]);
    expect(p.total).toBe(45 * 25);
    expect(p.last).toBe(42.5 * 23);
    expect(p.pct).toBeCloseTo(1125 / 977.5 - 1, 6);
    expect(kgToBeatLine(p, total)).toBe('1,125 kg to beat · +15% on last time');
  });
  it('no per-set goals: every set at the rep goal', () => {
    expect(kgPlan({ ...base, setGoals: [] }, last3)!.sets.map((s) => s.reps)).toEqual([8, 8, 8]);
  });
  it('a lighter back-off last time is planned as it was', () => {
    const p = kgPlan(base, [{ weightKg: 42.5, reps: 8 }, { weightKg: 42.5, reps: 8 }, { weightKg: 30, reps: 12 }])!;
    expect(p.sets.at(-1)).toEqual({ weightKg: 30, reps: 12, asLast: true });
    expect(p.sets.slice(0, 2).every((s) => s.weightKg === 45)).toBe(true);
    expect(kgSetLines(p, weight)).toEqual(['Set 1 · 45 kg × 9', 'Set 2 · 45 kg × 8', 'Set 3 · 30 kg × 12 (as last time)']);
  });
  it('no kg to beat where the Target is something else', () => {
    expect(kgPlan({ ...base, action: 'start' }, [])).toBeNull();
    expect(kgPlan({ ...base, topSetOnly: true }, last3)).toBeNull();
    expect(kgPlan({ ...base, logType: 'time' }, last3)).toBeNull();
    expect(kgPlan({ ...base, logType: 'reps' }, last3)).toBeNull();
    expect(kgPlan({ ...base, bodyweightOnly: true }, last3)).toBeNull();
    expect(kgPlan({ ...base, easy: true }, last3)).toBeNull();
    expect(kgPlan({ ...base, free: true }, last3)).toBeNull();
    expect(kgPlan({ ...base, version: { kind: 'harder', id: null, name: 'X' } }, last3)).toBeNull();
    expect(kgPlan({ ...base, repGoal: null }, last3)).toBeNull();
    expect(kgPlan({ ...base, targetWeightKg: 0 }, last3)).toBeNull();
  });
  it('nothing usable last time: a total, no %', () => {
    const p = kgPlan(base, [{ weightKg: 0, reps: 10 }])!;
    expect(p.last).toBeNull();
    expect(p.pct).toBeNull();
    expect(kgToBeatLine(p, total)).toBe('1,125 kg to beat');
  });
  it('a heavy top set first last time stays first, where the rows hint it', () => {
    const p = kgPlan({ ...base, targetSets: 4, setGoals: [6, 5, 5] }, [{ weightKg: 60, reps: 3 }, { weightKg: 42.5, reps: 5 }, { weightKg: 42.5, reps: 5 }, { weightKg: 42.5, reps: 5 }])!;
    expect(p.sets).toEqual([
      { weightKg: 60, reps: 3, asLast: true },
      { weightKg: 45, reps: 6, asLast: false },
      { weightKg: 45, reps: 5, asLast: false },
      { weightKg: 45, reps: 5, asLast: false },
    ]);
  });
  it('no % when last time had a different number of sets', () => {
    expect(kgPlan(base, last3.slice(0, 2))!.pct).toBeNull();
    expect(kgPlan(base, [...last3, { weightKg: 42.5, reps: 6 }])!.pct).toBeNull();
    expect(kgPlan(base, last3)!.pct).not.toBeNull();
  });
  it('the % words', () => {
    expect(pctWords(0.002)).toBe('same as last time');
    expect(pctWords(-0.05)).toBe('lighter than last time');
    expect(pctWords(0.004)).toBe('same as last time');
    expect(pctWords(0.006)).toBe('+1% on last time');
    expect(pctWords(null)).toBeNull();
  });
});

describe('#9 kg to beat: during the workout', () => {
  const p = kgPlan(base, last3)!; // 45 × 9, 8, 8 = 1,125
  it('ticked sets count, warm-ups never; open sets follow the plan', () => {
    const g = kgProgress(p, [row(20, 10, true, true), row(45, 9, true), row(null, null, false), row(null, null, false)]);
    expect(g.done).toBe(405);
    expect(g.left).toBe(720);
    expect(g.next).toEqual([{ weightKg: 45, reps: 8 }, { weightKg: 45, reps: 8 }]);
    expect(g.short).toBe(false);
    expect(kgLiveLine(p, g, total, weight)).toBe('405 of 1,125 kg · next 45 kg × 8, 8');
  });
  it('a short set: the open sets catch up, at most 2 reps above plan each', () => {
    const g = kgProgress(p, [row(45, 6, true), row(null, null, false), row(null, null, false)]);
    // 1,125 − 270 = 855 left; 45 × 8 + 45 × 8 = 720 → +2 each = 45 × 10, 10 = 900 ≥ 855 (one rep at a time).
    expect(g.next.every((s, i) => s.reps - [8, 8][i] <= MAX_EXTRA_REPS)).toBe(true);
    expect(g.next.reduce((a, s) => a + s.weightKg * s.reps, 0)).toBeGreaterThanOrEqual(855);
    expect(g.short).toBe(false);
  });
  it('too far behind: capped, and says close enough', () => {
    const g = kgProgress(p, [row(45, 2, true), row(45, 2, true), row(null, null, false)]);
    expect(g.next).toEqual([{ weightKg: 45, reps: 8 + MAX_EXTRA_REPS }]);
    expect(g.short).toBe(true);
    expect(kgLiveLine(p, g, total, weight)).toMatch(/\(a little short is fine\)$/);
  });
  it('beaten: says so with what was done', () => {
    const g = kgProgress(p, [row(45, 10, true), row(45, 10, true), row(45, 9, true)]);
    expect(g.left).toBe(0);
    expect(kgLiveLine(p, g, total, weight)).toBe('1,125 kg beaten ✓ (1,305 kg done)');
  });
  it('a weight typed on an open row is kept; drop sets done count too', () => {
    const g = kgProgress(p, [row(45, 9, true), row(47.5, null, false), row(null, null, false), row(30, 10, true)]);
    expect(g.next[0].weightKg).toBe(47.5);
    expect(g.done).toBe(405 + 300);
  });
  it('all ticked and still short: no plan, says how much', () => {
    const g = kgProgress(p, [row(45, 5, true), row(45, 5, true), row(45, 5, true)]);
    expect(g.next).toEqual([]);
    expect(kgLiveLine(p, g, total, weight)).toBe('675 of 1,125 kg · 450 kg short, add a set if you have it in you');
  });
  it('starts from what each row hints, and stays within 2 reps of it', () => {
    // Set 1 done at 7: the rows hint 7, 7 (fillForSet caps at the row above) — never 8 + 2.
    const g = kgProgress(p, [
      { weightKg: 45, reps: 7, done: true, isWarmup: false },
      { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 45, hintReps: 7 },
      { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 45, hintReps: 7 },
    ]);
    expect(g.next.every((s) => s.reps <= 7 + MAX_EXTRA_REPS)).toBe(true);
    // A weight typed above carries down in the hint: the line says it too.
    const h = kgProgress(p, [
      { weightKg: 47.5, reps: 9, done: true, isWarmup: false },
      { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 47.5, hintReps: 8 },
    ]);
    expect(h.next[0].weightKg).toBe(47.5);
  });
  it('a drop row takes no plan place and is never planned', () => {
    const g = kgProgress(p, [
      { weightKg: 45, reps: 9, done: true, isWarmup: false },
      { weightKg: null, reps: null, done: false, isWarmup: false, setType: 'drop' },
      { weightKg: null, reps: null, done: false, isWarmup: false },
      { weightKg: null, reps: null, done: false, isWarmup: false },
    ]);
    expect(g.next).toEqual([{ weightKg: 45, reps: 8 }, { weightKg: 45, reps: 8 }]);
  });
  it('a row added mid-workout with a hint is planned from it', () => {
    const g = kgProgress(p, [row(45, 5, true), row(45, 5, true), row(45, 5, true), { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 45, hintReps: 5 }]);
    expect(g.next).toEqual([{ weightKg: 45, reps: 5 + MAX_EXTRA_REPS }]);
    expect(g.short).toBe(true);
  });
  it('member words never say volume, PR or session', () => {
    const words = [kgToBeatLine(p, total), ...kgSetLines(p, weight), kgLiveLine(p, kgProgress(p, []), total, weight)].join(' ');
    expect(words).not.toMatch(/\bvolume\b|\bPR\b|session/i);
  });
});

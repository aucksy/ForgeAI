/**
 * R-366 (owner, 5 Nov 2026): a Pull-Up (bodyweight, reps only), last time 7, 5, 4 = 16 reps, today
 * 7, 5, 5 = 17: the green bar said "17 reps reached" with no word of last time. Now the reps line
 * mirrors the kg line after R-351: it names last time's total and what was done, "beat" only past it,
 * one check mark (the box's icon; no "✓" in the words), never the banned words.
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, type ProgSession } from '@/tracker/engine/progression';
import {
  beatPlan,
  kgBeaten,
  kgLiveLine,
  kgPlan,
  kgProgress,
  lineGreen,
  repLiveLine,
  repPlan,
  repsToBeatLine,
  type KgRow,
} from '@/tracker/lib/kgTarget';
import type { Exercise } from '@/types/models';

const pullUp: Exercise = { id: 'pullup', name: 'Pull Up', aliases: [], muscleGroup: 'back', secondaryMuscles: [], equipment: 'bodyweight', isCompound: true, incrementKg: 2.5 };
const sess = (dateISO: string, sets: [number, number][]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, rpe: null, setType: 'normal' as const })),
});
const LAST = [7, 5, 4].map((reps) => ({ weightKg: 0, reps }));
const done = (reps: number): KgRow => ({ weightKg: 0, reps, done: true, isWarmup: false });
const open = (reps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 0, hintReps: reps });
const BANNED = /\b(volume|PR|session)\b|✓/i;

describe('R-366: the owner Pull-Up', () => {
  const t = computeProgressionTarget({ exercise: pullUp, target: { targetSets: 3, repRangeMin: 5, repRangeMax: 12 }, history: [sess('2026-11-02', [[0, 7], [0, 5], [0, 4]])], todayISO: '2026-11-05', logType: 'reps' });
  const p = beatPlan(t, LAST)!;

  it('the plan is reps, +1 a set (8, 6, 5 = 19), against last time\'s 16', () => {
    expect(p.reps).toBe(true);
    expect(t.setGoals).toEqual([8, 6, 5]);
    expect(p.total).toBe(19);
    expect(p.last).toBe(16);
    expect(repsToBeatLine(p)).toBe('19 reps to beat · +3 on previous');
  });

  it('his day, 7, 5, 5 = 17: "17 reps done · Previous: 16 · +1" (owner, 12 Nov 2026), green, one tick only', () => {
    const g = kgProgress(p, [done(7), done(5), done(5)]);
    expect(kgBeaten(g)).toBe(false); // today's 19 not all reached ...
    expect(lineGreen(p, g)).toBe(true); // ... but last time is beaten: the bar is green
    const line = repLiveLine(p, g);
    expect(line).toBe('Previous reps beaten! +1\nDone 17 reps · Previous 16 reps');
    expect(line).not.toMatch(BANNED);
  });

  it('before the end it reads like the kg line ("Done: n of today\'s 19 reps")', () => {
    const g = kgProgress(p, [done(7), open(6), open(5)]);
    expect(repLiveLine(p, g)).toMatch(/^Next sets: \d+, \d+ reps · Done: 7 of 19 reps/);
    expect(lineGreen(p, g)).toBe(false);
  });

  it('equal to last time (16) is "same as last time", green; under it is short and plain; never "beat"', () => {
    // Owner, 12 Nov 2026 (one rule for kilos and reps, `lineGreen`): equal counts as at least last time.
    const eq = kgProgress(p, [done(7), done(5), done(4)]);
    expect(lineGreen(p, eq)).toBe(true);
    expect(repLiveLine(p, eq)).toBe('Previous reps matched\nDone 16 reps · Previous 16 reps');
    const under = kgProgress(p, [done(6), done(5), done(4)]);
    expect(lineGreen(p, under)).toBe(false);
    expect(repLiveLine(p, under)).toBe('Done: 15 of 19 reps · 4 reps less, fine for this workout');
    for (const g of [eq, under]) expect(repLiveLine(p, g)).not.toMatch(/beat/i);
    // A set still open: never green yet, even past last time.
    const early = kgProgress(p, [done(9), done(9), open(5)]);
    expect(lineGreen(p, early)).toBe(false);
    expect(repLiveLine(p, early)).not.toMatch(/^Beat/);
  });

  it('all of today\'s 19 or more: the same words, last time named', () => {
    expect(repLiveLine(p, kgProgress(p, [done(8), done(6), done(5)]))).toBe('Previous reps beaten! +3\nDone 19 reps · Previous 16 reps');
    expect(repLiveLine(p, kgProgress(p, [done(9), done(7), done(5)]))).toBe('Previous reps beaten! +5\nDone 21 reps · Previous 16 reps');
  });
});

describe('R-366: reps to beat never under last time (as R-351 for kg)', () => {
  const lower = { action: 'hold' as const, targetWeightKg: 0, targetSets: 3, repGoal: 12, setGoals: [12, 10, 8], topSetOnly: false, logType: 'reps' as const, bodyweightOnly: false };
  const last = [12, 11, 10].map((reps) => ({ weightKg: 0, reps }));
  it('a plan of 30 under last time\'s 33 aims at 33, and equal is "same as last time" (owner, 12 Nov 2026)', () => {
    const p = repPlan(lower, last)!;
    expect(p.total).toBe(33);
    expect(p.planned).toBe(30);
    expect(repsToBeatLine(p)).toBe('33 reps to beat · your previous total');
    const eq = kgProgress(p, [done(12), done(11), done(10)]);
    expect(kgBeaten(eq)).toBe(true);
    expect(repLiveLine(p, eq)).toBe('Previous reps matched\nDone 33 reps · Previous 33 reps');
    expect(repLiveLine(p, kgProgress(p, [done(12), done(10), done(8)]))).toBe('Done: 30 of 33 reps · 3 reps less, fine for this workout');
  });
  it('no last time to compare (first time, or another set count): "First time", or the set count named', () => {
    const p = repPlan(lower, [])!;
    expect(repLiveLine(p, kgProgress(p, [done(12), done(10), done(8)]))).toBe('30 reps done · First time');
    const two = repPlan(lower, last.slice(0, 2))!;
    expect(repLiveLine(two, kgProgress(two, [done(13), done(12), done(9)]))).toBe('Previous reps beaten! +11\nDone 34 reps · Previous 23 reps · +1 set'); // first 2 sets never under last time's 23 (R-351)
  });
  it('R-358: Counting changed since last time: no reps line at all', () => {
    expect(beatPlan({ ...lower, countingChanged: true }, last)).toBeNull();
  });
});

describe('R-366: weighted and assisted bodyweight', () => {
  it('weighted pull-up (+10 kg) keeps the kg line, never under last time (R-351 regression)', () => {
    const t = computeProgressionTarget({ exercise: pullUp, target: { targetSets: 3, repRangeMin: 5, repRangeMax: 12 }, history: [sess('2026-11-02', [[10, 7], [10, 5], [10, 4]])], todayISO: '2026-11-05' });
    const p = beatPlan(t, [7, 5, 4].map((reps) => ({ weightKg: 10, reps })))!;
    expect(p.reps).toBeUndefined();
    expect(p.total).toBe(190); // 10 x (8 + 6 + 5)
    const g = kgProgress(p, [7, 5, 5].map((reps) => ({ weightKg: 10, reps, done: true, isWarmup: false })));
    expect(kgBeaten(g)).toBe(false);
    // Owner, 12 Nov 2026: kilos follow the same rule as reps: every set done and past last time's 160 kg.
    expect(lineGreen(p, g)).toBe(true);
    expect(kgLiveLine(p, g, (kg) => `${kg} kg`, (kg) => `${kg} kg`)).toBe('Previous set volume beaten! +10\u00a0kg\nDone 170 kg · Previous 160 kg');
  });
  it('assisted pull-up: no kg or reps line (the help changes, so reps are not comparable)', () => {
    const t = computeProgressionTarget({ exercise: pullUp, target: { targetSets: 3, repRangeMin: 5, repRangeMax: 12 }, history: [sess('2026-11-02', [[-20, 7], [-20, 5], [-20, 4]])], todayISO: '2026-11-05', logType: 'assisted' });
    expect(beatPlan(t, [7, 5, 4].map((reps) => ({ weightKg: -20, reps })))).toBeNull();
  });
  it('kg regression: R-351 owner T-Bar screen is unchanged', () => {
    const t = computeProgressionTarget({ exercise: { ...pullUp, id: 'tbar', equipment: 'machine' }, target: { targetSets: 3, repRangeMin: 6, repRangeMax: 10 }, history: [sess('2026-11-02', [[30, 13], [30, 12], [30, 10]])], todayISO: '2026-11-05' });
    const p = kgPlan(t, [13, 12, 10].map((reps) => ({ weightKg: 30, reps })))!;
    const g = kgProgress(p, [{ weightKg: 30, reps: 13, done: true, isWarmup: false }, { weightKg: 30, reps: 13, done: true, isWarmup: false }, { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 30, hintReps: 9 }]);
    expect(kgLiveLine(p, g, (kg) => `${kg.toLocaleString('en-US')} kg`, (kg) => `${kg} kg`)).toBe("Next set: 30 kg × 9 · Done: 780 of 1,050 kg");
  });
});

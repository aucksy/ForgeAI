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
  repLiveLine,
  repPlan,
  repsBeatLast,
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
    expect(repsToBeatLine(p)).toBe('19 reps to beat · +3 on last time');
  });

  it('his day, 7, 5, 5 = 17: "Beat last time\'s 16 reps (17 done)", green, one tick only', () => {
    const g = kgProgress(p, [done(7), done(5), done(5)]);
    expect(kgBeaten(g)).toBe(false); // today's 19 not all reached ...
    expect(repsBeatLast(p, g)).toBe(true); // ... but last time is beaten: the bar is green
    const line = repLiveLine(p, g);
    expect(line).toBe("Beat last time's 16 reps (17 done)");
    expect(line).not.toMatch(BANNED);
  });

  it('before the end it reads like the kg line ("Done: n of today\'s 19 reps")', () => {
    const g = kgProgress(p, [done(7), open(6), open(5)]);
    expect(repLiveLine(p, g)).toMatch(/^Next sets: \d+, \d+ reps · Done: 7 of today's 19 reps/);
    expect(repsBeatLast(p, g)).toBe(false);
  });

  it('negative: equal to last time (16) or under it never says "beat"', () => {
    const eq = kgProgress(p, [done(7), done(5), done(4)]);
    expect(repsBeatLast(p, eq)).toBe(false);
    expect(repLiveLine(p, eq)).not.toMatch(/beat/i);
    expect(repLiveLine(p, eq)).toBe('Done: 16 of 19 reps · 3 reps short, fine for today');
    const under = kgProgress(p, [done(6), done(5), done(4)]);
    expect(repLiveLine(p, under)).not.toMatch(/beat/i);
    // A set still open: never "beat" yet, even past last time.
    const early = kgProgress(p, [done(9), done(9), open(5)]);
    expect(repsBeatLast(p, early)).toBe(false);
    expect(repLiveLine(p, early)).not.toMatch(/^Beat/);
  });

  it('all of today\'s 19 or more: the same words, last time named', () => {
    expect(repLiveLine(p, kgProgress(p, [done(8), done(6), done(5)]))).toBe("Beat last time's 16 reps (19 done)");
    expect(repLiveLine(p, kgProgress(p, [done(9), done(7), done(5)]))).toBe("Beat last time's 16 reps (21 done)");
  });
});

describe('R-366: reps to beat never under last time (as R-351 for kg)', () => {
  const lower = { action: 'hold' as const, targetWeightKg: 0, targetSets: 3, repGoal: 12, setGoals: [12, 10, 8], topSetOnly: false, logType: 'reps' as const, bodyweightOnly: false };
  const last = [12, 11, 10].map((reps) => ({ weightKg: 0, reps }));
  it('a plan of 30 under last time\'s 33 aims at 33, and equal is "reached", not "beat"', () => {
    const p = repPlan(lower, last)!;
    expect(p.total).toBe(33);
    expect(p.planned).toBe(30);
    expect(repsToBeatLine(p)).toBe('33 reps to beat · your previous total');
    const eq = kgProgress(p, [done(12), done(11), done(10)]);
    expect(kgBeaten(eq)).toBe(true);
    expect(repLiveLine(p, eq)).toBe("Last time's 33 reps reached");
    expect(repLiveLine(p, kgProgress(p, [done(12), done(10), done(8)]))).toBe('Done: 30 of 33 reps · 3 reps short, fine for today');
  });
  it('no last time to compare (first time, or another set count): today\'s words as before', () => {
    const p = repPlan(lower, [])!;
    expect(repLiveLine(p, kgProgress(p, [done(12), done(10), done(8)]))).toBe("Today's 30 reps reached");
    const two = repPlan(lower, last.slice(0, 2))!;
    expect(repLiveLine(two, kgProgress(two, [done(13), done(12), done(9)]))).toBe("Today's 31 reps beaten (34 done)"); // first 2 sets never under last time's 23 (R-351)
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
    expect(kgLiveLine(p, g, (kg) => `${kg} kg`, (kg) => `${kg} kg`)).toBe('Done: 170 of 190 kg · 20 kg short, fine for today');
  });
  it('assisted pull-up: no kg or reps line (the help changes, so reps are not comparable)', () => {
    const t = computeProgressionTarget({ exercise: pullUp, target: { targetSets: 3, repRangeMin: 5, repRangeMax: 12 }, history: [sess('2026-11-02', [[-20, 7], [-20, 5], [-20, 4]])], todayISO: '2026-11-05', logType: 'assisted' });
    expect(beatPlan(t, [7, 5, 4].map((reps) => ({ weightKg: -20, reps })))).toBeNull();
  });
  it('kg regression: R-351 owner T-Bar screen is unchanged', () => {
    const t = computeProgressionTarget({ exercise: { ...pullUp, id: 'tbar', equipment: 'machine' }, target: { targetSets: 3, repRangeMin: 6, repRangeMax: 10 }, history: [sess('2026-11-02', [[30, 13], [30, 12], [30, 10]])], todayISO: '2026-11-05' });
    const p = kgPlan(t, [13, 12, 10].map((reps) => ({ weightKg: 30, reps })))!;
    const g = kgProgress(p, [{ weightKg: 30, reps: 13, done: true, isWarmup: false }, { weightKg: 30, reps: 13, done: true, isWarmup: false }, { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 30, hintReps: 9 }]);
    expect(kgLiveLine(p, g, (kg) => `${kg.toLocaleString('en-US')} kg`, (kg) => `${kg} kg`)).toBe("Next set: 30 kg × 9 · Done: 780 of today's 1,050 kg");
  });
});

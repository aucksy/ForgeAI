/**
 * Owner, 12 Nov 2026 ("ensure this is reviewed and consistent ... across"): ONE rule for when the live
 * line turns green, for kilo moves and reps-only moves alike. Green = every working set is ticked AND the
 * total is at least the previous workout's over the same sets (more, or the same), even when today's plan
 * was not all reached; with no previous workout, today's plan must be reached. Before: a reps move went
 * green on beating last time (R-366) while a kilo move stayed amber ("Done: 1,760 of 1,800 kg · 40 kg
 * short") after passing last time's 1,720 kg, and a plan reached early went green with a set still open.
 * The words follow the colour: green reads "Previous set volume beaten! +<diff>" / "Done <done> · Previous <prev>"
 * ("... matched" when equal; R-498, owner 14 Nov 2026), and "<done> done · First time" with nothing to compare.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { kgBeaten, kgLiveLine, kgProgress, lineGreen, repLiveLine, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';

const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const done = (weightKg: number, reps: number): KgRow => ({ weightKg, reps, done: true, isWarmup: false });
const open = (weightKg: number, reps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg: weightKg, hintReps: reps });

// His Incline Dumbbell Press (R-454): last time 40 x 13, 12, 10, 8 = 1,720 kg; today's plan 13, 12, 11, 9 = 1,800 kg.
const kg: KgPlan = {
  sets: [13, 12, 11, 9].map((reps) => ({ weightKg: 40, reps, asLast: false })),
  total: 1800,
  last: 1720,
  pct: 80 / 1720,
};
// A reps-only move: last time 16, 15, 8 = 39; today's plan 16, 15, 9 = 40 (his Chest Dip).
const reps: KgPlan = { reps: true, sets: [16, 15, 9].map((r) => ({ weightKg: 1, reps: r, asLast: false })), total: 40, last: 39, pct: 1 / 39 };
const r = (n: number): KgRow => ({ weightKg: null, reps: n, done: true, isWarmup: false });
const ro = (n: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 0, hintReps: n });

describe('one green rule: kilos', () => {
  it('every set done, past last time but under today\'s plan: green, the finished words (was amber "short")', () => {
    const g = kgProgress(kg, [done(40, 13), done(40, 12), done(40, 10), done(40, 9)]); // 1,760
    expect(kgBeaten(g)).toBe(false);
    expect(lineGreen(kg, g)).toBe(true);
    expect(kgLiveLine(kg, g, total, weight)).toBe('Previous set volume beaten! +40\u00a0kg\nDone 1,760 kg · Previous 1,720 kg');
  });
  it('every set done, exactly last time\'s total: green, "same as last time"', () => {
    const g = kgProgress(kg, [done(40, 13), done(40, 12), done(40, 10), done(40, 8)]);
    expect(lineGreen(kg, g)).toBe(true);
    expect(kgLiveLine(kg, g, total, weight)).toBe('You matched your previous total\nDone 1,720 kg · Previous 1,720 kg');
  });
  it('every set done, under last time: not green, the short line', () => {
    const g = kgProgress(kg, [done(40, 12), done(40, 12), done(40, 10), done(40, 8)]);
    expect(lineGreen(kg, g)).toBe(false);
    expect(kgLiveLine(kg, g, total, weight)).toBe('Done: 1,680 of 1,800 kg · 120 kg less, fine for this workout');
  });
  it('the plan reached with a set still open: not green yet; green once the last set is ticked', () => {
    const early = kgProgress(kg, [done(40, 20), done(40, 15), done(40, 11), open(40, 9)]); // 1,840 with set 4 open
    expect(kgBeaten(early)).toBe(true);
    expect(lineGreen(kg, early)).toBe(false);
    const all = kgProgress(kg, [done(40, 20), done(40, 15), done(40, 11), done(40, 9)]);
    expect(lineGreen(kg, all)).toBe(true);
    expect(kgLiveLine(kg, all, total, weight)).toBe('Previous set volume beaten! +480\u00a0kg\nDone 2,200 kg · Previous 1,720 kg');
  });
  it('warm-ups and drop sets never hold it back; an unticked working set does', () => {
    const warm: KgRow = { weightKg: 20, reps: 10, done: false, isWarmup: true };
    const drop: KgRow = { weightKg: 30, reps: 8, done: false, isWarmup: false, setType: 'drop' };
    const g = kgProgress(kg, [warm, done(40, 13), done(40, 12), done(40, 11), done(40, 9), drop]);
    expect(g.open).toBe(0);
    expect(lineGreen(kg, g)).toBe(true);
    expect(kgProgress(kg, [done(40, 13), done(40, 12), done(40, 11), open(40, 9)]).open).toBe(1);
  });
  it('no previous workout: green only when every set is done AND today\'s plan is reached', () => {
    const first: KgPlan = { ...kg, last: null, pct: null };
    const met = kgProgress(first, [done(40, 13), done(40, 12), done(40, 11), done(40, 9)]);
    expect(lineGreen(first, met)).toBe(true);
    expect(kgLiveLine(first, met, total, weight)).toBe('1,800 kg done · First time');
    const missed = kgProgress(first, [done(40, 13), done(40, 12), done(40, 10), done(40, 8)]);
    expect(lineGreen(first, missed)).toBe(false);
    expect(kgLiveLine(first, missed, total, weight)).toBe('Done: 1,720 of 1,800 kg · 80 kg less, fine for this workout');
  });
  it('T76: typed in lb as shown, a hair off last time\'s total, is the same total, green', () => {
    // 60 kg x 10 x 3 last time = 1,800 kg; 132.3 lb typed = 60.0103 kg -> 1,800.3 kg.
    const plan: KgPlan = { sets: [10, 10, 10].map((n) => ({ weightKg: 60, reps: n, asLast: false })), total: 1830, last: 1800, pct: 30 / 1800 };
    const g = kgProgress(plan, [done(60.0103, 10), done(60.0103, 10), done(60.0103, 10)]);
    expect(lineGreen(plan, g)).toBe(true);
  });
});

describe('one green rule: reps only (same rule as kilos)', () => {
  it('his Chest Dip day 17, 14, 9 = 40 after 39: green, "40 reps done · Previous: 39 · +1"', () => {
    const g = kgProgress(reps, [r(17), r(14), r(9)]);
    expect(lineGreen(reps, g)).toBe(true);
    expect(repLiveLine(reps, g)).toBe('Previous reps beaten! +1\nDone 40 reps · Previous 39 reps');
  });
  it('every set done, past last time but under today\'s plan: green (as R-366 had it for reps)', () => {
    const plan: KgPlan = { ...reps, sets: [17, 16, 9].map((n) => ({ weightKg: 1, reps: n, asLast: false })), total: 42, pct: 3 / 39 };
    const g = kgProgress(plan, [r(17), r(14), r(9)]); // 40 of 42, past last time's 39
    expect(kgBeaten(g)).toBe(false);
    expect(lineGreen(plan, g)).toBe(true);
    expect(repLiveLine(plan, g)).toBe('Previous reps beaten! +1\nDone 40 reps · Previous 39 reps');
  });
  it('every set done, exactly last time\'s 39 (plan 40 missed): green, "same as last time" (was amber "short")', () => {
    const g = kgProgress(reps, [r(16), r(15), r(8)]);
    expect(kgBeaten(g)).toBe(false);
    expect(lineGreen(reps, g)).toBe(true);
    expect(repLiveLine(reps, g)).toBe('You matched your previous reps\nDone 39 reps · Previous 39 reps');
  });
  it('every set done, under last time: not green, the short line', () => {
    const g = kgProgress(reps, [r(16), r(14), r(8)]);
    expect(lineGreen(reps, g)).toBe(false);
    expect(repLiveLine(reps, g)).toBe('Done: 38 of 40 reps · 2 reps less, fine for this workout');
  });
  it('a set still open: never green, even past last time already', () => {
    const g = kgProgress(reps, [r(25), r(20), ro(9)]);
    expect(lineGreen(reps, g)).toBe(false);
    expect(lineGreen(reps, kgProgress(reps, [r(25), r(20), r(9)]))).toBe(true);
  });
  it('kilos and reps agree case by case (beat, same, under, a set open)', () => {
    const cases: [KgRow[], KgRow[], boolean][] = [
      [[done(40, 13), done(40, 12), done(40, 10), done(40, 9)], [r(16), r(15), r(9)], true], // more than last time
      [[done(40, 13), done(40, 12), done(40, 10), done(40, 8)], [r(16), r(15), r(8)], true], // the same
      [[done(40, 12), done(40, 12), done(40, 10), done(40, 8)], [r(15), r(15), r(8)], false], // under
      [[done(40, 20), done(40, 20), done(40, 20), open(40, 9)], [r(25), r(25), ro(9)], false], // a set open
    ];
    for (const [k, n, want] of cases) {
      expect(lineGreen(kg, kgProgress(kg, k))).toBe(want);
      expect(lineGreen(reps, kgProgress(reps, n))).toBe(want);
    }
  });
});

describe('totals never say "each" (owner, 12 Nov 2026)', () => {
  // The workout card hands kgLiveLine a total wording without "each" (ExerciseLogCard); "each" stays on
  // the per-set weight ("Suggested: 40 kg each · 13, 12, 11, 9", the KG EACH column).
  const card = readFileSync(join(__dirname, '../../src/tracker/components/ExerciseLogCard.tsx'), 'utf8');
  const today = readFileSync(join(__dirname, '../../src/tracker/components/ExerciseKgRow.tsx'), 'utf8');
  it('his Incline: the running line, the green line and the same-as-last-time line', () => {
    const rows = [open(40, 13), open(40, 12), open(40, 11), open(40, 9)];
    expect(kgLiveLine(kg, kgProgress(kg, rows), total, weight)).toBe("Next set: 40 kg × 13 · Done: 0 of 1,800 kg");
    const all = kgProgress(kg, [done(40, 13), done(40, 12), done(40, 11), done(40, 9)]);
    expect(kgLiveLine(kg, all, total, weight)).toBe('Previous set volume beaten! +80\u00a0kg\nDone 1,800 kg · Previous 1,720 kg');
    const same = kgProgress(kg, [done(40, 13), done(40, 12), done(40, 10), done(40, 8)]);
    expect(kgLiveLine(kg, same, total, weight)).toBe('You matched your previous total\nDone 1,720 kg · Previous 1,720 kg');
  });
  it('the workout card and the Today kg-to-beat row add no "each" to a total', () => {
    const live = card.slice(card.indexOf('kgLiveLine(kgPlanned'), card.indexOf('beaten: lineGreen'));
    expect(live).not.toMatch(/each/);
    const beat = today.slice(today.indexOf('kgToBeatLine(plan'), today.indexOf('const sets ='));
    expect(beat).not.toMatch(/each/);
  });
});

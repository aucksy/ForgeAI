/**
 * R-516 (owner, 14 Nov 2026, "build it"): the orange box while a working set is open is two lines —
 *   line 1  "Previous set volume: 840 kg · Today's target: 880 kg"   (his words; "volume" and "Today's" are
 *           his exception for this line only)
 *   line 2  a bar, with "720 kg done · 160 kg to go" ("+40 kg over target" past the target, bar full)
 * — and no "Next set: …" words (the set row shows them). Every set ticked: the green R-498 box, unchanged.
 * Reps-only moves the same in reps ("Previous reps: 39 · Today's target: 40" / "17 reps done · 23 to go").
 * His Dumbbell Curl: previous 20 kg x 18, 13, 11 = 840 kg; this workout 18, 14, 12 = 880 kg (R-515).
 */
import { describe, expect, it } from 'vitest';

import { computeProgressionTarget, type ProgSession } from '@/tracker/engine/progression';
import { kgLiveLine, kgPlan, kgProgress, liveBox, liveBoxShows, repPlan, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';
import type { Exercise } from '@/types/models';

const NB = String.fromCharCode(160);
const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
const done = (weightKg: number, reps: number): KgRow => ({ weightKg, reps, done: true, isWarmup: false });
const open = (hintKg: number, hintReps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg, hintReps });
const kg = (s: string) => s.split(' kg').join(`${NB}kg`);

const curl: Exercise = { id: 'curl', name: 'Dumbbell Curl', aliases: [], muscleGroup: 'biceps', secondaryMuscles: [], equipment: 'dumbbell', isCompound: false, incrementKg: 2 };
const sess = (dateISO: string, kgEach: number, reps: number[]): ProgSession => ({
  dateISO,
  sets: reps.map((r) => ({ weightKg: kgEach, reps: r, rpe: null, setType: 'normal' as const })),
});
const LAST = [18, 13, 11];
const t = computeProgressionTarget({ exercise: curl, target: { targetSets: 3, repRangeMin: 10, repRangeMax: 15 }, history: [sess('2026-11-10', 20, LAST)], todayISO: '2026-11-14' });
const plan = (): KgPlan => kgPlan(t, LAST.map((reps) => ({ weightKg: 20, reps })))!;
const box = (rows: KgRow[]) => liveBox(plan(), kgProgress(plan(), rows), total);

describe('R-516: his Dumbbell Curl box, 840 kg previous, 880 kg target', () => {
  it('the numbers: previous 840 (every working set), target 880 (the goals shown, 18, 14, 12)', () => {
    expect(t.setGoals).toEqual([18, 14, 12]);
    expect(plan().previous).toBe(840);
    expect(plan().total).toBe(880);
  });

  it('start: "Previous set volume: 840 kg · Today\'s target: 880 kg", "0 kg done · 880 kg to go", empty bar', () => {
    const b = box([open(20, 18), open(20, 14), open(20, 12)]);
    expect(b.head).toBe(kg("Previous set volume: 840 kg · Today's target: 880 kg"));
    expect(b.done).toBe(kg('0 kg done · 880 kg to go'));
    expect(b.share).toBe(0);
    expect(b.over).toBe(false);
  });

  it('mid-workout: two sets of 18 done -> "720 kg done · 160 kg to go", bar 720/880', () => {
    const b = box([done(20, 18), done(20, 18), open(20, 12)]);
    expect(b.done).toBe(kg('720 kg done · 160 kg to go'));
    expect(b.share).toBeCloseTo(720 / 880, 5);
    expect(b.head).toBe(kg("Previous set volume: 840 kg · Today's target: 880 kg"));
  });

  it('over the target with a set still open: "+60 kg over target", bar full', () => {
    const b = box([done(20, 25), done(20, 22), open(20, 12)]);
    expect(b.done).toBe(kg('940 kg done · +60 kg over target'));
    expect(b.share).toBe(1);
    expect(b.over).toBe(true);
    expect(liveBoxShows(kgProgress(plan(), [done(20, 25), done(20, 22), open(20, 12)]))).toBe(true);
  });

  it('exactly on target with a set open: "0 kg to go", bar full, not "over"', () => {
    const b = box([done(20, 22), done(20, 22), open(20, 12)]);
    expect(b.done).toBe(kg('880 kg done · 0 kg to go'));
    expect(b.share).toBe(1);
    expect(b.over).toBe(false);
  });

  it('every set done: no box, the green R-498 words exactly as before', () => {
    const g = kgProgress(plan(), [done(20, 18), done(20, 14), done(20, 12)]);
    expect(liveBoxShows(g)).toBe(false);
    expect(kgLiveLine(plan(), g, total, weight)).toBe(`Previous set volume beaten! +40${NB}kg\nDone 880 kg · Previous 840 kg`);
  });

  it('line 2 never says "Next set", "today" or "volume"; line 1 is the only place for his words', () => {
    for (const rows of [
      [open(20, 18), open(20, 14), open(20, 12)],
      [done(20, 18), open(20, 14), open(20, 12)],
      [done(20, 25), done(20, 22), open(20, 12)],
    ]) {
      const b = box(rows);
      expect(b.done).not.toMatch(/next set|today|volume/i);
      expect(b.head).not.toMatch(/next set/i);
    }
  });
});

describe('R-516: the other cases', () => {
  it('reps only (Chest Dip, previous 16, 15, 8): "Previous reps: 39 · Today\'s target: 40", "17 reps done · 23 to go"', () => {
    const rp = repPlan({ action: 'hold', targetWeightKg: 0, targetSets: 3, repGoal: 16, setGoals: [16, 15, 9], topSetOnly: false, logType: 'reps', bodyweightOnly: false }, [16, 15, 8].map((reps) => ({ weightKg: 0, reps })))!;
    const row = (reps: number | null, hint: number): KgRow => (reps != null ? { weightKg: null, reps, done: true, isWarmup: false } : { weightKg: null, reps: null, done: false, isWarmup: false, hintReps: hint });
    const start = liveBox(rp, kgProgress(rp, [row(null, 16), row(null, 15), row(null, 9)]), total);
    expect(start.head).toBe("Previous reps: 39 · Today's target: 40");
    expect(start.done).toBe(`0${NB}reps done · 40 to go`);
    expect(liveBox(rp, kgProgress(rp, [row(17, 16), row(null, 15), row(null, 9)]), total).done).toBe(`17${NB}reps done · 23 to go`);
    const over = liveBox(rp, kgProgress(rp, [row(20, 16), row(22, 15), row(null, 9)]), total);
    expect(over.done).toBe(`42${NB}reps done · +2 over target`);
    expect(over.share).toBe(1);
  });

  it('after a weight step the target is the goals shown (942.5), the previous total stays 1,050', () => {
    const step = { action: 'increase' as const, targetWeightKg: 32.5, targetSets: 3, repGoal: 10, setGoals: [10, 10, 9], topSetOnly: false, logType: 'weight_reps' as const, bodyweightOnly: false };
    const p = kgPlan(step, [13, 12, 10].map((reps) => ({ weightKg: 30, reps })))!;
    const b = liveBox(p, kgProgress(p, [open(32.5, 10), open(32.5, 10), open(32.5, 9)]), total);
    expect(b.head).toBe(kg("Previous set volume: 1,050 kg · Today's target: 943 kg"));
    expect(b.done).toBe(kg('0 kg done · 943 kg to go'));
  });

  it('no previous workout: only the target on line 1', () => {
    const p = kgPlan({ ...t, last: null }, [])!;
    const b = liveBox(p, kgProgress(p, [open(20, 18), open(20, 14), open(20, 12)]), total);
    expect(b.head).toBe(kg("Today's target: 880 kg"));
  });
});

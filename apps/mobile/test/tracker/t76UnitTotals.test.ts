/**
 * T76 (owner's full test round, 5 Nov 2026): no false "beaten", "short" or "Lighter than last time"
 * after a kg <-> lb switch. Weights typed as the other unit shows them are off by a hair (60 kg shows
 * as 132.3 lb = 60.0103 kg; a 10 kg dumbbell shows as 22.0 lb = 9.979 kg), and totals in whole units
 * flipped on that hair:
 *  - 60 kg x 10 x 3 last time, 132.3 lb x 10 x 3 today: "Today's 3,968 lb beaten (3,969 lb done)".
 *  - 10 kg x 10 x 3 last time, 22.0 lb x 10 x 3 today: "1 lb short", and the finish screen's big card
 *    "Lighter than last time" (which also puts the sleep or protein line under it).
 * Weights on the kg grid (every kg member) are never given any allowance: their lines do not move.
 */
import { describe, expect, it } from 'vitest';

import { KG_PER_LB } from '@/lib/units';
import { kgBeaten, kgLiveLine, kgProgress, offKgGrid, shownTotalNoise, type KgPlan, type KgRow } from '@/tracker/lib/kgTarget';
import { kgHero } from '@/tracker/services/kgHero';

const lb = (v: number): number => v * KG_PER_LB;
const totalLb = (kg: number): string => `${Math.round(kg / KG_PER_LB).toLocaleString('en-US')} lb`;
const weightLb = (kg: number): string => `${Math.round((kg / KG_PER_LB) * 10) / 10} lb`;
const totalKg = (kg: number): string => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weightKg = (kg: number): string => `${kg} kg`;

const plan = (kg: number, reps: number, sets = 3): KgPlan => ({
  sets: Array.from({ length: sets }, () => ({ weightKg: kg, reps, asLast: false })),
  total: kg * reps * sets,
  last: kg * reps * sets,
  pct: 0,
});
const done = (kg: number, reps: number): KgRow => ({ weightKg: kg, reps, done: true, isWarmup: false });
const open = (kg: number, reps: number): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false, hintKg: kg, hintReps: reps });

describe('T76: the kg to beat after a switch to lb', () => {
  // Owner, 12 Nov 2026: one finished format; within the unit-switch allowance it is "same as last time".
  it('regression: 132.3 lb x 10 x 3 after 60 kg x 10 x 3 is "same as last time", never "+1 lb" by a hair', () => {
    const p = plan(60, 10);
    const g = kgProgress(p, [done(lb(132.3), 10), done(lb(132.3), 10), done(lb(132.3), 10)]);
    expect(kgBeaten(g)).toBe(true);
    const line = kgLiveLine(p, g, totalLb, weightLb);
    expect(line).toBe('You matched your previous total\nDone 3,968 lb · Previous 3,968 lb');
    expect(line).not.toMatch(/beaten|reached|\+/);
  });

  it('regression: 22.0 lb dumbbells for last time\'s 10 kg ones: "same as last time", never "1 lb short"', () => {
    const p = plan(10, 10);
    const g = kgProgress(p, [done(lb(22), 10), done(lb(22), 10), done(lb(22), 10)]);
    expect(g.short).toBe(false);
    expect(kgBeaten(g)).toBe(true);
    expect(kgLiveLine(p, g, totalLb, weightLb)).toBe('You matched your previous total\nDone 661 lb · Previous 661 lb');
  });

  it('positive: a real heavier weight in lb (135 lb) is still "beaten"', () => {
    const p = plan(60, 10);
    const g = kgProgress(p, [done(lb(135), 10), done(lb(135), 10), done(lb(135), 10)]);
    // R-498: the green line's shout, then both totals; "+82 lb" never splits (a no-break space).
    expect(kgLiveLine(p, g, totalLb, weightLb)).toMatch(/^Previous set volume beaten! \+8[12]\u00a0lb\nDone 4,050 lb · Previous 3,968 lb$/);
  });

  it('positive: a real rep short in lb is still short (one set open, one rep fewer is not hidden)', () => {
    const p = plan(60, 10);
    const g = kgProgress(p, [done(lb(132.3), 10), done(lb(132.3), 10), done(lb(132.3), 9)]);
    expect(kgBeaten(g)).toBe(false);
    expect(g.short).toBe(true);
  });

  it('a kg member gets no allowance at all: 60 kg sets are exact, one kilo short is short', () => {
    expect(shownTotalNoise([{ weightKg: 60, reps: 10 }, { weightKg: 62.5, reps: 8 }, { weightKg: 41.25, reps: 8 }])).toBe(0);
    const p = plan(60, 10);
    const g = kgProgress(p, [done(60, 10), done(60, 10), done(60, 10)]);
    expect(g.noise).toBeUndefined();
    expect(kgLiveLine(p, g, totalKg, weightKg)).toBe('You matched your previous total\nDone 1,800 kg · Previous 1,800 kg');
    const more = kgProgress(p, [done(60, 10), done(60, 10), done(60.25, 10)]);
    expect(kgLiveLine(p, more, totalKg, weightKg)).toBe('Previous set volume beaten! +3\u00a0kg\nDone 1,803 kg · Previous 1,800 kg');
    const mid = kgProgress(p, [done(60, 10), done(60, 10), open(60, 10)]);
    expect(kgBeaten(mid)).toBe(false);
  });

  it('offKgGrid: lb weights are off the grid, kg plate weights are on it', () => {
    expect(offKgGrid(lb(132.3))).toBe(true);
    expect(offKgGrid(lb(135))).toBe(true);
    expect([60, 62.5, 41.25, 1.25, 0.5, 200].some(offKgGrid)).toBe(false);
  });
});

describe('T76: the finish screen big card after a switch to lb', () => {
  const sets = [lb(22), lb(22), lb(22)].map((w) => ({ weightKg: w, reps: 10 }));
  const today = { kg: sets.reduce((a, s) => a + s.weightKg * s.reps, 0), reps: 30 };
  const last = { kg: 300, reps: 30, against: 'Pull 1 on 22 Oct' };

  it('the bug, as it was: with no allowance, 22.0 lb x 30 reads "Lighter than last time" against 10 kg x 30', () => {
    expect(kgHero(today, last, 'imperial')?.tone).toBe('down');
  });

  it('regression: with the allowance it is "Same as last time" (so no sleep or protein line)', () => {
    const h = kgHero(today, last, 'imperial', false, shownTotalNoise(sets));
    expect(h?.tone).toBe('same');
    expect(h?.line).toBe('Same as previous');
  });

  it('positive: a real lighter day is still "Lighter than last time"', () => {
    const light = [lb(20), lb(20), lb(20)].map((w) => ({ weightKg: w, reps: 10 }));
    const t = { kg: light.reduce((a, s) => a + s.weightKg * s.reps, 0), reps: 30 };
    expect(kgHero(t, last, 'imperial', false, shownTotalNoise(light))?.tone).toBe('down');
  });

  it('positive: a real heavier day is still "+... more than last time"', () => {
    const heavy = [lb(25), lb(25), lb(25)].map((w) => ({ weightKg: w, reps: 10 }));
    const t = { kg: heavy.reduce((a, s) => a + s.weightKg * s.reps, 0), reps: 30 };
    const h = kgHero(t, last, 'imperial', false, shownTotalNoise(heavy));
    expect(h?.tone).toBe('up');
    expect(h?.line).toMatch(/more than previous/);
  });
});

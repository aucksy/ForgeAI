import { describe, expect, it } from 'vitest';

import { estimatedOneRepMax } from '@/lib/e1rm';
import { KG_PER_LB } from '@/lib/units';
import { bestRecentSet, checkOneRep, loadableKg, ONE_REP_PERCENTS, percentRows } from '@/tracker/services/oneRepMax';
import { EMPTY_SETUP, gymBarKg, gymPlatesKg } from '@/tracker/services/plateMath';

const KG_GYM = { barKg: gymBarKg(EMPTY_SETUP, 'metric'), platesKg: gymPlatesKg(EMPTY_SETUP, 'metric') };
const LB_GYM = { barKg: gymBarKg(EMPTY_SETUP, 'imperial'), platesKg: gymPlatesKg(EMPTY_SETUP, 'imperial') };
const lb = (kg: number): number => Math.round((kg / KG_PER_LB) * 1000) / 1000;

describe('checkOneRep', () => {
  it('uses the one shared estimate (same as the chart)', () => {
    const c = checkOneRep(100, 5);
    expect(c).toEqual({ ok: true, e1rmKg: estimatedOneRepMax(100, 5), rough: false });
    if (c.ok) expect(c.e1rmKg).toBeCloseTo(116.667, 2);
  });
  it('a single is itself', () => {
    const c = checkOneRep(140, 1);
    expect(c.ok && c.e1rmKg).toBe(140);
  });
  it('empty boxes ask for input', () => {
    expect(checkOneRep(null, 5)).toEqual({ ok: false, why: 'empty' });
    expect(checkOneRep(100, null)).toEqual({ ok: false, why: 'empty' });
    expect(checkOneRep(Number.NaN, 5)).toEqual({ ok: false, why: 'empty' });
  });
  it('refuses a zero weight and bad reps', () => {
    expect(checkOneRep(0, 5)).toEqual({ ok: false, why: 'weight' });
    expect(checkOneRep(100, 0)).toEqual({ ok: false, why: 'reps' });
    expect(checkOneRep(100, 2.5)).toEqual({ ok: false, why: 'reps' });
    expect(checkOneRep(100, 101)).toEqual({ ok: false, why: 'reps' });
  });
  it('flags high reps as rough, at the shared formula cap', () => {
    expect(checkOneRep(60, 12)).toMatchObject({ ok: true, rough: false });
    const c = checkOneRep(60, 20);
    expect(c).toMatchObject({ ok: true, rough: true });
    // reps above 12 count as 12, as everywhere else in the app
    expect(c.ok && c.e1rmKg).toBe(estimatedOneRepMax(60, 12));
  });
});

describe('loadableKg', () => {
  it('rounds to the nearest weight the plates make', () => {
    expect(loadableKg(110.83, KG_GYM)).toBe(110);
    expect(loadableKg(99.17, KG_GYM)).toBe(100);
    expect(loadableKg(105, KG_GYM)).toBe(105);
  });
  it('a tie goes to the lighter weight', () => {
    expect(loadableKg(103.75, KG_GYM)).toBe(102.5);
  });
  it('under the bar, whole smallest jumps (a dumbbell weight still exists)', () => {
    expect(loadableKg(15, KG_GYM)).toBe(15);
    expect(loadableKg(16.4, KG_GYM)).toBe(17.5);
    expect(loadableKg(19.6, KG_GYM)).toBe(20);
    expect(loadableKg(0.3, KG_GYM)).toBe(2.5);
  });
  it('a gym without small plates rounds to its own jumps', () => {
    const gym = { barKg: 20, platesKg: [20, 10, 5] };
    expect(loadableKg(57, gym)).toBe(60);
    expect(loadableKg(53, gym)).toBe(50);
  });
  it('no plates on: the bar', () => {
    expect(loadableKg(80, { barKg: 20, platesKg: [] })).toBe(20);
  });
  it('pounds load clean pound weights', () => {
    // 202.5 lb sits halfway between 200 and 205: the lighter one
    expect(lb(loadableKg(202.5 * KG_PER_LB, LB_GYM))).toBe(200);
    expect(lb(loadableKg(208 * KG_PER_LB, LB_GYM))).toBe(210);
  });
});

describe('percentRows', () => {
  it('95 down to 50, each loadable, with plates a side', () => {
    const rows = percentRows(estimatedOneRepMax(100, 5), KG_GYM);
    expect(rows.map((r) => r.pct)).toEqual([...ONE_REP_PERCENTS]);
    expect(rows.map((r) => r.loadKg)).toEqual([110, 105, 100, 92.5, 87.5, 82.5, 75, 70, 65, 57.5]);
    expect(rows[1].perSide).toEqual([25, 15, 2.5]);
    expect(rows[1].exactKg).toBeCloseTo(105, 6);
  });
  it('the bar or lighter has no plates', () => {
    const rows = percentRows(30, KG_GYM);
    expect(rows.at(-1)).toMatchObject({ pct: 50, loadKg: 15, perSide: [] });
    expect(rows[2]).toMatchObject({ pct: 85, loadKg: 25 });
  });
  it('nothing for no max', () => {
    expect(percentRows(0, KG_GYM)).toEqual([]);
  });
});

describe('bestRecentSet', () => {
  const w = (sets: [number, number][], easyWeek = false) => ({ easyWeek, sets: sets.map(([weightKg, reps]) => ({ weightKg, reps })) });
  it('the set with the highest estimate in the newest workouts', () => {
    expect(bestRecentSet([w([[100, 5], [105, 3]]), w([[90, 8]])])).toEqual({ weightKg: 100, reps: 5 });
  });
  it('looks only at the newest few workouts, skipping easy weeks', () => {
    const h = [w([[200, 5]], true), w([[60, 5]]), w([[70, 5]]), w([[150, 5]])];
    expect(bestRecentSet(h, 2)).toEqual({ weightKg: 70, reps: 5 });
  });
  it('a tie keeps the newer set; empty or zero sets give none', () => {
    expect(bestRecentSet([w([[100, 1]]), w([[100, 1]])])).toEqual({ weightKg: 100, reps: 1 });
    expect(bestRecentSet([w([[0, 10]]), w([])])).toBeNull();
    expect(bestRecentSet([])).toBeNull();
  });
});

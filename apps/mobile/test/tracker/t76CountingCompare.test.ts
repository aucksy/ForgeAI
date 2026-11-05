/**
 * T76 (owner's full test round, 5 Nov 2026): the R-358 family beyond records. After a Counting
 * change ("Weight as typed" → "One side at a time"), records and the kg to beat stopped comparing
 * across Countings (R-358). Two more places still did, and the round found them:
 *
 *  1. The finish screen's big card and line compared the kg lifted of the two workouts, one counted
 *     once and the other twice: "+340 kg more than last time" for the same work, or (the other way)
 *     "Lighter than last time" and then a line about last night's sleep. Now not compared at all
 *     (like a first workout after the change): `countingChangedNames` in coachNote.
 *  2. The quiet "on last time" line after a tick: 10 kg × 18 per side against last time's 10 × 12
 *     as typed said "+6 reps on last time". Now quiet when last time's set used another Counting.
 *
 * Negative (must NOT show), regression (the owner's Dumbbell Preacher Curl numbers), state change
 * mid-workout (switch and switch back), and the positive cases that must still show.
 */
import { describe, expect, it } from 'vitest';

import { countingChangedNames, type CountedWorkout } from '@/tracker/lib/workoutCompare';
import { vsLastTimeText } from '@/tracker/services/vsLastTime';
import { recount, toPrevSet, type DraftSet, type PrevSet } from '@/tracker/store/activeWorkoutStore';
import { kgHero } from '@/tracker/services/kgHero';

const set = (p: Partial<DraftSet> = {}): DraftSet => ({ key: 's', weightKg: null, reps: null, isWarmup: false, done: true, ...p });

/** A saved workout: exercise id → set ids (warm-ups marked w). */
function workout(list: [id: string, name: string, sets: string[]][]): CountedWorkout {
  return {
    exercises: list.map(([id, name, sets]) => ({
      exercise: { id, name },
      sets: sets.map((sid) => ({ id: sid, isWarmup: sid.startsWith('w') })),
    })),
  };
}

describe('T76: the finish screen never compares totals across a Counting change', () => {
  // 22 Oct Pull 1: Dumbbell Preacher Curl as typed (10 × 15, 10 × 12), stamped 'one' when he switched.
  const last = workout([
    ['curl', 'Dumbbell Preacher Curl', ['a1', 'a2']],
    ['row', 'T-Bar Row', ['b1', 'b2', 'b3']],
  ]);
  // Today: the curl per side (the exercise's counting now, sets unstamped), T-Bar Row as before.
  const today = workout([
    ['row', 'T-Bar Row', ['c1', 'c2', 'c3']],
    ['curl', 'Dumbbell Preacher Curl', ['d1', 'd2', 'd3']],
  ]);
  const current = new Map([
    ['curl', 'side'],
    ['row', 'one'],
  ]);

  it("regression: the owner's switch to one side at a time is found (so no '+340 kg more')", () => {
    const modes = new Map([
      ['a1', 'one'],
      ['a2', 'one'],
    ]);
    expect(countingChangedNames(today, last, modes, current)).toEqual(['Dumbbell Preacher Curl']);
  });

  it('switched back (per side last time, as typed today): found too, so no "Lighter than last time" and no sleep line', () => {
    const modes = new Map([
      ['a1', 'side'],
      ['a2', 'side'],
    ]);
    expect(countingChangedNames(today, last, modes, new Map([['curl', 'one'], ['row', 'one']]))).toEqual(['Dumbbell Preacher Curl']);
  });

  it('positive: the same Counting both times is compared as before', () => {
    expect(countingChangedNames(today, last, new Map(), current)).toEqual([]);
  });

  it('an exercise done only once (new or skipped) is not a Counting change', () => {
    const t = workout([['row', 'T-Bar Row', ['c1']], ['pull', 'Pull-Up', ['e1']]]);
    expect(countingChangedNames(t, last, new Map([['e1', 'side']]), current)).toEqual([]);
  });

  it('warm-ups never decide it (a warm-up in another counting is not compared anyway)', () => {
    const t = workout([['curl', 'Dumbbell Preacher Curl', ['w1', 'd1']]]);
    const modes = new Map([['w1', 'one']]); // warm-up stamped 'one'; working set per side like last time
    const l = workout([['curl', 'Dumbbell Preacher Curl', ['a1']]]);
    expect(countingChangedNames(t, l, modes, new Map([['curl', 'side']]))).toEqual([]);
  });

  it('a switch MID-workout (some sets each way today) is a change', () => {
    const modes = new Map([['d1', 'one']]); // set 1 before the switch, 2 and 3 after
    expect(countingChangedNames(today, last, modes, current)).toEqual(['Dumbbell Preacher Curl']);
  });

  it('the same exercise on two cards is named once', () => {
    const t = workout([
      ['curl', 'Dumbbell Preacher Curl', ['d1']],
      ['curl', 'Dumbbell Preacher Curl', ['d2']],
    ]);
    expect(countingChangedNames(t, last, new Map([['a1', 'one'], ['a2', 'one']]), current)).toEqual(['Dumbbell Preacher Curl']);
  });

  it('with no workout to compare, the big card is "your number to beat", never "Lighter" (so no sleep line)', () => {
    const h = kgHero({ kg: 1020, reps: 51 }, null, 'metric');
    expect(h?.tone).toBe('first');
    expect(h?.line).toBe('Your number to beat next time.');
    expect(h?.line).not.toMatch(/Lighter|more than last time/);
  });
});

describe('T76: "on last time" never compares across Countings', () => {
  it("regression: 10 kg × 18 per side after last time's 10 × 12 as typed says nothing", () => {
    const p = toPrevSet({ weightKg: 10, reps: 12, loadMode: 'one' }, 'weight_reps', 'side');
    expect(p.counting).toBe('one');
    expect(vsLastTimeText(set({ weightKg: 10, reps: 18 }), p, 'weight_reps', 'side', 'metric')).toBeNull();
  });

  it('no "+kg each" either: 10 kg each after 15 kg as typed (read as 7.5 each)', () => {
    const p = toPrevSet({ weightKg: 15, reps: 10, loadMode: 'one' }, 'weight_reps', 'both');
    expect(p.weightKg).toBe(7.5);
    expect(vsLastTimeText(set({ weightKg: 10, reps: 10 }), p, 'weight_reps', 'both', 'metric')).toBeNull();
    expect(vsLastTimeText(set({ weightKg: 10, reps: 10 }), p, 'weight_reps', 'both', 'imperial')).toBeNull();
  });

  it('positive: the same Counting still gets its line', () => {
    const p = toPrevSet({ weightKg: 10, reps: 12, loadMode: null }, 'weight_reps', 'side');
    expect(p.counting).toBeUndefined();
    expect(vsLastTimeText(set({ weightKg: 10, reps: 18 }), p, 'weight_reps', 'side', 'metric')).toBe('+6 reps on last time');
    const q = toPrevSet({ weightKg: 10, reps: 12, loadMode: 'side' }, 'weight_reps', 'side');
    expect(q.counting).toBeUndefined();
    expect(vsLastTimeText(set({ weightKg: 12.5, reps: 12 }), q, 'weight_reps', 'side', 'metric')).toBe('+2.5 kg on last time');
  });

  it('state change mid-workout: switched to per side, PREVIOUS keeps where it came from; switched back, it compares again', () => {
    const asTyped: PrevSet = { weightKg: 10, reps: 12 };
    const perSide = recount(asTyped, 'one', 'side');
    expect(perSide).toEqual({ weightKg: 10, reps: 12, counting: 'one' });
    expect(vsLastTimeText(set({ weightKg: 10, reps: 18 }), perSide, 'weight_reps', 'side', 'metric')).toBeNull();
    const back = recount(perSide, 'side', 'one');
    expect(back).toEqual({ weightKg: 10, reps: 12 });
    expect(vsLastTimeText(set({ weightKg: 10, reps: 18 }), back, 'weight_reps', 'one', 'metric')).toBe('+6 reps on last time');
  });

  it('recount still converts the weight between "as typed" and "each" (TG-03 unchanged)', () => {
    expect(recount({ weightKg: 20, reps: 8 }, 'one', 'both')).toEqual({ weightKg: 10, reps: 8, counting: 'one' });
    expect(recount({ weightKg: 10, reps: 8, counting: 'one' }, 'both', 'one')).toEqual({ weightKg: 20, reps: 8 });
  });

  it('an older draft (PREVIOUS without a Counting) is unchanged', () => {
    expect(vsLastTimeText(set({ weightKg: 100, reps: 7 }), { weightKg: 100, reps: 5 }, 'weight_reps', 'one', 'metric')).toBe('+2 reps on last time');
  });
});

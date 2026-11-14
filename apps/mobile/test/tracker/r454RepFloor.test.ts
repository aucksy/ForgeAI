/**
 * R-454 (owner, 12 Nov 2026: "Never suggesting less than before."): at the same weight as last time a
 * set's rep goal is max(last time's reps on that set, min(top of range, last time's reps + 1)). His
 * Incline Dumbbell Press, 8-12, 40 kg x 13, 12, 10, 8 aimed 12, 12, 11, 9 (1,760 kg); now 13, 12, 11, 9
 * (1,800 kg). The weight still goes up only when every set reaches the top; a weight step keeps its own
 * goals (no floor). The live line still moves the reps a set misses to the NEXT open set first (at most
 * 2 above that set's hint), and no open row ever hints under last time's same set at the same weight.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/tracker/services/workoutAlerts', () => ({ scheduleRestEnd: async () => undefined, cancelRestEnd: async () => undefined }));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return { ...real, ringerMode: () => 'normal', dismissRestOver: () => undefined, postDoneNote: () => undefined };
});
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined, tap: () => undefined, warn: () => undefined }));
vi.mock('@/db', () => ({
  getDb: () => {
    throw new Error('no db in unit tests');
  },
  getMeta: async () => null,
  setMeta: async () => undefined,
}));
vi.mock('react-native', () => {
  const fixed: Record<string, unknown> = {
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
    AccessibilityInfo: { announceForAccessibility: () => undefined },
    Platform: { OS: 'test' },
  };
  const stub: unknown = new Proxy(
    {},
    {
      has: () => true,
      get(_t, k) {
        if (k === 'default') return stub;
        if (k === '__esModule') return true;
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k in fixed) return fixed[k];
        return () => {
          throw new Error(`native ${String(k)} in a unit test`);
        };
      },
    },
  );
  return stub as Record<string, unknown>;
});

import { computeProgressionTarget, rowTargetFill, targetFill, targetLine, type ProgSession } from '@/tracker/engine/progression';
import { nudgeLine } from '@/tracker/engine/rpeNudge';
import { kgLiveLine, kgPlan, kgProgress, kgToBeatLine, MAX_EXTRA_REPS, repLiveLine, repPlan, repsToBeatLine, type KgRow } from '@/tracker/lib/kgTarget';
import { fillForSet, goalAtWeight, nudgeForSet, nudgeLineShows, type DraftExercise, type DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const TODAY = '2026-11-12';

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'incline-db',
  name: 'Incline Dumbbell Press',
  aliases: [],
  muscleGroup: 'chest',
  secondaryMuscles: [],
  equipment: 'dumbbell',
  isCompound: true,
  incrementKg: 2.5,
  ...over,
});
const sess = (dateISO: string, sets: [number, number, (number | null)?][]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, reps, rpe = null]) => ({ weightKg, reps, rpe, setType: 'normal' as const })),
});
const range = (min: number, max: number, sets: number) => ({ targetSets: sets, repRangeMin: min, repRangeMax: max });

const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;

// His Incline Dumbbell Press, 12 Nov 2026: 8-12, 4 sets, 40 kg x 13 @9, 12 @9.5, 10 @9.5, 8 @9.5.
const HIS = [sess('2026-11-08', [[40, 13, 9], [40, 12, 9.5], [40, 10, 9.5], [40, 8, 9.5]])];
const HIS_LAST = [13, 12, 10, 8].map((reps) => ({ weightKg: 40, reps }));
const his = () => computeProgressionTarget({ exercise: ex(), target: range(8, 12, 4), history: HIS, todayISO: TODAY });

/** The workout card as the live screen holds it: last time's sets, set 1 maybe ticked. */
const card = (set1: number | null): DraftExercise => {
  const rows: DraftSet[] = [0, 1, 2, 3].map((i) => ({
    key: `r${i + 1}`,
    weightKg: i === 0 && set1 != null ? 40 : null,
    reps: i === 0 ? set1 : null,
    isWarmup: false,
    done: i === 0 && set1 != null,
  }));
  return {
    key: 'c1',
    exerciseId: 'incline-db',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'chest',
    equipment: 'dumbbell',
    previousSets: HIS_LAST,
    sets: rows,
  } as unknown as DraftExercise;
};
/** Each row as kgProgress reads it: a ticked row's numbers, an open row's grey hint (fillForSet). */
const liveRows = (c: DraftExercise): KgRow[] => {
  const fill = targetFill(his());
  return c.sets.map((s) => {
    if (s.done) return { weightKg: s.weightKg, reps: s.reps, done: true, isWarmup: false };
    const h = fillForSet(c, s.key, fill);
    return { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: h?.weightKg ?? null, hintReps: h?.reps ?? null };
  });
};

describe('R-454: his Incline Dumbbell Press, 40 kg x 13, 12, 10, 8 in 8-12', () => {
  it('same weight, goals 13, 12, 11, 9: set 1 keeps its 13 (was 12)', () => {
    const t = his();
    expect(t.rule).toBe('R5');
    expect(t.change).toBeNull();
    expect(t.targetWeightKg).toBe(40);
    expect(t.setGoals).toEqual([13, 12, 11, 9]);
    expect(t.repGoal).toBe(13);
    expect(targetLine(t)).toBe('40 kg · 13, 12, 11, 9');
    expect(t.reason).toBe('Add 1 rep to each set under 12: 40 kg × 13, 12, 11, 9.');
    // The range's top stays 12 (the R-143 lift-up and the RPE nudge read the real range).
    expect(t.targetRepsMax).toBe(12);
  });

  it('RPE never changes the numbers', () => {
    const plain = computeProgressionTarget({
      exercise: ex(),
      target: range(8, 12, 4),
      history: [sess('2026-11-08', [[40, 13], [40, 12], [40, 10], [40, 8]])],
      todayISO: TODAY,
    });
    expect(plain.setGoals).toEqual(his().setGoals);
  });

  it('the set rows hint 13, 12, 11, 9 and the kg to beat is 1,800 (was 1,760)', () => {
    const fill = targetFill(his())!;
    expect(fill.setReps).toEqual([13, 12, 11, 9]);
    expect(liveRows(card(null)).map((r) => r.hintReps)).toEqual([13, 12, 11, 9]);
    const p = kgPlan(his(), HIS_LAST)!;
    expect(p.total).toBe(1800);
    expect(kgToBeatLine(p, total)).toBe('1,800 kg to beat · +5% on last time');
    const g = kgProgress(p, liveRows(card(null)));
    expect(kgLiveLine(p, g, total, weight)).toBe("Next set: 40 kg × 13 · Done: 0 of today's 1,800 kg");
  });
});

describe('R-454 keeps the live line changing with each set (owner, 12 Nov 2026)', () => {
  const p = kgPlan(his(), HIS_LAST)!;

  it('(a) set 1 done 11 of 13: the missing reps go to set 2 first, at most 2 above its hint', () => {
    const rows = liveRows(card(11));
    // Set 2 is never hinted under last time's 12 (the row-above cap stops at last time's same set).
    expect(rows.slice(1).map((r) => r.hintReps)).toEqual([12, 11, 9]);
    const g = kgProgress(p, rows);
    expect(g.done).toBe(440);
    expect(g.next.map((s) => s.reps)).toEqual([13, 12, 9]);
    expect(kgLiveLine(p, g, total, weight)).toBe("Next set: 40 kg × 13 · Done: 440 of today's 1,800 kg");
  });

  it('(a) set 1 done 9: still never more than 2 extra reps a set', () => {
    const rows = liveRows(card(9));
    expect(rows.slice(1).map((r) => r.hintReps)).toEqual([12, 10, 9]);
    const g = kgProgress(p, rows);
    expect(g.next.map((s) => s.reps)).toEqual([14, 12, 10]);
    g.next.forEach((s, i) => expect(s.reps).toBeLessThanOrEqual((rows[i + 1].hintReps as number) + MAX_EXTRA_REPS));
    expect(kgLiveLine(p, g, total, weight)).toBe("Next set: 40 kg × 14 · Done: 360 of today's 1,800 kg");
  });

  it('(b) set 1 done 15: the later aims stay 12, 11, 9 (never dropped), then the done line', () => {
    const rows = liveRows(card(15));
    const g = kgProgress(p, rows);
    expect(g.done).toBe(600);
    expect(g.next.map((s) => s.reps)).toEqual([12, 11, 9]);
    expect(kgLiveLine(p, g, total, weight)).toBe("Next set: 40 kg × 12 · Done: 600 of today's 1,800 kg");
    const all = (reps: number[]): KgRow[] => reps.map((r) => ({ weightKg: 40, reps: r, done: true, isWarmup: false }));
    expect(kgLiveLine(p, kgProgress(p, all([15, 12, 11, 9])), total, weight)).toBe('Previous set volume beaten! +160\u00a0kg\nDone 1,880 kg · Previous 1,720 kg');
    expect(kgLiveLine(p, kgProgress(p, all([13, 12, 11, 9])), total, weight)).toBe('Previous set volume beaten! +80\u00a0kg\nDone 1,800 kg · Previous 1,720 kg');
  });

  it('(c) whatever set 1 did, no open set hints or aims under last time\'s same set', () => {
    for (let set1 = 1; set1 <= 16; set1++) {
      const rows = liveRows(card(set1));
      rows.slice(1).forEach((r, i) => expect(r.hintReps as number).toBeGreaterThanOrEqual(HIS_LAST[i + 1].reps));
      const g = kgProgress(p, rows);
      g.next.forEach((s, i) => expect(s.reps).toBeGreaterThanOrEqual(HIS_LAST[i + 1].reps));
    }
  });
});

describe('owner, 12 Nov 2026: the finished line says done and Previous', () => {
  const p = kgPlan(his(), HIS_LAST)!;
  const all = (reps: number[]): KgRow[] => reps.map((r) => ({ weightKg: 40, reps: r, done: true, isWarmup: false }));

  // R-498 (owner, 14 Nov 2026): green, the shout first, both totals under it; still never "last time".
  it('his screen: 40 x 14, 12, 11, 9 = 1,840 kg after 1,720 kg: "Previous set volume beaten! +120 kg" / "Done 1,840 kg · Previous 1,720 kg"', () => {
    const line = kgLiveLine(p, kgProgress(p, all([14, 12, 11, 9])), total, weight);
    expect(line).toBe('Previous set volume beaten! +120\u00a0kg\nDone 1,840 kg · Previous 1,720 kg');
    expect(line).not.toMatch(/last time|Last|kg done/);
  });

  it('the line while sets are open is unchanged', () => {
    const g = kgProgress(p, [...all([14, 12, 11]), { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 40, hintReps: 9 }]);
    expect(kgLiveLine(p, g, total, weight)).toBe("Next set: 40 kg × 9 · Done: 1,480 of today's 1,800 kg");
  });

  it('reps only: "Previous reps beaten! +3" / "Done 46 reps · Previous 43 reps" (R-498)', () => {
    const last = [15, 15, 13].map((reps) => ({ weightKg: 0, reps }));
    const t = {
      action: 'hold' as const,
      targetWeightKg: 0,
      targetSets: 3,
      repGoal: 15,
      setGoals: [15, 15, 14],
      topSetOnly: false,
      logType: 'reps' as const,
      bodyweightOnly: true,
    };
    const rp = repPlan(t, last)!;
    const g = kgProgress(rp, [16, 15, 15].map((reps) => ({ weightKg: null, reps, done: true, isWarmup: false })));
    expect(repLiveLine(rp, g)).toBe('Previous reps beaten! +3\nDone 46 reps · Previous 43 reps');
  });

  // Owner, 12 Nov 2026: one format for every exercise and every case; "reached" / "beaten" are gone.
  // R-498 (owner, 14 Nov 2026): equal is "... matched", a previous workout beaten "... beaten! +n"; first time unchanged.
  it('one format: equal is "matched", nothing before is "First time", kg and reps alike', () => {
    const kgFirst = kgPlan(his(), [])!;
    expect(kgFirst.last).toBeNull();
    expect(kgLiveLine(kgFirst, kgProgress(kgFirst, all([13, 12, 11, 9])), total, weight)).toBe('1,800 kg done · First time');
    const t = { action: 'hold' as const, targetWeightKg: 0, targetSets: 3, repGoal: 15, setGoals: [15, 15, 14], topSetOnly: false, logType: 'reps' as const, bodyweightOnly: true };
    const reps = (r: number[]) => r.map((n) => ({ weightKg: null, reps: n, done: true, isWarmup: false }));
    const same = repPlan(t, [15, 15, 14].map((n) => ({ weightKg: 0, reps: n })))!;
    expect(repLiveLine(same, kgProgress(same, reps([15, 15, 14])))).toBe('Previous reps matched\nDone 44 reps · Previous 44 reps');
    const first = repPlan(t, [])!;
    expect(repLiveLine(first, kgProgress(first, reps([15, 15, 14])))).toBe('44 reps done · First time');
    for (const l of [kgLiveLine(p, kgProgress(p, all([13, 12, 11, 9])), total, weight), repLiveLine(first, kgProgress(first, reps([16, 15, 14])))]) {
      expect(l).not.toMatch(/reached|Today's|same as last time/);
    }
  });
});

describe('owner, 12 Nov 2026: a "very hard" line only when it changes the row', () => {
  const fill = rowTargetFill(his());
  const plan = kgPlan(his(), HIS_LAST)!;
  const kg = (x: number) => `${x} kg`;
  const set = (key: string, reps: number | null, rpe: number | null = null): DraftSet => ({
    key,
    weightKg: reps != null ? 40 : null,
    reps,
    rpe,
    isWarmup: false,
    done: reps != null,
  });
  const cardOf = (sets: DraftSet[]): DraftExercise => ({ ...card(null), sets }) as DraftExercise;

  it('his screen: 14 @9.5, 12 @9.5, 11 @10, set 4 hints 9: no line (nothing changed, he is ahead)', () => {
    const c = cardOf([set('a', 14, 9.5), set('b', 12, 9.5), set('c', 11, 10), set('d', null)]);
    expect(nudgeForSet(c, 'd', fill)?.kind).toBe('hold');
    expect(fillForSet(c, 'd', fill)).toEqual({ weightKg: 40, reps: 9 });
    expect(nudgeLineShows(c, 'd', fill, plan)).toBe(false);
  });

  it('behind the plan: the hold stops the catch-up reps, so the line shows with the new words', () => {
    // 13 @9, then 11 @9.5 against a goal of 12: set 3 would take a catch-up rep; the hold stops it.
    const c = cardOf([set('a', 13, 9), set('b', 11, 9.5), set('c', null), set('d', null)]);
    const n = nudgeForSet(c, 'c', fill)!;
    expect(n.kind).toBe('hold');
    expect(fillForSet(c, 'c', fill)).toEqual({ weightKg: 40, reps: 11 }); // never under last time's 10
    expect(nudgeLineShows(c, 'c', fill, plan)).toBe(true);
    expect(nudgeLine(n, kg, 3)).toBe('Set 2 was very hard, so no extra reps on set 3.');
    // Without a plan to catch up on, the same hold changes nothing: no line.
    expect(nudgeLineShows(c, 'c', fill, null)).toBe(false);
  });

  it('reps only: a very hard set that stops catch-up reps says so; a hold never hints under last time', () => {
    const pull = ex({ id: 'pullup', name: 'Pull-Up', equipment: 'bodyweight', muscleGroup: 'back' });
    const LAST = [10, 9, 8];
    const t = computeProgressionTarget({
      exercise: pull,
      target: range(6, 12, 3),
      history: [sess('2026-11-08', LAST.map((r) => [0, r] as [number, number]))],
      todayISO: TODAY,
      logType: 'reps',
    });
    expect(t.setGoals).toEqual([11, 10, 9]);
    const rp = repPlan(t, LAST.map((reps) => ({ weightKg: 0, reps })))!;
    const c = {
      key: 'p1',
      exerciseId: 'pullup',
      name: 'Pull-Up',
      muscleGroup: 'back',
      equipment: 'bodyweight',
      logType: 'reps',
      previousSets: LAST.map((reps) => ({ weightKg: 0, reps })),
      sets: [
        { key: 'a', weightKg: null, reps: 8, rpe: 10, isWarmup: false, done: true },
        { key: 'b', weightKg: null, reps: null, isWarmup: false, done: false },
        { key: 'c', weightKg: null, reps: null, isWarmup: false, done: false },
      ],
    } as unknown as DraftExercise;
    const f = rowTargetFill(t);
    const n = nudgeForSet(c, 'b', f)!;
    expect(n.kind).toBe('hold');
    expect(fillForSet(c, 'b', f)?.reps).toBe(9); // set 2 did 9 last time: never 8
    expect(nudgeLineShows(c, 'b', f, rp)).toBe(true);
    expect(nudgeLine(n, kg, 2)).toBe('Set 1 was very hard, so no extra reps on set 2.');
  });
});

// Owner, 12 Nov 2026 (screenshot): Chest Dip, reps only, last time 16, 15, 8; today 17 @8.5, 14 @9.5,
// set 3 aimed 9, and the card said "Set 2 was very hard, so keep the same weight." on a move with no
// weight. A hold never names the weight now, shows only when it changed the row, and the top line and
// the row agree.
describe('owner, 12 Nov 2026: Chest Dip (reps only) after a very hard set', () => {
  const dip = ex({ id: 'dip', name: 'Chest Dip', equipment: 'bodyweight', muscleGroup: 'chest' });
  const LAST = [16, 15, 8];
  const t = computeProgressionTarget({
    exercise: dip,
    target: range(8, 12, 3),
    history: [sess('2026-11-08', LAST.map((r) => [0, r] as [number, number]))],
    todayISO: TODAY,
    logType: 'reps',
  });
  const plan = repPlan(t, LAST.map((reps) => ({ weightKg: 0, reps })))!;
  const f = rowTargetFill(t);
  const row = (key: string, reps: number | null, rpe: number | null = null) =>
    ({ key, weightKg: null, reps, rpe, isWarmup: false, done: reps != null }) as DraftSet;
  const cardOf = (sets: DraftSet[]) =>
    ({
      key: 'd1',
      exerciseId: 'dip',
      name: 'Chest Dip',
      muscleGroup: 'chest',
      equipment: 'bodyweight',
      logType: 'reps',
      previousSets: LAST.map((reps) => ({ weightKg: 0, reps })),
      sets,
    }) as unknown as DraftExercise;
  /** The card's own wiring: each row's hint, and "eased" on a row a very hard set eased. */
  const line = (c: DraftExercise) =>
    repLiveLine(
      plan,
      kgProgress(
        plan,
        c.sets.map((s) => {
          const h = fillForSet(c, s.key, f);
          const k = nudgeForSet(c, s.key, f)?.kind;
          return { weightKg: s.weightKg, reps: s.reps, done: s.done, isWarmup: false, hintKg: h?.weightKg, hintReps: h?.reps, eased: k === 'lighter' || k === 'hold' };
        }),
      ),
    );

  it('his screen: 17 @8.5, 14 @9.5 -> set 3 aims 9 (last time 8 + 1), no line, top line says 9 too', () => {
    expect(t.setGoals).toEqual([16, 15, 9]);
    const c = cardOf([row('a', 17, 8.5), row('b', 14, 9.5), row('c', null)]);
    expect(nudgeForSet(c, 'c', f)?.kind).toBe('hold');
    expect(fillForSet(c, 'c', f)?.reps).toBe(9);
    // Set 1's extra rep covers set 2's missing one: the hold changed nothing, so no line.
    expect(nudgeLineShows(c, 'c', f, plan)).toBe(false);
    expect(line(c)).toMatch(/^Next set: 9 reps\b/);
  });

  it('behind: 16, then 13 @9.5 -> the hold stops the catch-up reps; the line talks reps, never weight', () => {
    const c = cardOf([row('a', 16, 8.5), row('b', 13, 9.5), row('c', null)]);
    const n = nudgeForSet(c, 'c', f)!;
    expect(n.kind).toBe('hold');
    expect(fillForSet(c, 'c', f)?.reps).toBe(9);
    expect(nudgeLineShows(c, 'c', f, plan)).toBe(true);
    const words = nudgeLine(n, (kg) => `${kg} kg`, 3);
    expect(words).toBe('Set 2 was very hard, so no extra reps on set 3.');
    expect(words).not.toMatch(/weight|kg/);
    // The top line follows the eased row: 9, not 9 + catch-up.
    expect(line(c)).toMatch(/^Next set: 9 reps\b/);
  });
});

describe('R-454: the row-above cap stops at last time (UAT flow r439-b, Goblet Squat)', () => {
  it('20 x 8, 5 last time; set 1 done 20 x 3 -> set 2 hints 5 (was 3), never its goal 6', () => {
    const t = computeProgressionTarget({
      exercise: ex({ id: 'goblet', name: 'Goblet Squat', muscleGroup: 'quads' }),
      target: range(8, 12, 2),
      history: [sess('2026-11-08', [[20, 8], [20, 5]])],
      todayISO: TODAY,
    });
    expect(t.setGoals).toEqual([9, 6]);
    const c = {
      key: 'g1',
      exerciseId: 'goblet',
      name: 'Goblet Squat',
      muscleGroup: 'quads',
      equipment: 'dumbbell',
      previousSets: [{ weightKg: 20, reps: 8 }, { weightKg: 20, reps: 5 }],
      sets: [
        { key: 'a', weightKg: 20, reps: 3, isWarmup: false, done: true },
        { key: 'b', weightKg: null, reps: null, isWarmup: false, done: false },
      ],
    } as unknown as DraftExercise;
    expect(fillForSet(c, 'b', targetFill(t))).toEqual({ weightKg: 20, reps: 5 });
    // Typed at another weight above: last time's 20 kg set says nothing about it (the old cap).
    const lighter = { ...c, sets: [{ ...c.sets[0], weightKg: 15 }, c.sets[1]] } as DraftExercise;
    expect(fillForSet(lighter, 'b', targetFill(t))).toEqual({ weightKg: 15, reps: 3 });
  });
});

describe('R-454: a set done at another weight than planned (his Lateral Raise, 12 Nov 2026)', () => {
  // Last time at 20 kg: 20 @9, 17 @9.5, 15 @9, 19 @9.5; range 10-15, so the plan moved up to 25 kg.
  const LAST = [20, 17, 15, 19];
  const lateral = ex({ id: 'lateral', name: 'Lateral Raise', muscleGroup: 'shoulders', isCompound: false });
  const t = computeProgressionTarget({
    exercise: lateral,
    target: range(10, 15, 4),
    history: [sess('2026-11-08', [[20, 20, 9], [20, 17, 9.5], [20, 15, 9], [20, 19, 9.5]])],
    todayISO: TODAY,
    ladder: [15, 20, 25],
  });
  const fill = rowTargetFill(t);
  const lastSets = LAST.map((reps) => ({ weightKg: 20, reps }));
  const lateralCard = (rows: DraftSet[]): DraftExercise =>
    ({ key: 'l1', exerciseId: 'lateral', name: 'Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', previousSets: lastSets, sets: rows }) as unknown as DraftExercise;
  const open = (key: string): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false });

  it('the plan: 25 kg x 15, 13, 12, 15', () => {
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(25);
    expect(t.setGoals).toEqual([15, 13, 12, 15]);
  });

  it('set 1 done at 20 kg x 20: sets 2-4 follow 20 kg and aim 17, 15, 19 (never 13, 12, 15)', () => {
    const c = lateralCard([{ key: 'a', weightKg: 20, reps: 20, isWarmup: false, done: true }, open('b'), open('c'), open('d')]);
    const hints = ['b', 'c', 'd'].map((k) => fillForSet(c, k, fill));
    expect(hints).toEqual([
      { weightKg: 20, reps: 17 },
      { weightKg: 20, reps: 15 },
      { weightKg: 20, reps: 19 },
    ]);
    hints.forEach((h, i) => expect(h!.reps).toBeGreaterThanOrEqual(LAST[i + 1]));
  });

  it('the live line and the rows show the same numbers', () => {
    const c = lateralCard([{ key: 'a', weightKg: 20, reps: 20, isWarmup: false, done: true }, open('b'), open('c'), open('d')]);
    const p = kgPlan(t, lastSets)!;
    const rows: KgRow[] = c.sets.map((s) => {
      if (s.done) return { weightKg: s.weightKg, reps: s.reps, done: true, isWarmup: false };
      const h = fillForSet(c, s.key, fill)!;
      return { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: h.weightKg, hintReps: h.reps };
    });
    const g = kgProgress(p, rows);
    expect(g.next.map((s) => s.reps)).toEqual([17, 15, 19]);
    expect(kgLiveLine(p, g, total, weight)).toBe("Next set: 20 kg × 17 · Done: 400 of today's 1,420 kg");
  });

  // Owner, 12 Nov 2026 (screenshot): this card read "Today's 1,420 kg reached" with no previous number
  // while another exercise read "... done · Previous: ...". One format for every case now.
  it('his finish, 20 kg x 20, 19, 16, 16 = 1,420 after 1,420: "same as last time", never "reached"', () => {
    const p = kgPlan(t, lastSets)!;
    const rows = [20, 19, 16, 16].map((reps): KgRow => ({ weightKg: 20, reps, done: true, isWarmup: false }));
    const line = kgLiveLine(p, kgProgress(p, rows), total, weight);
    expect(line).toBe('Previous set volume matched\nDone 1,420 kg · Previous 1,420 kg');
    expect(line).not.toMatch(/reached|beaten/);
  });

  it('no history at the weight done: the planned aim moved by the kilos, never under it (22.5 kg: 13 -> 14)', () => {
    const c = lateralCard([{ key: 'a', weightKg: 22.5, reps: 16, isWarmup: false, done: true }, open('b'), open('c'), open('d')]);
    expect(fillForSet(c, 'b', fill)).toEqual({ weightKg: 22.5, reps: 14 }); // 13 x 25 / 22.5 = 14.4
    expect(fillForSet(c, 'c', fill)).toEqual({ weightKg: 22.5, reps: 13 }); // 12 x 25 / 22.5 = 13.3
    expect(fillForSet(c, 'd', fill)).toEqual({ weightKg: 22.5, reps: 16 }); // 15 x 25 / 22.5 = 16.7, capped by the 16 just done
  });

  it('heavier than planned: never under the planned aims', () => {
    expect(goalAtWeight(13, 25, 27.5, null, 15)).toBe(13);
    expect(goalAtWeight(13, 25, 20, { weightKg: 20, reps: 12 }, 15)).toBe(13); // last time under the top: +1
    expect(goalAtWeight(13, 25, 20, { weightKg: 20, reps: 17 }, 15)).toBe(17); // past the top: kept
  });
});

describe('R-454: what stays the same', () => {
  it('every set at the top: the weight goes up, as before', () => {
    const t = computeProgressionTarget({
      exercise: ex(),
      target: range(8, 12, 4),
      history: [sess('2026-11-08', [[40, 12], [40, 12], [40, 12], [40, 12]])],
      todayISO: TODAY,
    });
    expect(t.rule).toBe('R2');
    expect(t.change).toBe('up');
    expect(t.targetWeightKg).toBeGreaterThan(40);
    expect(Math.max(...t.setGoals)).toBeLessThanOrEqual(12);
  });

  it('below the range: +1 a set, the floor changes nothing (40 x 7, 6, 6 -> 8, 7, 7)', () => {
    const t = computeProgressionTarget({
      exercise: ex(),
      target: range(8, 12, 3),
      history: [sess('2026-11-08', [[40, 7], [40, 6], [40, 6]])],
      todayISO: TODAY,
    });
    expect(t.rule).toBe('R5');
    expect(t.targetWeightKg).toBe(40);
    expect(t.setGoals).toEqual([8, 7, 7]);
  });

  it('a weight step is a different weight: no floor (13 last time never asks 13 at the new weight)', () => {
    const t = computeProgressionTarget({
      exercise: ex(),
      target: range(8, 12, 4),
      history: [sess('2026-11-08', [[40, 13], [40, 12], [40, 12], [40, 12]])],
      todayISO: TODAY,
    });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBeGreaterThan(40);
    expect(Math.max(...t.setGoals)).toBeLessThanOrEqual(12);
  });
});

describe('R-454: bodyweight reps take the same floor', () => {
  const pull = ex({ id: 'pullup', name: 'Pull-Up', equipment: 'bodyweight', muscleGroup: 'back' });
  const LAST = [17, 12, 9];
  const t = computeProgressionTarget({
    exercise: pull,
    target: range(6, 10, 3),
    history: [sess('2026-11-08', LAST.map((r) => [0, r] as [number, number]))],
    todayISO: TODAY,
    logType: 'reps',
  });

  it('17, 12, 9 under a cap of 15 aims 17, 13, 10 (was 15, 13, 10)', () => {
    expect(t.rule).toBe('B1');
    expect(t.bodyweightOnly).toBe(true);
    expect(t.setGoals).toEqual([17, 13, 10]);
  });

  it('the reps to beat add up the same goals: 40, +2 on last time', () => {
    const p = repPlan(t, LAST.map((reps) => ({ weightKg: 0, reps })))!;
    expect(p.total).toBe(40);
    expect(repsToBeatLine(p)).toBe('40 reps to beat · +2 on last time');
  });
});

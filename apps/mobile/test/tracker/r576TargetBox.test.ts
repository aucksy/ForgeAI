/**
 * R-576 (owner, 15 Nov 2026): the target box as one simple piece, three rules.
 *   1. Previous = every working set of the previous workout added up (warm-ups and drop sets out; reps on a
 *      move with no kilos).
 *   2. Today's target = exactly what the set rows suggest, added up (the box and the rows never disagree).
 *   3. The target beats Previous: 1 rep at a time on the first sets, at most 2 a set; only a break of 6+
 *      weeks may aim at the same or less. Whenever a target is unusual, the box says why in plain words and
 *      the "i" stands out ("if there's an unusual calculation, there is a reason behind it").
 * His bug: Hip Thrust Machine after 29 days read "Previous set volume: 360 kg · Today's target: 310 kg"
 * (every set aimed at 8, the bottom of the range, rule R1 at 21+ days, and the box showed the lower plan).
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

import {
  computeProgressionTarget,
  targetFill,
  toEasyTarget,
  type ProgSession,
  type ProgSet,
  type ProgressionTarget,
} from '@/tracker/engine/progression';
import {
  beatPlan,
  kgPlan,
  kgProgress,
  liveBox,
  liveWhy,
  repPlan,
  targetWhy,
  whyIcon,
  whyKey,
  whySets,
  whyText,
  type KgPlan,
  type KgRow,
  type KgSet,
  type Why,
} from '@/tracker/lib/kgTarget';
import { beatRows, fillForSet, type DraftExercise, type DraftSet } from '@/tracker/store/activeWorkoutStore';
import type { Exercise } from '@/types/models';

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'hip-thrust',
  name: 'Hip Thrust Machine',
  aliases: [],
  muscleGroup: 'glutes',
  secondaryMuscles: [],
  equipment: 'machine',
  isCompound: true,
  incrementKg: 2.5,
  ...over,
} as Exercise);
type S = [number, number, (number | null)?, ProgSet['setType']?, boolean?];
const sess = (dateISO: string, sets: S[]): ProgSession => ({
  dateISO,
  sets: sets.map(([weightKg, reps, rpe = null, setType = 'normal', longRest]) => ({ weightKg, reps, rpe, setType, ...(longRest ? { longRest: true } : {}) })),
});
const range = (min: number, max: number, sets: number) => ({ targetSets: sets, repRangeMin: min, repRangeMax: max });
const total = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`;
const weight = (kg: number) => `${kg} kg`;
/** Last time's working sets as the card's PREVIOUS holds them (warm-ups and drop sets out). */
const lastOf = (s: ProgSession): KgSet[] => s.sets.filter((x) => x.setType === 'normal' || x.setType === 'failure').map((x) => ({ weightKg: x.weightKg, reps: x.reps }));
const words = (why: readonly Why[] | undefined) => (why ?? []).map((w) => whyText(w, weight));
/** Never "volume", "PR", "session", "today" or "last time" in a reason (member-words, R-499). */
const BANNED = /\bvolume\b|\bp[rb]s?\b|\bsessions?\b|\btoday\b|last time/i;

// His Hip Thrust Machine, 17 Oct 2026: a 0 kg warm-up, then 10 x 10 @8.5, 10 x 11 @9, 15 x 10 @8.5 (8-12, 3 sets).
const HIP = sess('2026-10-17', [[0, 10, null, 'warmup'], [10, 10, 8.5], [10, 11, 9], [15, 10, 8.5]]);
const hip = (todayISO: string) => computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [HIP], todayISO });

describe('R-576: his Hip Thrust Machine after 29 days (15 Nov 2026)', () => {
  const t = hip('2026-11-15');
  const p = kgPlan(t, lastOf(HIP))!;
  it('29 days is a normal day: one more rep on the 10 kg sets, the 15 kg set as it was', () => {
    expect(t.rule).not.toBe('R1');
    expect(t.breakWeeks).toBeUndefined();
    expect(p.sets.map((s) => [s.weightKg, s.reps])).toEqual([[10, 11], [10, 12], [15, 10]]);
  });
  it('the box: Previous 360 kg (warm-up out), target 380 kg, no reason, the "i" as always', () => {
    expect(p.last).toBe(360);
    expect(p.total).toBe(380);
    expect(p.why).toBeUndefined();
    const g = kgProgress(p, p.sets.map((): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false })));
    expect(liveBox(p, g, total).head).toBe(`Previous set volume: 360${String.fromCharCode(160)}kg · Today's target: 380${String.fromCharCode(160)}kg`);
    expect(whyIcon(p.why ?? [], null)).toBe('plain');
  });
  it('the rows hint exactly the box: 10 x 11, 10 x 12, 15 x 10', () => {
    const c = card(lastOf(HIP), [null, null, null]);
    const fill = targetFill(t);
    expect(c.sets.map((s) => fillForSet(c, s.key, fill)).map((f) => [f?.weightKg, f?.reps])).toEqual([[10, 11], [10, 12], [15, 10]]);
    expect(beatRows(c, fill)?.target).toBe(380);
  });
});

describe('R-576: only a break of 6 weeks or more may aim lower, and it says why', () => {
  const t = hip('2026-12-05'); // 49 days = 7 weeks
  const p = kgPlan(t, lastOf(HIP))!;
  it('7 weeks: a lighter start (R1b), the reason in the box and the "i" standing out', () => {
    expect(t.rule).toBe('R1b');
    expect(t.breakWeeks).toBe(7);
    expect(t.change).toBe('down');
    expect(p.total).toBeLessThan(p.last!);
    expect(words(p.why)).toEqual(['Back after 7 weeks, so a lighter start.']);
    expect(whyIcon(p.why!, null)).toBe('standout');
    // Once opened it keeps its colour but stops moving.
    expect(whyIcon(p.why!, whyKey(p.why!))).toBe('seen');
  });
  it('6 weeks exactly (42 days) counts; 41 days does not', () => {
    expect(hip('2026-11-28').breakWeeks).toBe(6);
    expect(hip('2026-11-27').breakWeeks).toBeUndefined();
  });
  it('a body-weight move after 7 weeks: the same reps-at-the-bottom start, said as an easier start', () => {
    const h = sess('2026-10-17', [[0, 12], [0, 11], [0, 10]]);
    const bt = computeProgressionTarget({ exercise: ex({ name: 'Push-Up', equipment: 'bodyweight' }), target: range(8, 15, 3), history: [h], todayISO: '2026-12-05', logType: 'reps' });
    expect(bt.rule).toBe('R1');
    expect(words(repPlan(bt, lastOf(h))!.why)).toEqual(['Back after 7 weeks, so an easier start.']);
  });
  it('a timed hold after 7 weeks keeps its time and says why; after 30 days it climbs as usual', () => {
    const h: ProgSession = { dateISO: '2026-10-17', sets: [1, 2, 3].map(() => ({ weightKg: 0, reps: 0, rpe: null, setType: 'normal' as const, durationSec: 40 })) };
    const plank = (todayISO: string) => computeProgressionTarget({ exercise: ex({ name: 'Plank', equipment: 'bodyweight' }), target: range(8, 12, 3), history: [h], todayISO, logType: 'time' });
    const late = plank('2026-12-05');
    expect(late.rule).toBe('T1');
    expect(words(targetWhy(late))).toEqual(['Back after 7 weeks, so an easier start.']);
    const soon = plank('2026-11-16');
    expect(soon.rule).not.toBe('T1');
    expect(targetWhy(soon)).toEqual([]);
  });
});

describe('R-576 rule 3: a weight step still beats Previous', () => {
  const tbar = ex({ id: 'tbar', name: 'T-Bar Row', muscleGroup: 'back', equipment: 'machine' });
  it('30 x 13, 12, 10 (1,050 kg) -> 32.5 kg x 12, 11, 10 = 1,072.5 kg, and why', () => {
    const h = sess('2026-11-01', [[30, 13], [30, 12], [30, 10]]);
    const t = computeProgressionTarget({ exercise: tbar, target: range(6, 10, 3), history: [h], todayISO: '2026-11-05' });
    expect(t.rule).toBe('R2');
    expect(t.targetWeightKg).toBe(32.5);
    expect(t.setGoals).toEqual([12, 11, 10]);
    expect(t.extraReps).toEqual([2, 1, 1]);
    expect(t.targetRepsMax).toBe(10);
    expect(t.reason).toBe('All sets reached 10. Move up to 32.5 kg: 12, 11, 10.');
    const p = kgPlan(t, lastOf(h))!;
    expect(p.total).toBe(1072.5);
    expect(words(p.why)).toEqual(['Heavier weight, so some sets aim for fewer reps than previous.', 'Sets 1, 2 and 3 get up to 2 extra reps so the total beats previous.']);
    expect(whySets(p.why!)).toEqual([1, 2, 3]);
    expect(whyIcon(p.why!, null)).toBe('standout');
  });
  it('a step that cannot beat it even with 2 extra reps a set says so', () => {
    const h = sess('2026-11-01', [[20, 30], [20, 30], [20, 30]]);
    const t = computeProgressionTarget({ exercise: tbar, target: range(8, 12, 3), history: [h], todayISO: '2026-11-05' });
    expect(t.change).toBe('up');
    const p = kgPlan(t, lastOf(h))!;
    expect(p.total).toBeLessThan(p.last!);
    expect(words(p.why)).toEqual(['Heavier weight, so some sets aim for fewer reps than previous.', 'Even with 2 extra reps a set, the target is not above previous.']);
  });
});

describe('R-576: fewer sets than last time', () => {
  it('3 sets against 4: topped up; when it still cannot beat it, the box says why', () => {
    const h = sess('2026-11-01', [[40, 10], [40, 10], [40, 10], [40, 10]]);
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [h], todayISO: '2026-11-05' });
    expect(t.setGoals).toEqual([13, 13, 13]); // 11 + up to 2 a set: 40 x 13 x 3 = 1,560 < 1,600
    const p = kgPlan(t, lastOf(h))!;
    expect(p.setDiff).toBe(-1);
    expect(words(p.why)).toEqual(['3 sets planned, 4 in the previous workout, so the target is not above previous.']);
  });
  it('3 sets against 4 where 3 can beat it: extra reps, said, never a set under its last reps', () => {
    const h = sess('2026-11-01', [[40, 10], [40, 10], [40, 10], [40, 3]]);
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [h], todayISO: '2026-11-05' });
    const p = kgPlan(t, lastOf(h))!;
    expect(p.total).toBeGreaterThan(p.last!);
    expect(p.sets.every((s, i) => s.reps >= lastOf(h)[i].reps)).toBe(true);
  });
});

describe('R-576: per-set reasons, and their rows are marked', () => {
  it('R-143: a lighter set that reached the top moves up; the extra rep that keeps it above is named', () => {
    const h = sess('2026-11-01', [[12, 10], [12, 10], [10, 12]]);
    const t = computeProgressionTarget({ exercise: ex({ name: 'Dumbbell Curl', equipment: 'dumbbell' }), target: range(8, 12, 3), history: [h], todayISO: '2026-11-05' });
    const p = kgPlan(t, lastOf(h))!;
    expect(p.sets.map((s) => [s.weightKg, s.reps])).toEqual([[12, 12], [12, 11], [12, 8]]);
    expect(p.total).toBe(372);
    expect(words(p.why)).toEqual(['Set 3 reached the top of its range, so it moves up to 12 kg.', 'Set 1 gets an extra rep so the total beats previous.']);
    expect(whySets(p.why!)).toEqual([1, 3]);
  });
  it('F73: a set done after a long rest is not raised, and says so', () => {
    const h = sess('2026-11-01', [[40, 10], [40, 10, null, 'normal', true], [40, 10]]);
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [h], todayISO: '2026-11-05' });
    expect(t.setGoals).toEqual([11, 10, 11]);
    const p = kgPlan(t, lastOf(h))!;
    expect(words(p.why)).toEqual(['Set 2 came after a long rest in the previous workout, so it is not raised.']);
    expect(whySets(p.why!)).toEqual([2]);
  });
  it('R-300: a set that missed its goal aims for it again, and says so', () => {
    const h = [sess('2026-11-04', [[40, 11], [40, 9], [40, 10]]), sess('2026-11-01', [[40, 10], [40, 10], [40, 10]])];
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: h, todayISO: '2026-11-06' });
    expect(t.setGoals).toEqual([12, 11, 11]);
    const p = kgPlan(t, lastOf(h[0]))!;
    expect(words(p.why)).toEqual(['Set 2 fell short in the previous workout, so it aims again for 11.']);
  });
  it('R3: under the range twice -> a step back, said in the box (its own words)', () => {
    const h = [sess('2026-11-04', [[40, 6], [40, 5], [40, 5]]), sess('2026-11-01', [[40, 7], [40, 6], [40, 5]])];
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: h, todayISO: '2026-11-06' });
    expect(t.rule).toBe('R3');
    const p = kgPlan(t, lastOf(h[0]))!;
    expect(words(p.why)[0]).toBe(t.dropNote);
    expect(p.total).toBeGreaterThan(p.last!);
  });
});

describe('R-576: during the workout the rows carry the catch-up reps (R-304) and the box says so', () => {
  // His Incline Dumbbell Press (R-454): 40 x 13, 12, 10, 8 -> 13, 12, 11, 9 = 1,800 kg.
  const h = sess('2026-11-08', [[40, 13], [40, 12], [40, 10], [40, 8]]);
  const t = computeProgressionTarget({ exercise: ex({ name: 'Incline Dumbbell Press', equipment: 'dumbbell' }), target: range(8, 12, 4), history: [h], todayISO: '2026-11-12' });
  const fill = targetFill(t);
  it('a normal day: no reason, the "i" as always', () => {
    const p = kgPlan(t, lastOf(h))!;
    expect(p.why).toBeUndefined();
    expect(whyIcon([], null)).toBe('plain');
  });
  it('set 1 done at 11 of 13: sets 2 and 3 aim one more, never under their last reps; the box names them', () => {
    const c = card(lastOf(h), [11, null, null, null], 40);
    const br = beatRows(c, fill)!;
    expect(br.target).toBe(1800);
    const hints = c.sets.slice(1).map((s) => fillForSet(c, s.key, fill)?.reps);
    expect(hints).toEqual([13, 12, 9]);
    expect(hints.every((r, i) => r! >= lastOf(h)[i + 1].reps)).toBe(true);
    const sets = c.sets.flatMap((s, i) => ((br.extra.get(s.key) ?? 0) > 0 ? [i + 1] : []));
    const why = liveWhy({ sets, most: Math.max(...br.extra.values()), short: br.short, ticked: true });
    expect(words(why)).toEqual(['Sets 2 and 3 aim for an extra rep to reach the target.']);
    // The box counts what the rows show: 440 done, 1,360 to go = 13 + 12 + 9 at 40 kg.
    const p: KgPlan = { ...kgPlan(t, lastOf(h))!, total: br.target };
    const g = kgProgress(p, c.sets.map((s, i) => (i === 0 ? { weightKg: 40, reps: 11, done: true, isWarmup: false } : { weightKg: null, reps: null, done: false, isWarmup: false, hintKg: 40, hintReps: hints[i - 1] })));
    expect(g.left).toBe(1360);
    expect(g.next.reduce((a, s) => a + s.weightKg * s.reps, 0)).toBe(1360);
    expect(g.short).toBe(false);
  });
  it('nothing typed moves the rows: a weight typed into an open row adds no reps elsewhere', () => {
    const c = card(lastOf(h), [null, null, null, null]);
    const typed = { ...c, sets: c.sets.map((s, i) => (i === 0 ? { ...s, weightKg: 30 } : s)) };
    expect(beatRows(typed, fill)!.extra.size).toBe(0);
  });
  it('the sets left cannot reach it: said once a set is ticked', () => {
    const c = card(lastOf(h), [3, null, null, null], 40);
    const br = beatRows(c, fill)!;
    expect(br.short).toBe(true);
    expect(words(liveWhy({ sets: [2, 3, 4], most: 2, short: br.short, ticked: true }))).toEqual(["The sets left can't reach the target. That's fine, the next workout aims again."]);
  });
  it('ahead of the target: nothing is added (a good day stays a good day)', () => {
    const c = card(lastOf(h), [15, null, null, null], 40);
    expect(beatRows(c, fill)!.extra.size).toBe(0);
  });
});

describe('R-576: reps only, lb, warm-ups and drop sets', () => {
  it('reps only: Dips 16, 15, 8 = 39 reps -> more than 39, the box counts reps', () => {
    const h = sess('2026-11-08', [[0, 16], [0, 15], [0, 8]]);
    const t = computeProgressionTarget({ exercise: ex({ name: 'Dips', equipment: 'bodyweight' }), target: range(8, 12, 3), history: [h], todayISO: '2026-11-12', logType: 'reps' });
    const p = repPlan(t, lastOf(h))!;
    expect(p.last).toBe(39);
    expect(p.total).toBeGreaterThan(39);
    expect(p.total).toBe(t.setGoals.reduce((a, b) => a + b, 0));
    t.setGoals.forEach((g, i) => expect(g).toBeGreaterThanOrEqual(lastOf(h)[i].reps));
    expect(p.why).toBeUndefined();
    const g = kgProgress(p, [0, 1, 2].map((): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false })));
    expect(liveBox(p, g, total).head).toBe(`Previous reps: 39 · Today's target: ${p.total}`);
  });
  it('reps only, near the rep cap: still more reps than last time', () => {
    const h = sess('2026-11-08', [[0, 15], [0, 15], [0, 14]]);
    const t = computeProgressionTarget({ exercise: ex({ name: 'Dips', equipment: 'bodyweight' }), target: range(8, 12, 3), history: [h], todayISO: '2026-11-12', logType: 'reps' });
    const p = repPlan(t, lastOf(h))!;
    expect(p.total).toBeGreaterThan(44);
  });
  it('lb: a set typed as the pound weight shown never earns a catch-up rep (T76)', () => {
    const LB = 60.0103; // 132.3 lb
    const h = sess('2026-11-08', [[LB, 10], [LB, 10], [LB, 10]]);
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [h], todayISO: '2026-11-12' });
    const fill = targetFill(t);
    const c = card(lastOf(h), [11, null, null], 60.01);
    expect(beatRows(c, fill)!.extra.size).toBe(0);
    const p = beatPlan(t, lastOf(h))!;
    const lb = (kg: number) => `${Math.round(kg / 0.45359237).toLocaleString('en-US')} lb`;
    const g = kgProgress(p, [0, 1, 2].map((): KgRow => ({ weightKg: null, reps: null, done: false, isWarmup: false })));
    expect(liveBox(p, g, lb).head).toBe(`Previous set volume: 3,969${String.fromCharCode(160)}lb · Today's target: 4,365${String.fromCharCode(160)}lb`);
  });
  it('warm-ups never count and a drop set is never planned (it counts when done)', () => {
    const h = sess('2026-11-08', [[20, 10, null, 'warmup'], [40, 10], [40, 10], [40, 10], [25, 12, null, 'drop']]);
    const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [h], todayISO: '2026-11-12' });
    expect(t.setGoals).toEqual([11, 11, 11]);
    expect(t.extraReps).toBeUndefined();
    const p = kgPlan(t, lastOf(h))!;
    expect(p.last).toBe(1200);
    const fill = targetFill(t);
    const rows: DraftSet[] = [
      { key: 'w', weightKg: 20, reps: 10, isWarmup: true, done: true },
      { key: 'a', weightKg: 40, reps: 11, isWarmup: false, done: true },
      { key: 'b', weightKg: null, reps: null, isWarmup: false, done: false },
      { key: 'c', weightKg: null, reps: null, isWarmup: false, done: false },
      { key: 'd', weightKg: 25, reps: 12, isWarmup: false, done: true, setType: 'drop' },
    ];
    const c = { ...card(lastOf(h), []), sets: rows } as DraftExercise;
    const br = beatRows(c, fill)!;
    expect(br.target).toBe(1320);
    expect(br.done).toBe(440 + 300);
    expect(br.extra.size).toBe(0);
  });
});

describe('R-576: Targets with no box still say why', () => {
  const h = sess('2026-11-08', [[40, 10], [40, 10], [40, 10]]);
  const base = computeProgressionTarget({ exercise: ex(), target: range(8, 12, 3), history: [h], todayISO: '2026-11-12' });
  it('another Counting: no box, and the reason', () => {
    const t: ProgressionTarget = { ...base, countingChanged: true };
    expect(beatPlan(t, lastOf(h))).toBeNull();
    expect(words(targetWhy(t))).toEqual(['You changed how this weight is counted, so there is no previous total to beat.']);
  });
  it('an easy week: its own reason', () => {
    const t = toEasyTarget(base, 'An easy week: fewer sets, stop with 3 or more reps left.', (n) => Math.ceil(n / 2));
    expect(beatPlan(t, lastOf(h))).toBeNull();
    expect(words(targetWhy(t))).toEqual(['An easy week: fewer sets, stop with 3 or more reps left.']);
  });
  it('a normal Target with a box has no Target-only reason', () => {
    expect(targetWhy(base)).toEqual([]);
  });
});

describe('R-576: the hard rule and the words', () => {
  it('no set ever aims under its last reps at the same weight, on any rule that keeps the weight', () => {
    const cases: [number, number][][] = [
      [[40, 13], [40, 12], [40, 10], [40, 8]],
      [[30, 12], [30, 12], [30, 9]],
      [[50, 15], [50, 9], [50, 8]],
    ];
    for (const sets of cases) {
      const h = sess('2026-11-01', sets);
      const t = computeProgressionTarget({ exercise: ex(), target: range(8, 12, sets.length), history: [h], todayISO: '2026-11-05' });
      if (t.change != null) continue;
      t.setGoals.forEach((g, i) => expect(g).toBeGreaterThanOrEqual(sets[i][1]));
    }
  });
  it('every reason is plain English with no banned word', () => {
    const all: Why[] = [
      { kind: 'break', weeks: 7, lighter: true },
      { kind: 'heavier' },
      { kind: 'liftUp', sets: [3, 4], weightKg: 25 },
      { kind: 'held', sets: [2, 3] },
      { kind: 'again', sets: [2, 3], goals: [10, 9] },
      { kind: 'extra', sets: [1], most: 1 },
      { kind: 'notAbove', todaySets: 3, lastSets: 3 },
      { kind: 'counting' },
      { kind: 'catchUp', sets: [2], most: 2 },
      { kind: 'cannotReach' },
    ];
    for (const w of words(all)) {
      expect(w).not.toMatch(BANNED);
      expect(w.length).toBeLessThan(100);
    }
  });
});

/** The live card's rows: last time's sets, the first rows ticked at `reps` (null = open). */
function card(previous: KgSet[], reps: (number | null)[], kg?: number): DraftExercise {
  const rows: DraftSet[] = reps.map((r, i) => ({
    key: `r${i + 1}`,
    weightKg: r != null ? kg ?? previous[i]?.weightKg ?? null : null,
    reps: r,
    isWarmup: false,
    done: r != null,
  }));
  return {
    key: 'c1',
    exerciseId: 'x',
    name: 'X',
    muscleGroup: 'chest',
    equipment: 'machine',
    previousSets: previous,
    sets: rows,
  } as unknown as DraftExercise;
}

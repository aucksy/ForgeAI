/**
 * R-499 (owner, 14 Nov 2026, his Profile, Kg lifted chip): "Today: Pull 2. 3,780 kg to lift today. 1,840 kg
 * more than last time (1,940 kg). Not counted: 2 exercises that are new to you or use a different weight
 * each set." A next goal must be a small step over the previous (one more rep a set, or one weight step),
 * never +95%, and the words are Next and Previous, never "today" or "last time".
 *
 * The cause: the goal (every exercise of the routine as planned now, minus the ones not counted) was
 * compared with the newest workout of the ROUTINE as a whole. Those are different lists of exercises: a
 * short previous Pull 2 (his Pull 2 days ran 3 to 6 exercises), an exercise last done in another workout
 * (its Target reads it from there), and the 2 "not counted" exercises still inside the previous total.
 * Now both sides are the SAME exercises, each one's previous being the sets its Target reads (`lastSets`),
 * counted by the one volume rule (dumbbells "each" x2, pull-ups and dips add body weight).
 */
import { describe, expect, it } from 'vitest';

import { bodyweightOn, setVolumeKg, type BodyweightPoint, type VolumeRule } from '@/tracker/engine/volume';
import { goalParts, goalText, goalTitle, plannedSets, todayGoalFrom, todayLineWords, type GoalTarget, type KgOf, type TodayGoal } from '@/tracker/lib/todayGoal';

const TODAY = '2026-11-14';
/** A no-break space: a number and its unit never split over two lines. */
const NB = String.fromCharCode(160);

const RULES: Record<string, VolumeRule> = {
  chin: { logType: 'reps', loadMode: 'one', bwShare: 1 },
  lat: { logType: 'weight_reps', loadMode: 'one', bwShare: 0 },
  row: { logType: 'weight_reps', loadMode: 'one', bwShare: 0 },
  wrist: { logType: 'weight_reps', loadMode: 'one', bwShare: 0 },
  curl: { logType: 'weight_reps', loadMode: 'both', bwShare: 0 },
  cable: { logType: 'weight_reps', loadMode: 'one', bwShare: 0 },
  plank: { logType: 'time', loadMode: 'one', bwShare: 0 },
};

/** The one volume rule, as the service's counter applies it (each set the exercise's current way). */
const counter =
  (bw: BodyweightPoint[] = [{ dateISO: '2026-01-01', weightKg: 80 }]): KgOf =>
  (id, sets, dateISO) =>
    sets.reduce((kg, s) => kg + setVolumeKg({ weightKg: s.weightKg, reps: s.reps, isWarmup: false, loadMode: null }, RULES[id], bodyweightOn(bw, dateISO)), 0);

const t = (id: string, o: Partial<GoalTarget> = {}): GoalTarget => ({
  exerciseId: id,
  action: 'increase',
  targetWeightKg: 50,
  targetRepsMin: 8,
  targetRepsMax: 15,
  targetSets: 3,
  repGoal: 13,
  setGoals: [13, 12, 11],
  last: { weightKg: 50, topReps: 12, sets: 3, dateISO: '2026-11-10' },
  lastSets: [
    { weightKg: 50, reps: 12 },
    { weightKg: 50, reps: 11 },
    { weightKg: 50, reps: 10 },
  ],
  bodyweightOnly: false,
  logType: 'weight_reps',
  free: false,
  topSetOnly: false,
  version: null,
  ...o,
});

/**
 * His Pull 2 as the report reads it. Body weight 80 kg.
 *  - Chin Up (body weight counts): last done in Pull 1 on 12 Nov, 12, 10, 8; plan 13, 11, 9.
 *  - Lat Pulldown: 30 kg x 12, 12, 11 in the previous Pull 2 (10 Nov, a short day); plan 30 x 13, 13, 12.
 *  - Chest Supported Incline Row: a different weight each set (30 x 12, 35 x 8, 25 x 10) -> not counted.
 *  - Seated Wrist Extension: never done -> not counted.
 * The previous Pull 2 (10 Nov) held only Lat Pulldown and the row: 1,050 + 890 = 1,940 kg.
 */
const pull2: GoalTarget[] = [
  t('chin', {
    logType: 'reps',
    bodyweightOnly: true,
    targetWeightKg: 0,
    repGoal: 13,
    setGoals: [13, 11, 9],
    last: { weightKg: 0, topReps: 12, sets: 3, dateISO: '2026-11-12' },
    lastSets: [
      { weightKg: 0, reps: 12 },
      { weightKg: 0, reps: 10 },
      { weightKg: 0, reps: 8 },
    ],
  }),
  t('lat', {
    targetWeightKg: 30,
    setGoals: [13, 13, 12],
    last: { weightKg: 30, topReps: 12, sets: 3, dateISO: '2026-11-10' },
    lastSets: [
      { weightKg: 30, reps: 12 },
      { weightKg: 30, reps: 12 },
      { weightKg: 30, reps: 11 },
    ],
  }),
  t('row', {
    topSetOnly: true,
    targetWeightKg: 35,
    setGoals: [],
    repGoal: 9,
    last: { weightKg: 35, topReps: 12, sets: 3, dateISO: '2026-11-10' },
    lastSets: [
      { weightKg: 30, reps: 12 },
      { weightKg: 35, reps: 8 },
      { weightKg: 25, reps: 10 },
    ],
  }),
  t('wrist', { action: 'start', targetWeightKg: 0, repGoal: null, setGoals: [], last: null, lastSets: undefined }),
];

/** The routine's previous run as a whole (what the old line compared with). */
const previousPull2 = { lat: pull2[1].lastSets ?? [], row: pull2[2].lastSets ?? [] };

/** The rule before R-499, reproduced: planned kilos of the counted exercises vs the routine's previous run. */
function oldWay(targets: readonly GoalTarget[], kgOf: KgOf): { goal: number; last: number } {
  const goal = targets
    .map((x) => ({ x, p: plannedSets(x) }))
    .filter(({ x, p }) => p.kgKnown && !x.free)
    .reduce((kg, { x, p }) => kg + kgOf(x.exerciseId, p.sets, TODAY), 0);
  const last = kgOf('lat', previousPull2.lat, '2026-11-10') + kgOf('row', previousPull2.row, '2026-11-10');
  return { goal, last };
}

const words = (g: TodayGoal): string => {
  const x = goalText(g, 'volume', 'metric');
  return `${goalTitle(g)}. ${todayLineWords(x, 'volume')}${x.note ? ` ${x.note}` : ''}`;
};

describe('R-499 his report: +1,840 kg on 1,940 kg', () => {
  it('the old rule gives exactly his numbers (3,780 against 1,940, +1,840)', () => {
    const o = oldWay(pull2, counter());
    expect(o.goal).toBe(3780);
    expect(o.last).toBe(1940);
    expect(o.goal - o.last).toBe(1840);
  });

  it('like for like: the same 2 exercises on both sides, a small step (+330 kg = one rep a set)', () => {
    const g = todayGoalFrom('Pull 2', pull2, counter(), { durationSec: 3600, dateISO: '2026-11-10' }, TODAY);
    expect(g.volumeKg).toBe(3780);
    // Chin Up 30 reps x 80 kg + Lat Pulldown 1,050: what these exercises really did the previous time.
    expect(g.last?.volumeKg).toBe(3450);
    expect(g.uncounted).toBe(2);
    expect(g.setDiff).toBe(0);
    expect((g.volumeKg - (g.last?.volumeKg ?? 0)) / (g.last?.volumeKg ?? 1)).toBeLessThan(0.1);
    expect(words(g)).toBe(
      `Next: Pull 2. 3,780${NB}kg to lift. 330${NB}kg more than previous (3,450${NB}kg). Not counted: 2 exercises that are new to you or use a different weight each set.`,
    );
  });

  it('an exercise left out of the goal is left out of the previous too', () => {
    const parts = goalParts(pull2);
    expect(parts.map((p) => p.counted)).toEqual([true, true, false, false]);
    const g = todayGoalFrom('Pull 2', pull2, counter(), null, TODAY);
    // The row's 890 kg is no longer inside "previous".
    expect(g.last?.volumeKg).toBe(2400 + 1050);
  });
});

describe('R-499 like for like in every case', () => {
  it('first time: nothing done before reads as a first time; all new reads "finish it once"', () => {
    const fresh = [t('lat', { action: 'start', targetWeightKg: 0, repGoal: null, setGoals: [], last: null, lastSets: undefined })];
    const g = todayGoalFrom('Pull 2', fresh, counter(), null, TODAY);
    expect(g.last).toBeNull();
    expect(g.uncounted).toBe(1);
    expect(goalText(g, 'volume', 'metric').line).toBe('Finish this workout once to see your goal here.');
    const one = todayGoalFrom('Pull 2', [t('lat', { lastSets: undefined, last: null, action: 'increase' })], counter(), null, TODAY);
    expect(one.last).toBeNull();
  });

  it('a routine never done whose exercises were done elsewhere compares with those exercises', () => {
    const g = todayGoalFrom('Pull 2', [t('lat')], counter(), null, TODAY);
    expect(g.volumeKg).toBe(50 * 36);
    expect(g.last?.volumeKg).toBe(50 * 33);
    expect(goalText(g, 'volume', 'metric').line).toBe('150 kg more than previous (1,650 kg).');
  });

  it('a skipped exercise (done in the previous run, not in the routine any more) is on neither side', () => {
    // Only the routine's exercises are Targets: the previous run's extra exercise never shows up.
    const g = todayGoalFrom('Pull 2', [t('lat')], counter(), { durationSec: 3000, dateISO: '2026-11-10' }, TODAY);
    expect(g.last?.volumeKg).toBe(1650);
  });

  it('an added exercise: with a history it counts on both sides; new, on neither', () => {
    const withCable = [t('lat'), t('cable', { targetWeightKg: 20, setGoals: [13, 12, 11], lastSets: [20, 20, 20].map((w, i) => ({ weightKg: w, reps: 12 - i })) })];
    const g = todayGoalFrom('Pull 2', withCable, counter(), null, TODAY);
    expect(g.volumeKg).toBe(1800 + 20 * 36);
    expect(g.last?.volumeKg).toBe(1650 + 20 * 33);
    const withNew = [t('lat'), t('cable', { action: 'start', targetWeightKg: 0, repGoal: null, setGoals: [], last: null, lastSets: undefined })];
    const n = todayGoalFrom('Pull 2', withNew, counter(), null, TODAY);
    expect(n.volumeKg).toBe(1800);
    expect(n.last?.volumeKg).toBe(1650);
    expect(n.uncounted).toBe(1);
  });

  it('dumbbells counted "each" count both on both sides (never twice on one side only)', () => {
    const curl = t('curl', {
      targetWeightKg: 15,
      setGoals: [13, 11, 10],
      lastSets: [
        { weightKg: 15, reps: 12 },
        { weightKg: 15, reps: 10 },
        { weightKg: 15, reps: 9 },
      ],
    });
    const g = todayGoalFrom('Arms', [curl], counter(), null, TODAY);
    expect(g.volumeKg).toBe(15 * 34 * 2);
    expect(g.last?.volumeKg).toBe(15 * 31 * 2);
    expect(goalText(g, 'volume', 'metric').line).toBe('90 kg more than previous (930 kg).');
  });

  it('body weight: pull-ups count it on both sides, each at its own day', () => {
    const bw = [
      { dateISO: '2026-11-01', weightKg: 80 },
      { dateISO: '2026-11-13', weightKg: 81 },
    ];
    const g = todayGoalFrom('Pull 2', [pull2[0]], counter(bw), null, TODAY);
    expect(g.last?.volumeKg).toBe(30 * 80);
    expect(g.volumeKg).toBe(33 * 81);
  });

  it('an easy week is lower and says why (no floor)', () => {
    const easy = t('lat', { easy: true, targetSets: 2, repGoal: null, setGoals: [], targetRepsMin: 8 });
    const g = todayGoalFrom('Pull 2', [easy], counter(), null, TODAY);
    expect(g.volumeKg).toBe(50 * 16);
    expect(g.last?.volumeKg).toBe(1650);
    const x = goalText(g, 'volume', 'metric');
    expect(x.line).toBe('850 kg less than previous (1,650 kg).');
    expect(x.note).toBe('This is an easy week, so the goal is lower.');
  });

  it('a routine whose previous run was partial: each exercise compares with its own previous sets', () => {
    // Lat Pulldown stopped after 1 set in the previous run; the Target plans 3 sets: named, not hidden.
    const partial = t('lat', { setGoals: [13, 12, 12], lastSets: [{ weightKg: 50, reps: 12 }] });
    const g = todayGoalFrom('Pull 2', [partial], counter(), null, TODAY);
    expect(g.setDiff).toBe(2);
    expect(goalText(g, 'volume', 'metric').note).toBe('The plan has 2 more sets than previous.');
  });

  it('never less than previous: a weight step whose plan adds up under the previous aims at the previous', () => {
    // 30 kg x 13, 12, 10 = 1,050 -> 32.5 kg x 10, 10, 9 = 942.5 (R-351): the goal is 1,050, "same as previous".
    const step = t('lat', {
      targetWeightKg: 32.5,
      repGoal: 10,
      setGoals: [10, 10, 9],
      last: { weightKg: 30, topReps: 13, sets: 3, dateISO: '2026-11-10' },
      lastSets: [
        { weightKg: 30, reps: 13 },
        { weightKg: 30, reps: 12 },
        { weightKg: 30, reps: 10 },
      ],
    });
    const g = todayGoalFrom('Pull 2', [step], counter(), null, TODAY);
    expect(g.volumeKg).toBe(1050);
    expect(goalText(g, 'volume', 'metric').line).toBe('Same as previous (1,050 kg).');
  });

  it('a lighter back-off last time is planned as it was, as the exercise card plans it', () => {
    const backOff = t('lat', {
      targetSets: 3,
      setGoals: [13, 12],
      lastSets: [
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 11 },
        { weightKg: 35, reps: 12 },
      ],
    });
    const [p] = goalParts([backOff]);
    expect(p.planned).toEqual([
      { weightKg: 50, reps: 13 },
      { weightKg: 50, reps: 12 },
      { weightKg: 35, reps: 12 },
    ]);
  });

  it('timed work counts as sets only; counted another way last time is not counted', () => {
    const plank = t('plank', { free: true, logType: 'time', setGoals: [], repGoal: null });
    const changed = t('lat', { countingChanged: true });
    const g = todayGoalFrom('Core', [plank, changed], counter(), null, TODAY);
    expect(g.volumeKg).toBe(0);
    expect(g.uncounted).toBe(1);
    expect(g.sets).toBe(6);
  });
});

describe('R-499 words: Next and Previous, never "today" or "last time"', () => {
  const prev = { volumeKg: 1940, sets: 12, durationSec: 3120, dateISO: '2026-11-10' };
  const g: TodayGoal = { routineName: 'Pull 2', volumeKg: 1990, sets: 12, uncounted: 0, easy: false, setDiff: 0, last: prev };
  it('the Profile line reads as he asked', () => {
    expect(words(g)).toBe(`Next: Pull 2. 1,990${NB}kg to lift. 50${NB}kg more than previous (1,940${NB}kg).`);
    expect(todayLineWords(goalText(g, 'duration', 'metric'), 'duration')).toBe(`It took 52${NB}min the previous time.`);
  });
  it('no line in any case says today or last time', () => {
    const cases: TodayGoal[] = [
      g,
      { ...g, last: null },
      { ...g, volumeKg: 0 },
      { ...g, volumeKg: 0, last: null },
      { ...g, easy: true, uncounted: 2, setDiff: -1 },
      { ...g, setDiff: 1 },
      { ...g, last: { ...prev, volumeKg: 0, durationSec: 0 } },
    ];
    const all = cases
      .flatMap((c) => (['volume', 'sets', 'duration'] as const).map((m) => ({ c, m, x: goalText(c, m, 'metric') })))
      .map(({ c, m, x }) => `${goalTitle(c)} ${todayLineWords(x, m)} ${x.label} ${x.line} ${x.note ?? ''}`)
      .join(' ');
    expect(all).not.toMatch(/\btoday\b|last time/i);
    expect(all).not.toMatch(/\b(volume|session|PR)\b/i);
  });
});

describe('R-499 follow-up: a number never splits from its unit (his phone: "(7,910" / "kg).")', () => {
  const prev = { volumeKg: 7910, sets: 20, durationSec: 4500, dateISO: '2026-11-10' };
  const g: TodayGoal = { routineName: 'Legs 1', volumeKg: 8520, sets: 20, uncounted: 0, easy: false, setDiff: 0, last: prev };
  it('his line: every number and its unit held by a no-break space', () => {
    expect(words(g)).toBe(`Next: Legs 1. 8,520${NB}kg to lift. 610${NB}kg more than previous (7,910${NB}kg).`);
    expect(words(g)).not.toMatch(/\d +(kg|lb|min)\b/);
  });
  it('every mode and unit: no plain space between a number and its unit; other words still wrap', () => {
    const cases: TodayGoal[] = [g, { ...g, volumeKg: 7910 }, { ...g, volumeKg: 7000 }, { ...g, setDiff: 2 }, { ...g, last: null }];
    for (const c of cases) {
      for (const u of ['metric', 'imperial'] as const) {
        for (const m of ['volume', 'sets', 'duration'] as const) {
          const l = todayLineWords(goalText(c, m, u), m);
          expect(l).not.toMatch(/\d +(kg|lbs?|min|h|s|sets?|reps?)\b/);
          expect(l).toContain(' ');
        }
      }
    }
  });
});

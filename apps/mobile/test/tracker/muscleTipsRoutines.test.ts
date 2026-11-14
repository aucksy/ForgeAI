/**
 * R-482 (owner, 13 Nov 2026: "build all 5"): the Up next muscle tip judges the member's ROUTINES,
 * not the logs. His case: Standing Calf Raise sits in his Legs routine (he skips it), and Pull 2's
 * Up next said "Easy add today: 3 sets of Standing Calf Raise for your calves." It must say nothing.
 */
import { describe, expect, it, vi } from 'vitest';

import { CATALOG } from '@/tracker/catalog/exerciseCatalog';
import { setShares, type Muscle } from '@/tracker/catalog/muscles';
import {
  addLine,
  addedLine,
  chooseSwap,
  COMPARE_GROUPS,
  GAP_MIN_SETS,
  GAP_RATIO,
  groupSetsAWeek,
  homeRoutines,
  planSettled,
  routineWords,
  SHOULDER_GAP_MIN_SETS,
  SHOULDER_GAP_RATIO,
  swapLine,
  swappedLine,
  TIP_LABEL,
  timesPerWeekOf,
  timesWords,
  tipWhy,
  underTrainedGroups,
  weekFromRoutines,
  whyRows,
  WHY_TITLE,
  type PlannedExercise,
  type PlannedRoutine,
  type CompareGroup,
  type PlannedWeek,
  type WeekSets,
} from '@/tracker/engine/muscleBalance';
import { addExerciseToRoutine, swapRoutineExerciseKeepingSets } from '@/tracker/db/routineRepo';
import { applyMuscleTip, pickCandidate, tipCandidates, type MuscleTip } from '@/tracker/services/muscleTips';
import type { DayType } from '@/types/models';

// R-492: Add and Swap are checked without a database (the routine writes are stand-ins here).
vi.mock('@/tracker/db/routineRepo', () => ({
  addExerciseToRoutine: vi.fn(async () => 'newRow'),
  removeRoutineExercise: vi.fn(async () => undefined),
  restoreRoutineRow: vi.fn(async () => undefined),
  swapRoutineExerciseKeepingSets: vi.fn(async () => ({ rowId: 'out', exerciseId: 'ex_out' })),
}));

const TODAY = '2026-11-13';

let row = 0;
/** One routine row from a library exercise: "key:sets". */
function ex(key: string, sets: number): PlannedExercise {
  const e = CATALOG.find((c) => c.key === key);
  if (!e) throw new Error(`no library exercise ${key}`);
  row += 1;
  return {
    rowId: `row${row}`,
    exerciseId: `ex_${key}`,
    name: e.name,
    sets,
    shares: setShares({ primary: [...e.primary], secondary: [...e.secondary] }),
    compound: e.compound,
  };
}
function routine(id: string, name: string, dayType: DayType, exercises: PlannedExercise[]): PlannedRoutine {
  return { id, name, dayType, exercises };
}

/** The owner's kind of plan: Push, Pull 1, Pull 2, Legs, each once a week. */
function ownersPlan(withCalfRaise = true): PlannedWeek {
  return {
    timesPerWeek: 1,
    routines: [
      routine('push', 'Push', 'push', [ex('barbell_bench_press', 3), ex('incline_dumbbell_press', 3), ex('cable_fly', 3), ex('lateral_raise', 3), ex('triceps_pushdown', 3)]),
      routine('pull1', 'Pull 1', 'pull', [ex('lat_pulldown', 3), ex('seated_cable_row', 3), ex('face_pull', 3), ex('dumbbell_curl', 3)]),
      routine('pull2', 'Pull 2', 'pull', [ex('barbell_row', 3), ex('lat_pulldown', 3), ex('dumbbell_curl', 3)]),
      routine('legs', 'Legs', 'legs', [
        ex('barbell_back_squat', 3),
        ex('leg_press', 3),
        ex('romanian_deadlift', 3),
        ex('lying_leg_curl', 3),
        ...(withCalfRaise ? [ex('standing_calf_raise', 3)] : []),
        ex('plank', 3),
      ]),
    ],
  };
}

describe('R-482: the member\'s week is the routines, not the logs', () => {
  it('his case: calf raise in Legs (skipped or not), today Pull 2 -> no calves tip, no tip at all', () => {
    const week = ownersPlan(true);
    const cands = tipCandidates(week);
    expect(cands.map((c) => c.group)).not.toContain('calves');
    expect(cands).toEqual([]);
    expect(pickCandidate(cands, 'pull2', null, TODAY)).toBeNull();
    expect(pickCandidate(cands, 'legs', null, TODAY)).toBeNull();
  });

  it('a group NO routine trains: tip 1, on its home routine only (calves go to Legs, never Pull 2)', () => {
    const cands = tipCandidates(ownersPlan(false));
    expect(cands).toEqual([{ kind: 'add', group: 'calves', routineId: 'legs' }]);
    expect(pickCandidate(cands, 'pull2', null, TODAY)).toBeNull();
    expect(pickCandidate(cands, 'legs', null, TODAY)?.group).toBe('calves');
  });

  it('counts planned sets: 1 main, 0.5 helper, times how often each routine runs a week', () => {
    expect(timesPerWeekOf(null, 4)).toBe(1);
    expect(timesPerWeekOf(6, 3)).toBe(2);
    expect(timesPerWeekOf(4, 3)).toBeCloseTo(4 / 3);
    expect(timesPerWeekOf(3, 0)).toBe(0);
    const week = ownersPlan(true);
    const counts = groupSetsAWeek(week);
    expect(counts.get('chest')).toBe(9);
    // Back: a row and a pulldown count once each for the group, not once per back muscle.
    expect(counts.get('back')).toBe(3 + 3 + 1.5 + 3 + 3);
    expect(counts.get('hamstrings')).toBe(6);
    expect(counts.get('glutes')).toBe(4.5);
    const twice = groupSetsAWeek({ ...week, timesPerWeek: 2 });
    expect(twice.get('chest')).toBe(18);
    const planned = weekFromRoutines(week);
    expect(planned.main.get('calves')).toBe(3);
    expect(planned.counted.get('triceps')).toBe(3 + 1.5 + 1.5);
  });

  it('beginners see big groups only; a muted group stays quiet', () => {
    const week = ownersPlan(false);
    expect(tipCandidates(week, { beginner: true })).toEqual([]);
    expect(tipCandidates(week, { quiet: new Set(['calves']) })).toEqual([]);
  });

  it('a plan is judged only once it is in use: every routine done once, the first 14+ days ago', () => {
    const ids = ['a', 'b', 'c'];
    expect(planSettled(new Map([['a', '2026-10-01'], ['b', '2026-10-02'], ['c', '2026-10-03']]), ids, TODAY)).toBe(true);
    // One routine never done yet.
    expect(planSettled(new Map([['a', '2026-10-01'], ['b', '2026-10-02']]), ids, TODAY)).toBe(false);
    // Brand-new plan: all three done, but the first only 13 days ago.
    expect(planSettled(new Map([['a', '2026-10-31'], ['b', '2026-11-01'], ['c', '2026-11-02']]), ids, TODAY)).toBe(false);
    expect(planSettled(new Map([['a', '2026-10-30'], ['b', '2026-11-01'], ['c', '2026-11-12']]), ids, TODAY)).toBe(true);
    expect(planSettled(new Map(), [], TODAY)).toBe(false);
  });

  it('home routine: calves on a legs day first; core in the shortest; no fitting day = any routine', () => {
    const week = ownersPlan(false);
    expect(homeRoutines('calves', week.routines)[0].id).toBe('legs');
    expect(homeRoutines('core', week.routines)[0].id).toBe('pull2');
    expect(homeRoutines('rear_shoulders', week.routines).map((r) => r.id)).toEqual(['pull2', 'pull1']);
    const upperOnly = [routine('u1', 'Upper A', 'upper', [ex('barbell_bench_press', 3)]), routine('u2', 'Upper B', 'upper', [ex('lat_pulldown', 3), ex('barbell_row', 3)])];
    expect(homeRoutines('legs', upperOnly)[0].id).toBe('u1');
  });
});

/** Push and pull full, legs with quads and only one leg curl: hamstrings far behind. */
function quadHeavyPlan(): PlannedWeek {
  return {
    timesPerWeek: 1,
    routines: [
      routine('push', 'Push', 'push', [ex('barbell_bench_press', 4), ex('incline_dumbbell_press', 4), ex('cable_fly', 4), ex('lateral_raise', 4), ex('triceps_pushdown', 3)]),
      routine('pull', 'Pull', 'pull', [ex('lat_pulldown', 4), ex('seated_cable_row', 4), ex('barbell_row', 4), ex('face_pull', 3), ex('dumbbell_curl', 3)]),
      routine('legs', 'Legs', 'legs', [ex('barbell_back_squat', 4), ex('leg_press', 4), ex('leg_extension', 4), ex('lying_leg_curl', 3), ex('standing_calf_raise', 3), ex('plank', 3)]),
    ],
  };
}

describe('R-482 tip 2: a big group trained much less than the others', () => {
  it('the rule: under a third of the median of the other big groups AND 6+ sets below it', () => {
    expect(GAP_RATIO).toBeCloseTo(1 / 3);
    expect(GAP_MIN_SETS).toBe(6);
    expect(COMPARE_GROUPS).not.toContain('core');
    const week = quadHeavyPlan();
    const counts = groupSetsAWeek(week);
    expect(counts.get('hamstrings')).toBe(3);
    expect(counts.get('quads')).toBe(12);
    const under = underTrainedGroups(counts, weekFromRoutines(week));
    expect(under.map((u) => u.group)).toEqual(['hamstrings']);
    expect(under[0].others).toBe(12);
  });

  it('does not fire on a small gap (6 against 10 is taste, not a gap)', () => {
    const counts = new Map<CompareGroup, number>([['chest', 10], ['back', 10], ['shoulders', 10], ['quads', 10], ['hamstrings', 6], ['glutes', 8]]);
    const sixMain: WeekSets = { counted: new Map<Muscle, number>([['hamstrings', 6]]), main: new Map<Muscle, number>([['hamstrings', 6]]) };
    expect(underTrainedGroups(counts, sixMain)).toEqual([]);
    // A third of the median but under 6 sets behind: still nothing (a light trainer of everything).
    const light = new Map<CompareGroup, number>([['chest', 6], ['back', 6], ['shoulders', 6], ['quads', 6], ['hamstrings', 1.5], ['glutes', 6]]);
    expect(underTrainedGroups(light, { counted: new Map<Muscle, number>([['hamstrings', 3]]), main: new Map<Muscle, number>([['hamstrings', 1.5]]) })).toEqual([]);
  });

  it('the typical push / pull / legs plan says nothing', () => {
    const week = ownersPlan(true);
    expect(underTrainedGroups(groupSetsAWeek(week), weekFromRoutines(week))).toEqual([]);
  });

  it('swap: out goes a single-joint exercise of the routine\'s most-trained group, same sets, same place', () => {
    const week = quadHeavyPlan();
    const swap = chooseSwap('hamstrings', week, groupSetsAWeek(week));
    expect(swap).not.toBeNull();
    expect(swap!.routineId).toBe('legs');
    expect(swap!.from).toBe('quads');
    expect(swap!.out.name).toBe('Leg Extension');
    expect(swap!.fromSets).toBe(12);
    expect(swap!.toSets).toBe(3);
    const cands = tipCandidates(week);
    expect(cands.map((c) => [c.kind, c.group, c.routineId])).toEqual([['swap', 'hamstrings', 'legs']]);
    expect(pickCandidate(cands, 'push', null, TODAY)).toBeNull();
    expect(pickCandidate(cands, 'legs', null, TODAY)?.group).toBe('hamstrings');
    // "Keep as is" mutes hamstrings: no tip.
    expect(tipCandidates(week, { quiet: new Set(['hamstrings']) })).toEqual([]);
  });

  it('never empties a group: the only quads exercise of the routine is never swapped out', () => {
    const week: PlannedWeek = {
      timesPerWeek: 1,
      routines: [
        routine('push', 'Push', 'push', [ex('barbell_bench_press', 4), ex('incline_dumbbell_press', 4), ex('cable_fly', 4)]),
        routine('pull', 'Pull', 'pull', [ex('lat_pulldown', 4), ex('seated_cable_row', 4), ex('barbell_row', 4)]),
        routine('legs', 'Legs', 'legs', [ex('barbell_back_squat', 12), ex('lying_leg_curl', 2)]),
      ],
    };
    const counts = groupSetsAWeek(week);
    expect(underTrainedGroups(counts, weekFromRoutines(week)).map((u) => u.group)).toContain('hamstrings');
    expect(chooseSwap('hamstrings', week, counts)).toBeNull();
    expect(tipCandidates(week).filter((c) => c.group === 'hamstrings')).toEqual([]);
  });

  it('never makes a new gap the other way: the taken-from group keeps at least as many sets', () => {
    const week: PlannedWeek = {
      timesPerWeek: 1,
      routines: [routine('legs', 'Legs', 'legs', [ex('barbell_back_squat', 3), ex('leg_extension', 3), ex('lying_leg_curl', 1)])],
    };
    // quads 6, hamstrings 1: taking 3 quads sets for hamstrings would leave quads 3 under hamstrings 4.
    expect(chooseSwap('hamstrings', week, groupSetsAWeek(week))).toBeNull();
  });

  it('tip 1 wins over tip 2 when both apply', () => {
    const week = quadHeavyPlan();
    const noCalves = { ...week, routines: week.routines.map((r) => (r.id === 'legs' ? { ...r, exercises: r.exercises.filter((x) => x.name !== 'Standing Calf Raise') } : r)) };
    expect(tipCandidates(noCalves).map((c) => [c.kind, c.group])).toEqual([['add', 'calves']]);
  });
});

describe('R-482: one tip at a time, a new group at most once a week', () => {
  const cands = [
    { group: 'calves' as const, routineId: 'legs' },
    { group: 'rear_shoulders' as const, routineId: 'pull' },
  ];
  it('the group on show keeps its place on its own routine\'s day', () => {
    expect(pickCandidate(cands, 'legs', { group: 'calves', sinceISO: '2026-11-10' }, TODAY)?.group).toBe('calves');
    expect(pickCandidate(cands, 'pull', { group: 'calves', sinceISO: '2026-11-10' }, TODAY)).toBeNull();
    // A week on, the shown group still waits for its own routine.
    expect(pickCandidate(cands, 'pull', { group: 'calves', sinceISO: '2026-11-01' }, TODAY)).toBeNull();
  });
  it('a settled group (added, swapped or put away) holds the week: nothing new the same day', () => {
    expect(pickCandidate(cands, 'pull', { group: 'hamstrings', sinceISO: TODAY }, TODAY)).toBeNull();
    expect(pickCandidate(cands, 'pull', { group: 'hamstrings', sinceISO: '2026-11-06' }, TODAY)?.group).toBe('rear_shoulders');
    expect(pickCandidate([], 'pull', null, TODAY)).toBeNull();
  });
});

describe('R-482: the words (member-words: the muscle and the routine, plain, buttons named)', () => {
  it('tip 1', () => {
    expect(addLine('calves', 'Standing Calf Raise', 3, 'Legs')).toBe(
      'None of your routines trains your calves. Add 3 sets of Standing Calf Raise to your Legs routine?',
    );
    expect(addLine('back', 'Lat Pulldown', 2, 'Upper A')).toBe('None of your routines trains your back. Add 2 sets of Lat Pulldown to your Upper A routine?');
  });
  it('tip 2: the two numbers are the planned sets a week of the routines, rounded; Add first, then Swap (R-492)', () => {
    expect(swapLine('shoulders', 3, 'chest', 12, 'Incline Dumbbell Press', 'Dumbbell Shoulder Press', 'Push')).toBe(
      'Your routines give your shoulders 3 sets a week and your chest 12. Add 3 sets of Dumbbell Shoulder Press to your Push routine, or swap Incline Dumbbell Press for it?',
    );
    expect(swapLine('back', 4.5, 'quads', 11.6, 'Leg Extension', 'Lat Pulldown', 'Full Body', 2)).toBe(
      'Your routines give your back 5 sets a week and your quads 12. Add 2 sets of Lat Pulldown to your Full Body routine, or swap Leg Extension for it?',
    );
    expect(swapLine('hamstrings', 1, 'quads', 9, 'Leg Extension', 'Seated Leg Curl', 'Legs')).toContain('your hamstrings 1 set a week');
  });
  it('a routine already named "routine" is not doubled', () => {
    expect(routineWords('Legs')).toBe('your Legs routine');
    expect(routineWords('Morning Routine')).toBe('your Morning Routine');
  });
  it('the confirmations with Undo', () => {
    expect(addedLine('Standing Calf Raise', 'Legs')).toBe('Standing Calf Raise added to your Legs routine.');
    expect(swappedLine('Seated Leg Curl', 'Leg Extension', 'Legs')).toBe('Seated Leg Curl now replaces Leg Extension in your Legs routine.');
  });
  it('never "Easy add", never a banned or blaming word', () => {
    const lines = [
      addLine('calves', 'Standing Calf Raise', 3, 'Legs'),
      swapLine('shoulders', 3, 'chest', 12, 'Incline Dumbbell Press', 'Dumbbell Shoulder Press', 'Push'),
      addedLine('Plank', 'Pull 2'),
      swappedLine('Seated Leg Curl', 'Leg Extension', 'Legs'),
    ];
    for (const l of lines) expect(l).not.toMatch(/\b(easy add|volume|PR|session|missing|neglect|imbalance|weak)\b/i);
  });
});

/**
 * R-483 (owner, 13 Nov 2026: "Yes count only shoulder exercises"): a normal push / pull / legs plan
 * with bench and incline pressing and ONE shoulder exercise a week. Before R-483 every press added half
 * a shoulder set, so this plan read as 12 shoulder sets and never got a tip.
 */
function oneShoulderPlan(): PlannedWeek {
  return {
    timesPerWeek: 1,
    routines: [
      routine('push', 'Push', 'push', [ex('barbell_bench_press', 4), ex('incline_dumbbell_press', 4), ex('cable_fly', 3), ex('lateral_raise', 3), ex('triceps_pushdown', 3)]),
      routine('pull', 'Pull', 'pull', [ex('lat_pulldown', 4), ex('seated_cable_row', 4), ex('barbell_row', 3), ex('dumbbell_curl', 3)]),
      routine('legs', 'Legs', 'legs', [ex('barbell_back_squat', 4), ex('leg_press', 3), ex('romanian_deadlift', 3), ex('lying_leg_curl', 3), ex('standing_calf_raise', 3), ex('plank', 3)]),
    ],
  };
}

describe('R-483: the shoulders count direct shoulder exercises only', () => {
  it('a bench or incline press adds no shoulder set; a side raise or an overhead press adds a whole one', () => {
    const one = (key: string) => groupSetsAWeek({ timesPerWeek: 1, routines: [routine('r', 'R', 'push', [ex(key, 3)])] }).get('shoulders');
    expect(one('barbell_bench_press')).toBe(0);
    expect(one('incline_dumbbell_press')).toBe(0);
    expect(one('lateral_raise')).toBe(3);
    expect(one('dumbbell_shoulder_press')).toBe(3);
    // Other groups count as before: a bench press still gives the chest its sets and the triceps half.
    const bench = groupSetsAWeek({ timesPerWeek: 1, routines: [routine('r', 'R', 'push', [ex('barbell_bench_press', 4)])] });
    expect(bench.get('chest')).toBe(4);
  });

  it('the shoulders have their own bar: at most half the median of the others AND 3+ sets below it', () => {
    expect(SHOULDER_GAP_RATIO).toBeCloseTo(1 / 2);
    expect(SHOULDER_GAP_MIN_SETS).toBe(3);
    const at = (shoulders: number, others: number) =>
      underTrainedGroups(
        new Map<CompareGroup, number>([['chest', others], ['back', others], ['shoulders', shoulders], ['quads', others], ['hamstrings', others], ['glutes', others]]),
        { counted: new Map<Muscle, number>([['side_delts', shoulders]]), main: new Map<Muscle, number>([['side_delts', shoulders]]) },
      ).map((u) => u.group);
    expect(at(3, 6)).toEqual(['shoulders']);
    expect(at(3, 7)).toEqual(['shoulders']);
    expect(at(4, 7)).toEqual([]);
    // A light trainer of everything: half the median, but under 3 sets behind -> nothing.
    expect(at(2, 4)).toEqual([]);
  });

  it('the goal: bench + incline pressing and one shoulder exercise a week -> tip 2 for the shoulders on Push', () => {
    const week = oneShoulderPlan();
    const counts = groupSetsAWeek(week);
    expect(counts.get('shoulders')).toBe(3);
    const under = underTrainedGroups(counts, weekFromRoutines(week));
    expect(under.map((u) => u.group)).toEqual(['shoulders']);
    const cands = tipCandidates(week);
    expect(cands.map((c) => [c.kind, c.group, c.routineId])).toEqual([['swap', 'shoulders', 'push']]);
    const c = cands[0];
    if (c.kind !== 'swap') throw new Error('not a swap');
    expect(c.swap.out.name).toBe('Cable Fly');
    expect([c.swap.from, c.swap.fromSets, c.swap.toSets]).toEqual(['chest', 11, 3]);
    // The words on Up next (the app's first library pick for the shoulders is Dumbbell Shoulder Press).
    expect(swapLine('shoulders', c.swap.toSets, c.swap.from, c.swap.fromSets, c.swap.out.name, 'Dumbbell Shoulder Press', 'Push')).toBe(
      'Your routines give your shoulders 3 sets a week and your chest 11. Add 3 sets of Dumbbell Shoulder Press to your Push routine, or swap Cable Fly for it?',
    );
    expect(pickCandidate(cands, 'push', null, TODAY)?.group).toBe('shoulders');
    expect(pickCandidate(cands, 'legs', null, TODAY)).toBeNull();
    expect(tipCandidates(week, { quiet: new Set(['shoulders']) })).toEqual([]);
    // After the swap (Dumbbell Shoulder Press in Cable Fly's place, same 3 sets) the week says nothing more.
    const swapped: PlannedWeek = {
      ...week,
      routines: week.routines.map((r) =>
        r.id === 'push' ? { ...r, exercises: r.exercises.map((x) => (x.name === 'Cable Fly' ? ex('dumbbell_shoulder_press', 3) : x)) } : r,
      ),
    };
    expect(groupSetsAWeek(swapped).get('shoulders')).toBe(6);
    expect(tipCandidates(swapped)).toEqual([]);
  });

  it('two direct shoulder exercises (a side raise and a face pull) say nothing, as before', () => {
    const week = ownersPlan(true);
    expect(groupSetsAWeek(week).get('shoulders')).toBe(6);
    expect(tipCandidates(week)).toEqual([]);
  });

  it('the hamstrings case is unchanged (its plan has a side raise and a face pull: shoulders 7)', () => {
    const week = quadHeavyPlan();
    const counts = groupSetsAWeek(week);
    expect(counts.get('shoulders')).toBe(7);
    expect(underTrainedGroups(counts, weekFromRoutines(week)).map((u) => u.group)).toEqual(['hamstrings']);
  });
});

/**
 * R-492 (owner, 14 Nov 2026): "Some people might just want to add one exercise and not swap anything ... a letter I
 * symbol which we can tap and find out why we are giving this suggestion and then the word smart suggestion".
 */
function swapTip(): MuscleTip {
  return {
    kind: 'swap',
    group: 'hamstrings',
    routineId: 'legs',
    routineName: 'Legs',
    exerciseId: 'ex_seated_leg_curl',
    exerciseName: 'Seated Leg Curl',
    sets: 4,
    addSets: 3,
    outRowId: 'rowLegExt',
    outExerciseId: 'ex_leg_extension',
    outName: 'Leg Extension',
    line: '',
    why: tipWhy({ kind: 'swap', group: 'hamstrings', routineNames: ['Legs'], timesPerWeek: 1, rows: [], exerciseName: 'Seated Leg Curl', routineName: 'Legs', addSets: 3, outName: 'Leg Extension' }),
  };
}

describe('R-492: tip 2 also offers Add (nothing swapped out)', () => {
  it('Add on tip 2 adds the exercise with 3 sets to that routine and swaps nothing; Undo removes that row', async () => {
    vi.mocked(addExerciseToRoutine).mockClear();
    vi.mocked(swapRoutineExerciseKeepingSets).mockClear();
    const done = await applyMuscleTip(swapTip(), 'add');
    expect(addExerciseToRoutine).toHaveBeenCalledWith('legs', 'ex_seated_leg_curl', { targetSets: 3 });
    expect(swapRoutineExerciseKeepingSets).not.toHaveBeenCalled();
    expect(done).toEqual({ kind: 'add', rowId: 'newRow' });
  });
  it('Swap on tip 2 is unchanged: same place, same sets (the row it replaces keeps its 4)', async () => {
    vi.mocked(addExerciseToRoutine).mockClear();
    const done = await applyMuscleTip(swapTip(), 'swap');
    expect(swapRoutineExerciseKeepingSets).toHaveBeenCalledWith('rowLegExt', 'ex_leg_extension', 'ex_seated_leg_curl');
    expect(addExerciseToRoutine).not.toHaveBeenCalled();
    expect(done?.kind).toBe('swap');
    // With no choice given, a swap tip still swaps (the old call).
    expect((await applyMuscleTip(swapTip()))?.kind).toBe('swap');
  });
  it('tip 1 only ever adds, whatever is asked', async () => {
    vi.mocked(swapRoutineExerciseKeepingSets).mockClear();
    const add: MuscleTip = { ...swapTip(), kind: 'add', group: 'calves' } as MuscleTip;
    expect((await applyMuscleTip(add, 'swap'))?.kind).toBe('add');
    expect(swapRoutineExerciseKeepingSets).not.toHaveBeenCalled();
  });
});

describe('R-492: "Smart suggestion" and the (i) "Why we suggest this"', () => {
  it('the label and the sheet title', () => {
    expect(TIP_LABEL).toBe('Smart suggestion');
    expect(WHY_TITLE).toBe('Why we suggest this');
  });

  it('how often each routine is done, in words', () => {
    expect(timesWords(1)).toBe('once a week');
    expect(timesWords(2)).toBe('twice a week');
    expect(timesWords(3)).toBe('3 times a week');
    expect(timesWords(4 / 3)).toBe('about 1.3 times a week');
  });

  it('the table: the 6 big groups with their real sets a week, most first; tip 1 adds its own group', () => {
    const week = quadHeavyPlan();
    const rows = whyRows('hamstrings', week);
    expect(rows.map((r) => r.group).sort()).toEqual([...COMPARE_GROUPS].sort());
    expect(rows.find((r) => r.group === 'quads')?.sets).toBe(12);
    expect(rows.find((r) => r.group === 'hamstrings')?.sets).toBe(3);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].sets).toBeGreaterThanOrEqual(rows[i].sets);
    const noCalves = whyRows('calves', ownersPlan(false), 'add');
    expect(noCalves).toHaveLength(7);
    expect(noCalves[noCalves.length - 1]).toEqual({ group: 'calves', sets: 0 });
    // "legs" is quads + hamstrings + glutes, already in the table: no extra row.
    expect(whyRows('legs', ownersPlan(false), 'add')).toHaveLength(6);
    // Counted the usual way (helpers half), the calves get 2 sets from exercises where they only help.
    expect(whyRows('calves', ownersPlan(false)).find((r) => r.group === 'calves')?.sets).toBeGreaterThan(0);
  });

  it('tip 2 (the hamstrings case): the routines counted, the numbers, why, and that nothing changes until Add or Swap', () => {
    const week = quadHeavyPlan();
    const counts = groupSetsAWeek(week);
    const under = underTrainedGroups(counts, weekFromRoutines(week))[0];
    const w = tipWhy({
      kind: 'swap',
      group: 'hamstrings',
      routineNames: week.routines.map((r) => r.name),
      timesPerWeek: week.timesPerWeek,
      rows: whyRows('hamstrings', week),
      others: under.others,
      exerciseName: 'Seated Leg Curl',
      routineName: 'Legs',
      addSets: 3,
      outName: 'Leg Extension',
    });
    expect(w.title).toBe('Why we suggest this');
    expect(w.counted).toBe(`We added up the sets planned in your ${week.routines.length} routines: ${week.routines.map((r) => r.name).slice(0, -1).join(', ')} and ${week.routines[week.routines.length - 1].name}. Each one is done once a week.`);
    expect(w.heading).toBe('Sets a week for each muscle');
    expect(w.rows.find((r) => r.label === 'Quads')).toEqual({ label: 'Quads', sets: '12 sets', tip: false });
    expect(w.rows.find((r) => r.label === 'Hamstrings')).toEqual({ label: 'Hamstrings', sets: '3 sets', tip: true });
    expect(w.rows.filter((r) => r.tip)).toHaveLength(1);
    expect(w.rule).toBe('A set counts 1 for the muscle it mainly works and half for a muscle that helps. For shoulders, only shoulder exercises count.');
    expect(w.reason).toBe(
      'Your hamstrings get 3 sets a week. Your other big muscles get around 12. Muscles grow and get stronger with the work they get, so closer numbers keep your body even.',
    );
    expect(w.change).toBe(
      'Nothing changes unless you tap Add or Swap. Add puts 3 sets of Seated Leg Curl at the end of your Legs routine. Swap puts Seated Leg Curl in place of Leg Extension, with the same sets. You can undo either one right after.',
    );
    expect(w.off).toBe('You can turn these suggestions off in Settings → "Muscle tips".');
  });

  it('tip 1 (no calf exercise): no Swap words; one routine reads as one', () => {
    const week = ownersPlan(false);
    const w = tipWhy({
      kind: 'add',
      group: 'calves',
      routineNames: ['Push', 'Pull 1', 'Pull 2', 'Legs'],
      timesPerWeek: 1,
      rows: whyRows('calves', week, 'add'),
      exerciseName: 'Standing Calf Raise',
      routineName: 'Legs',
      addSets: 3,
    });
    expect(w.counted).toBe('We added up the sets planned in your 4 routines: Push, Pull 1, Pull 2 and Legs. Each one is done once a week.');
    expect(w.rows[w.rows.length - 1]).toEqual({ label: 'Calves', sets: '0 sets', tip: true });
    expect(w.reason).toBe('None of your exercises mainly works your calves. A few sets a week give them direct work of their own.');
    expect(w.change).toBe('Nothing changes unless you tap Add. Add puts 3 sets of Standing Calf Raise at the end of your Legs routine. You can undo it right after.');
    expect(w.change).not.toMatch(/Swap/);
    const one = tipWhy({ ...{ kind: 'add' as const, group: 'core' as const, rows: [], exerciseName: 'Plank', routineName: 'Full Body', addSets: 2 }, routineNames: ['Full Body'], timesPerWeek: 3 });
    expect(one.counted).toBe('We added up the sets planned in your Full Body routine. It is done 3 times a week.');
  });

  it('never a banned, scary or blaming word in any line of the sheet', () => {
    const week = quadHeavyPlan();
    const all = [
      tipWhy({ kind: 'swap', group: 'hamstrings', routineNames: ['Push', 'Pull', 'Legs'], timesPerWeek: 1, rows: whyRows('hamstrings', week), others: 12, exerciseName: 'Seated Leg Curl', routineName: 'Legs', addSets: 3, outName: 'Leg Extension' }),
      tipWhy({ kind: 'add', group: 'calves', routineNames: ['Legs'], timesPerWeek: 2, rows: whyRows('calves', week), exerciseName: 'Standing Calf Raise', routineName: 'Legs', addSets: 3 }),
    ];
    for (const w of all) {
      const text = [w.title, w.counted, w.heading, w.rule, w.reason, w.change, w.off, ...w.rows.map((r) => `${r.label} ${r.sets}`)].join(' ');
      expect(text).not.toMatch(/\b(easy add|volume|PR|session|missing|neglect|imbalance|weak|injur\w*|fail\w*|should)\b/i);
    }
  });
});

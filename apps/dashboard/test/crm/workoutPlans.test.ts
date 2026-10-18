/**
 * Workout plans from the gym or trainer (18 Oct 2026, OWNER-INBOX #6): the builder's checks (the
 * server's `_workout_plan_ok` in supabase/migrations/0024_workout_plans.sql, in plain words), the
 * "Sent to" line, the exercise search, and saving through the browser store and online.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '../../src/crm/data/adapter';
import { CloudCrmData, type CrmCloudApi, type CrmRecord, type PullResult } from '../../src/crm/data/cloud';
import { emptySnapshot, LocalCrmData, memoryStore, normalizeSnapshot } from '../../src/crm/data/local';
import { EXERCISE_CATALOG } from '../../src/crm/logic/exerciseCatalog';
import {
  assignSummary,
  buildSetList,
  cleanDraft,
  copyName,
  copyOfPlan,
  copyRoutine,
  draftFromReadyPlan,
  READY_PLANS,
  sendChoices,
  startKind,
  startOf,
  withMember,
  withoutMember,
  customExercise,
  draftOf,
  emptyRoutine,
  emptyWorkoutDraft,
  exerciseFromCatalog,
  moveItem,
  planSizeWords,
  plansForMember,
  recordBytes,
  searchExercises,
  splitPlans,
  workoutPlanProblem,
  WP_MAX_BYTES,
  WP_MAX_EXERCISES,
  WP_MAX_ROUTINES,
} from '../../src/crm/logic/workoutPlans';
import type { Membership, WorkoutPlan, WorkoutPlanDraft } from '../../src/crm/types';

const bench = EXERCISE_CATALOG.find((e) => e.key === 'barbell_bench_press')!;
const squat = EXERCISE_CATALOG.find((e) => e.key === 'barbell_back_squat')!;
const lib = (key: string) => EXERCISE_CATALOG.find((e) => e.key === key)!;

function goodDraft(over: Partial<WorkoutPlanDraft> = {}): WorkoutPlanDraft {
  return {
    name: 'Beginner 3 days',
    note: null,
    routines: [{ name: 'Day 1', dayType: 'full', exercises: [exerciseFromCatalog(bench), exerciseFromCatalog(squat)] }],
    assign: { memberIds: ['m1'], planIds: [] },
    ...over,
  };
}

function savedPlan(over: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return { ...goodDraft(), id: 'w1', gymId: 'g1', withdrawn: false, createdAt: 1, updatedAt: 1, ...over } as WorkoutPlan;
}

describe('workoutPlanProblem: the server’s checks, in plain words', () => {
  it('passes a normal plan', () => {
    expect(workoutPlanProblem(goodDraft())).toBeNull();
  });

  it('needs a plan name of at most 80 letters', () => {
    expect(workoutPlanProblem(goodDraft({ name: '   ' }))).toBe('Give the plan a name.');
    expect(workoutPlanProblem(goodDraft({ name: 'x'.repeat(81) }))).toMatch(/80 letters/);
    expect(workoutPlanProblem(goodDraft({ name: 'x'.repeat(80) }))).toBeNull();
  });

  it('needs 1 to 14 days, each named, each with 1 to 30 exercises', () => {
    expect(workoutPlanProblem(goodDraft({ routines: [] }))).toBe('Add at least one day to the plan.');
    const day = goodDraft().routines[0];
    expect(workoutPlanProblem(goodDraft({ routines: Array.from({ length: WP_MAX_ROUTINES }, () => day) }))).toBeNull();
    expect(workoutPlanProblem(goodDraft({ routines: Array.from({ length: WP_MAX_ROUTINES + 1 }, () => day) }))).toMatch(/at most 14 days/);
    expect(workoutPlanProblem(goodDraft({ routines: [{ ...day, name: ' ' }] }))).toBe('Give day 1 a name.');
    expect(workoutPlanProblem(goodDraft({ routines: [emptyRoutine(1)] }))).toBe('Add at least one exercise to Day 2.');
    const many = Array.from({ length: WP_MAX_EXERCISES + 1 }, () => exerciseFromCatalog(bench));
    expect(workoutPlanProblem(goodDraft({ routines: [{ ...day, exercises: many }] }))).toMatch(/at most 30 exercises/);
  });

  it('checks the numbers a trainer types', () => {
    const withEx = (patch: object) =>
      goodDraft({ routines: [{ name: 'Day 1', dayType: 'push', exercises: [{ ...exerciseFromCatalog(bench), ...patch }] }] });
    expect(workoutPlanProblem(withEx({ sets: 0 }))).toMatch(/sets must be a whole number/);
    expect(workoutPlanProblem(withEx({ sets: Number.NaN }))).toMatch(/sets/);
    expect(workoutPlanProblem(withEx({ repMin: 12, repMax: 8 }))).toMatch(/lowest reps/);
    expect(workoutPlanProblem(withEx({ repMax: 101 }))).toMatch(/reps must be/);
    expect(workoutPlanProblem(withEx({ restSec: 601 }))).toMatch(/rest must be/);
    expect(workoutPlanProblem(withEx({ restSec: null }))).toBeNull();
    expect(workoutPlanProblem(withEx({ restSec: 90 }))).toBeNull();
    expect(workoutPlanProblem(withEx({ name: '' }))).toMatch(/has no name/);
  });

  it('refuses a library key the phone would not read (the server takes 1-64 letters)', () => {
    const withKey = (catalogKey: string | null) =>
      goodDraft({ routines: [{ name: 'D', dayType: 'full', exercises: [{ ...exerciseFromCatalog(bench), catalogKey }] }] });
    expect(workoutPlanProblem(withKey(null))).toBeNull();
    expect(workoutPlanProblem(withKey(''))).toMatch(/damaged/);
    expect(workoutPlanProblem(withKey('Bench Press'))).toMatch(/damaged/);
  });

  it('keeps "Send to" inside the server’s limits', () => {
    expect(workoutPlanProblem(goodDraft({ assign: { memberIds: Array.from({ length: 2001 }, (_, i) => `m${i}`), planIds: [] } }))).toMatch(/2000 members/);
    expect(workoutPlanProblem(goodDraft({ assign: { memberIds: [], planIds: Array.from({ length: 101 }, (_, i) => `p${i}`) } }))).toMatch(/100 membership plans/);
    expect(workoutPlanProblem(goodDraft({ assign: { memberIds: [''], planIds: [] } }))).toMatch(/looks damaged/);
    // Saved to nobody yet is fine: the trainer can tick people later.
    expect(workoutPlanProblem(goodDraft({ assign: { memberIds: [], planIds: [] } }))).toBeNull();
  });

  it('refuses a plan the server would refuse for size (20,000 bytes)', () => {
    const note = 'x'.repeat(480);
    const ex = { ...exerciseFromCatalog(bench), note };
    const big = goodDraft({ routines: Array.from({ length: 14 }, (_, i) => ({ name: `Day ${i + 1}`, dayType: 'full' as const, exercises: [ex, ex, ex] })) });
    expect(recordBytes(big)).toBeGreaterThan(WP_MAX_BYTES);
    expect(workoutPlanProblem(big)).toMatch(/too big/);
    // Hindi letters are 3 bytes each: counted as bytes, as the server does.
    expect(recordBytes({ n: 'बैठक' })).toBe('{"n": ""}'.length + 12);
  });

  it('counts the way Postgres writes jsonb: a space after each : and , outside text', () => {
    // Checked on Postgres 16: octet_length('{"n":"बैठक","a":[1,2],"s":"x:y, z\\"q"}'::jsonb::text) = 52.
    expect(recordBytes({ n: 'बैठक', a: [1, 2], s: 'x:y, z"q' })).toBe(52);
    // Review case: 6 days x 19 exercises passed compact JSON (19,754) but Postgres counts ~21,855.
    const days = Array.from({ length: 6 }, (_, i) => ({ name: `Day ${i + 1}`, dayType: 'full' as const, exercises: Array(19).fill(exerciseFromCatalog(bench)) }));
    const plan = goodDraft({ routines: days });
    expect(recordBytes(plan)).toBeGreaterThan(new TextEncoder().encode(JSON.stringify(plan)).length * 1.08);
  });
});

describe('building a plan', () => {
  it('starts with one empty day and the given members ticked', () => {
    expect(emptyWorkoutDraft(['m9'])).toEqual({
      name: '',
      note: null,
      routines: [{ name: 'Day 1', dayType: 'full', exercises: [] }],
      assign: { memberIds: ['m9'], planIds: [] },
    });
  });

  it('a library exercise carries its key, name and muscles, with 3 x 8-12', () => {
    expect(exerciseFromCatalog(bench)).toEqual({
      name: 'Barbell Bench Press',
      catalogKey: 'barbell_bench_press',
      logType: 'weight_reps',
      sets: 3,
      repMin: 8,
      repMax: 12,
      primary: ['chest'],
      restSec: null,
      note: null,
    });
    expect(customExercise('  Tyre   flip ')).toMatchObject({ name: 'Tyre flip', catalogKey: null, primary: [] });
  });

  it('moves an item up and down, and ignores a move off the end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('cleanDraft tidies names, empties blank notes and drops repeated ticks', () => {
    const d = cleanDraft(
      goodDraft({
        name: '  Fat   loss ',
        note: '  ',
        assign: { memberIds: ['m1', 'm1', 'm2'], planIds: ['p1', 'p1'] },
        routines: [{ name: ' Day  1 ', dayType: 'push', exercises: [{ ...exerciseFromCatalog(bench), note: '   ', catalogKey: '' }] }],
      }),
    );
    expect(d.name).toBe('Fat loss');
    expect(d.note).toBeNull();
    expect(d.routines[0].name).toBe('Day 1');
    expect(d.routines[0].exercises[0].note).toBeNull();
    expect(d.routines[0].exercises[0].catalogKey).toBeNull();
    expect(d.assign).toEqual({ memberIds: ['m1', 'm2'], planIds: ['p1'] });
    expect('id' in d).toBe(false);
  });

  it('draftOf is a copy: changing it never changes the saved plan', () => {
    const p = savedPlan();
    const d = draftOf(p);
    d.routines[0].exercises[0].sets = 9;
    expect(p.routines[0].exercises[0].sets).toBe(3);
    expect(d.id).toBe('w1');
  });
});

describe('the plan’s lines on screen', () => {
  const plans = [
    { id: 'p1', name: 'Gold' },
    { id: 'p2', name: 'Silver Plan' },
  ];

  it('"Sent to 3 members · Gold plan"', () => {
    expect(assignSummary({ assign: { memberIds: ['a', 'b', 'c'], planIds: ['p1'] } }, plans)).toBe('Sent to 3 members · Gold plan');
    expect(assignSummary({ assign: { memberIds: ['a'], planIds: [] } }, plans)).toBe('Sent to 1 member');
    expect(assignSummary({ assign: { memberIds: [], planIds: ['p2'] } }, plans)).toBe('Sent to Silver Plan');
    expect(assignSummary({ assign: { memberIds: [], planIds: ['p1', 'gone'] } }, plans)).toBe('Sent to Gold plan');
    expect(assignSummary({ assign: { memberIds: [], planIds: [] } }, plans)).toBe('Not sent to anyone yet');
  });

  it('counts days and exercises', () => {
    expect(planSizeWords(savedPlan())).toBe('1 day · 2 exercises');
  });

  it('lists open plans newest first, withdrawn ones apart', () => {
    const { open, withdrawn } = splitPlans([
      savedPlan({ id: 'a', updatedAt: 5 }),
      savedPlan({ id: 'b', updatedAt: 9 }),
      savedPlan({ id: 'c', updatedAt: 7, withdrawn: true }),
    ]);
    expect(open.map((p) => p.id)).toEqual(['b', 'a']);
    expect(withdrawn.map((p) => p.id)).toEqual(['c']);
  });

  it('a member gets plans sent by name or to a plan they have today (as member_gym_plans picks)', () => {
    const ms = (over: Partial<Membership>) =>
      ({ memberId: 'm1', planId: 'p1', startsOn: '2026-10-01', endsOn: '2026-10-31', cancelled: false, ...over }) as Membership;
    const list = [
      savedPlan({ id: 'byName', assign: { memberIds: ['m1'], planIds: [] } }),
      savedPlan({ id: 'byPlan', assign: { memberIds: [], planIds: ['p1'] } }),
      savedPlan({ id: 'other', assign: { memberIds: ['m2'], planIds: ['p2'] } }),
      savedPlan({ id: 'gone', withdrawn: true, assign: { memberIds: ['m1'], planIds: [] } }),
    ];
    const ids = (memberships: Membership[], today = '2026-10-18') => plansForMember(list, 'm1', memberships, today).map((p) => p.id).sort();
    expect(ids([ms({})])).toEqual(['byName', 'byPlan']);
    expect(ids([ms({ cancelled: true })])).toEqual(['byName']);
    expect(ids([ms({})], '2026-11-01')).toEqual(['byName']);
    expect(ids([ms({ memberId: 'm2' })])).toEqual(['byName']);
  });
});

describe('searchExercises', () => {
  const keys = (q: string) => searchExercises(q, 50).map((e) => e.key);

  it('finds by name in any case, best match first', () => {
    expect(keys('BENCH')[0]).toBe('barbell_bench_press');
    expect(keys('lat pulldown')[0]).toBe('lat_pulldown');
    expect(keys('leg curl')).toEqual(expect.arrayContaining(['lying_leg_curl', 'seated_leg_curl']));
  });

  it('finds by the words people use at an Indian gym, Hindi script too', () => {
    expect(keys('chhati')).toContain('barbell_bench_press');
    expect(keys('dole')).toContain('barbell_curl');
    expect(keys('baithak')).toContain('barbell_back_squat');
    expect(keys('बैठक')).toContain('barbell_back_squat');
    expect(keys('डोले')).toContain('barbell_curl');
    expect(keys('pindli')).toContain('standing_calf_raise');
  });

  it('needs every word typed, and ignores stray punctuation', () => {
    expect(keys('incline   dumbbell')).toEqual(expect.arrayContaining(['incline_dumbbell_press', 'incline_dumbbell_curl']));
    expect(keys('incline dumbbell')).not.toContain('barbell_bench_press');
    expect(keys('t-bar')).toContain('t_bar_row');
    expect(keys('zzzz')).toEqual([]);
  });

  it('shows the start of the list when nothing is typed, and keeps to the limit', () => {
    expect(searchExercises('', 5)).toHaveLength(5);
    expect(searchExercises('curl', 3)).toHaveLength(3);
  });
});

describe('saving in the browser store', () => {
  let clock: number;
  let db: LocalCrmData;
  beforeEach(() => {
    clock = 1_000;
    db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym') });
  });

  it('makes a plan, then changes it keeping when (and by whom) it was made', async () => {
    const made = await db.saveWorkoutPlan(goodDraft());
    expect(made).toMatchObject({ name: 'Beginner 3 days', withdrawn: false });
    expect(made.createdAt).toBe(made.updatedAt);
    // What the server stamps (createdBy) survives an edit made on this copy.
    const snap = await db.load();
    snap.workoutPlans[0].createdByName = 'Rohit';
    db.replaceAll(snap);
    const changed = await db.saveWorkoutPlan({ ...draftOf(made), name: 'Beginner 4 days' });
    expect(changed.id).toBe(made.id);
    expect(changed.createdAt).toBe(made.createdAt);
    expect(changed.updatedAt).toBeGreaterThan(made.updatedAt);
    expect(changed.createdByName).toBe('Rohit');
    expect((await db.load()).workoutPlans.map((p) => p.name)).toEqual(['Beginner 4 days']);
  });

  it('stamps who made a new plan, so the desk shows it at once', async () => {
    const made = await db.saveWorkoutPlan({ ...goodDraft(), createdBy: 's-1', createdByName: 'Ravi' });
    expect(made).toMatchObject({ createdBy: 's-1', createdByName: 'Ravi' });
    expect(made).not.toHaveProperty('baseUpdatedAt');
  });

  it('refuses an edit over a newer save from another desk, never dropping their change', async () => {
    const made = await db.saveWorkoutPlan(goodDraft());
    const mine = draftOf(made);
    await db.saveWorkoutPlan({ ...draftOf(made), assign: { memberIds: ['m-1', 'm-2'], planIds: [] } });
    await expect(db.saveWorkoutPlan({ ...mine, name: 'Mine' })).rejects.toThrow(/Someone else changed this plan/);
    expect((await db.load()).workoutPlans[0].assign.memberIds).toEqual(['m-1', 'm-2']);
    expect((await db.load()).workoutPlans[0]).not.toHaveProperty('baseUpdatedAt');
  });

  it('refuses a plan the server would refuse, with the same words as the builder', async () => {
    await expect(db.saveWorkoutPlan(goodDraft({ name: '' }))).rejects.toThrow('Give the plan a name.');
    await expect(db.saveWorkoutPlan({ ...goodDraft(), id: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.load()).workoutPlans).toEqual([]);
  });

  it('withdraws a plan without deleting it', async () => {
    const made = await db.saveWorkoutPlan(goodDraft());
    const w = await db.withdrawWorkoutPlan(made.id);
    expect(w.withdrawn).toBe(true);
    expect((await db.load()).workoutPlans).toHaveLength(1);
    await expect(db.withdrawWorkoutPlan('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('an older saved gym has no workout plans list: it reads as empty', () => {
    const old: Partial<ReturnType<typeof emptySnapshot>> = emptySnapshot(1);
    delete old.workoutPlans;
    expect(normalizeSnapshot(old as never).workoutPlans).toEqual([]);
  });
});

/** crm_pull / crm_push in one line each: one version per push, STALE on a race. */
class TinyServer implements CrmCloudApi {
  version = 0;
  rows = new Map<string, CrmRecord>();
  sent: CrmRecord[][] = [];
  async pull(): Promise<PullResult> {
    return { version: this.version, gym: { gymId: 'g1', name: 'Iron', joinCode: 'ABC123', createdAt: 1 }, records: JSON.parse(JSON.stringify([...this.rows.values()])) };
  }
  async push(_k: string, base: number, records: CrmRecord[]): Promise<number> {
    if (base !== this.version) throw new Error('STALE');
    this.sent.push(records);
    for (const r of records) this.rows.set(`${r.k}:${r.id}`, JSON.parse(JSON.stringify(r)));
    return (this.version += 1);
  }
}

describe('online', () => {
  it('sends a workout plan as ONE workout_plan row, and another device reads it back', async () => {
    const server = new TinyServer();
    const desk = new CloudCrmData('k', server, { now: () => 5 });
    const made = await desk.saveWorkoutPlan(goodDraft());
    expect(server.sent).toHaveLength(1);
    expect(server.sent[0]).toEqual([{ k: 'workout_plan', id: made.id, d: made }]);
    const other = await new CloudCrmData('k', server).load();
    expect(other.workoutPlans.map((p) => p.name)).toEqual(['Beginner 3 days']);

    await desk.withdrawWorkoutPlan(made.id);
    expect(server.sent[1]).toEqual([{ k: 'workout_plan', id: made.id, d: expect.objectContaining({ withdrawn: true }) }]);
  });
});

describe('starting weight (or time): saved as the phone’s setList', () => {
  const one = (key: string, patch: object = {}) =>
    goodDraft({ routines: [{ name: 'Day 1', dayType: 'full', exercises: [{ ...exerciseFromCatalog(lib(key)), ...patch }] }] });

  it('each exercise is logged the library’s way; one typed by hand is weight and reps', () => {
    expect(exerciseFromCatalog(lib('plank')).logType).toBe('time');
    expect(exerciseFromCatalog(lib('pull_up')).logType).toBe('reps');
    expect(exerciseFromCatalog(lib('weighted_dip')).logType).toBe('weighted');
    expect(exerciseFromCatalog(lib('assisted_pull_up')).logType).toBe('assisted');
    expect(exerciseFromCatalog(bench).logType).toBe('weight_reps');
    expect(customExercise('Tyre flip').logType).toBe('weight_reps');
  });

  it('which box each type gets: kg, kg added, seconds, or none', () => {
    expect(startKind('weight_reps')).toBe('kg');
    expect(startKind('weighted')).toBe('addedKg');
    expect(startKind('time')).toBe('seconds');
    expect(startKind('reps')).toBeNull();
    expect(startKind('assisted')).toBeNull();
  });

  it('weight and reps: one normal set per working set, at the lowest reps and the weight', () => {
    expect(buildSetList('weight_reps', 3, 8, 60)).toEqual([
      { type: 'normal', reps: 8, weightKg: 60 },
      { type: 'normal', reps: 8, weightKg: 60 },
      { type: 'normal', reps: 8, weightKg: 60 },
    ]);
    // Weighted: the kg ADDED to body weight, as the phone logs it ("+KG x REPS").
    expect(buildSetList('weighted', 2, 6, 10)).toEqual([
      { type: 'normal', reps: 6, weightKg: 10 },
      { type: 'normal', reps: 6, weightKg: 10 },
    ]);
  });

  it('a timed hold: its seconds, no reps or weight', () => {
    expect(buildSetList('time', 2, 8, 45)).toEqual([
      { type: 'normal', durationSec: 45 },
      { type: 'normal', durationSec: 45 },
    ]);
  });

  it('no setList for an empty box, or for reps only and machines that help', () => {
    expect(buildSetList('weight_reps', 3, 8, null)).toBeNull();
    expect(buildSetList('reps', 3, 8, 20)).toBeNull();
    expect(buildSetList('assisted', 3, 8, 20)).toBeNull();
    const d = cleanDraft(one('barbell_bench_press'));
    expect(d.routines[0].exercises[0]).not.toHaveProperty('setList');
  });

  it('reads the start back from a saved plan (editing it shows the same number)', () => {
    const saved = savedPlan({ routines: cleanDraft(one('barbell_bench_press', { setList: buildSetList('weight_reps', 3, 8, 62.5) })).routines });
    expect(startOf(draftOf(saved).routines[0].exercises[0])).toBe(62.5);
    const hold = cleanDraft(one('plank', { setList: buildSetList('time', 3, 8, 30) }));
    expect(startOf(hold.routines[0].exercises[0])).toBe(30);
    expect(startOf(exerciseFromCatalog(bench))).toBeNull();
  });

  it('Save makes the sets again from the start box, so they match the sets and reps typed last', () => {
    // 60 kg typed with 3 x 8, then the trainer changed it to 4 sets of 10-12.
    const ex = { ...exerciseFromCatalog(bench), setList: buildSetList('weight_reps', 3, 8, 60.004), sets: 4, repMin: 10, repMax: 12 };
    const out = cleanDraft(goodDraft({ routines: [{ name: 'D', dayType: 'full', exercises: [ex] }] })).routines[0].exercises[0];
    expect(out.setList).toEqual(Array(4).fill({ type: 'normal', reps: 10, weightKg: 60 }));
    expect(out).toMatchObject({ sets: 4, repMin: 10, repMax: 12 });
  });

  it('a plan saved before this change (every exercise weight and reps) is corrected on its next save', () => {
    const old = { ...exerciseFromCatalog(lib('plank')), logType: 'weight_reps' as const, setList: buildSetList('weight_reps', 3, 8, 20) };
    const out = cleanDraft(goodDraft({ routines: [{ name: 'D', dayType: 'full', exercises: [old] }] })).routines[0].exercises[0];
    expect(out.logType).toBe('time');
    // 20 kg never becomes 20 seconds.
    expect(out).not.toHaveProperty('setList');
  });

  it('checks the starting numbers in plain words (kg 0.5-500, seconds 5-600)', () => {
    const kg = (v: number) => one('barbell_bench_press', { setList: buildSetList('weight_reps', 3, 8, v) });
    expect(workoutPlanProblem(kg(0.5))).toBeNull();
    expect(workoutPlanProblem(kg(500))).toBeNull();
    expect(workoutPlanProblem(kg(0.4))).toBe('Barbell Bench Press (Day 1): the starting weight must be from 0.5 to 500 kg.');
    expect(workoutPlanProblem(kg(501))).toMatch(/0\.5 to 500 kg/);
    expect(workoutPlanProblem(kg(Number.NaN))).toMatch(/starting weight/);
    expect(workoutPlanProblem(one('weighted_dip', { setList: buildSetList('weighted', 3, 8, 900) }))).toMatch(/the added weight must be/);
    const sec = (v: number) => one('plank', { setList: buildSetList('time', 3, 8, v) });
    expect(workoutPlanProblem(sec(5))).toBeNull();
    expect(workoutPlanProblem(sec(600))).toBeNull();
    expect(workoutPlanProblem(sec(4))).toBe('Plank (Day 1): seconds must be a whole number from 5 to 600.');
    expect(workoutPlanProblem(sec(601))).toMatch(/seconds/);
    expect(workoutPlanProblem(one('plank', { setList: [{ type: 'jump' }] }))).toMatch(/looks damaged/);
    expect(workoutPlanProblem(one('plank', { logType: 'yoga' }))).toMatch(/looks damaged/);
  });

  it('the size check counts the starting numbers too (the whole record)', () => {
    const ex = { ...exerciseFromCatalog(bench), sets: 20, setList: buildSetList('weight_reps', 20, 8, 100), note: 'x'.repeat(200) };
    const big = goodDraft({ routines: Array.from({ length: 14 }, (_, i) => ({ name: `Day ${i + 1}`, dayType: 'full' as const, exercises: [ex, ex] })) });
    const noSets = goodDraft({ routines: big.routines.map((r) => ({ ...r, exercises: r.exercises.map(({ setList: _s, ...e }) => e) })) });
    expect(workoutPlanProblem(noSets)).toBeNull();
    expect(workoutPlanProblem(big)).toMatch(/too big/);
  });

  it('what the phone reads: a plan saved with starting numbers is a routine file the phone opens', async () => {
    const db = new LocalCrmData({ store: memoryStore(), now: () => 5, seed: () => emptySnapshot(0, 'Test Gym') });
    const made = await db.saveWorkoutPlan(
      goodDraft({
        routines: [
          {
            name: 'Day 1',
            dayType: 'full',
            exercises: [
              { ...exerciseFromCatalog(bench), setList: buildSetList('weight_reps', 3, 8, 40) },
              { ...exerciseFromCatalog(lib('plank')), sets: 2, setList: buildSetList('time', 2, 8, 30) },
              exerciseFromCatalog(lib('pull_up')),
            ],
          },
        ],
      }),
    );
    const [b, p, u] = made.routines[0].exercises;
    expect(b).toMatchObject({ logType: 'weight_reps', sets: 3, setList: [{ type: 'normal', reps: 8, weightKg: 40 }, {}, {}] });
    expect(p).toMatchObject({ logType: 'time', sets: 2, setList: [{ type: 'normal', durationSec: 30 }, { type: 'normal', durationSec: 30 }] });
    expect(u.logType).toBe('reps');
    expect(u).not.toHaveProperty('setList');
  });
});

describe('ready plans', () => {
  it('are the 5 gym programs, each with its words for the list', () => {
    expect(READY_PLANS).toHaveLength(5);
    for (const t of READY_PLANS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.meta).toMatch(/·\s*\d days a week/);
      expect(t.summary.length).toBeGreaterThan(10);
    }
  });

  it('fill the days and exercises (name, muscles, how it is logged) with the file’s sets and reps', () => {
    const t = READY_PLANS.find((x) => x.key === 'gym_full_body_beginner')!;
    const d = draftFromReadyPlan(t, ['m1']);
    expect(d).toMatchObject({ name: 'Full Body Basics', note: null, assign: { memberIds: ['m1'], planIds: [] } });
    expect(d).not.toHaveProperty('id');
    expect(d.routines.map((r) => r.name)).toEqual(t.routines.map((r) => r.name));
    const first = d.routines[0].exercises[0];
    expect(first).toMatchObject({ name: 'Leg Press', catalogKey: 'leg_press', logType: 'weight_reps', sets: 3, repMin: 6, repMax: 10, primary: ['quads'] });
    expect(first).not.toHaveProperty('setList');
    const plank = d.routines[0].exercises.find((e) => e.catalogKey === 'plank')!;
    expect(plank.logType).toBe('time');
  });

  it('every ready plan, filled in, can be saved as it is (nothing left out)', () => {
    for (const t of READY_PLANS) {
      const d = draftFromReadyPlan(t);
      expect(workoutPlanProblem(cleanDraft(d)), t.key).toBeNull();
      expect(d.routines.map((r) => r.exercises.length)).toEqual(t.routines.map((r) => r.exercises.length));
    }
  });

  it('a fresh copy each time: changing one plan never changes the next', () => {
    const t = READY_PLANS[0];
    const a = draftFromReadyPlan(t);
    a.routines[0].exercises[0].sets = 9;
    expect(draftFromReadyPlan(t).routines[0].exercises[0].sets).toBe(t.routines[0].exercises[0].sets);
  });
});

describe('copies', () => {
  it('"Make a copy": same days and exercises, "(copy)" added, sent to nobody, a NEW plan', () => {
    const p = savedPlan({ name: 'Beginner 3 days', note: 'Drink water', assign: { memberIds: ['m1'], planIds: ['p1'] }, createdByName: 'Ravi' });
    const c = copyOfPlan(p);
    expect(c).toEqual({ name: 'Beginner 3 days (copy)', note: 'Drink water', routines: p.routines, assign: { memberIds: [], planIds: [] } });
    expect(c).not.toHaveProperty('id');
    expect(c).not.toHaveProperty('baseUpdatedAt');
    c.routines[0].exercises[0].sets = 9;
    expect(p.routines[0].exercises[0].sets).toBe(3);
  });

  it('a copy’s name stays inside the 80-letter limit', () => {
    expect(copyName('Push (copy)')).toBe('Push (copy)');
    expect(copyName('Push (copy) (copy)')).toBe('Push (copy)');
    const n = copyName('x'.repeat(80));
    expect(n.length).toBe(80);
    expect(n.endsWith(' (copy)')).toBe(true);
    expect(copyName('  ')).toBe('Day (copy)');
  });

  it('"Copy day": the same exercises under "<day> (copy)", a deep copy', () => {
    const r = goodDraft().routines[0];
    const c = copyRoutine(r);
    expect(c.name).toBe('Day 1 (copy)');
    expect(c.exercises).toEqual(r.exercises);
    c.exercises[0].sets = 7;
    expect(r.exercises[0].sets).toBe(3);
  });
});

describe('sending a plan to one member in one tap (Member detail)', () => {
  const ms = { memberId: 'm1', planId: 'p1', startsOn: '2026-10-01', endsOn: '2026-10-31', cancelled: false } as Membership;

  it('lists the open plans, marking the ones the member already gets', () => {
    const list = [
      savedPlan({ id: 'byName', updatedAt: 3, assign: { memberIds: ['m1'], planIds: [] } }),
      savedPlan({ id: 'byPlan', updatedAt: 2, assign: { memberIds: [], planIds: ['p1'] } }),
      savedPlan({ id: 'free', updatedAt: 1, assign: { memberIds: ['m2'], planIds: [] } }),
      savedPlan({ id: 'gone', withdrawn: true, assign: { memberIds: [], planIds: [] } }),
    ];
    expect(sendChoices(list, 'm1', [ms], '2026-10-18').map((c) => [c.plan.id, c.already])).toEqual([
      ['byName', true],
      ['byPlan', true],
      ['free', false],
    ]);
  });

  it('adds the member as an edit of the saved plan, and Undo takes them off again', () => {
    const p = savedPlan({ updatedAt: 42, assign: { memberIds: ['m2'], planIds: ['p1'] } });
    const add = withMember(p, 'm1');
    expect(add).toMatchObject({ id: 'w1', baseUpdatedAt: 42, assign: { memberIds: ['m2', 'm1'], planIds: ['p1'] } });
    expect(withMember(p, 'm2').assign.memberIds).toEqual(['m2']);
    expect(withoutMember({ ...p, assign: add.assign }, 'm1').assign).toEqual({ memberIds: ['m2'], planIds: ['p1'] });
  });

  it('through the store: sends, undoes, and never drops another desk’s change', async () => {
    let clock = 1_000;
    const db = new LocalCrmData({ store: memoryStore(), now: () => (clock += 1), seed: () => emptySnapshot(0, 'Test Gym') });
    const made = await db.saveWorkoutPlan(goodDraft({ assign: { memberIds: ['m2'], planIds: [] } }));
    const sent = await db.saveWorkoutPlan(withMember(made, 'm1'));
    expect(sent.assign.memberIds).toEqual(['m2', 'm1']);
    expect(sent.createdAt).toBe(made.createdAt);
    const undone = await db.saveWorkoutPlan(withoutMember(sent, 'm1'));
    expect(undone.assign.memberIds).toEqual(['m2']);
    // Another desk ticked m3 meanwhile: a send from the old copy is refused, their tick kept.
    await db.saveWorkoutPlan(withMember(undone, 'm3'));
    await expect(db.saveWorkoutPlan(withMember(undone, 'm1'))).rejects.toThrow(/Someone else changed this plan/);
    expect((await db.load()).workoutPlans[0].assign.memberIds).toEqual(['m2', 'm3']);
  });
});

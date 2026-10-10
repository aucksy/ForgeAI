/**
 * Audit Phase 4, packet B — routines like Hevy's, against REAL SQLite (test/helpers/realDb.ts).
 *  - RP-19: a routine keeps set types (warm-up / drop / failure) and targets, its own rest, a
 *    superset and a note (tracker schema v12); Start builds exactly those rows; "Update
 *    routine" saves them.
 *  - RP-20: an exercise added in the workout is saved with the rows the member did, not 3.
 *  - RP-21: lowering a routine's sets is respected next workout even when last time had more.
 *  - RP-23: no 12-set / 50-rep caps.
 *  - RP-08: new, saved and duplicated routines never silently join the followed plan, and never
 *    create and follow a plan by themselves.
 *  - RP-05 / RP-06 / RP-07 / RP-16 / RP-18: fresh weeks on follow, days a week, folder order,
 *    shared files that always import back, and no duplicate folders.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'intermediate',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
});

const exerciseId = (name: string) => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;
const repo = () => import('@/tracker/db/routineRepo');
const folders = () => import('@/tracker/db/folderRepo');
const store = async () => (await import('@/tracker/store/activeWorkoutStore')).useActiveWorkout;
const rowTypes = (sets: { isWarmup: boolean; setType?: string }[]) => sets.map((s) => (s.isWarmup ? 'warmup' : s.setType ?? 'normal'));

/** Tick every working row of card `i` at `w` × `r` (warm-ups at half). */
async function tickCard(i: number, w: number, r: number): Promise<void> {
  const st = (await store()).getState();
  const c = st.exercises[i];
  for (const s of c.sets) {
    st.updateSet(c.key, s.key, { weightKg: s.isWarmup ? w / 2 : w, reps: r });
    expect(st.toggleDone(c.key, s.key)).toBeNull();
  }
}

describe('RP-19 a routine keeps its sets, rest, supersets and notes', () => {
  async function pushDay(): Promise<{ day: string; bench: string; fly: string }> {
    const r = await repo();
    const { createFolder } = await folders();
    const day = await r.createRoutine({ name: 'Push A', dayType: 'push', folderId: await createFolder('Mine') });
    const benchId = exerciseId('Barbell Bench Press');
    const flyId = exerciseId('Cable Fly');
    const bench = await r.addExerciseToRoutine(day, benchId, { targetSets: 3, repRangeMin: 6, repRangeMax: 8 });
    const fly = await r.addExerciseToRoutine(day, flyId, { targetSets: 2 });
    await r.updateRoutineExercise(bench, {
      sets: [{ type: 'warmup' }, { type: 'warmup' }, { type: 'normal', reps: 8, weightKg: 80 }, { type: 'normal' }, { type: 'drop' }, { type: 'failure' }],
      restSec: 150,
      supersetGroup: 1,
      note: 'Pause at the bottom',
    });
    await r.updateRoutineExercise(fly, { supersetGroup: 1 });
    return { day, bench: benchId, fly: flyId };
  }

  it('the routine reads back exactly as saved (old rows stay "N normal sets")', async () => {
    const { day } = await pushDay();
    const got = (await (await repo()).getRoutine(day))!;
    const [b, f] = got.exercises;
    expect(b.sets?.map((s) => s.type)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'drop', 'failure']);
    expect(b.sets?.[2]).toEqual({ type: 'normal', reps: 8, weightKg: 80 });
    expect(b.targetSets).toBe(3); // normal + failure; warm-ups and drops are not working sets
    expect([b.restSec, b.supersetGroup, b.note]).toEqual([150, 1, 'Pause at the bottom']);
    expect([f.sets, f.restSec, f.supersetGroup, f.note, f.targetSets]).toEqual([null, null, 1, null, 2]);
  });

  it('Start builds exactly those rows — warm-ups as warm-ups, drops as drops — with its rest, superset and note', async () => {
    const { day } = await pushDay();
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    const [b, f] = aw.getState().exercises;
    expect(rowTypes(b.sets)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'drop', 'failure']);
    expect(b.restSec).toBe(150);
    expect(b.note).toBe('Pause at the bottom');
    expect(b.supersetGroup).not.toBeNull();
    expect(f.supersetGroup).toBe(b.supersetGroup);
    expect(rowTypes(f.sets)).toEqual(['normal', 'normal']);
    // Nothing changed: no "Update routine?".
    const { routineUpdateOffer } = await import('@/tracker/services/routineOffer');
    expect(await routineUpdateOffer(day, aw.getState().exercises)).toBeNull();
  });

  it('"Update routine" saves the set types, rest, superset and note as done', async () => {
    const { day } = await pushDay();
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    const st = aw.getState();
    const [b, f] = st.exercises;
    // Fly gets a warm-up and a drop set; Bench's rest goes to 3 min; Fly leaves the superset;
    // the note changes.
    st.addSet(f.key);
    const added = aw.getState().exercises[1].sets.at(-1)!;
    st.setSetType(f.key, added.key, 'drop');
    st.setSetType(f.key, aw.getState().exercises[1].sets[0].key, 'warmup');
    await st.setRestSec(b.key, 180);
    st.setSupersetGroup(f.key, null);
    st.setExerciseNote(b.key, 'Slow down');
    const { routineUpdateOffer, applyRoutineOffer } = await import('@/tracker/services/routineOffer');
    const offer = await routineUpdateOffer(day, aw.getState().exercises);
    expect(offer).not.toBeNull();
    expect(offer!.text).toMatch(/You changed/);
    await applyRoutineOffer(offer!);
    const got = (await (await repo()).getRoutine(day))!;
    expect(got.exercises[1].sets?.map((s) => s.type)).toEqual(['warmup', 'normal', 'drop']);
    expect(got.exercises[1].targetSets).toBe(1);
    expect(got.exercises[0].restSec).toBe(180);
    expect(got.exercises[0].note).toBe('Slow down');
    expect(got.exercises.map((e) => e.supersetGroup)).toEqual([null, null]);
    // Bench kept its own list and the set target it had.
    expect(got.exercises[0].sets?.[2]).toEqual({ type: 'normal', reps: 8, weightKg: 80 });
  });

  it('an older routine (no set list) still starts as "N normal sets"', async () => {
    const r = await repo();
    const { createFolder } = await folders();
    const day = await r.createRoutine({ name: 'Legs', dayType: 'legs', folderId: await createFolder('Mine') });
    await r.addExerciseToRoutine(day, exerciseId('Barbell Bench Press'), { targetSets: 4 });
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    expect(rowTypes(aw.getState().exercises[0].sets)).toEqual(['normal', 'normal', 'normal', 'normal']);
  });
});

describe('RP-20 / RP-21 set counts come out right', () => {
  it('RP-20: an added exercise is saved with the 4 rows the member did, not 3', async () => {
    const r = await repo();
    const { createFolder } = await folders();
    const day = await r.createRoutine({ name: 'Push A', dayType: 'push', folderId: await createFolder('Mine') });
    await r.addExerciseToRoutine(day, exerciseId('Barbell Bench Press'), { targetSets: 3 });
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    const { getExerciseById } = await import('@/db/repos/exerciseRepo');
    await aw.getState().addExercise((await getExerciseById(exerciseId('Cable Fly')))!);
    const flyKey = aw.getState().exercises[1].key;
    while (aw.getState().exercises[1].sets.length < 4) aw.getState().addSet(flyKey);
    const { routineUpdateOffer, applyRoutineOffer } = await import('@/tracker/services/routineOffer');
    const offer = (await routineUpdateOffer(day, aw.getState().exercises))!;
    expect(offer.text).toMatch(/You added Cable Fly/);
    await applyRoutineOffer(offer);
    const got = (await r.getRoutine(day))!;
    expect(got.exercises.map((e) => [e.exercise.name, e.targetSets])).toEqual([
      ['Barbell Bench Press', 3],
      ['Cable Fly', 4],
    ]);
  });

  it('RP-21: Bench had 5 sets last time; the routine now says 3 → 3 rows', async () => {
    const r = await repo();
    const { createFolder } = await folders();
    const day = await r.createRoutine({ name: 'Push A', dayType: 'push', folderId: await createFolder('Mine') });
    const pe = await r.addExerciseToRoutine(day, exerciseId('Barbell Bench Press'), { targetSets: 5 });
    const aw = await store();
    await aw.getState().startFromPlanDay(day);
    await tickCard(0, 100, 5);
    expect(await aw.getState().finish(null)).toBeTruthy();
    await r.updateRoutineExercise(pe, { targetSets: 3 });
    await aw.getState().startFromPlanDay(day);
    expect(aw.getState().exercises[0].sets).toHaveLength(3);
    // Raising it again gives the routine's count too.
    aw.setState({ active: false });
    await r.updateRoutineExercise(pe, { targetSets: 6 });
    await aw.getState().startFromPlanDay(day);
    expect(aw.getState().exercises[0].sets).toHaveLength(6);
  });

  it('RP-23: 20 sets and 100 reps are kept (no 12-set / 50-rep caps); a set list follows a new count', async () => {
    const r = await repo();
    const { createFolder } = await folders();
    const day = await r.createRoutine({ name: 'Calves', dayType: 'legs', folderId: await createFolder('Mine') });
    const pe = await r.addExerciseToRoutine(day, exerciseId('Barbell Bench Press'), { targetSets: 3 });
    await r.updateRoutineExercise(pe, { targetSets: 20, repRangeMin: 80, repRangeMax: 100 });
    let got = (await r.getRoutine(day))!.exercises[0];
    expect([got.targetSets, got.repRangeMin, got.repRangeMax]).toEqual([20, 80, 100]);
    await r.updateRoutineExercise(pe, { sets: [{ type: 'warmup' }, { type: 'normal' }, { type: 'normal' }, { type: 'drop' }] });
    await r.updateRoutineExercise(pe, { targetSets: 1 });
    got = (await r.getRoutine(day))!.exercises[0];
    expect(got.sets?.map((s) => s.type)).toEqual(['warmup', 'normal']);
    expect(got.targetSets).toBe(1);
  });
});

describe('RP-08 a new routine never silently joins the plan', () => {
  async function followedPlan(): Promise<string> {
    const { createFolderWithRoutines } = await folders();
    return createFolderWithRoutines('PPL', [{ name: 'Push', dayType: 'push', exercises: [] }], { follow: true, todayISO: '2026-10-01' });
  }

  it('"+ New routine", "Save as routine" and "Duplicate" go to "My routines", not the followed plan', async () => {
    const plan = await followedPlan();
    const r = await repo();
    const fresh = await r.createRoutine({ name: 'Abs', dayType: 'full' });
    const saved = await r.createRoutineFromWorkout({ name: 'Fri', dayType: 'full', items: [{ exerciseId: exerciseId('Barbell Bench Press'), workingSets: 4 }] });
    const pushId = db.all<{ id: string }>("SELECT id FROM plan_days WHERE name = 'Push'")[0].id;
    const copy = await r.duplicateRoutine(pushId);
    const list = await (await folders()).listFolders();
    expect(list.map((f) => [f.name, f.following, f.routines.map((x) => x.name)])).toEqual([
      ['PPL', true, ['Push']],
      ['My routines', false, ['Abs', 'Fri', 'Push (copy)']],
    ]);
    expect([fresh, saved, copy].every((id) => !list[0].routines.some((x) => x.id === id))).toBe(true);
    expect(list[0].id).toBe(plan);
    // Only when the member picks the plan does it join.
    const chosen = await r.createRoutine({ name: 'Arms', dayType: 'full', folderId: plan });
    expect((await r.listRoutines()).map((x) => x.id)).toContain(chosen);
  });

  it('with no plan, nothing is created and followed by itself', async () => {
    const r = await repo();
    await r.createRoutine({ name: 'Abs', dayType: 'full' });
    expect(db.all('SELECT name, is_active FROM workout_plans')).toEqual([{ name: 'My routines', is_active: 0 }]);
    expect(await r.listRoutines()).toEqual([]);
  });

  it('an older plan itself called "My Routines" is not mistaken for the new folder', async () => {
    db.raw.run("INSERT INTO workout_plans(id, name, is_active) VALUES('old', 'My Routines', 1)");
    const r = await repo();
    await r.createRoutine({ name: 'Abs', dayType: 'full' });
    expect(db.all('SELECT name, is_active FROM workout_plans ORDER BY rowid')).toEqual([
      { name: 'My Routines', is_active: 1 },
      { name: 'Other routines', is_active: 0 },
    ]);
  });
});

describe('RP-05 / RP-06 / RP-07 plans and order', () => {
  it('RP-05: following a folder again leaves no one-off easy week behind', async () => {
    const f = await folders();
    const id = await f.createFolder('Old plan', { settings: { startISO: '2026-08-01', easyOnce: 3, easyFrom: '2026-08-20', easy: { every: 6, base: 2 } } });
    await f.followFolder(id, '2026-10-10');
    const got = (await f.followedFolder())!;
    expect(got.settings).toEqual({ startISO: '2026-10-10', easy: { every: 6, base: 0 } });
  });

  it('RP-06: a 3-day program of 2 routines counts to 3; the builder its days; the own folder its routines', async () => {
    const { planDaysPerWeek } = await import('@/tracker/services/planState');
    expect(planDaysPerWeek({ program: 'gym_full_body_beginner' }, 2)).toBe(3);
    expect(planDaysPerWeek({ builder: { days: 3 } }, 4)).toBe(3);
    expect(planDaysPerWeek({ daysPerWeek: 5 }, 2)).toBe(5);
    expect(planDaysPerWeek({}, 4)).toBe(4);
    expect(planDaysPerWeek({}, 0)).toBeNull();
    const { addProgram } = await import('@/tracker/services/plansService');
    await addProgram('gym_full_body_beginner', { follow: true, easyWeeks: false });
    expect((await (await folders()).followedFolder())!.settings.daysPerWeek).toBe(3);
  });

  it('RP-07: routines and folders keep the order the member gives them (the order is the rotation)', async () => {
    const f = await folders();
    const r = await repo();
    const plan = await f.createFolderWithRoutines(
      'PPL',
      ['Push 1', 'Push 2', 'Pull 1', 'Pull 2'].map((name) => ({ name, dayType: 'push' as const, exercises: [] })),
      { follow: true, todayISO: '2026-10-01' },
    );
    const ids = Object.fromEntries(db.all<{ id: string; name: string }>('SELECT id, name FROM plan_days').map((x) => [x.name, x.id]));
    await r.reorderRoutines([ids['Push 1'], ids['Pull 1'], ids['Push 2'], ids['Pull 2']]);
    expect((await r.listRoutines()).map((x) => x.name)).toEqual(['Push 1', 'Pull 1', 'Push 2', 'Pull 2']);
    const a = await f.createFolder('A');
    const b = await f.createFolder('B');
    await f.reorderFolders([plan, b, a]);
    expect((await f.listFolders()).map((x) => x.name)).toEqual(['PPL', 'B', 'A']);
  });
});

describe('RP-16 / RP-18 shared files and programs', () => {
  it('RP-16: long names, 31 routines and 41 exercises share and import back whole', async () => {
    const { makeRoutineFile, parseRoutineFile, routineFileJson, routineFileName } = await import('@/tracker/plans/routineFile');
    const long = 'Upper body with a very long name that goes on and on past eighty characters for sure ok';
    const ex = { name: 'Barbell Bench Press', catalogKey: 'barbell_bench_press', logType: 'weight_reps' as const, sets: 3, repMin: 8, repMax: 12, primary: [] };
    const file = makeRoutineFile(long, [
      { name: long, dayType: 'upper', exercises: Array.from({ length: 41 }, () => ex) },
      ...Array.from({ length: 30 }, (_, i) => ({ name: `R${i}`, dayType: 'full' as const, exercises: [ex] })),
    ]);
    const parsed = parseRoutineFile(routineFileJson(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.routines).toHaveLength(31);
    expect(parsed.file.routines[0].name).toBe(long);
    expect(parsed.file.routines[0].exercises).toHaveLength(41);
    expect(routineFileName(long).length).toBeLessThan(80);
    // A name longer than the editor allows is shortened, never refused.
    const huge = parseRoutineFile(routineFileJson(makeRoutineFile(null, [{ name: 'x'.repeat(300), dayType: 'full', exercises: [] }])));
    expect(huge.ok && huge.file.routines[0].name.length).toBe(120);
  });

  it('RP-18: the same file imported twice updates one folder; "Add a copy" makes a second', async () => {
    const { makeRoutineFile } = await import('@/tracker/plans/routineFile');
    const { importRoutineFile, existingFileFolder } = await import('@/tracker/services/plansService');
    const file = makeRoutineFile('From Sam', [
      {
        name: 'Upper',
        dayType: 'upper',
        exercises: [{ name: 'Barbell Bench Press', catalogKey: 'barbell_bench_press', logType: 'weight_reps', sets: 3, repMin: 8, repMax: 12, primary: [], setList: [{ type: 'warmup' }, { type: 'normal' }, { type: 'normal' }, { type: 'normal' }], restSec: 120, note: 'Arch' }],
      },
    ]);
    expect(await existingFileFolder(file)).toBeNull();
    const first = await importRoutineFile(file);
    const dayId = db.all<{ id: string }>("SELECT id FROM plan_days WHERE name = 'Upper'")[0].id;
    expect((await existingFileFolder(file))?.id).toBe(first.folderId);
    const again = await importRoutineFile(file);
    expect(again).toMatchObject({ folderId: first.folderId, updated: true });
    expect(db.all("SELECT name FROM workout_plans WHERE source = 'import'")).toEqual([{ name: 'From Sam' }]);
    // The routine kept its id (its workouts stay with it), and its sets, rest and note came along.
    const got = (await (await repo()).getRoutine(dayId))!;
    expect(got.exercises[0].sets?.map((s) => s.type)).toEqual(['warmup', 'normal', 'normal', 'normal']);
    expect([got.exercises[0].restSec, got.exercises[0].note]).toEqual([120, 'Arch']);
    await importRoutineFile(file, { existing: 'copy' });
    expect(db.all("SELECT name FROM workout_plans WHERE source = 'import' ORDER BY rowid")).toEqual([{ name: 'From Sam' }, { name: 'From Sam (copy)' }]);
  });

  it('RP-18: the same program added twice stays one folder (followed when asked)', async () => {
    const { addProgram, existingProgramFolder } = await import('@/tracker/services/plansService');
    const a = await addProgram('gym_full_body_beginner', { follow: false, easyWeeks: true });
    expect((await existingProgramFolder('gym_full_body_beginner'))?.id).toBe(a);
    const b = await addProgram('gym_full_body_beginner', { follow: true, easyWeeks: true });
    expect(b).toBe(a);
    expect(db.all("SELECT is_active FROM workout_plans WHERE source = 'program'")).toEqual([{ is_active: 1 }]);
    await addProgram('gym_full_body_beginner', { follow: false, easyWeeks: true, existing: 'copy' });
    expect(db.count('workout_plans', "source = 'program'")).toBe(2);
  });
});

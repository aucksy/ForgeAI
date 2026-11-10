/**
 * R-436 (owner, 10 Nov 2026): "Start remembering my empty workouts". Against REAL SQL
 * (test/helpers/realDb.ts):
 *  - Finish of an empty workout remembers its exercises (in order, with their set counts);
 *  - Discard remembers nothing, and a routine's workout never overwrites the list;
 *  - the next empty workout starts with those exercises, in that order;
 *  - an exercise deleted since is skipped;
 *  - "Start blank" removes the pre-added cards that have no ticked set (the member's own stay);
 *  - the cloud copy carries it as the 'p' item 'empty', and an older app's prefs reader refuses it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnboardingInput } from '@/onboarding/form';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const MEMBER: OnboardingInput = {
  name: 'Test Member',
  phoneE164: '+919876543210',
  goal: 'muscle',
  experience: 'beginner',
  age: 30,
  heightCm: 175,
  gymName: 'Test Gym',
  bodyWeightKg: 78,
  targets: { calorieTarget: 2700, proteinTargetG: 135, carbsTargetG: 370, fatTargetG: 75 },
};

let db: RealDb;
let ids: string[];

beforeEach(async () => {
  db = await bootRealApp();
  const { completeOnboarding } = await import('@/onboarding/db/dataActions');
  await completeOnboarding(MEMBER);
  ids = db
    .all<{ id: string }>(
      "SELECT id FROM exercises WHERE equipment = 'barbell' AND (log_type IS NULL OR log_type = 'weight_reps') AND catalog_key IS NOT NULL ORDER BY name LIMIT 4",
    )
    .map((r) => r.id);
  expect(ids).toHaveLength(4);
});

async function store() {
  return (await import('@/tracker/store/activeWorkoutStore')).useActiveWorkout;
}
async function memory() {
  return import('@/tracker/services/emptyWorkoutMemory');
}
async function exercise(id: string) {
  const { getExerciseById } = await import('@/db/repos/exerciseRepo');
  return (await getExerciseById(id))!;
}
const metaValue = (key: string): string | null => db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])[0]?.value ?? null;

/** Add `id` to the open workout and tick `ticks` sets of it (60 kg x 8). */
async function addAndTick(id: string, ticks: number): Promise<void> {
  const aw = await store();
  await aw.getState().addExercise(await exercise(id));
  const card = aw.getState().exercises[aw.getState().exercises.length - 1];
  for (let i = card.sets.length; i < ticks; i++) aw.getState().addSet(card.key);
  const rows = aw.getState().exercises.find((e) => e.key === card.key)!.sets;
  for (let i = 0; i < ticks; i++) {
    aw.getState().updateSet(card.key, rows[i].key, { weightKg: 60, reps: 8 });
    aw.getState().toggleDone(card.key, rows[i].key);
  }
}

/** An empty workout of A (2 sets), B (1 set) and C (nothing ticked), finished. */
async function finishFirst(): Promise<void> {
  const aw = await store();
  aw.getState().startEmpty();
  await addAndTick(ids[0], 2);
  await addAndTick(ids[1], 1);
  await addAndTick(ids[2], 0);
  expect(await aw.getState().finish(null)).toBeTruthy();
}

describe('R-436 remembering the last empty workout', () => {
  it('Finish saves its exercises in order with their set counts; a card with nothing saved is left out', async () => {
    await finishFirst();
    const m = await memory();
    const saved = m.parseRemembered(metaValue(m.LAST_EMPTY_KEY));
    expect(saved?.items).toEqual([
      { id: ids[0], sets: 2 },
      { id: ids[1], sets: 1 },
    ]);
  });

  it('Discard saves nothing (the earlier list stays)', async () => {
    await finishFirst();
    const m = await memory();
    const before = metaValue(m.LAST_EMPTY_KEY);
    const aw = await store();
    aw.getState().startEmpty();
    await addAndTick(ids[3], 2);
    await aw.getState().discard();
    expect(metaValue(m.LAST_EMPTY_KEY)).toBe(before);
  });

  it('a workout that did not start empty never overwrites the list', async () => {
    await finishFirst();
    const m = await memory();
    const before = metaValue(m.LAST_EMPTY_KEY);
    const aw = await store();
    await aw.getState().startQuick('Quick one', [{ exercise: await exercise(ids[3]), sets: 1 }]);
    const card = aw.getState().exercises[0];
    aw.getState().updateSet(card.key, card.sets[0].key, { weightKg: 50, reps: 5 });
    aw.getState().toggleDone(card.key, card.sets[0].key);
    expect(await aw.getState().finish(null)).toBeTruthy();
    expect(metaValue(m.LAST_EMPTY_KEY)).toBe(before);
  });

  it('the next empty workout starts with the same exercises, in order, and shows the line', async () => {
    await finishFirst();
    const aw = await store();
    await aw.getState().startEmptyRemembered();
    const s = aw.getState();
    expect(s.active).toBe(true);
    expect(s.startedEmpty).toBe(true);
    expect(s.exercises.map((e) => e.exerciseId)).toEqual([ids[0], ids[1]]);
    expect(s.exercises.map((e) => e.sets.filter((x) => !x.isWarmup).length)).toEqual([2, 1]);
    expect(s.exercises.every((e) => e.sets.every((x) => !x.done && x.weightKg == null))).toBe(true);
    expect(s.emptyPrefill).toEqual(s.exercises.map((e) => e.key));
    const m = await memory();
    expect(m.showPrefillLine(s)).toBe(true);
    // The first tick hides the line.
    const card = s.exercises[0];
    aw.getState().updateSet(card.key, card.sets[0].key, { weightKg: 60, reps: 8 });
    aw.getState().toggleDone(card.key, card.sets[0].key);
    expect(m.showPrefillLine(aw.getState())).toBe(false);
  });

  it('R-444: Start opens the workout at once and the cards are filled after (start resolves before the fill)', async () => {
    await finishFirst();
    const aw = await store();
    const { startShownWorkout } = await import('@/tracker/services/todayStart');
    const nav = { push: () => undefined, replace: () => undefined };
    let atShow: { active: boolean; cards: number } | null = null;
    await startShownWorkout(nav, null, () => {
      atShow = { active: aw.getState().active, cards: aw.getState().exercises.length };
    });
    // The screen was opened while the workout was already open and still blank: the fill had not run.
    expect(atShow).toEqual({ active: true, cards: 0 });
    // Then the remembered cards arrive, with the line.
    await vi.waitFor(() => expect(aw.getState().exercises.map((e) => e.exerciseId)).toEqual([ids[0], ids[1]]), { timeout: 5000 });
    expect(aw.getState().emptyPrefill).toHaveLength(2);
  });

  it('R-444: the workout is open as soon as startEmptyRemembered returns; the member acting first still wins', async () => {
    await finishFirst();
    const aw = await store();
    // A real card of the member's own (built the normal way), kept for below.
    aw.getState().startEmpty();
    await aw.getState().addExercise(await exercise(ids[3]));
    const theirs = aw.getState().exercises[0];
    await aw.getState().discard();

    const filling = aw.getState().startEmptyRemembered();
    expect(aw.getState().active).toBe(true);
    expect(aw.getState().exercises).toEqual([]);
    // The member's card lands before the fill is done (addExercise's own set): theirs wins, nothing is pre-added.
    aw.setState({ exercises: [theirs] });
    await filling;
    expect(aw.getState().exercises.map((e) => e.exerciseId)).toEqual([ids[3]]);
    expect(aw.getState().emptyPrefill).toBeNull();
  });

  it('R-444: the Workout tab and Home do not wait for the fill (read as text)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = resolve(__dirname, '../..');
    expect(readFileSync(resolve(root, 'src/app/(tabs)/workout.tsx'), 'utf8')).toMatch(/void startEmptyRemembered\(\);\s*goActive\(\);/);
    expect(readFileSync(resolve(root, 'src/tracker/services/todayStart.ts'), 'utf8')).toMatch(/else void useActiveWorkout\.getState\(\)\.startEmptyRemembered\(\);/);
  });

  it('nothing remembered: the empty workout stays blank', async () => {
    const aw = await store();
    await aw.getState().startEmptyRemembered();
    expect(aw.getState().active).toBe(true);
    expect(aw.getState().exercises).toEqual([]);
    expect(aw.getState().emptyPrefill).toBeNull();
  });

  it('an exercise that no longer exists is skipped', async () => {
    const m = await memory();
    await db.runAsync('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      m.LAST_EMPTY_KEY,
      m.serializeRemembered({ items: [{ id: ids[1], sets: 1 }, { id: 'deleted-long-ago', sets: 3 }, { id: ids[0], sets: 2 }], at: 1 }),
    ]);
    const aw = await store();
    await aw.getState().startEmptyRemembered();
    expect(aw.getState().exercises.map((e) => e.exerciseId)).toEqual([ids[1], ids[0]]);
  });

  it('"Start blank" removes the pre-added cards with no ticked set; an exercise the member added stays', async () => {
    await finishFirst();
    const aw = await store();
    await aw.getState().startEmptyRemembered();
    await aw.getState().addExercise(await exercise(ids[3]));
    aw.getState().clearEmptyPrefill();
    const s = aw.getState();
    expect(s.exercises.map((e) => e.exerciseId)).toEqual([ids[3]]);
    expect(s.emptyPrefill).toBeNull();
    const m = await memory();
    expect(m.showPrefillLine(s)).toBe(false);
    // Still an empty workout: its Finish is remembered.
    const card = s.exercises[0];
    aw.getState().updateSet(card.key, card.sets[0].key, { weightKg: 40, reps: 10 });
    aw.getState().toggleDone(card.key, card.sets[0].key);
    expect(await aw.getState().finish(null)).toBeTruthy();
    expect(m.parseRemembered(metaValue(m.LAST_EMPTY_KEY))?.items.map((i) => i.id)).toEqual([ids[3]]);
  });

  it('the cloud copy carries it as p:empty by exercise ref and brings it back; an older app refuses it', async () => {
    await finishFirst();
    const { readLocalItems, applyExclusive } = await import('@/cloud/copyLocal');
    const pack = await import('@/cloud/pack');
    const m = await memory();
    const item = (await readLocalItems()).find((i) => i.kind === 'p' && i.id === pack.EMPTY_WORKOUT_ID);
    expect(item).toBeTruthy();
    const refs = pack.unpackEmptyWorkout(item!.data)!;
    expect(refs.map((r) => r.sets)).toEqual([2, 1]);
    expect(refs.every((r) => r.ref.startsWith('c:'))).toBe(true);
    // An older app reads every 'p' item as rest lengths: this one must not parse.
    expect(pack.unpackPrefs(item!.data)).toBeNull();

    await db.runAsync('DELETE FROM meta WHERE key = ?', [m.LAST_EMPTY_KEY]);
    await applyExclusive({
      apply: [{ kind: 'p', id: pack.EMPTY_WORKOUT_ID, data: item!.data, editedAt: 5 }],
      remove: [],
      remember: [],
      serverDeletes: [],
      keptLocal: 0,
    });
    expect(m.parseRemembered(metaValue(m.LAST_EMPTY_KEY))?.items).toEqual([
      { id: ids[0], sets: 2 },
      { id: ids[1], sets: 1 },
    ]);
  });
});

// R-444 (fresh-eyes review): bringing back a list whose exercises this phone does not (all) have must
// never delete or shorten the member's cloud copy.
describe('R-444 the cloud copy of the empty-workout list survives a bring-back', () => {
  async function cloud() {
    return {
      local: await import('@/cloud/copyLocal'),
      pack: await import('@/cloud/pack'),
      plan: await import('@/cloud/copyPlan'),
      m: await memory(),
    };
  }
  const opsFor = <T extends { kind: string; id: string }>(ops: readonly T[], id: string): T[] => ops.filter((o) => o.kind === 'p' && o.id === id);

  it('NOTHING matched: left out (skipped, not remembered), and the next scan does not delete the copy', async () => {
    const { local, pack, plan, m } = await cloud();
    const data = pack.packEmptyWorkout([
      { ref: 'x:on-another-phone-1', sets: 2 },
      { ref: 'c:no_such_catalog_key', sets: 3 },
    ]);
    const res = await local.applyExclusive({
      apply: [{ kind: 'p', id: pack.EMPTY_WORKOUT_ID, data, editedAt: 5 }],
      remove: [],
      remember: [{ kind: 'p', id: pack.EMPTY_WORKOUT_ID, hash: pack.packHash(data), editedAt: 5 }],
      serverDeletes: [],
      keptLocal: 0,
    });
    expect(res.skipped).toContain(`p:${pack.EMPTY_WORKOUT_ID}`);
    expect(res.other).toBe(0);
    expect(metaValue(m.LAST_EMPTY_KEY)).toBeNull();
    const state = await local.readState();
    expect(state.find((s) => s.kind === 'p' && s.id === pack.EMPTY_WORKOUT_ID)).toBeUndefined();
    const scan = plan.planScan(await local.readLocalItems(), state, 10_000);
    expect(opsFor(scan.ops, pack.EMPTY_WORKOUT_ID)).toEqual([]);
  });

  it('SOME matched: the phone keeps the ones it has, and the next scan sends nothing (the copy keeps the full list)', async () => {
    await finishFirst();
    const { local, pack, plan, m } = await cloud();
    const mine = (await local.readLocalItems()).find((i) => i.kind === 'p' && i.id === pack.EMPTY_WORKOUT_ID)!;
    const refs = pack.unpackEmptyWorkout(mine.data)!;
    // The server's (newer) list: this phone's two exercises with one it never had in between.
    const full = pack.packEmptyWorkout([refs[0], { ref: 'x:made-on-another-phone', sets: 4 }, refs[1]]);
    await db.runAsync('DELETE FROM meta WHERE key = ?', [m.LAST_EMPTY_KEY]);
    const res = await local.applyExclusive({
      apply: [{ kind: 'p', id: pack.EMPTY_WORKOUT_ID, data: full, editedAt: 7 }],
      remove: [],
      remember: [{ kind: 'p', id: pack.EMPTY_WORKOUT_ID, hash: pack.packHash(full), editedAt: 7 }],
      serverDeletes: [],
      keptLocal: 0,
    });
    expect(res.skipped).toEqual([]);
    expect(m.parseRemembered(metaValue(m.LAST_EMPTY_KEY))?.items).toEqual([
      { id: ids[0], sets: 2 },
      { id: ids[1], sets: 1 },
    ]);
    const items = await local.readLocalItems();
    const state = await local.readState();
    const row = state.find((s) => s.kind === 'p' && s.id === pack.EMPTY_WORKOUT_ID)!;
    expect(row.hash).toBe(items.find((i) => i.kind === 'p' && i.id === pack.EMPTY_WORKOUT_ID)!.hash);
    expect(row.hash).not.toBe(pack.packHash(full));
    expect(opsFor(plan.planScan(items, state, 10_000).ops, pack.EMPTY_WORKOUT_ID)).toEqual([]);
  });

  it('regression: a later finished empty workout still replaces the whole list in the copy (product rule)', async () => {
    await finishFirst();
    const { local, pack, plan } = await cloud();
    // As if the earlier list was already copied.
    const before = await local.readLocalItems();
    const p = before.find((i) => i.kind === 'p' && i.id === pack.EMPTY_WORKOUT_ID)!;
    const state = [{ kind: 'p' as const, id: pack.EMPTY_WORKOUT_ID, hash: p.hash, editedAt: 1 }];
    const aw = await store();
    aw.getState().startEmpty();
    await addAndTick(ids[3], 1);
    expect(await aw.getState().finish(null)).toBeTruthy();
    const sent = opsFor(plan.planScan(await local.readLocalItems(), state, 10_000).ops, pack.EMPTY_WORKOUT_ID);
    expect(sent).toHaveLength(1);
    expect(pack.unpackEmptyWorkout(sent[0].data!)!.map((r) => r.sets)).toEqual([1]);
  });
});

/**
 * R-136 (owner, 26 Oct 2026; built 28 Oct): body-weight moves count everywhere. Under "Previous
 * values: Same routine", a body-weight move (reps only, body weight + added weight, assisted, or a
 * library move done with body weight) reads EVERY workout for PREVIOUS and the Target — another
 * routine's, an empty workout's. Weighted lifts keep the routine's own. The switch "Always use all
 * workouts for body-weight moves" (on by default) turns it off.
 *
 * The rule is pure (`scopeFor`); the second half runs it against REAL SQL (test/helpers/realDb.ts):
 * one folder with Push 1 / Push 2 (Barbell Bench Press + Pull Up), Push 2 done 14 days ago, Push 1
 * 7 days ago, an EMPTY workout with pull-ups 3 days ago; he starts Push 2.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isBodyWeightMove, readByScope, scopeFor, type HistoryScope } from '@/tracker/db/historyScope';
import { bootRealApp, type RealDb } from '../helpers/realDb';

const SCOPE: HistoryScope = { routineIds: ['r1'], names: ['push 2'], kind: 'routine' };

describe('R-136: scopeFor — the one rule', () => {
  it('body-weight moves: reps only, body weight + added weight, assisted, or a library body-weight move', () => {
    expect(isBodyWeightMove({ logType: 'reps' })).toBe(true);
    expect(isBodyWeightMove({ logType: 'weighted' })).toBe(true);
    expect(isBodyWeightMove({ logType: 'assisted' })).toBe(true);
    expect(isBodyWeightMove({ logType: 'weight_reps', equipment: 'bodyweight' })).toBe(true);
    expect(isBodyWeightMove({ logType: 'weight_reps', equipment: 'barbell' })).toBe(false);
    expect(isBodyWeightMove({ logType: 'time', equipment: 'machine' })).toBe(false);
    expect(isBodyWeightMove(null)).toBe(false);
  });

  it('a body-weight move reads every workout; a weighted lift keeps the scope', () => {
    expect(scopeFor(SCOPE, { logType: 'reps' }, true)).toBeNull();
    expect(scopeFor(SCOPE, { logType: 'weight_reps', equipment: 'bodyweight' }, true)).toBeNull();
    expect(scopeFor(SCOPE, { logType: 'weight_reps', equipment: 'barbell' }, true)).toBe(SCOPE);
    // Unknown exercise (its read failed): treated as weighted, the scope stays.
    expect(scopeFor(SCOPE, null, true)).toBe(SCOPE);
  });

  it('the switch off: body-weight moves follow the scope too', () => {
    expect(scopeFor(SCOPE, { logType: 'reps' }, false)).toBe(SCOPE);
  });

  it('"Any workout" (no scope) stays every workout for all', () => {
    expect(scopeFor(null, { logType: 'weight_reps' }, true)).toBeNull();
    expect(scopeFor(null, { logType: 'reps' }, false)).toBeNull();
  });

  it('readByScope: one read per scope, answers merged', async () => {
    const calls: { ids: string[]; scope: HistoryScope | null }[] = [];
    const out = await readByScope(['a', 'b', 'c'], (id) => (id === 'b' ? null : SCOPE), async (ids, scope) => {
      calls.push({ ids, scope });
      return new Map(ids.map((id) => [id, `${id}:${scope ? 'scoped' : 'all'}`]));
    });
    expect(calls).toHaveLength(2);
    expect(out.get('a')).toBe('a:scoped');
    expect(out.get('b')).toBe('b:all');
    expect(out.get('c')).toBe('c:scoped');
  });
});

vi.setConfig({ testTimeout: 30_000 });

let db: RealDb;
let bench: string;
let pull: string;
let P1: string;
let P2: string;
let clock: number;

function daysAgo(n: number, today: string): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One workout `ago` days back from `routineId` ('' = an empty workout): each lift with its sets. */
async function log(routineId: string, title: string | null, ago: number, lifts: { id: string; weightKg: number; reps: number[] }[]): Promise<void> {
  const { createSession } = await import('@/db/repos/workoutRepo');
  const { addSetsWithMeta } = await import('@/tracker/db/trackerSets');
  const { getDb } = await import('@/db');
  const { todayISO } = await import('@/lib/date');
  clock += 60_000;
  const s = await createSession({ dateISO: daysAgo(ago, todayISO()), dayType: 'push', source: 'manual', startedAt: clock });
  await addSetsWithMeta(
    s.id,
    lifts.flatMap((l) => l.reps.map((r) => ({ exerciseId: l.id, weightKg: l.weightKg, reps: r, isWarmup: false }))),
  );
  await getDb().runAsync('UPDATE workout_sessions SET routine_id = ?, title = ? WHERE id = ?', [routineId, title, s.id]);
}

describe('R-136 on real SQL: Same routine, starting Push 2', () => {
  beforeEach(async () => {
    db = await bootRealApp();
    const { loadDemoData } = await import('@/onboarding/db/dataActions');
    await loadDemoData();
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.persist.setOptions({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    useTrackerPrefs.getState().setPreviousFrom('routine');
    useTrackerPrefs.getState().setBodyWeightAnyWorkout(true);
    const { setDisplayUnits } = await import('@/lib/units');
    setDisplayUnits('metric');
    const one = (name: string): string => db.all<{ id: string }>('SELECT id FROM exercises WHERE name = ?', [name])[0].id;
    bench = one('Barbell Bench Press');
    pull = one('Pull Up');
    const { createFolderWithRoutines } = await import('@/tracker/db/folderRepo');
    const rows = [
      { exerciseId: bench, sets: 3, repMin: 6, repMax: 10 },
      { exerciseId: pull, sets: 3, repMin: 6, repMax: 12 },
    ];
    const folder = await createFolderWithRoutines('Gym', [
      { name: 'Push 1', dayType: 'push', exercises: rows },
      { name: 'Push 2', dayType: 'push', exercises: rows },
    ]);
    const idOf = (name: string): string => db.all<{ id: string }>('SELECT id FROM plan_days WHERE plan_id = ? AND name = ?', [folder, name])[0].id;
    P1 = idOf('Push 1');
    P2 = idOf('Push 2');
    clock = Number(db.all<{ t: number | null }>('SELECT MAX(started_at) AS t FROM workout_sessions')[0].t ?? Date.now() - 86_400_000);
    await log(P2, 'Push 2', 14, [
      { id: bench, weightKg: 60, reps: [8, 8, 7] },
      { id: pull, weightKg: 0, reps: [6, 6, 5] },
    ]);
    await log(P1, 'Push 1', 7, [
      { id: bench, weightKg: 70, reps: [6, 6, 6] },
      { id: pull, weightKg: 0, reps: [8, 7, 7] },
    ]);
    // An empty workout (no routine) with only pull-ups: the newest.
    await log('', null, 3, [{ id: pull, weightKg: 0, reps: [10, 9, 9] }]);
  });

  async function start() {
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const { useTargets } = await import('@/tracker/store/targetStore');
    await useActiveWorkout.getState().startFromPlanDay(P2);
    const cards = useActiveWorkout.getState().exercises;
    const card = (id: string) => cards.find((c) => c.exerciseId === id)!;
    const target = (id: string) => useTargets.getState().targets.get(card(id).key) as import('@/tracker/services/coachTargets').KgTarget | undefined;
    return { card, target, discard: () => useActiveWorkout.getState().discard() };
  }

  it('pull-ups read the empty workout (newest anywhere); bench keeps Push 2’s own last time', async () => {
    const { card, target, discard } = await start();
    expect(card(pull).previousSets.map((p) => p.reps)).toEqual([10, 9, 9]);
    expect(card(pull).elsewhere).toBeUndefined();
    expect(target(pull)?.last?.dateISO).toBe(card(pull).lastFrom?.dateISO);
    expect(card(bench).previousSets.map((p) => p.reps)).toEqual([8, 8, 7]);
    expect(card(bench).previousSets.map((p) => p.weightKg)).toEqual([60, 60, 60]);
    expect(target(bench)?.last?.dateISO).toBe(card(bench).lastFrom?.dateISO);
    await discard();
  });

  it('switch off: pull-ups follow "Same routine" too (Push 2’s own 6, 6, 5)', async () => {
    const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
    useTrackerPrefs.getState().setBodyWeightAnyWorkout(false);
    const { card, target, discard } = await start();
    expect(card(pull).previousSets.map((p) => p.reps)).toEqual([6, 6, 5]);
    expect(target(pull)?.last?.dateISO).toBe(card(pull).lastFrom?.dateISO);
    await discard();
  });
});

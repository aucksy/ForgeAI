import { describe, expect, it } from 'vitest';

import { fromGymLine, gymPlanFromRow, gymPlansFromRow } from '@/shop/gymPlans';
import { gymPlanKey, gymSyncSteps, leftGymSteps } from '@/tracker/lib/gymPlanSteps';
import { MAX_ROUTINE_SETS } from '@/tracker/plans/routineSets';

const ex = { name: 'Bench Press', catalogKey: 'bench_press', logType: 'weight_reps', sets: 3, repMin: 6, repMax: 10, primary: ['chest'] };
const row = (over: Record<string, unknown> = {}) => ({ id: 'wp-1', version: 7, name: 'Asha strength', note: 'Knee: no deep squats', byName: 'Ravi', routines: [{ name: 'Push', dayType: 'push', exercises: [ex] }], ...over });

describe('gym workout plans (OWNER-INBOX #6): reading the answer', () => {
  it('reads a plan through the routine-file reader', () => {
    const p = gymPlanFromRow(row())!;
    expect(p).toMatchObject({ id: 'wp-1', version: 7, name: 'Asha strength', note: 'Knee: no deep squats', byName: 'Ravi' });
    expect(p.file.folder).toBe('Asha strength');
    expect(p.file.routines[0].exercises[0]).toMatchObject({ name: 'Bench Press', catalogKey: 'bench_press', sets: 3, repMin: 6, repMax: 10 });
  });
  it("OWNER-INBOX #19: the trainer's start weights and each exercise's own kind arrive", () => {
    const start = Array.from({ length: 3 }, () => ({ type: 'normal', reps: 8, weightKg: 20 }));
    const pull = { name: 'Pull-Up', catalogKey: 'pull_up', logType: 'reps', sets: 3, repMin: 6, repMax: 10, primary: ['lats'] };
    const p = gymPlanFromRow(row({ routines: [{ name: 'Push', dayType: 'push', exercises: [{ ...ex, setList: start }, pull] }] }))!;
    const [bench, pu] = p.file.routines[0].exercises;
    expect(bench.sets).toBe(3);
    expect(bench.setList?.map((s) => [s.weightKg, s.reps])).toEqual([[20, 8], [20, 8], [20, 8]]);
    expect(pu).toMatchObject({ logType: 'reps', sets: 3 });
    expect(pu.setList).toBeUndefined();
  });
  it('cleans numbers the way a shared file is cleaned', () => {
    const p = gymPlanFromRow(row({ routines: [{ name: 'Push', dayType: 'push', exercises: [{ ...ex, sets: 999, repMin: -4 }] }] }))!;
    const e = p.file.routines[0].exercises[0];
    expect(e.sets).toBe(MAX_ROUTINE_SETS);
    expect(e.repMin).toBeGreaterThanOrEqual(1);
  });
  it('skips what it cannot read, never breaks the list', () => {
    expect(gymPlanFromRow(row({ id: '' }))).toBeNull();
    expect(gymPlanFromRow(row({ routines: [] }))).toBeNull();
    expect(gymPlanFromRow(row({ version: 'x' }))).toBeNull();
    const a = gymPlansFromRow({ ok: true, gymId: 'g1', gymName: 'G', plans: [row(), row({ id: '' }), 'junk'] });
    expect(a).toMatchObject({ ok: true, gymId: 'g1' });
    if (a?.ok) expect(a.plans.map((p) => p.id)).toEqual(['wp-1']);
  });
  it('reads the "see the desk" answers, and refuses others', () => {
    for (const problem of ['NO_PHONE', 'NOT_ON_ROSTER', 'GYM_NOT_ONLINE', 'NAME_MISMATCH', 'SHARED_NUMBER']) {
      expect(gymPlansFromRow({ error: problem, gymName: 'G' })).toEqual({ ok: false, problem, gymName: 'G' });
    }
    expect(gymPlansFromRow({ ok: true, plans: [] })).toBeNull();
    expect(gymPlansFromRow(null)).toBeNull();
  });
  it('the line under the folder', () => {
    expect(fromGymLine({ gymName: "RAM'S FITNESS", byName: 'Ravi' })).toBe("From RAM'S FITNESS · Ravi");
    expect(fromGymLine({ gymName: 'G', byName: null })).toBe('From G');
    expect(fromGymLine({ gymName: 'G', byName: 'Ravi', gone: true })).toBe('No longer sent by G');
  });
});

describe('gym workout plans: what to save', () => {
  const plan = gymPlanFromRow(row())!;
  const folder = (planId: string, version: number, extra: Record<string, unknown> = {}, gymId = 'g1') => ({
    id: `f-${planId}`, name: 'Mine', settings: { fromGym: { gymId, planId, version, gymName: 'G', byName: null, ...extra } },
  });
  it('a new plan: a new folder', () => {
    expect(gymSyncSteps('g1', [plan], [])).toEqual([{ kind: 'save', plan, before: null }]);
  });
  it('unchanged: nothing; a new version: update its folder', () => {
    expect(gymSyncSteps('g1', [plan], [folder('wp-1', 7)])).toEqual([]);
    const f = folder('wp-1', 6);
    expect(gymSyncSteps('g1', [plan], [f])).toEqual([{ kind: 'save', plan, before: f }]);
  });
  it('no longer sent: relabel once, never delete; sent again: back', () => {
    const f = folder('wp-old', 3);
    expect(gymSyncSteps('g1', [], [f])).toEqual([{ kind: 'gone', folder: f, from: f.settings.fromGym }]);
    expect(gymSyncSteps('g1', [], [folder('wp-old', 3, { gone: true })])).toEqual([]);
    expect(gymSyncSteps('g1', [plan], [folder('wp-1', 7, { gone: true })])[0]).toMatchObject({ kind: 'save' });
  });
  it("release review: another gym's folders are relabelled (no more updates); the member's own never touched", () => {
    const other = folder('wp-1', 1, {}, 'g2');
    const own = { id: 'f-own', name: 'Mine', settings: {} };
    expect(gymSyncSteps('g1', [], [other, own]).map((s) => [s.kind, s.kind === 'gone' ? s.folder.id : ''])).toEqual([['gone', other.id]]);
    expect(leftGymSteps([other, own], null).map((s) => s.kind)).toEqual(['gone']);
    const relabelled = folder('wp-1', 1, { gone: true }, 'g2');
    expect(gymSyncSteps('g1', [], [relabelled, own])).toEqual([]);
  });
  it('release review: a plan whose folder the member deleted never comes back', () => {
    const plan = gymPlanFromRow(row())!;
    expect(gymSyncSteps('g1', [plan], [], new Set([gymPlanKey('g1', 'wp-1')]))).toEqual([]);
    expect(gymSyncSteps('g1', [plan], [], new Set([gymPlanKey('g2', 'wp-1')])).map((s) => s.kind)).toEqual(['save']);
  });
});

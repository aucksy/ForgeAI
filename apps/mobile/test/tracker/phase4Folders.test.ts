/**
 * Phase 4 — routine folders on the database (v0.26.0). The cloud test runner has Node 20,
 * which has no built-in SQLite, so a small stand-in answers exactly the statements the folder
 * code sends, with SQLite's rules where they matter here (rowid order, MAX of nothing = NULL).
 * Also: an easy week's workouts never reach the Target's history or the records.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  interface Plan { rowid: number; id: string; name: string; is_active: number; folder_order: number | null; source: string | null; settings: string | null }
  interface Day { rowid: number; id: string; plan_id: string; day_type: string; day_order: number; name: string }
  interface Pe { id: string; plan_day_id: string; exercise_id: string; ex_order: number; target_sets: number; rep_range_min: number; rep_range_max: number }
  const s = { plans: [] as Plan[], days: [] as Day[], pes: [] as Pe[], sql: [] as string[], tx: 0 };
  let rowid = 0;
  const one = (q: string) => q.replace(/\s+/g, ' ').trim();
  const ex = (id: string) => ({ id, name: `Ex ${id}`, aliases: '[]', muscle_group: 'chest', secondary_muscles: '[]', equipment: 'barbell', is_compound: 1, increment_kg: 2.5 });
  const api = {
    async runAsync(sql: string, args: unknown[] = []) {
      const q = one(sql);
      s.sql.push(q);
      let m: RegExpMatchArray | null;
      if (q.startsWith('INSERT INTO workout_plans(id, name, is_active, folder_order, source, settings) VALUES(?, ?, 0, ?, ?, ?)')) {
        const [id, name, order, source, settings] = args as [string, string, number, string | null, string];
        s.plans.push({ rowid: ++rowid, id, name, is_active: 0, folder_order: order, source, settings });
      } else if (q.startsWith('INSERT INTO workout_plans(id, name, is_active, folder_order, source, settings)')) {
        const [id, name, active, order, source, settings] = args as [string, string, number, number, string | null, string];
        s.plans.push({ rowid: ++rowid, id, name, is_active: active, folder_order: order, source, settings });
      } else if (q.startsWith('INSERT INTO plan_days')) {
        const [id, plan_id, day_type, day_order, name] = args as [string, string, string, number, string];
        s.days.push({ rowid: ++rowid, id, plan_id, day_type, day_order, name });
      } else if (q.startsWith('INSERT INTO plan_exercises')) {
        const [id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max] = args as [string, string, string, number, number, number, number];
        s.pes.push({ id, plan_day_id, exercise_id, ex_order, target_sets, rep_range_min, rep_range_max });
      } else if (q === 'UPDATE workout_plans SET is_active = 0') {
        for (const p of s.plans) p.is_active = 0;
      } else if (q.startsWith('UPDATE workout_plans SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END')) {
        for (const p of s.plans) p.is_active = p.id === args[0] ? 1 : 0;
      } else if ((m = q.match(/^UPDATE workout_plans SET (settings|name) = \? WHERE id = \?$/))) {
        const p = s.plans.find((x) => x.id === args[1]);
        if (p) (p as unknown as Record<string, unknown>)[m[1]] = args[0];
      } else if (q === 'DELETE FROM plan_days WHERE plan_id = ?') {
        const gone = new Set(s.days.filter((d) => d.plan_id === args[0]).map((d) => d.id));
        s.days = s.days.filter((d) => !gone.has(d.id));
        s.pes = s.pes.filter((p) => !gone.has(p.plan_day_id)); // ON DELETE CASCADE
      } else if (q === 'DELETE FROM workout_plans WHERE id = ?') {
        s.plans = s.plans.filter((p) => p.id !== args[0]);
      } else if (q === 'UPDATE plan_days SET plan_id = ?, day_order = ? WHERE id = ?') {
        const d = s.days.find((x) => x.id === args[2]);
        if (d) Object.assign(d, { plan_id: args[0], day_order: args[1] });
      } else {
        throw new Error(`unexpected write: ${q}`);
      }
    },
    async getFirstAsync(sql: string, args: unknown[] = []) {
      const q = one(sql);
      s.sql.push(q);
      if (q === 'SELECT MAX(folder_order) AS m FROM workout_plans') {
        const v = s.plans.map((p) => p.folder_order).filter((n): n is number => n != null);
        return { m: v.length ? Math.max(...v) : null };
      }
      if (q === 'SELECT MAX(day_order) AS m FROM plan_days WHERE plan_id = ?') {
        const v = s.days.filter((d) => d.plan_id === args[0]).map((d) => d.day_order);
        return { m: v.length ? Math.max(...v) : null };
      }
      if (q === 'SELECT settings FROM workout_plans WHERE id = ?') return s.plans.find((p) => p.id === args[0]) ?? null;
      if (q.startsWith('SELECT id, plan_id, day_type, day_order, name FROM plan_days WHERE id = ?')) return s.days.find((d) => d.id === args[0]) ?? null;
      if (q.includes('FROM plan_days pd JOIN workout_plans wp')) {
        const d = s.days.find((x) => x.id === args[0]);
        return d ? s.plans.find((p) => p.id === d.plan_id) ?? null : null;
      }
      if (q.includes('FROM workout_plans WHERE is_active = 1 LIMIT 1')) return s.plans.find((p) => p.is_active === 1) ?? null;
      throw new Error(`unexpected read: ${q}`);
    },
    async getAllAsync(sql: string, args: unknown[] = []) {
      const q = one(sql);
      s.sql.push(q);
      if (q.startsWith('SELECT id, name, is_active, folder_order, source, settings FROM workout_plans ORDER BY')) {
        return [...s.plans].sort((a, b) => b.is_active - a.is_active || (a.folder_order ?? 1e6) - (b.folder_order ?? 1e6) || a.rowid - b.rowid);
      }
      if (q.startsWith('SELECT id, plan_id, day_type, day_order, name FROM plan_days ORDER BY')) {
        return [...s.days].sort((a, b) => a.day_order - b.day_order || a.rowid - b.rowid);
      }
      if (q.includes('FROM plan_exercises WHERE plan_day_id IN')) {
        return s.pes.filter((p) => args.includes(p.plan_day_id)).sort((a, b) => a.ex_order - b.ex_order);
      }
      if (q.includes('FROM exercises WHERE id IN')) return (args as string[]).map(ex);
      if (q.includes('FROM set_entries se')) return []; // the easy-week SQL checks below read the text only
      throw new Error(`unexpected read: ${q}`);
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      s.tx += 1;
      await fn();
    },
  };
  const reset = () => {
    s.plans = [];
    s.days = [];
    s.pes = [];
    s.sql = [];
    s.tx = 0;
    rowid = 0;
    // The member's own routines from before Phase 4: one followed plan, no Phase 4 columns.
    s.plans.push({ rowid: ++rowid, id: 'mine', name: 'My Routines', is_active: 1, folder_order: null, source: null, settings: null });
    s.days.push({ rowid: ++rowid, id: 'd-push', plan_id: 'mine', day_type: 'push', day_order: 0, name: 'Push' });
    s.days.push({ rowid: ++rowid, id: 'd-legs', plan_id: 'mine', day_type: 'legs', day_order: 1, name: 'Legs' });
    s.pes.push({ id: 'pe1', plan_day_id: 'd-push', exercise_id: 'x1', ex_order: 0, target_sets: 3, rep_range_min: 8, rep_range_max: 12 });
  };
  return { s, api, reset };
});

vi.mock('@/db', () => ({ getDb: () => db.api }));
// expo-crypto is device-only; any unique id will do here.
vi.mock('@/lib/uuid', () => {
  let n = 0;
  return { uuid: () => `id${++n}` };
});

const repo = await import('@/tracker/db/folderRepo');

describe('routine folders', () => {
  beforeEach(() => db.reset());

  it("the member's routines from before Phase 4 are one followed folder", async () => {
    const [f] = await repo.listFolders();
    expect(f).toMatchObject({ id: 'mine', name: 'My Routines', following: true, source: null, settings: {} });
    expect(f.routines.map((r) => r.name)).toEqual(['Push', 'Legs']);
    expect(f.routines[0].exercises.map((e) => e.exerciseId)).toEqual(['x1']);
  });

  it('a followed program becomes the plan; the old folder stays, not followed', async () => {
    const id = await repo.createFolderWithRoutines(
      'Push Pull Legs',
      [
        { name: 'Push', dayType: 'push', exercises: [{ exerciseId: 'a', sets: 20, repMin: 0, repMax: 99 }, { exerciseId: 'b', sets: 3, repMin: 12, repMax: 8 }] },
        { name: '  ', dayType: 'pull', exercises: [] },
      ],
      { source: 'program', settings: { program: 'gym_ppl_intermediate', easy: { every: 6, base: 0 } }, follow: true, todayISO: '2026-10-07' },
    );
    expect(db.s.tx).toBe(1); // one transaction: a crash leaves no half folder
    const list = await repo.listFolders();
    expect(list.map((f) => [f.name, f.following])).toEqual([
      ['Push Pull Legs', true],
      ['My Routines', false],
    ]);
    const f = list[0];
    expect(f.id).toBe(id);
    expect(f.source).toBe('program');
    expect(f.settings).toEqual({ program: 'gym_ppl_intermediate', easy: { every: 6, base: 0 }, startISO: '2026-10-07' });
    expect(f.routines.map((r) => r.name)).toEqual(['Push', 'Routine']);
    // Odd numbers are brought into range, max never under min. RP-23: no 12-set / 50-rep caps
    // (20 sets and 99 reps stay; only 1–50 sets and 1–999 reps are the bounds).
    expect(f.routines[0].exercises.map((e) => [e.targetSets, e.repRangeMin, e.repRangeMax])).toEqual([
      [20, 1, 99],
      [3, 12, 12],
    ]);
  });

  it('a folder that is not followed adds no plan weeks and changes nothing else', async () => {
    await repo.createFolderWithRoutines('Shared', [{ name: 'Arms', dayType: 'upper', exercises: [] }], { source: 'import', settings: {} });
    const list = await repo.listFolders();
    expect(list.map((f) => [f.name, f.following])).toEqual([
      ['My Routines', true],
      ['Shared', false],
    ]);
    expect(list[1].settings.startISO).toBeUndefined();
  });

  it('following a folder starts its weeks today and its easy-week count again', async () => {
    const id = await repo.createFolder('Old plan', { settings: { startISO: '2026-01-01', easy: { every: 6, base: 9 } } });
    await repo.followFolder(id, '2026-10-07');
    const list = await repo.listFolders();
    expect(list.filter((f) => f.following).map((f) => f.id)).toEqual([id]);
    expect(list[0].settings).toEqual({ startISO: '2026-10-07', easy: { every: 6, base: 0 } });
    expect((await repo.followedFolder())?.id).toBe(id);
    await repo.followFolder('no-such-folder', '2026-10-07'); // nothing breaks, nothing changes
    expect((await repo.followedFolder())?.id).toBe(id);
  });

  it('a routine in any folder opens, and knows its folder', async () => {
    const id = await repo.createFolderWithRoutines('Other', [{ name: 'Arms', dayType: 'upper', exercises: [{ exerciseId: 'c', sets: 3, repMin: 10, repMax: 15 }] }], {});
    const arms = (await repo.listFolders()).find((f) => f.id === id)!.routines[0];
    const r = await repo.getRoutineAnywhere(arms.id);
    expect(r?.name).toBe('Arms');
    expect(r?.exercises.map((e) => e.exerciseId)).toEqual(['c']);
    expect((await repo.folderOfRoutine(arms.id))?.name).toBe('Other');
    expect(await repo.getRoutineAnywhere('nope')).toBeNull();
  });

  it('moving a routine puts it at the end of the other folder', async () => {
    const other = await repo.createFolderWithRoutines('Other', [{ name: 'Arms', dayType: 'upper', exercises: [] }], {});
    await repo.moveRoutine('d-push', other);
    const list = await repo.listFolders();
    expect(list.find((f) => f.id === other)!.routines.map((r) => r.name)).toEqual(['Arms', 'Push']);
    expect(list.find((f) => f.id === 'mine')!.routines.map((r) => r.name)).toEqual(['Legs']);
    // Into an empty folder: first place.
    const empty = await repo.createFolder('Empty');
    await repo.moveRoutine('d-legs', empty);
    expect((await repo.listFolders()).find((f) => f.id === empty)!.routines[0]).toMatchObject({ name: 'Legs', order: 0 });
  });

  it('deleting a folder takes its routines, in one transaction; the others stay', async () => {
    const other = await repo.createFolderWithRoutines('Other', [{ name: 'Arms', dayType: 'upper', exercises: [{ exerciseId: 'c', sets: 3, repMin: 10, repMax: 15 }] }], {});
    await repo.deleteFolder(other);
    expect(db.s.tx).toBe(2);
    const list = await repo.listFolders();
    expect(list.map((f) => f.id)).toEqual(['mine']);
    expect(db.s.pes.map((p) => p.exercise_id)).toEqual(['x1']);
  });

  it('new folders go to the end; names are trimmed', async () => {
    const a = await repo.createFolder('  Summer  ');
    const b = await repo.createFolder('   ');
    await repo.renameFolder(a, '  Winter ');
    const list = await repo.listFolders();
    expect(list.map((f) => f.name)).toEqual(['My Routines', 'Winter', 'Folder']);
    expect(list.map((f) => f.id)).toEqual(['mine', a, b]);
  });
});

describe("an easy week's workouts stay out of the Target and the records", () => {
  beforeEach(() => db.reset());

  it('the Target reads only normal workouts', async () => {
    const { getProgressionHistory } = await import('@/tracker/db/progressionHistory');
    await getProgressionHistory('x1', 4);
    const q = db.s.sql.find((x) => x.includes('FROM set_entries se'))!;
    expect(q).toContain('COALESCE(ws.easy_week, 0) = 0');
    expect(q).toContain('COALESCE(w2.easy_week, 0) = 0'); // the LIMIT counts normal workouts too
  });

  it('PREVIOUS can skip them; the history list still has them, marked', async () => {
    const { getBoundedExerciseHistory } = await import('@/tracker/db/exerciseHistory');
    await getBoundedExerciseHistory('x1', 1, { skipEasy: true });
    const skip = db.s.sql.filter((x) => x.includes('FROM set_entries se')).pop()!;
    expect(skip).toContain('COALESCE(ws.easy_week, 0) = 0');
    await getBoundedExerciseHistory('x1', 1);
    const all = db.s.sql.filter((x) => x.includes('FROM set_entries se')).pop()!;
    expect(all).not.toContain('COALESCE(ws.easy_week, 0) = 0');
    expect(all).toContain('ws.easy_week AS easy_week');
  });
});

/**
 * Phase 4 — saving a ready program or a built plan as a folder, swapping within a plan's
 * limits, and opening a routine file someone shared (v0.26.0). The database calls are
 * stand-ins; the rules that pick each exercise are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  folders: [] as { name: string; routines: unknown[]; opts: Record<string, unknown> }[],
  custom: [] as { name: string; logType: string; muscles: unknown }[],
  own: new Map<string, string>(),
  folder: null as null | { settings: Record<string, unknown> },
  experience: 'beginner' as string | null,
}));

vi.mock('@/tracker/db/folderRepo', async () => {
  const { catalogEntry } = await import('@/tracker/catalog/exerciseCatalog');
  return {
    // Every library key gets its library row; unknown keys are left out.
    exerciseIdsForKeys: async (keys: readonly string[]) => new Map(keys.filter((k) => catalogEntry(k)).map((k) => [k, `lib-${k}`])),
    exerciseIdsByName: async (names: readonly string[]) => new Map(names.flatMap((n) => (h.own.has(n) ? [[n, h.own.get(n)!] as const] : []))),
    createFolderWithRoutines: async (name: string, routines: unknown[], opts: Record<string, unknown> = {}) => {
      h.folders.push({ name, routines, opts });
      return `folder-${h.folders.length}`;
    },
    folderOfRoutine: async () => h.folder,
    followedFolder: async () => h.folder,
    // RP-18: nothing was added before in these tests (the real lookups are tested on SQLite).
    programFolder: async () => null,
    fileFolder: async () => null,
    refillFolder: async () => 'refilled',
  };
});
vi.mock('@/tracker/db/customExercise', () => ({
  createCustomExercise: async (input: { name: string; logType: string; muscles: unknown }) => {
    h.custom.push(input);
    return `own-new-${h.custom.length}`;
  },
}));
vi.mock('@/db/repos/userRepo', () => ({
  getProfile: async () => {
    if (!h.experience) throw new Error('no profile');
    return { experience: h.experience };
  },
}));
vi.mock('@/lib/date', async (orig) => ({ ...(await orig<typeof import('@/lib/date')>()), todayISO: () => '2026-10-07' }));

const { addProgram, importRoutineFile, saveBuiltPlan, swapContextFor } = await import('@/tracker/services/plansService');
const { catalogEntryByName } = await import('@/tracker/catalog/exerciseCatalog');
const { buildPlan } = await import('@/tracker/plans/builder');
const { DEFAULT_INPUT } = await import('@/tracker/store/planBuilderStore');
const { makeRoutineFile } = await import('@/tracker/plans/routineFile');

beforeEach(() => {
  h.folders = [];
  h.custom = [];
  h.own = new Map([['My Band Pull', 'own-1']]);
  h.folder = null;
  h.experience = 'beginner';
});

type Routine = { name: string; dayType: string; exercises: { exerciseId: string; sets: number; repMin: number; repMax: number }[] };

describe('ready programs and built plans become folders', () => {
  it('a program lands on library exercises, with its own easy-week setting', async () => {
    await addProgram('gym_full_body_beginner', { follow: true, easyWeeks: true });
    await addProgram('gym_full_body_beginner', { follow: false, easyWeeks: false });
    const [on, off] = h.folders;
    // RP-06: the plan remembers its days a week (3 for this program of 2 routines).
    expect(on.opts).toEqual({ source: 'program', settings: { program: 'gym_full_body_beginner', easy: { every: 6, base: 0 }, daysPerWeek: 3 }, follow: true, todayISO: '2026-10-07' });
    expect(off.opts).toMatchObject({ follow: false, settings: { easy: null } });
    for (const r of on.routines as Routine[]) {
      expect(r.exercises.length).toBeGreaterThan(0);
      for (const x of r.exercises) expect(x.exerciseId).toMatch(/^lib-/);
    }
  });

  it('a program this version does not have says so plainly', async () => {
    await expect(addProgram('from_the_future', { follow: true, easyWeeks: true })).rejects.toThrow('That program is not in this version of ForgeAI.');
  });

  it('a built plan keeps its answers, so it can be built again', async () => {
    const input = { ...DEFAULT_INPUT, equipment: 'none' as const, sore: ['knee' as const] };
    const plan = buildPlan(input);
    await saveBuiltPlan(plan, input, { follow: true, easyWeeks: false });
    const [f] = h.folders;
    expect(f.name).toBe(plan.name);
    expect(f.opts).toMatchObject({ source: 'builder', settings: { builder: input, easy: null, daysPerWeek: input.days }, follow: true });
    expect((f.routines as Routine[]).map((r) => r.exercises.length)).toEqual(plan.routines.map((r) => r.exercises.length));
  });
});

describe("a swap keeps to the plan's limits", () => {
  it("a built plan's equipment, sore areas and leave-out list, and the member's level", async () => {
    h.folder = { settings: { builder: { equipment: 'none', sore: ['knee', 'elbow-ish'], avoid: ['push_up', 7] } } };
    h.experience = 'advanced';
    expect(await swapContextFor('day-1')).toEqual({ level: 'advanced', equipment: 'none', sore: ['knee'], avoid: ['push_up'] });
  });

  it('a folder of your own, or no profile: a full gym, nothing left out, intermediate', async () => {
    h.folder = { settings: { builder: { equipment: 'spaceship' } } };
    h.experience = null;
    expect(await swapContextFor(null)).toEqual({ level: 'intermediate', equipment: 'gym', sore: [], avoid: [] });
  });
});

describe('opening a shared routine file', () => {
  const ex = (name: string, over: Record<string, unknown> = {}) => ({ name, catalogKey: null, logType: 'weight_reps', sets: 3, repMin: 8, repMax: 12, primary: [], ...over });

  it('each exercise lands on the same library exercise, the member\'s own, or a new one of theirs', async () => {
    const file = makeRoutineFile('From Sam', [
      {
        name: 'Upper',
        dayType: 'upper',
        exercises: [
          ex('Barbell Bench Press', { catalogKey: 'barbell_bench_press' }),
          ex('Bench Press (Barbell)'), // a library link name without the key (an older file)
          ex('My Band Pull', { primary: ['rear_delts'] }), // the member has one by this name
          ex('Secret Move', { logType: 'reps', primary: ['chest'] }), // only the sender had it
          ex('secret move ', { logType: 'reps', primary: ['chest'] }), // the same one again
          ex('Mystery', { primary: [] }), // nothing to make it from
        ] as never,
      },
    ]);
    const res = await importRoutineFile(file);
    expect(res).toEqual({ folderId: 'folder-1', added: ['Secret Move'], skipped: ['Mystery'] });
    expect(h.custom).toHaveLength(1);
    expect(h.custom[0]).toMatchObject({ name: 'Secret Move', logType: 'reps', muscles: { primary: ['chest'], secondary: [] } });
    const [f] = h.folders;
    expect(f.name).toBe('From Sam');
    // RP-18: the folder remembers which file it came from.
    expect(f.opts).toEqual({ source: 'import', settings: { fromFile: expect.stringMatching(/^[a-z0-9]+$/) } });
    const ids = (f.routines as Routine[])[0].exercises.map((x) => x.exerciseId);
    expect(ids).toEqual(['lib-barbell_bench_press', `lib-${catalogEntryByName('Bench Press (Barbell)')!.key}`, 'own-1', 'own-new-1', 'own-new-1']);
  });

  it('a single shared routine gets its own name as the folder', async () => {
    await importRoutineFile(makeRoutineFile(null, [{ name: 'Leg Day', dayType: 'legs', exercises: [] }]));
    await importRoutineFile(makeRoutineFile(null, [{ name: 'A', dayType: 'full', exercises: [] }, { name: 'B', dayType: 'full', exercises: [] }]));
    expect(h.folders.map((f) => f.name)).toEqual(['Leg Day', 'Shared routines']);
  });
});

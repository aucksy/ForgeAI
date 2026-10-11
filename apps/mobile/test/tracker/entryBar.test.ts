/**
 * The entry bar on the keyboard (live workout): the step maths, "Copy to sets below" and its
 * Undo — the pure rules (services/setEntry) and the store actions next to updateSet
 * (stepSetValue, copySetDown, undoCopy), including that the draft saves through the normal path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ writes: [] as { key: string; value: string }[] }));

vi.mock('@/db', () => ({
  getDb: () => ({
    runAsync: async () => undefined,
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
  getMeta: async () => null,
  setMeta: async (key: string, value: string) => {
    h.writes.push({ key, value });
  },
}));
vi.mock('@/tracker/db/exerciseHistory', () => ({ getBoundedExerciseHistory: async () => [] }));
vi.mock('@/tracker/db/exercisePrefs', () => ({
  getCarriedNote: async () => null,
  getExerciseRestSec: async () => null,
  getPriorBests: async () => null,
  setExerciseRestSec: async () => undefined,
}));
vi.mock('@/tracker/db/exerciseInfo', () => ({
  getTrackerExercise: async () => null,
  getTrackerExercisesByIds: async () => new Map(),
  setExerciseLoadMode: async () => undefined,
}));
vi.mock('@/components/ui/confirmStore', () => ({ askConfirm: async () => false }));
vi.mock('@/lib/uuid', () => {
  let n = 0;
  return { uuid: () => `u${++n}` };
});

const { useActiveWorkout, flushDraft } = await import('@/tracker/store/activeWorkoutStore');
const { useWorkoutUi } = await import('@/tracker/store/workoutUiStore');
const E = await import('@/tracker/services/setEntry');
const { KG_PER_LB, setDisplayUnits } = await import('@/lib/units');
const { kgToTyped } = await import('@/tracker/components/unitText');
const { hintTexts } = await import('@/tracker/components/setRowLayout');
type DraftExercise = import('@/tracker/store/activeWorkoutStore').DraftExercise;
type DraftSet = import('@/tracker/store/activeWorkoutStore').DraftSet;
type SetFill = import('@/tracker/store/activeWorkoutStore').SetFill;

let n = 0;
const row = (patch: Partial<DraftSet> = {}): DraftSet => ({
  key: `r${++n}`,
  weightKg: null,
  reps: null,
  isWarmup: false,
  done: false,
  ...patch,
});
const card = (patch: Partial<DraftExercise> = {}): DraftExercise => ({
  key: `c${++n}`,
  exerciseId: 'bench',
  name: 'Bench Press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  incrementKg: 2.5,
  previousSets: [],
  sets: [row()],
  ...patch,
});
const blank = { weightKg: null, reps: null };
const fill = (weightKg: number, reps: number, more: Partial<SetFill> = {}): SetFill => ({ weightKg, reps, ...more });
const metric = { logType: 'weight_reps' as const, incrementKg: 2.5, units: 'metric' as const };
const lb = { logType: 'weight_reps' as const, incrementKg: 2.5, units: 'imperial' as const };

// ------------------------------------------------------------------ the step
describe('the weight step in the member unit', () => {
  it('is the exercise step in kg, 2.5 kg when unknown or nonsense', () => {
    expect(E.weightStepShown(2.5, 'metric')).toBe(2.5);
    expect(E.weightStepShown(1.25, 'metric')).toBe(1.25);
    expect(E.weightStepShown(5, 'metric')).toBe(5);
    expect(E.weightStepShown(undefined, 'metric')).toBe(2.5);
    expect(E.weightStepShown(0, 'metric')).toBe(2.5);
    expect(E.weightStepShown(-1, 'metric')).toBe(2.5);
    expect(E.weightStepShown(Number.NaN, 'metric')).toBe(2.5);
  });

  it('under pounds: the same pound step as Targets and warm-ups (stepFor) — never 5.51', () => {
    expect(E.weightStepShown(2.5, 'imperial')).toBe(5);
    expect(E.weightStepShown(5, 'imperial')).toBe(10);
    expect(E.weightStepShown(1.25, 'imperial')).toBe(2.5);
    expect(E.weightStepShown(0.5, 'imperial')).toBe(1);
    expect(E.weightStepShown(null, 'imperial')).toBe(5);
    // Review fix: a step the member picked in pounds ("5 lb" = 2.268 kg, "10 lb", "1 lb") stays that step.
    expect(E.weightStepShown(5 * 0.45359237, 'imperial')).toBe(5);
    expect(E.weightStepShown(10 * 0.45359237, 'imperial')).toBe(10);
    expect(E.weightStepShown(1 * 0.45359237, 'imperial')).toBe(1);
  });

  it('under kg: to 0.01 at most (a step picked in pounds shows as 2.27, never 2.268)', () => {
    expect(E.weightStepShown(2.5, 'metric')).toBe(2.5);
    expect(E.weightStepShown(5 * 0.45359237, 'metric')).toBe(2.27);
    expect(E.weightStepShown(0.001, 'metric')).toBe(0.01);
  });

  it('labels the buttons in the unit, with a true minus', () => {
    expect(E.stepLabels('weight', 2.5, 'metric')).toEqual({ minus: '− 2.5', plus: '+ 2.5', amount: '2.5 kilograms' });
    expect(E.stepLabels('weight', 1.25, 'metric')).toEqual({ minus: '− 1.25', plus: '+ 1.25', amount: '1.25 kilograms' });
    expect(E.stepLabels('weight', 2.5, 'imperial')).toEqual({ minus: '− 5', plus: '+ 5', amount: '5 pounds' });
    expect(E.stepLabels('reps', 2.5, 'metric')).toEqual({ minus: '− 1', plus: '+ 1', amount: '1 rep' });
    expect(E.stepLabels('time', 2.5, 'metric')).toEqual({ minus: '− 15 s', plus: '+ 15 s', amount: '15 seconds' });
    expect(E.stepLabels('distance', 2.5, 'metric')).toBeNull();
  });
});

describe('stepOnGrid', () => {
  it('moves one step on the grid, and to the nearest grid point from off it', () => {
    expect(E.stepOnGrid(60, 2.5, 1)).toBe(62.5);
    expect(E.stepOnGrid(60, 2.5, -1)).toBe(57.5);
    expect(E.stepOnGrid(61, 2.5, 1)).toBe(62.5);
    expect(E.stepOnGrid(61, 2.5, -1)).toBe(60);
    expect(E.stepOnGrid(67, 15, 1)).toBe(75);
    expect(E.stepOnGrid(67, 15, -1)).toBe(60);
    expect(E.stepOnGrid(10, 0, 1)).toBe(10);
  });
});

describe('stepValue — weight', () => {
  it('steps the typed number', () => {
    expect(E.stepValue({ ...blank, weightKg: 60 }, null, 'weight', 1, metric)).toBe(62.5);
    expect(E.stepValue({ ...blank, weightKg: 60 }, null, 'weight', -1, metric)).toBe(57.5);
    expect(E.stepValue({ ...blank, weightKg: 61 }, null, 'weight', 1, metric)).toBe(62.5);
    expect(E.stepValue({ ...blank, weightKg: 61 }, null, 'weight', -1, metric)).toBe(60);
  });

  it('starts an empty box from the grey hint the row shows', () => {
    expect(E.stepValue(blank, fill(80, 5), 'weight', 1, metric)).toBe(82.5);
    expect(E.stepValue(blank, fill(80, 5), 'weight', -1, metric)).toBe(77.5);
    // The typed number wins over the hint.
    expect(E.stepValue({ ...blank, weightKg: 50 }, fill(80, 5), 'weight', 1, metric)).toBe(52.5);
  });

  it('starts from 0 with no hint, and never goes below 0', () => {
    expect(E.stepValue(blank, null, 'weight', 1, metric)).toBe(2.5);
    expect(E.stepValue(blank, null, 'weight', -1, metric)).toBeNull();
    expect(E.stepValue({ ...blank, weightKg: 0 }, null, 'weight', -1, metric)).toBeNull();
    expect(E.stepValue({ ...blank, weightKg: 1 }, null, 'weight', -1, metric)).toBe(0);
    expect(E.stepValue({ ...blank, weightKg: 2.5 }, null, 'weight', -1, metric)).toBe(0);
  });

  it('keeps small steps clean (no 61.249999)', () => {
    const ctx = { ...metric, incrementKg: 1.25 };
    expect(E.stepValue({ ...blank, weightKg: 61 }, null, 'weight', 1, ctx)).toBe(61.25);
    expect(E.stepValue({ ...blank, weightKg: 61.25 }, null, 'weight', 1, ctx)).toBe(62.5);
    let w = 0;
    for (let i = 0; i < 81; i++) w = E.stepValue({ ...blank, weightKg: w }, null, 'weight', 1, ctx) as number;
    expect(w).toBe(101.25);
    expect(String(w)).toBe('101.25');
  });

  it('steps pounds in pounds, stored as their exact kilograms, shown without float noise', () => {
    const typed135 = 135 * KG_PER_LB;
    const up = E.stepValue({ ...blank, weightKg: typed135 }, null, 'weight', 1, lb) as number;
    expect(up).toBeCloseTo(140 * KG_PER_LB, 9);
    expect(kgToTyped(up, 'imperial')).toBe('140');
    const down = E.stepValue({ ...blank, weightKg: typed135 }, null, 'weight', -1, lb) as number;
    expect(kgToTyped(down, 'imperial')).toBe('130');
    // A 60 kg hint reads 132.3 lb: + goes to 135, − to 130.
    expect(kgToTyped(E.stepValue(blank, fill(60, 5), 'weight', 1, lb) as number, 'imperial')).toBe('135');
    expect(kgToTyped(E.stepValue(blank, fill(60, 5), 'weight', -1, lb) as number, 'imperial')).toBe('130');
    // A small step under pounds: 2.5 lb.
    const small = { ...lb, incrementKg: 1 };
    expect(kgToTyped(E.stepValue({ ...blank, weightKg: typed135 }, null, 'weight', 1, small) as number, 'imperial')).toBe('137.5');
  });

  it('assisted: the help box steps the same way, never below no help', () => {
    const a = { ...metric, logType: 'assisted' as const };
    expect(E.stepValue({ ...blank, weightKg: 20 }, null, 'weight', -1, a)).toBe(17.5);
    expect(E.stepValue({ ...blank, weightKg: 0 }, null, 'weight', -1, a)).toBeNull();
    expect(E.stepValue(blank, fill(25, 8), 'weight', 1, a)).toBe(27.5);
  });

  it('weighted: a 0 kg hint is not shown (the box reads "—"), so it starts from nothing', () => {
    const w = { ...metric, logType: 'weighted' as const };
    expect(hintTexts(fill(0, 8), 'weighted', 'km', 'metric').weight).toBe('—');
    expect(E.stepValue(blank, fill(0, 8), 'weight', 1, w)).toBe(2.5);
    expect(E.stepValue(blank, fill(0, 8), 'weight', -1, w)).toBeNull();
  });

  it('a box this exercise does not have never steps', () => {
    expect(E.stepValue({ ...blank, weightKg: 20 }, null, 'weight', 1, { ...metric, logType: 'reps' })).toBeNull();
    expect(E.stepValue({ ...blank, reps: 5 }, null, 'reps', 1, { ...metric, logType: 'time' })).toBeNull();
    expect(E.stepValue({ ...blank, distanceM: 5000 }, null, 'distance', 1, { ...metric, logType: 'distance' })).toBeNull();
  });

  it('stops at the box limit', () => {
    expect(E.stepValue({ ...blank, weightKg: 9999 }, null, 'weight', 1, metric)).toBeNull();
  });
});

describe('stepValue — reps and time', () => {
  it('reps ±1 from the typed number or the hint; never below 1', () => {
    expect(E.stepValue({ ...blank, reps: 8 }, null, 'reps', 1, metric)).toBe(9);
    expect(E.stepValue({ ...blank, reps: 8 }, null, 'reps', -1, metric)).toBe(7);
    expect(E.stepValue(blank, fill(60, 10), 'reps', 1, metric)).toBe(11);
    expect(E.stepValue(blank, fill(60, 10), 'reps', -1, metric)).toBe(9);
    expect(E.stepValue(blank, null, 'reps', 1, metric)).toBe(1);
    expect(E.stepValue(blank, null, 'reps', -1, metric)).toBeNull();
    expect(E.stepValue({ ...blank, reps: 1 }, null, 'reps', -1, metric)).toBeNull();
    expect(E.stepValue({ ...blank, reps: 0 }, null, 'reps', 1, metric)).toBe(1);
    expect(E.stepValue({ ...blank, reps: 999 }, null, 'reps', 1, metric)).toBeNull();
  });

  it('bodyweight (reps only) steps reps', () => {
    expect(E.stepValue(blank, fill(0, 12), 'reps', 1, { ...metric, logType: 'reps' })).toBe(13);
  });

  it('time ±15 s on the 15 s grid, from the hint when empty; never below 15 s', () => {
    const t = { ...metric, logType: 'time' as const };
    expect(E.stepValue({ ...blank, durationSec: 60 }, null, 'time', 1, t)).toBe(75);
    expect(E.stepValue({ ...blank, durationSec: 60 }, null, 'time', -1, t)).toBe(45);
    expect(E.stepValue({ ...blank, durationSec: 67 }, null, 'time', 1, t)).toBe(75);
    expect(E.stepValue({ ...blank, durationSec: 67 }, null, 'time', -1, t)).toBe(60);
    expect(E.stepValue(blank, fill(0, 0, { durationSec: 30 }), 'time', 1, t)).toBe(45);
    expect(E.stepValue(blank, null, 'time', 1, t)).toBe(15);
    expect(E.stepValue({ ...blank, durationSec: 15 }, null, 'time', -1, t)).toBeNull();
    expect(E.stepValue({ ...blank, durationSec: 10 }, null, 'time', -1, t)).toBeNull();
  });

  it('stepPatch names the field it changes', () => {
    expect(E.stepPatch({ ...blank, weightKg: 60 }, null, 'weight', 1, metric)).toEqual({ weightKg: 62.5 });
    expect(E.stepPatch({ ...blank, reps: 5 }, null, 'reps', -1, metric)).toEqual({ reps: 4 });
    expect(E.stepPatch({ ...blank, durationSec: 30 }, null, 'time', 1, { ...metric, logType: 'time' })).toEqual({ durationSec: 45 });
    expect(E.stepPatch({ ...blank, reps: 1 }, null, 'reps', -1, metric)).toBeNull();
  });
});

// ------------------------------------------------------------------ what the boxes show
describe('shownValues mirrors the row hint rule', () => {
  it('typed numbers win; empty boxes take the visible hint', () => {
    expect(E.shownValues({ weightKg: 70, reps: null }, fill(60, 8), 'weight_reps')).toEqual({ weightKg: 70, reps: 8 });
    expect(E.shownValues(blank, fill(0, 8), 'weight_reps')).toEqual({ weightKg: 0, reps: 8 });
    expect(E.shownValues(blank, fill(0, 8), 'weighted')).toEqual({ reps: 8 });
    expect(E.shownValues(blank, fill(0, 0), 'weight_reps')).toEqual({ weightKg: 0 });
    expect(E.shownValues(blank, null, 'weight_reps')).toEqual({});
    expect(E.shownValues({ weightKg: 5, reps: 3 }, null, 'reps')).toEqual({ reps: 3 });
    expect(E.shownValues(blank, fill(0, 0, { durationSec: 600, distanceM: 2000 }), 'time_distance')).toEqual({ durationSec: 600, distanceM: 2000 });
    expect(E.shownValues({ ...blank, durationSec: 0 }, null, 'time')).toEqual({ durationSec: 0 });
  });
});

// ------------------------------------------------------------------ copy
describe('copy to sets below', () => {
  it('fills only rows below of the same kind that are not ticked', () => {
    const w1 = row({ isWarmup: true });
    const w2 = row({ isWarmup: true });
    const s1 = row();
    const s2 = row({ done: true });
    const s3 = row({ setType: 'failure' });
    const d4 = row({ setType: 'drop' });
    const s5 = row();
    const d6 = row({ setType: 'drop' });
    const sets = [w1, w2, s1, s2, s3, d4, s5, d6];
    expect(E.copyTargets(sets, s1.key)).toEqual([s3.key, s5.key]);
    expect(E.copyTargets(sets, w1.key)).toEqual([w2.key]);
    expect(E.copyTargets(sets, w2.key)).toEqual([]);
    expect(E.copyTargets(sets, d4.key)).toEqual([d6.key]);
    expect(E.copyTargets(sets, s5.key)).toEqual([]);
    expect(E.copyTargets(sets, 'nope')).toEqual([]);
  });

  it('copies what the row shows, for this log type only', () => {
    expect(E.copyValues({ weightKg: 100, reps: null }, fill(90, 5), 'weight_reps')).toEqual({ weightKg: 100, reps: 5 });
    expect(E.copyValues(blank, null, 'weight_reps')).toBeNull();
    expect(E.copyValues({ weightKg: 10, reps: 12 }, null, 'reps')).toEqual({ reps: 12 });
    expect(E.copyValues({ ...blank, durationSec: 90 }, null, 'time')).toEqual({ durationSec: 90 });
    expect(E.copyValues({ ...blank, distanceM: 5000 }, fill(0, 0, { durationSec: 1500 }), 'time_distance')).toEqual({
      distanceM: 5000,
      durationSec: 1500,
    });
  });

  it('says how many rows it filled', () => {
    expect(E.copiedText(1)).toBe('Copied to 1 set below');
    expect(E.copiedText(3)).toBe('Copied to 3 sets below');
  });

  it('apply then undo gives back exactly the rows as they were', () => {
    const a = row({ weightKg: 80, reps: 5 });
    const b = row({ weightKg: null, reps: 6, autoFilled: { reps: true }, editedAt: 111 });
    const c = row({ weightKg: 70, reps: null, durationSec: null });
    const sets = [a, b, c];
    const copied = E.applyCopy(sets, [b.key, c.key], { weightKg: 80, reps: 5 }, 999);
    expect(copied.sets[1]).toMatchObject({ weightKg: 80, reps: 5, editedAt: 999, autoFilled: { weight: false, reps: false } });
    expect(copied.sets[2]).toMatchObject({ weightKg: 80, reps: 5, editedAt: 999 });
    expect(copied.sets[0]).toBe(a);
    expect(copied.before.map((x) => x.setKey)).toEqual([b.key, c.key]);
    const back = E.undoCopyRows(copied.sets, copied.before, { weightKg: 80, reps: 5 });
    expect(back).toEqual(sets);
  });

  it('undo keeps a number typed since, and never touches a row ticked since', () => {
    const a = row({ weightKg: 80, reps: 5 });
    const b = row({ weightKg: 60, reps: 8 });
    const c = row({ weightKg: 60, reps: 8 });
    const copied = E.applyCopy([a, b, c], [b.key, c.key], { weightKg: 80, reps: 5 }, 1);
    const edited = copied.sets.map((s) => (s.key === b.key ? { ...s, reps: 6 } : s.key === c.key ? { ...s, done: true } : s));
    const back = E.undoCopyRows(edited, copied.before, { weightKg: 80, reps: 5 });
    expect(back[1]).toMatchObject({ weightKg: 60, reps: 6 });
    expect(back[2]).toMatchObject({ weightKg: 80, reps: 5, done: true });
  });

  it('never writes into a row that is ticked', () => {
    const a = row({ weightKg: 80, reps: 5 });
    const b = row({ weightKg: 60, reps: 8, done: true });
    const copied = E.applyCopy([a, b], [b.key], { weightKg: 80, reps: 5 }, 1);
    expect(copied.sets[1]).toBe(b);
    expect(copied.before).toEqual([]);
  });
});

describe('the bar model', () => {
  it('names the row the way the card does', () => {
    const sets = [row({ isWarmup: true }), row(), row({ setType: 'drop' }), row({ isWarmup: true })];
    expect(E.rowSpoken(sets, sets[0].key)).toBe('warm-up 1');
    expect(E.rowSpoken(sets, sets[1].key)).toBe('set 1');
    expect(E.rowSpoken(sets, sets[2].key)).toBe('drop set 2');
    expect(E.rowSpoken(sets, sets[3].key)).toBe('warm-up 2');
  });

  it('offers copy only when a row below can take it', () => {
    const c = card({ sets: [row({ weightKg: 60, reps: 8 }), row()] });
    const m = E.entryBarModel(c, c.sets[0].key, 'weight', null, 'metric');
    expect(m).toMatchObject({ who: 'Bench Press set 1', canCopy: true, steps: { plus: '+ 2.5', canMinus: true, canPlus: true } });
    const last = E.entryBarModel(c, c.sets[1].key, 'reps', null, 'metric');
    expect(last).toMatchObject({ canCopy: false, steps: { canMinus: false, canPlus: true } });
  });

  it('a distance box with nothing to copy shows no bar; an unknown row shows none', () => {
    const run = card({ logType: 'distance', sets: [row({ distanceM: 5000 })] });
    expect(E.entryBarModel(run, run.sets[0].key, 'distance', null, 'metric')).toBeNull();
    const two = card({ logType: 'distance', sets: [row({ distanceM: 5000 }), row()] });
    expect(E.entryBarModel(two, two.sets[0].key, 'distance', null, 'metric')).toMatchObject({ steps: null, canCopy: true });
    expect(E.entryBarModel(two, 'gone', 'distance', null, 'metric')).toBeNull();
    expect(E.entryBarModel(undefined, 'x', 'reps', null, 'metric')).toBeNull();
  });
});

// ------------------------------------------------------------------ the store
const start = (exercises: DraftExercise[]) =>
  useActiveWorkout.setState({
    active: true,
    hydrated: true,
    committing: false,
    editingSessionId: null,
    pastLog: false,
    startedAt: Date.parse('2026-10-11T07:00:00'),
    dayType: 'push',
    planDayId: null,
    easyWeek: false,
    lastDeleted: null,
    lastCopy: null,
    exercises,
  });
const sets = (key: string) => useActiveWorkout.getState().exercises.find((e) => e.key === key)!.sets;
const settle = () => new Promise((r) => setTimeout(r, 30));

describe('store: stepSetValue', () => {
  beforeEach(() => {
    h.writes = [];
    setDisplayUnits('metric');
  });
  afterEach(() => setDisplayUnits('metric'));

  it('steps the typed weight and saves the draft through the normal path', async () => {
    const c = card({ sets: [row({ weightKg: 60, reps: 8 })] });
    start([c]);
    expect(useActiveWorkout.getState().stepSetValue(c.key, c.sets[0].key, 'weight', 1, null)).toBe(true);
    expect(sets(c.key)[0].weightKg).toBe(62.5);
    expect(sets(c.key)[0].editedAt).toBeTypeOf('number');
    await flushDraft();
    await settle();
    const last = h.writes.filter((w) => w.key === 'activeWorkoutDraft').pop();
    expect(last && JSON.parse(last.value).exercises[0].sets[0].weightKg).toBe(62.5);
  });

  it('starts an empty box from the hint it is given', () => {
    const c = card({ sets: [row()] });
    start([c]);
    useActiveWorkout.getState().stepSetValue(c.key, c.sets[0].key, 'reps', -1, fill(60, 10));
    expect(sets(c.key)[0].reps).toBe(9);
    expect(sets(c.key)[0].weightKg).toBeNull();
  });

  it('changes nothing at the floor, or for an unknown row', () => {
    const c = card({ sets: [row({ weightKg: 0, reps: 1 })] });
    start([c]);
    const before = useActiveWorkout.getState().exercises;
    expect(useActiveWorkout.getState().stepSetValue(c.key, c.sets[0].key, 'weight', -1, null)).toBe(false);
    expect(useActiveWorkout.getState().stepSetValue(c.key, c.sets[0].key, 'reps', -1, null)).toBe(false);
    expect(useActiveWorkout.getState().stepSetValue(c.key, 'gone', 'reps', 1, null)).toBe(false);
    expect(useActiveWorkout.getState().exercises).toBe(before);
  });

  it('under pounds, steps 5 lb (the box then reads a whole number)', () => {
    setDisplayUnits('imperial');
    const c = card({ sets: [row({ weightKg: 135 * KG_PER_LB, reps: 5 })] });
    start([c]);
    useActiveWorkout.getState().stepSetValue(c.key, c.sets[0].key, 'weight', 1, null);
    expect(kgToTyped(sets(c.key)[0].weightKg, 'imperial')).toBe('140');
  });
});

describe('store: copySetDown and its Undo', () => {
  beforeEach(() => {
    h.writes = [];
  });

  it('copies into open rows below of the same kind, then Undo restores them exactly', async () => {
    const w = row({ isWarmup: true, weightKg: 40, reps: 10 });
    const s1 = row({ weightKg: 100, reps: 5 });
    const s2 = row({ weightKg: 90, reps: 6, done: true });
    const s3 = row({ weightKg: null, reps: 3 });
    const s4 = row();
    const c = card({ sets: [w, s1, s2, s3, s4] });
    start([c]);
    const original = sets(c.key);
    expect(useActiveWorkout.getState().copySetDown(c.key, s1.key, null)).toBe(2);
    const now = sets(c.key);
    expect(now[0]).toBe(original[0]);
    expect(now[2]).toBe(original[2]);
    expect(now[3]).toMatchObject({ weightKg: 100, reps: 5 });
    expect(now[4]).toMatchObject({ weightKg: 100, reps: 5 });
    const lc = useActiveWorkout.getState().lastCopy;
    expect(lc).toMatchObject({ exKey: c.key, count: 2 });
    // Saved at once (like a tick), through the same draft path.
    await settle();
    const saved = JSON.parse(h.writes.filter((x) => x.key === 'activeWorkoutDraft').pop()!.value);
    expect(saved.exercises[0].sets[4].weightKg).toBe(100);

    useActiveWorkout.getState().undoCopy();
    expect(sets(c.key)).toEqual(original);
    expect(useActiveWorkout.getState().lastCopy).toBeNull();
  });

  it('copies the hint of an empty source row (what the member sees)', () => {
    const s1 = row();
    const s2 = row();
    const c = card({ sets: [s1, s2] });
    start([c]);
    expect(useActiveWorkout.getState().copySetDown(c.key, s1.key, fill(70, 8))).toBe(1);
    expect(sets(c.key)[1]).toMatchObject({ weightKg: 70, reps: 8 });
    expect(sets(c.key)[0]).toMatchObject({ weightKg: null, reps: null });
  });

  it('does nothing (and leaves no Undo) with no rows to fill or nothing to copy', () => {
    const s1 = row({ weightKg: 50, reps: 5 });
    const s2 = row({ done: true, weightKg: 50, reps: 5 });
    const c = card({ sets: [s1, s2, row()] });
    start([c]);
    expect(useActiveWorkout.getState().copySetDown(c.key, c.sets[2].key, null)).toBe(0);
    expect(useActiveWorkout.getState().copySetDown(c.key, s2.key, null)).toBe(1);
    useActiveWorkout.setState({ lastCopy: null });
    const blankFirst = card({ sets: [row(), row()] });
    start([blankFirst]);
    expect(useActiveWorkout.getState().copySetDown(blankFirst.key, blankFirst.sets[0].key, null)).toBe(0);
    expect(useActiveWorkout.getState().lastCopy).toBeNull();
  });

  it('a running-out Undo bar clears only its own copy; removing the card drops it', () => {
    const c = card({ sets: [row({ weightKg: 50, reps: 5 }), row()] });
    start([c]);
    useActiveWorkout.getState().copySetDown(c.key, c.sets[0].key, null);
    const id = useActiveWorkout.getState().lastCopy!.id;
    useActiveWorkout.getState().dismissCopy(id - 1);
    expect(useActiveWorkout.getState().lastCopy).not.toBeNull();
    useActiveWorkout.getState().dismissCopy(id);
    expect(useActiveWorkout.getState().lastCopy).toBeNull();
    useActiveWorkout.getState().copySetDown(c.key, c.sets[0].key, null);
    useActiveWorkout.getState().removeExercise(c.key);
    expect(useActiveWorkout.getState().lastCopy).toBeNull();
  });

  it('undo after the target row was deleted changes nothing else', () => {
    const c = card({ sets: [row({ weightKg: 50, reps: 5 }), row()] });
    start([c]);
    useActiveWorkout.getState().copySetDown(c.key, c.sets[0].key, null);
    useActiveWorkout.getState().removeSet(c.key, c.sets[1].key);
    const before = sets(c.key);
    useActiveWorkout.getState().undoCopy();
    expect(sets(c.key)).toEqual(before);
  });
});

// ------------------------------------------------------------------ which box has the cursor
describe('entry focus', () => {
  it('a blur only clears the box it names; leaving a row clears any of its boxes', () => {
    const ui = useWorkoutUi.getState();
    ui.focusEntry({ exKey: 'a', setKey: 's1', field: 'reps' });
    ui.blurEntry('a', 's1', 'weight');
    expect(useWorkoutUi.getState().entryFocus).toMatchObject({ field: 'reps' });
    ui.blurEntry('a', 's2');
    expect(useWorkoutUi.getState().entryFocus).not.toBeNull();
    ui.blurEntry('a', 's1', 'reps');
    expect(useWorkoutUi.getState().entryFocus).toBeNull();
    ui.focusEntry({ exKey: 'a', setKey: 's1', field: 'weight' });
    ui.blurEntry('a', 's1');
    expect(useWorkoutUi.getState().entryFocus).toBeNull();
  });
});

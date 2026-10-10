/**
 * Phase 2, packet E — building the workout as you go. Each test failed before its fix.
 *  LW-12  Move up / Move down (a superset moves as one block; inside it, one place at a time);
 *  LW-15  add several exercises at once, in the order picked;
 *  LW-31 / TG-06  Swap after a tick: ticked sets stay with the old exercise, open rows move to
 *         the new one — and the split never sets off "Update routine?";
 *  LW-26  no superset of one, no "C" without a "B";
 *  LW-18  the hold timer ignores a brushed screen and asks before Back throws the time away;
 *  LW-24 / RP-25  a second start offers Resume / Discard; a double tap never opens two screens.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  confirmAnswer: false as boolean,
  asked: [] as { title: string; confirmLabel: string; cancelLabel?: string }[],
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    runAsync: async () => undefined,
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
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
vi.mock('@/components/ui/confirmStore', () => ({
  askConfirm: async (o: { title: string; confirmLabel: string; cancelLabel?: string }) => {
    h.asked.push(o);
    return h.confirmAnswer;
  },
}));
vi.mock('@/lib/uuid', () => {
  let n = 0;
  return { uuid: () => `u${++n}` };
});

const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
const { moveCard, moveKind, tidySupersets, supersetChoices, swapSplit } = await import('@/tracker/services/workoutOrder');
const { workoutItems } = await import('@/tracker/services/routineOffer');
const { diffRoutine } = await import('@/tracker/services/routineDiff');
const { draftToRichSets } = await import('@/tracker/services/draftSets');
const { holdCloseIntent } = await import('@/tracker/services/holdTimerRules');
const { askAboutOpenWorkout, openActiveWorkout, resetOpenGuardForTests } = await import('@/tracker/services/workoutStart');
const { useWorkoutUi } = await import('@/tracker/store/workoutUiStore');
type DraftExercise = import('@/tracker/store/activeWorkoutStore').DraftExercise;
type DraftSet = import('@/tracker/store/activeWorkoutStore').DraftSet;
type Exercise = import('@/types/models').Exercise;

let n = 0;
const row = (done: boolean, patch: Partial<DraftSet> = {}): DraftSet => ({
  key: `r${++n}`,
  weightKg: done ? 60 : null,
  reps: done ? 8 : null,
  isWarmup: false,
  done,
  ...patch,
});
const card = (key: string, patch: Partial<DraftExercise> = {}): DraftExercise => ({
  key,
  exerciseId: `id-${key}`,
  name: key,
  muscleGroup: 'chest',
  equipment: 'barbell',
  previousSets: [],
  sets: [row(false)],
  ...patch,
});
const keys = (l: DraftExercise[]) => l.map((e) => e.key);
const groups = (l: DraftExercise[]) => l.map((e) => e.supersetGroup ?? null);
const lib = (id: string, name: string): Exercise => ({
  id,
  name,
  aliases: [],
  muscleGroup: 'back',
  secondaryMuscles: [],
  equipment: 'barbell',
  isCompound: true,
  incrementKg: 2.5,
});

const start = (exercises: DraftExercise[], extra: Record<string, unknown> = {}) =>
  useActiveWorkout.setState({
    active: true,
    hydrated: true,
    committing: false,
    editingSessionId: null,
    startedAt: Date.parse('2026-10-10T07:00:00'),
    dayType: 'push',
    planDayId: 'day-1',
    easyWeek: false,
    lastDeleted: null,
    exercises,
    ...extra,
  });

beforeEach(() => {
  h.confirmAnswer = false;
  h.asked = [];
});

describe('LW-12 — move exercises up and down', () => {
  it('a single card swaps places with its neighbour', () => {
    const l = [card('squat'), card('bench'), card('row')];
    expect(keys(moveCard(l, 'bench', -1))).toEqual(['bench', 'squat', 'row']);
    expect(keys(moveCard(l, 'bench', 1))).toEqual(['squat', 'row', 'bench']);
    expect(moveKind(l, 'squat', -1)).toBeNull(); // already first
    expect(moveKind(l, 'row', 1)).toBeNull();
    expect(moveKind(l, 'bench', -1)).toBe('card');
  });

  it('a superset moves as one block; inside it, a member moves one place', () => {
    const l = [card('squat'), card('a1', { supersetGroup: 1 }), card('a2', { supersetGroup: 1 }), card('row')];
    // Inside the superset first…
    expect(moveKind(l, 'a2', -1)).toBe('card');
    expect(keys(moveCard(l, 'a2', -1))).toEqual(['squat', 'a2', 'a1', 'row']);
    // …at its edge, the whole superset moves past the neighbour.
    expect(moveKind(l, 'a1', -1)).toBe('superset');
    expect(keys(moveCard(l, 'a1', -1))).toEqual(['a1', 'a2', 'squat', 'row']);
    expect(keys(moveCard(l, 'a2', 1))).toEqual(['squat', 'row', 'a1', 'a2']);
  });

  it('a card never lands inside another superset — it jumps the whole block', () => {
    const l = [card('a1', { supersetGroup: 1 }), card('a2', { supersetGroup: 1 }), card('row')];
    expect(keys(moveCard(l, 'row', -1))).toEqual(['row', 'a1', 'a2']);
  });

  it('the store keeps the new order in the draft, and the save follows it', () => {
    start([card('squat', { sets: [row(true)] }), card('bench', { sets: [row(true)] })]);
    useActiveWorkout.getState().moveExercise('bench', -1);
    const ex = useActiveWorkout.getState().exercises;
    expect(keys(ex)).toEqual(['bench', 'squat']);
    expect(draftToRichSets(ex).map((s) => s.exerciseId)).toEqual(['id-bench', 'id-squat']);
  });
});

describe('LW-26 — superset leftovers', () => {
  it('a group of one is dissolved and groups are lettered in screen order', () => {
    const l = [card('b1', { supersetGroup: 3 }), card('b2', { supersetGroup: 3 }), card('lone', { supersetGroup: 1 })];
    expect(groups(tidySupersets(l))).toEqual([1, 1, null]);
  });

  it('removing a superset partner leaves no "Superset A" badge on the other', () => {
    start([card('a1', { supersetGroup: 1 }), card('a2', { supersetGroup: 1 }), card('row')]);
    useActiveWorkout.getState().removeExercise('a2');
    expect(groups(useActiveWorkout.getState().exercises)).toEqual([null, null]);
  });

  it('"Remove from superset" on one of two dissolves the pair', () => {
    start([card('a1', { supersetGroup: 1 }), card('a2', { supersetGroup: 1 })]);
    useActiveWorkout.getState().setSupersetGroup('a1', null);
    expect(groups(useActiveWorkout.getState().exercises)).toEqual([null, null]);
  });

  it('a new pair after A was dissolved is called A again, never C', () => {
    start([card('x'), card('y'), card('z')]);
    useActiveWorkout.getState().pairSuperset('y', 'z');
    expect(groups(useActiveWorkout.getState().exercises)).toEqual([null, 1, 1]);
    useActiveWorkout.getState().setSupersetGroup('z', null);
    useActiveWorkout.getState().pairSuperset('x', 'y');
    expect(groups(useActiveWorkout.getState().exercises)).toEqual([1, 1, null]);
  });

  it('the chooser offers partners and existing supersets, never a superset of one', () => {
    const l = [card('a1', { supersetGroup: 1 }), card('a2', { supersetGroup: 1 }), card('row'), card('curl')];
    const c = supersetChoices(l, 'row');
    expect(c.current).toBeNull();
    expect(c.pairWith.map((p) => p.key)).toEqual(['curl']);
    expect(c.join).toEqual([{ group: 1, names: ['a1', 'a2'] }]);
  });
});

describe('LW-31 / TG-06 — swap after a tick', () => {
  it('ticked sets stay with the old exercise; the open rows move to the new one, right below', () => {
    const cur = card('bench', { sets: [row(true), row(false), row(false)], supersetGroup: 2, startRows: 3 });
    const built = card('new-card', { exerciseId: 'dips', name: 'Dips', sets: [row(false), row(false)] });
    const [old, next] = swapSplit(cur, built);
    expect(old.key).toBe('bench');
    expect(old.exerciseId).toBe('id-bench');
    expect(old.sets.every((s) => s.done)).toBe(true);
    expect(old.sets).toHaveLength(1);
    expect(next.exerciseId).toBe('dips');
    expect(next.sets).toHaveLength(2);
    expect(next.splitFrom).toBe('bench');
    expect(next.swappedFrom).toEqual({ exerciseId: 'id-bench', name: 'bench' });
    expect(next.supersetGroup).toBe(2);
  });

  it('the store swaps after a tick (before: refused) — also a custom exercise', async () => {
    start([card('bench', { catalogKey: null, sets: [row(true), row(false), row(false)], startRows: 3 })]);
    const ok = await useActiveWorkout.getState().swapExercise('bench', lib('dips', 'Dips'));
    expect(ok).toBe(true);
    const ex = useActiveWorkout.getState().exercises;
    expect(ex.map((e) => e.exerciseId)).toEqual(['id-bench', 'dips']);
    expect(ex[0].sets.filter((s) => s.done)).toHaveLength(1);
    expect(ex[1].sets).toHaveLength(2);
    expect(ex[1].sets.some((s) => s.done)).toBe(false);
  });

  it('a split swap is not a routine change ("Update routine?" stays quiet)', async () => {
    start([card('bench', { exerciseId: 'bench-id', sets: [row(true), row(false), row(false)], startRows: 3 })]);
    await useActiveWorkout.getState().swapExercise('bench', lib('dips', 'Dips'));
    const items = workoutItems(useActiveWorkout.getState().exercises);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ exerciseId: 'bench-id', name: 'bench', workingSets: 0, typesChanged: false });
    expect(diffRoutine([{ exerciseId: 'bench-id', name: 'bench', targetSets: 3 }], items).changed).toBe(false);
  });

  it('a swap before any tick still replaces the card in place', async () => {
    start([card('bench', { exerciseId: 'bench-id', sets: [row(false), row(false)] })]);
    await useActiveWorkout.getState().swapExercise('bench', lib('dips', 'Dips'));
    const ex = useActiveWorkout.getState().exercises;
    expect(ex).toHaveLength(1);
    expect(ex[0].key).toBe('bench');
    expect(ex[0].swappedFrom?.exerciseId).toBe('bench-id');
  });
});

describe('LW-15 — add several exercises at once', () => {
  it('adds every picked exercise, in the order picked', async () => {
    start([card('squat')]);
    await useActiveWorkout.getState().addExercises([lib('row', 'Row'), lib('curl', 'Curl'), lib('dips', 'Dips')]);
    expect(useActiveWorkout.getState().exercises.map((e) => e.name)).toEqual(['squat', 'Row', 'Curl', 'Dips']);
  });
});

describe('LW-18 — the hold timer is never lost to a brushed screen', () => {
  it('a running (or paused) clock ignores a tap outside and asks on Back / ×', () => {
    expect(holdCloseIntent('backdrop', true)).toBe('ignore');
    expect(holdCloseIntent('back', true)).toBe('ask');
    expect(holdCloseIntent('close', true)).toBe('ask');
  });
  it('before Start, any of them simply closes', () => {
    expect(holdCloseIntent('backdrop', false)).toBe('close');
    expect(holdCloseIntent('back', false)).toBe('close');
  });
});

describe('LW-24 — a second start is never a dead end', () => {
  it('no open workout: nothing is asked', async () => {
    useActiveWorkout.setState({ active: false, hydrated: true, exercises: [] });
    expect(await askAboutOpenWorkout()).toBe('none');
    expect(h.asked).toHaveLength(0);
  });

  it('offers Resume (keeps it) or Discard and start new', async () => {
    start([card('bench', { sets: [row(true)] })]);
    h.confirmAnswer = false;
    expect(await askAboutOpenWorkout()).toBe('resume');
    expect(useActiveWorkout.getState().active).toBe(true);
    expect(h.asked[0].cancelLabel).toBe('Resume workout');
    expect(h.asked[0].confirmLabel).toBe('Discard and start new');

    h.confirmAnswer = true;
    expect(await askAboutOpenWorkout()).toBe('replaced');
    expect(useActiveWorkout.getState().active).toBe(false);
  });
});

describe('RP-25 — a double tap never opens two workout screens', () => {
  it('the second open within the guard window, or while the screen is open, does nothing', () => {
    resetOpenGuardForTests();
    useWorkoutUi.setState({ screenOpen: false });
    const pushes: string[] = [];
    const nav = { push: (p: string) => void pushes.push(p), replace: (p: string) => void pushes.push(`r:${p}`) };
    expect(openActiveWorkout(nav, 'push', 1000)).toBe(true);
    expect(openActiveWorkout(nav, 'push', 1200)).toBe(false);
    useWorkoutUi.setState({ screenOpen: true });
    expect(openActiveWorkout(nav, 'push', 9000)).toBe(false);
    useWorkoutUi.setState({ screenOpen: false });
    expect(openActiveWorkout(nav, 'replace', 9000)).toBe(true);
    expect(pushes).toEqual(['/session/active', 'r:/session/active']);
  });
});

/**
 * Phase 2 review fixes (10 Oct 2026) — the pure and store-level ones. Each test failed before
 * its fix. The ones that need real SQL live in test/db/phase2ReviewReal.test.ts.
 *  #1  Resume from a screen opened on top of the workout goes BACK to it (never a second copy),
 *      and only the workout screen in front may bounce to the Workout tab;
 *  #3  drop rows never change the routine's set count;
 *  #4  the grey hint says exactly what a tick saves (41.25, not 41.3);
 *  #6  the suggested end follows the last thing typed, not only the last tick;
 *  #8  the finish clock follows the phone's 12/24-hour setting;
 *  #10 a card's number is given when it is made, not taken from screen order;
 *  #12 switching Units re-writes the height box in the new unit;
 *  #13 joining a superset moves the card next to its group.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  history: [] as unknown[],
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
vi.mock('@/tracker/db/exerciseHistory', () => ({ getBoundedExerciseHistory: async () => h.history }));
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

const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
const { workoutItems } = await import('@/tracker/services/routineOffer');
const { draftToRichSets } = await import('@/tracker/services/draftSets');
const { showActiveWorkout, bounceEmptyWorkout } = await import('@/tracker/services/workoutStart');
const { useWorkoutUi } = await import('@/tracker/store/workoutUiStore');
const { hintTexts, prevLabel } = await import('@/tracker/components/setRowLayout');
const { convertCounting } = await import('@/tracker/engine/logTypes');
const { clockTime, endDefault, lastActivity, suggestedEnd } = await import('@/tracker/services/finishCheck');
const { heightForUnits, parseProfileExtras } = await import('@/components/settings/profileFields');
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
const lib = (id: string, name: string): Exercise => ({
  id,
  name,
  aliases: [],
  muscleGroup: 'chest',
  secondaryMuscles: [],
  equipment: 'barbell',
  isCompound: true,
  incrementKg: 2.5,
});
const start = (exercises: DraftExercise[]) =>
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
  });

beforeEach(() => {
  h.history = [];
});

describe('#1 one workout screen, never two stacked', () => {
  it('with the workout screen already open underneath, Resume / start goes back to it (before: a second copy on top)', () => {
    const calls: string[] = [];
    const nav = {
      replace: (p: string) => void calls.push(`replace ${p}`),
      dismissTo: (p: string) => void calls.push(`back to ${p}`),
    };
    useWorkoutUi.setState({ screenOpen: true });
    showActiveWorkout(nav);
    useWorkoutUi.setState({ screenOpen: false });
    showActiveWorkout(nav);
    expect(calls).toEqual(['back to /session/active', 'replace /session/active']);
  });

  it('two mounted copies: closing one leaves the screen counted as open', () => {
    useWorkoutUi.setState({ screenOpen: false });
    const ui = useWorkoutUi.getState();
    ui.setScreenOpen(true);
    ui.setScreenOpen(true);
    ui.setScreenOpen(false);
    expect(useWorkoutUi.getState().screenOpen).toBe(true);
    ui.setScreenOpen(false);
    expect(useWorkoutUi.getState().screenOpen).toBe(false);
  });

  it('only the workout screen in front bounces to the Workout tab when the workout ends', () => {
    expect(bounceEmptyWorkout({ active: false, leaving: false, focused: true })).toBe(true);
    // Underneath another screen (the exercise page, a past workout mid "Discard and start new"):
    expect(bounceEmptyWorkout({ active: false, leaving: false, focused: false })).toBe(false);
    expect(bounceEmptyWorkout({ active: false, leaving: true, focused: true })).toBe(false);
    expect(bounceEmptyWorkout({ active: true, leaving: false, focused: true })).toBe(false);
  });
});

describe('#3 drop rows never change the routine set count', () => {
  it('a drop row added during the workout is not "4 sets" (before: Update routine? to 4)', () => {
    const c = card('bench', { exerciseId: 'bench-id', startRows: 3, sets: [row(true), row(true), row(true), row(true, { setType: 'drop' })] });
    expect(workoutItems([c])).toHaveLength(1);
    expect(workoutItems([c])[0]).toMatchObject({ exerciseId: 'bench-id', name: 'bench', workingSets: 0, typesChanged: false });
    // A real extra set still counts.
    c.sets.push(row(true));
    expect(workoutItems([c])[0].workingSets).toBe(4);
  });

  it('last time\'s drop row does not count in the starting rows either', async () => {
    h.history = [
      {
        sessionId: 's1',
        dateISO: '2026-10-08',
        volumeKg: 0,
        sets: [
          { id: 'a', sessionId: 's1', exerciseId: 'bench', setNumber: 1, weightKg: 80, reps: 8, isWarmup: false },
          { id: 'b', sessionId: 's1', exerciseId: 'bench', setNumber: 2, weightKg: 80, reps: 8, isWarmup: false },
          { id: 'c', sessionId: 's1', exerciseId: 'bench', setNumber: 3, weightKg: 80, reps: 8, isWarmup: false },
          { id: 'd', sessionId: 's1', exerciseId: 'bench', setNumber: 4, weightKg: 60, reps: 10, isWarmup: false, setType: 'drop' },
        ],
      },
    ];
    start([]);
    await useActiveWorkout.getState().addExercises([lib('bench', 'Bench')]);
    const c = useActiveWorkout.getState().exercises[0];
    expect(c.sets).toHaveLength(4);
    expect(c.startRows).toBe(3);
    // One normal row added: the routine becomes 4 sets (before: 5).
    useActiveWorkout.getState().addSet(c.key);
    expect(workoutItems(useActiveWorkout.getState().exercises)[0].workingSets).toBe(4);
  });
});

describe('#4 the hint says what the tick saves', () => {
  it('41.25 kg shows 41.25 (before: 41.3) and the tick saves 41.25', () => {
    const fill = { weightKg: 41.25, reps: 8 };
    const hint = hintTexts(fill, 'weight_reps', 'km', 'metric');
    expect(hint.weight).toBe('41.25');
    expect(prevLabel(fill, 'weight_reps', 'km', 'metric')).toBe('41.25 × 8');
    start([card('bench', { sets: [row(false)] })]);
    const c = useActiveWorkout.getState().exercises[0];
    expect(useActiveWorkout.getState().toggleDone(c.key, c.sets[0].key, fill)).toBeNull();
    const saved = useActiveWorkout.getState().exercises[0].sets[0].weightKg;
    expect(saved).toBe(41.25);
    expect(Number(hint.weight)).toBe(saved);
  });

  it('a Counting-halved 42.5 → 21.25 each shows 21.25', () => {
    const each = convertCounting(42.5, 'one', 'both');
    expect(each).toBe(21.25);
    expect(hintTexts({ weightKg: each, reps: 10 }, 'weight_reps', 'km', 'metric').weight).toBe('21.25');
    expect(prevLabel({ weightKg: each, reps: 10 }, 'weight_reps', 'km', 'metric')).toBe('21.25 × 10');
  });

  it('pounds keep the unit formatter\'s 0.1 lb', () => {
    expect(hintTexts({ weightKg: 41.25, reps: 8 }, 'weight_reps', 'km', 'imperial').weight).toBe('90.9');
  });
});

describe('#6 the suggested end follows the last thing typed', () => {
  const t0 = Date.parse('2026-10-10T07:00:00');
  it('rows typed after the last tick move the end to the last edit (before: last tick + rest)', () => {
    const ex = [
      card('bench', {
        restSec: 90,
        sets: [row(true, { doneAt: t0 + 30 * 60_000 }), row(false, { weightKg: 60, reps: 8, editedAt: t0 + 50 * 60_000 })],
      }),
    ];
    const last = lastActivity(ex, 120);
    expect(last).toEqual({ at: t0 + 50 * 60_000, restSec: 0 });
    expect(suggestedEnd({ startedAt: t0, lastTickAt: last.at, restSec: last.restSec, now: t0 + 4 * 3_600_000 })).toBe(t0 + 50 * 60_000);
  });

  it('a tick after the last edit still adds that exercise\'s rest', () => {
    const ex = [card('bench', { restSec: 90, sets: [row(true, { doneAt: t0 + 40 * 60_000, editedAt: t0 + 39 * 60_000 })] })];
    expect(lastActivity(ex, 120)).toEqual({ at: t0 + 40 * 60_000, restSec: 90 });
  });

  it('typing a row stamps it', () => {
    start([card('bench', { sets: [row(false)] })]);
    const c = useActiveWorkout.getState().exercises[0];
    useActiveWorkout.getState().updateSet(c.key, c.sets[0].key, { reps: 8 });
    expect(typeof useActiveWorkout.getState().exercises[0].sets[0].editedAt).toBe('number');
  });

  it('"Save them" defaults the end to Now, unless the workout has been open over 3 h', () => {
    expect(endDefault({ keepUnticked: false, startedAt: t0, now: t0 + 2 * 3_600_000 })).toBe('suggested');
    expect(endDefault({ keepUnticked: true, startedAt: t0, now: t0 + 2 * 3_600_000 })).toBe('now');
    expect(endDefault({ keepUnticked: true, startedAt: t0, now: t0 + 4 * 3_600_000 })).toBe('suggested');
  });
});

describe('#8 the finish clock follows the phone', () => {
  it('24-hour phone: 18:42; 12-hour phone: 6:42 pm', () => {
    const at = new Date(2026, 9, 10, 18, 42).getTime();
    expect(clockTime(at, at, true)).toBe('18:42');
    expect(clockTime(at, at, false)).toBe('6:42 pm');
    expect(clockTime(new Date(2026, 9, 10, 0, 5).getTime(), at, true)).toBe('00:05');
  });
});

describe('#10 card numbers are given when the card is made', () => {
  it('a second Bench added mid-workout is card 1 (before: card 0, merged into the first)', async () => {
    start([card('heavy', { exerciseId: 'bench', card: 0 })]);
    await useActiveWorkout.getState().addExercises([lib('bench', 'Bench')]);
    expect(useActiveWorkout.getState().exercises.map((e) => e.card)).toEqual([0, 1]);
    await useActiveWorkout.getState().addExercise(lib('bench', 'Bench'));
    expect(useActiveWorkout.getState().exercises.map((e) => e.card)).toEqual([0, 1, 2]);
  });

  it('moving back-off above heavy keeps each card\'s number (before: they swapped history)', () => {
    const heavy = card('heavy', { exerciseId: 'bench', card: 0, sets: [row(true, { weightKg: 100, reps: 5 })] });
    const back = card('back', { exerciseId: 'bench', card: 1, sets: [row(true, { weightKg: 70, reps: 10 })] });
    const rows = draftToRichSets([back, heavy]);
    expect(rows.map((r) => [r.weightKg, r.cardIndex ?? 0])).toEqual([
      [70, 1],
      [100, 0],
    ]);
  });
});

describe('#12 switching Units re-writes the height box', () => {
  it('an untouched 175 cm becomes 68.9 in (and stays "unchanged"); a typed one converts', () => {
    const untouched = heightForUnits({ text: '175', seeded: '175', storedCm: 175, from: 'metric', to: 'imperial' });
    expect(untouched).toEqual({ text: '68.9', seeded: '68.9' });
    const typed = heightForUnits({ text: '180', seeded: '175', storedCm: 175, from: 'metric', to: 'imperial' });
    expect(typed.text).toBe('70.9');
    expect(typed.seeded).toBe('68.9');
    expect(parseProfileExtras('', typed.text, 'imperial').ok).toBe(true); // before: 180 "inches" refused
    expect(heightForUnits({ text: '70', seeded: '', storedCm: 0, from: 'imperial', to: 'metric' }).text).toBe('177.8');
    expect(heightForUnits({ text: '', seeded: '', storedCm: 0, from: 'imperial', to: 'metric' }).text).toBe('');
  });
});

describe('#13 joining a superset moves the card next to its group', () => {
  it('Curl joins A: it lands right after A\'s last card (before: it stayed at the bottom)', () => {
    start([card('a1', { supersetGroup: 1 }), card('a2', { supersetGroup: 1 }), card('row'), card('curl')]);
    useActiveWorkout.getState().setSupersetGroup('curl', 1);
    const ex = useActiveWorkout.getState().exercises;
    expect(ex.map((e) => e.key)).toEqual(['a1', 'a2', 'curl', 'row']);
    expect(ex.map((e) => e.supersetGroup ?? null)).toEqual([1, 1, 1, null]);
  });
});
